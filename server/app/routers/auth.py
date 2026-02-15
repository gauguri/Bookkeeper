import os
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import (
    MODULE_DEFINITIONS,
    create_access_token,
    get_allowed_modules,
    get_current_user,
    hash_password,
    replace_user_module_access,
    seed_modules,
    verify_password,
)
from app.db import get_db
from app.models import Company, User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginPayload(BaseModel):
    email: str
    password: str


class BootstrapStatusResponse(BaseModel):
    needs_bootstrap: bool


class BootstrapAdminPayload(BaseModel):
    email: str
    password: str = Field(min_length=10)
    full_name: str | None = None


class BootstrapUserPayload(BaseModel):
    email: str
    password: str = Field(min_length=10)
    full_name: str | None = None
    role: Literal["ADMIN", "EMPLOYEE"]
    permissions: list[str] = Field(default_factory=list)


class DevResetPayload(BaseModel):
    password: str = Field(default="password123!", min_length=10)


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
        "role": "ADMIN" if user.is_admin else "EMPLOYEE",
    }


def _users_count(db: Session) -> int:
    return int(db.query(func.count(User.id)).scalar() or 0)


def _get_or_create_company(db: Session) -> Company:
    company = db.query(Company).order_by(Company.id.asc()).first()
    if company:
        return company
    company = Company(name="Demo Company", base_currency="USD", fiscal_year_start_month=1)
    db.add(company)
    db.flush()
    return company


def _require_admin_token(
    db: Session,
    authorization: str | None,
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Admin authentication required")

    token = authorization.split(" ", 1)[1]
    try:
        user = get_current_user(token=token, db=db)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Admin authentication required")

    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("/bootstrap/status", response_model=BootstrapStatusResponse)
def bootstrap_status(db: Session = Depends(get_db)):
    return {"needs_bootstrap": _users_count(db) == 0}


@router.post("/bootstrap/admin", status_code=status.HTTP_201_CREATED)
def bootstrap_admin(payload: BootstrapAdminPayload, db: Session = Depends(get_db)):
    try:
        if db.bind and db.bind.dialect.name == "postgresql":
            db.execute(text("LOCK TABLE users IN EXCLUSIVE MODE"))

        if _users_count(db) > 0:
            raise HTTPException(status_code=409, detail="Bootstrap already completed")

        seed_modules(db)
        company = _get_or_create_company(db)
        user = User(
            company_id=company.id,
            email=payload.email,
            full_name=payload.full_name,
            password_hash=hash_password(payload.password),
            role="admin",
            is_admin=True,
            is_active=True,
        )
        db.add(user)
        db.flush()

        all_module_keys = [key for key, _ in MODULE_DEFINITIONS]
        replace_user_module_access(db, user.id, all_module_keys)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Bootstrap already completed")

    db.refresh(user)
    access_token = create_access_token({"sub": str(user.id), "company_id": user.company_id, "is_admin": user.is_admin})
    return {
        "user": _serialize_user(user),
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.post("/bootstrap/users", status_code=status.HTTP_201_CREATED)
def bootstrap_users(
    payload: list[BootstrapUserPayload],
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    if _users_count(db) == 0:
        raise HTTPException(status_code=409, detail="Bootstrap has not completed yet")

    admin_user = _require_admin_token(db, authorization)

    if not payload:
        return {"created": 0, "users": []}

    created_users: list[dict] = []
    company_id = admin_user.company_id
    try:
        seed_modules(db)
        for item in payload:
            exists = db.query(User.id).filter(User.email == item.email).first()
            if exists:
                raise HTTPException(status_code=409, detail=f"Email already exists: {item.email}")

            is_admin = item.role == "ADMIN"
            user = User(
                company_id=company_id,
                email=item.email,
                full_name=item.full_name,
                password_hash=hash_password(item.password),
                role="admin" if is_admin else "employee",
                is_admin=is_admin,
                is_active=True,
            )
            db.add(user)
            db.flush()

            module_keys = [key for key, _ in MODULE_DEFINITIONS] if is_admin else item.permissions
            replace_user_module_access(db, user.id, module_keys)
            created_users.append(_serialize_user(user))
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="One or more emails already exist")

    return {"created": len(created_users), "users": created_users}


@router.post("/dev/reset-admin", status_code=status.HTTP_204_NO_CONTENT)
def dev_reset_admin(payload: DevResetPayload, db: Session = Depends(get_db)):
    env_name = os.getenv("ENV", "production").lower()
    allow_reset = os.getenv("ALLOW_DEV_RESET", "false").lower() in {"1", "true", "yes"}
    if env_name != "development" or not allow_reset:
        raise HTTPException(status_code=404, detail="Not found")

    seed_modules(db)
    company = _get_or_create_company(db)
    admin = db.query(User).filter(User.email == "admin@bookkeeper.local").first()
    if not admin:
        admin = User(
            company_id=company.id,
            email="admin@bookkeeper.local",
            full_name="System Admin",
            password_hash=hash_password(payload.password),
            role="admin",
            is_admin=True,
            is_active=True,
        )
        db.add(admin)
        db.flush()
    else:
        admin.company_id = company.id
        admin.full_name = admin.full_name or "System Admin"
        admin.password_hash = hash_password(payload.password)
        admin.role = "admin"
        admin.is_admin = True
        admin.is_active = True

    replace_user_module_access(db, admin.id, [key for key, _ in MODULE_DEFINITIONS])
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/login")
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    if _users_count(db) == 0:
        raise HTTPException(status_code=403, detail="Bootstrap required before login")

    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token = create_access_token(
        {
            "sub": str(user.id),
            "company_id": user.company_id,
            "is_admin": user.is_admin,
        }
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "is_admin": user.is_admin,
        },
    }


@router.get("/me")
def me(current_user: User = Depends(get_current_user), allowed_modules: list[str] = Depends(get_allowed_modules)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "is_admin": current_user.is_admin,
        "is_active": current_user.is_active,
        "allowed_modules": allowed_modules,
    }
