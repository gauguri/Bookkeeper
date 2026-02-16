from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import hash_password, replace_user_module_access, require_admin, seed_modules
from app.db import get_db
from app.models import Module, User, UserModuleAccess
from app.module_keys import MODULE_KEYS

router = APIRouter(prefix="/api/control", tags=["control"], dependencies=[Depends(require_admin)])



class ControlModulesResponse(BaseModel):
    modules: list[str]


class ControlUserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    role: Literal["ADMIN", "EMPLOYEE"]
    is_active: bool
    permissions: list[str]


class ControlUserCreate(BaseModel):
    email: str
    full_name: Optional[str] = None
    password: str
    role: Literal["ADMIN", "EMPLOYEE"]
    permissions: list[str] = Field(default_factory=list)
    is_active: bool = True


class ControlUserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Literal["ADMIN", "EMPLOYEE"]
    is_active: bool
    permissions: list[str] = Field(default_factory=list)


class ResetPasswordPayload(BaseModel):
    new_password: str


def _serialize_user(db: Session, user: User) -> dict:
    if user.is_admin:
        permissions = MODULE_KEYS
    else:
        rows = (
            db.query(Module.key)
            .join(UserModuleAccess, UserModuleAccess.module_id == Module.id)
            .filter(UserModuleAccess.user_id == user.id)
            .order_by(Module.key.asc())
            .all()
        )
        permissions = [key for (key,) in rows]

    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": "ADMIN" if user.is_admin else "EMPLOYEE",
        "is_active": user.is_active,
        "permissions": permissions,
    }


def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")


def _validate_permissions(permissions: list[str]) -> None:
    invalid = sorted({permission for permission in permissions if permission not in MODULE_KEYS})
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown module keys: {', '.join(invalid)}")


@router.get("/modules", response_model=ControlModulesResponse)
def list_modules():
    return {"modules": MODULE_KEYS}


@router.get("/users", response_model=list[ControlUserResponse])
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.id.asc()).all()
    return [_serialize_user(db, user) for user in users]


@router.post("/users", status_code=status.HTTP_201_CREATED, response_model=ControlUserResponse)
def create_user(payload: ControlUserCreate, db: Session = Depends(get_db)):
    existing = db.query(User.id).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists")

    _validate_password(payload.password)
    _validate_permissions(payload.permissions)

    seed_modules(db)
    company_id_row = db.query(User.company_id).order_by(User.id.asc()).first()
    company_id = company_id_row[0] if company_id_row else 1
    is_admin = payload.role == "ADMIN"

    user = User(
        company_id=company_id,
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        is_admin=is_admin,
        is_active=payload.is_active,
        role="admin" if is_admin else "employee",
    )
    db.add(user)
    db.flush()

    permissions = MODULE_KEYS if is_admin else payload.permissions
    replace_user_module_access(db, user.id, permissions)

    db.commit()
    db.refresh(user)
    return _serialize_user(db, user)


@router.put("/users/{user_id}", response_model=ControlUserResponse)
def update_user(user_id: int, payload: ControlUserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    _validate_permissions(payload.permissions)

    is_admin = payload.role == "ADMIN"
    user.full_name = payload.full_name
    user.is_admin = is_admin
    user.role = "admin" if is_admin else "employee"
    user.is_active = payload.is_active

    permissions = MODULE_KEYS if is_admin else payload.permissions
    replace_user_module_access(db, user.id, permissions)

    db.commit()
    db.refresh(user)
    return _serialize_user(db, user)


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(user_id: int, payload: ResetPasswordPayload, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    _validate_password(payload.new_password)
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return None


@router.delete("/users/{user_id}")
def soft_delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    return {"status": "ok"}
