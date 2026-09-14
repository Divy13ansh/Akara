"""Security: bcrypt password hashing, JWT minting/verification, Google id_token
verification (GIS flow per backend-endpoints.md §1.3)."""

from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request
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


logger = logging.getLogger("akara.auth")


def _allowed_google_audiences() -> list[str]:
    ids = list(getattr(settings, "google_client_ids", None) or [])
    if settings.google_client_id and settings.google_client_id not in ids:
        ids.append(settings.google_client_id)
    return ids


def verify_google_id_token(id_token: str) -> dict | None:
    """Verify a Google Identity Services id_token. Returns the claim dict
    (sub, email, name, picture) or None. Returns None when no client id is
    configured (endpoint should 501) or verification fails. The audience is
    checked against every configured client id so a frontend/backend mismatch
    fails closed with a clear log line."""
    allowed = _allowed_google_audiences()
    if not allowed or not id_token:
        if not allowed:
            logger.error("google auth attempted with no GOOGLE_CLIENT_ID configured")
        return None
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token

        # Verify signature without pinning the audience first so we can report
        # (and accept) any of the configured client ids.
        claims = google_id_token.verify_oauth2_token(id_token, google_requests.Request())
        issuer = claims.get("iss", "")
        if issuer not in ("accounts.google.com", "https://accounts.google.com"):
            logger.warning("google id_token rejected: bad issuer %r", issuer)
            return None
        aud = claims.get("aud", "")
        if aud not in allowed:
            logger.warning(
                "google id_token rejected: aud %r not in configured clients; "
                "set GOOGLE_CLIENT_IDS to include the frontend's VITE_GOOGLE_CLIENT_ID",
                aud,
            )
            return None
        return claims
    except Exception as e:
        logger.warning("google id_token verification failed: %s", e)
        return None


def verify_google_access_token(access_token: str) -> dict | None:
    """Verify a Google OAuth2 access token (popup token-client flow) via the
    tokeninfo endpoint and return a normalized claim dict
    {sub, email, name, picture} or None. Audience is checked against every
    configured client id."""
    allowed = _allowed_google_audiences()
    if not allowed or not access_token:
        if not allowed:
            logger.error("google auth attempted with no GOOGLE_CLIENT_ID configured")
        return None
    try:
        with urllib.request.urlopen(
            "https://oauth2.googleapis.com/tokeninfo?access_token="
            + urllib.parse.quote(access_token),
            timeout=10,
        ) as resp:
            info = json.load(resp)
        aud = info.get("aud", "")
        if aud not in allowed:
            logger.warning(
                "google access_token rejected: aud %r not in configured clients",
                aud,
            )
            return None
        sub = info.get("sub")
        if not sub:
            return None
        email = (info.get("email") or "").lower()
        # tokeninfo has no name/picture — fetch the profile (same token).
        name, picture = None, None
        try:
            req = urllib.request.Request(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            with urllib.request.urlopen(req, timeout=10) as uresp:
                profile = json.load(uresp)
            name = profile.get("name")
            picture = profile.get("picture")
            email = (profile.get("email") or email).lower()
        except Exception as e:
            logger.warning("google userinfo fetch failed (continuing): %s", e)
        return {"sub": sub, "email": email, "name": name, "picture": picture}
    except Exception as e:
        logger.warning("google access_token verification failed: %s", e)
        return None
