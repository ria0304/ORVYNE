"""ar-vr Integration Layer — Service adapters for existing projects.

Each adapter mediates communication between the integration layer and its
respective independent project backend. Adapters:
- Translate shared schemas to project-specific API requests
- Handle authentication (project-specific JWTs, API keys)
- Handle error mapping and response normalization
- Never modify the target project's code or database
"""

from __future__ import annotations

import httpx
from typing import Any, Dict, Optional

from . import batisse_service, wya_service, tryon_service, velaris_service

__all__ = [
    "batisse_service",
    "wya_service",
    "tryon_service",
    "velaris_service",
]