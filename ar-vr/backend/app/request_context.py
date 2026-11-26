"""Per-request context shared by the gateway and its downstream adapters."""
from __future__ import annotations

from contextvars import ContextVar

# Address of the browser behind the current request. Adapters forward it as
# X-Forwarded-For so a downstream project's per-IP limits apply per user rather
# than to the gateway as a whole.
client_ip_var: ContextVar[str | None] = ContextVar("client_ip", default=None)
