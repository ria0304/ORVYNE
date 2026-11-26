"""ORVYNE single sign-on.

One login for the whole platform. The user registers / signs in here once;
the gateway then links that account to the user's account inside each
downstream project so nothing else ever asks for a password:

* WYA    - the gateway registers/logs in to WYA with the same email + password
           at ORVYNE sign-in time and stores the resulting WYA JWT.
* TryOn  - TryOn has guest identities only (X-User-Id); the gateway creates one
           and stores its id.
* BATISSE / VELARIS have no per-user accounts; the gateway scopes their data
           through the ORVYNE user id.

Passwords are never stored in plain text and are never persisted for
downstream use: they are forwarded once, during the request that supplied them.
Link status is always reported honestly (linked / unavailable / failed).
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field

from . import config, database
from .services.tryon_service import get_tryon_service
from .services.wya_service import get_wya_service

logger = logging.getLogger(__name__)

TOKEN_TTL_SECONDS = int(os.getenv("ORVYNE_TOKEN_TTL_SECONDS", str(12 * 3600)))
_PBKDF2_ITERATIONS = 260_000
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


# ── Passwords ─────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt_hex, digest_hex = stored.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(digest.hex(), digest_hex)
    except Exception:
        return False


# A real hash to compare against when the email is unknown, so "no such user"
# and "wrong password" take the same time.
_DUMMY_HASH = hash_password("orvyne-timing-equaliser")


# ── Tokens ────────────────────────────────────────────────────────────────────

def create_access_token(user_id: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {"sub": user_id, "iat": now, "exp": now + TOKEN_TTL_SECONDS},
        config.INTEGRATION_JWT_SECRET,
        algorithm="HS256",
    )


def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    """Validate the ORVYNE JWT and return the user id (`sub`)."""
    try:
        payload = jwt.decode(token, config.INTEGRATION_JWT_SECRET, algorithms=["HS256"])
        user_id: Optional[str] = payload.get("sub")
        if user_id is None:
            raise jwt.PyJWTError("Token missing sub claim")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


# ── Downstream links ──────────────────────────────────────────────────────────

def _get_link(db, user_id: str, service: str):
    return db.query(database.DownstreamLink).filter_by(user_id=user_id, service=service).first()


def _upsert_link(db, user_id: str, service: str, **fields: Any) -> None:
    link = _get_link(db, user_id, service)
    if link is None:
        link = database.DownstreamLink(user_id=user_id, service=service)
        db.add(link)
    for key, value in fields.items():
        setattr(link, key, value)
    db.commit()


def _token_expiry(token: str) -> Optional[datetime]:
    try:
        exp = jwt.decode(token, options={"verify_signature": False}).get("exp")
        return datetime.fromtimestamp(exp, tz=timezone.utc) if exp else None
    except Exception:
        return None


def _as_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _wya_token_valid(link) -> bool:
    if link is None or not link.token:
        return False
    expires = _as_utc(link.token_expires_at)
    return expires is None or expires > datetime.now(timezone.utc)


def _classify(exc: Exception) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        return "rate_limited" if exc.response.status_code == 429 else "failed"
    if isinstance(exc, (httpx.TransportError, httpx.TimeoutException)):
        return "unavailable"
    return "failed"


async def link_wya(db, user_id: str, email: str, password: str, full_name: str) -> str:
    """Obtain (and store) a WYA JWT for this user. Returns a status string."""
    svc = get_wya_service()
    try:
        try:
            data = await svc.login({"email": email, "password": password})
        except httpx.HTTPStatusError as e:
            if e.response.status_code != 401:
                raise
            # No WYA account with these credentials yet: create it.
            data = await svc.register({"email": email, "password": password, "full_name": full_name or email})
        token = data.get("access_token")
        if not token:
            return "failed"
        _upsert_link(
            db, user_id, "wya",
            token=token,
            token_expires_at=_token_expiry(token),
            external_user_id=(data.get("user") or {}).get("user_id"),
        )
        return "linked"
    except Exception as e:
        logger.warning("WYA link failed for %s: %s", user_id, e)
        return _classify(e)


async def link_tryon(db, user_id: str, force: bool = False) -> str:
    """Ensure a TryOn guest identity exists for this user."""
    link = _get_link(db, user_id, "tryon")
    if link and link.external_user_id and not force:
        return "linked"
    try:
        data = await get_tryon_service().create_user()
        tryon_id = data.get("id")
        if not tryon_id:
            return "failed"
        _upsert_link(db, user_id, "tryon", external_user_id=tryon_id)
        return "linked"
    except Exception as e:
        logger.warning("TryOn link failed for %s: %s", user_id, e)
        return _classify(e)


def get_wya_token(user_id: str) -> str:
    """Stored WYA JWT for the signed-in ORVYNE user, or a clear 424."""
    db = database.get_db_session()
    try:
        link = _get_link(db, user_id, "wya")
        if not _wya_token_valid(link):
            raise HTTPException(
                status_code=424,
                detail="Your WYA account is not linked or its session expired. Sign in to ORVYNE again (WYA must be running).",
            )
        return link.token
    finally:
        db.close()


def clear_wya_token(user_id: str) -> None:
    db = database.get_db_session()
    try:
        link = _get_link(db, user_id, "wya")
        if link:
            link.token = None
            link.token_expires_at = None
            db.commit()
    finally:
        db.close()


async def get_tryon_user_id(user_id: str, force_new: bool = False) -> str:
    """TryOn guest id for this user, creating the guest identity if needed."""
    db = database.get_db_session()
    try:
        status = await link_tryon(db, user_id, force=force_new)
        if status != "linked":
            raise HTTPException(status_code=503 if status == "unavailable" else 502,
                                detail=f"TryOn account could not be linked ({status})")
        return _get_link(db, user_id, "tryon").external_user_id
    finally:
        db.close()


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterBody(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=255)


class LoginBody(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(min_length=1, max_length=128)


def _public_user(acct) -> Dict[str, Any]:
    return {"id": acct.id, "email": acct.email, "full_name": acct.full_name}


def _services_status(db, user_id: str) -> Dict[str, str]:
    wya = _get_link(db, user_id, "wya")
    tryon = _get_link(db, user_id, "tryon")
    return {
        "wya": "linked" if _wya_token_valid(wya) else "not_linked",
        "tryon": "linked" if tryon and tryon.external_user_id else "not_linked",
    }


# ── Routes ────────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", status_code=201, summary="Create the ORVYNE account (the only sign-up)")
async def register(body: RegisterBody) -> Dict[str, Any]:
    email = body.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="A valid email address is required")
    db = database.get_db_session()
    try:
        if db.query(database.Account).filter_by(email=email).first():
            raise HTTPException(status_code=409, detail="An account with this email already exists")
        acct = database.Account(
            id=uuid.uuid4().hex,
            email=email,
            full_name=body.full_name.strip(),
            password_hash=hash_password(body.password),
        )
        db.add(acct)
        db.commit()
        linked = {
            "wya": await link_wya(db, acct.id, email, body.password, acct.full_name),
            "tryon": await link_tryon(db, acct.id),
        }
        return {"access_token": create_access_token(acct.id), "token_type": "bearer",
                "user": _public_user(acct), "services": linked}
    finally:
        db.close()


@router.post("/login", summary="Sign in once; downstream projects are linked automatically")
async def login(body: LoginBody) -> Dict[str, Any]:
    email = body.email.strip().lower()
    db = database.get_db_session()
    try:
        acct = db.query(database.Account).filter_by(email=email).first()
        ok = verify_password(body.password, acct.password_hash if acct else _DUMMY_HASH)
        if not acct or not ok:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        acct.last_login_at = datetime.now(timezone.utc)
        db.commit()
        wya_link = _get_link(db, acct.id, "wya")
        linked = {
            # Refresh the WYA session whenever it is missing/expired; the
            # password is only available in this request, so do it now.
            "wya": "linked" if _wya_token_valid(wya_link) else await link_wya(db, acct.id, email, body.password, acct.full_name),
            "tryon": await link_tryon(db, acct.id),
        }
        return {"access_token": create_access_token(acct.id), "token_type": "bearer",
                "user": _public_user(acct), "services": linked}
    finally:
        db.close()


@router.get("/me", summary="Current ORVYNE user and downstream link status")
def me(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    db = database.get_db_session()
    try:
        acct = db.query(database.Account).filter_by(id=user_id).first()
        if not acct:
            raise HTTPException(status_code=401, detail="Account no longer exists")
        return {"user": _public_user(acct), "services": _services_status(db, user_id)}
    finally:
        db.close()


@router.post("/logout", summary="Sign out: drops the stored downstream sessions")
def logout(user_id: str = Depends(get_current_user)) -> Dict[str, Any]:
    clear_wya_token(user_id)
    return {"success": True}
