"""Security: bcrypt password hashing, JWT minting/verification, Google id_token
verification (GIS flow per backend-endpoints.md §1.3)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from services.api.config import settings

# ------------------------------------------------------------------ passwords


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


# ------------------------------------------------------------------ JWT


def create_access_token(user_id: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.jwt_expire_days)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str | None:
    """Returns the user id (sub) or None if invalid/expired."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


# ------------------------------------------------------------------ google


def verify_google_id_token(id_token: str) -> dict | None:
    """Verify a Google Identity Services id_token. Returns the claim dict
    (sub, email, name, picture) or None. Returns None when GOOGLE_CLIENT_ID is
    unset (endpoint should 501) or verification fails."""
    if not settings.google_client_id or not id_token:
        return None
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token

        claims = google_id_token.verify_oauth2_token(
            id_token, google_requests.Request(), settings.google_client_id
        )
        issuer = claims.get("iss", "")
        if issuer not in ("accounts.google.com", "https://accounts.google.com"):
            return None
        return claims
    except Exception:
        return None
