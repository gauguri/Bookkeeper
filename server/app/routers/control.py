from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import hash_password, replace_user_module_access, require_admin
from app.db import get_db
from app.models import Module, User, UserModuleAccess

router = APIRouter(prefix="/api/control", tags=["control"], dependencies=[Depends(require_admin)])


class ControlUserCreate(BaseModel):
    email: str
    full_name: Optional[str] = None
    password: str
    is_admin: bool = False
    is_active: bool = True


class ControlUserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None


class ModuleAccessPayload(BaseModel):
    modules: list[str]


@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.id.asc()).all()
    return [
        {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "is_admin": user.is_admin,
            "is_active": user.is_active,
        }
        for user in users
    ]


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(payload: ControlUserCreate, db: Session = Depends(get_db)):
    existing = db.query(User.id).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists")

    company_id = db.query(User.company_id).order_by(User.id.asc()).scalar() or 1
    user = User(
        company_id=company_id,
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        is_admin=payload.is_admin,
        is_active=payload.is_active,
        role="admin" if payload.is_admin else "user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
    }


@router.put("/users/{user_id}")
def update_user(user_id: int, payload: ControlUserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.email is not None:
        user.email = payload.email
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.password:
        user.password_hash = hash_password(payload.password)
    if payload.is_admin is not None:
        user.is_admin = payload.is_admin
        user.role = "admin" if payload.is_admin else "user"
    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
    }


@router.delete("/users/{user_id}")
def soft_delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    return {"status": "ok"}


@router.get("/modules")
def list_modules(db: Session = Depends(get_db)):
    modules = db.query(Module).order_by(Module.key.asc()).all()
    return [{"key": module.key, "name": module.name} for module in modules]


@router.get("/users/{user_id}/modules")
def get_user_modules(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    rows = (
        db.query(Module.key)
        .join(UserModuleAccess, UserModuleAccess.module_id == Module.id)
        .filter(UserModuleAccess.user_id == user_id)
        .all()
    )
    return {"modules": [key for (key,) in rows]}


@router.put("/users/{user_id}/modules")
def replace_modules(user_id: int, payload: ModuleAccessPayload, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    assigned = replace_user_module_access(db, user_id, payload.modules)
    db.commit()
    return {"modules": assigned}
