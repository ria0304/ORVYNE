from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

import os

# Callers allowed to tell us the real client address (e.g. a load balancer or the ORVYNE gateway).
# Comma-separated IPs in TRUSTED_PROXY_IPS. Empty (default) = never trust X-Forwarded-For.
_TRUSTED_PROXIES = {ip.strip() for ip in os.getenv("TRUSTED_PROXY_IPS", "").split(",") if ip.strip()}


def client_key(request: Request) -> str:
    """Rate-limit key: the real client when a trusted proxy forwards it, else the peer address."""
    peer = request.client.host if request.client else get_remote_address(request)
    if peer in _TRUSTED_PROXIES:
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if forwarded:
            return forwarded
    return peer


# Create the limiter instance. RATE_LIMIT_ENABLED=false turns limiting off (automated tests only).
limiter = Limiter(
    key_func=client_key,
    default_limits=["60/minute"],
    headers_enabled=True,
    enabled=os.getenv("RATE_LIMIT_ENABLED", "true").lower() != "false",
)

# Custom rate limit exceeded handler
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    # slowapi's RateLimitExceeded has no `.wait`; the window length is on the limit itself.
    try:
        wait = int(exc.limit.limit.get_expiry())
    except Exception:
        wait = 60
    return JSONResponse(
        status_code=429,
        content={
            "detail": f"Rate limit exceeded. Please try again in {wait} seconds.",
            "retry_after": wait,
        },
        headers={"Retry-After": str(wait)},
    )

def init_rate_limiter(app: FastAPI):
    """Initialize rate limiter with FastAPI app"""
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
