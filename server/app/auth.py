from datetime import datetime, timedelta, timezone
from typing import Iterable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Module, User, UserModuleAccess
from app.module_keys import MODULE_DEFINITIONS, MODULE_KEY_SET

SECRET_KEY = "bookkeeper-dev-secret"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def _get_allowed_modules(db: Session, user: User) -> list[str]:
    if user.is_admin:
        return [key.value for key, _ in MODULE_DEFINITIONS]

    rows = (
        db.query(Module.key)
        .join(UserModuleAccess, UserModuleAccess.module_id == Module.id)
        .filter(UserModuleAccess.user_id == user.id)
        .all()
    )
    return [key for (key,) in rows]


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise credentials_exception
    return user


def get_allowed_modules(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[str]:
    return _get_allowed_modules(db, current_user)


def require_module(module_key: str):
    def dependency(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        if current_user.is_admin:
            return current_user
        allowed = _get_allowed_modules(db, current_user)
        if module_key not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Not authorized for module '{module_key}'",
            )
        return current_user

    return dependency


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def seed_modules(db: Session) -> None:
    existing = {row[0] for row in db.query(Module.key).all()}
    for module_key, name in MODULE_DEFINITIONS:
        if module_key.value not in existing:
            db.add(Module(key=module_key.value, name=name))


def replace_user_module_access(db: Session, user_id: int, module_keys: Iterable[str]) -> list[str]:
    module_keys = list(dict.fromkeys(module_keys))
    invalid = [key for key in module_keys if key not in MODULE_KEY_SET]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown module keys: {', '.join(invalid)}")
    modules = db.query(Module).filter(Module.key.in_(module_keys)).all() if module_keys else []
    found_keys = {module.key for module in modules}
    invalid = [key for key in module_keys if key not in found_keys]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown module keys: {', '.join(invalid)}")

    db.query(UserModuleAccess).filter(UserModuleAccess.user_id == user_id).delete()
    for module in modules:
        db.add(UserModuleAccess(user_id=user_id, module_id=module.id))
    return module_keys
