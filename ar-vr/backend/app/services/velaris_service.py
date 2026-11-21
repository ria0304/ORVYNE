"""Service adapter for VELARIS — AI-powered jewellery design system.

Mediates communication between the ar-vr integration layer and the VELARIS
backend. Does NOT modify VELARIS code or database; only calls its verified
REST APIs.

Provides both 2D design outputs (descriptions, PNG previews, PDF briefs)
and 3D jewellery mesh generation via trimesh + the VELARIS rendering
pipeline. 3D meshes are output as GLTF data URIs for web integration.
"""

from __future__ import annotations

import base64
import json
import math
import random
import trimesh
import numpy as np
from typing import Any, Dict, List, Optional

from ..schemas import (
    AssetReference,
    AssetType,
    UserReference,
)

# VELARIS backend base URL
VELARIS_BASE = "http://127.0.0.1:8000"  # configured via config.VELARIS_BASE_URL in production


# ─── Minimal PBR material definitions ───────────────────────────────────

METAL_ROUGHNESS = {
    "yellow gold": (0.85, 0.65),
    "rose gold": (0.88, 0.72),
    "white gold": (0.90, 0.55),
    "platinum": (0.92, 0.48),
    "sterling silver": (0.82, 0.78),
    "14k yellow": (0.86, 0.68),
}

GEMS = {
    "diamond": {"color": (255, 255, 255), "roughness": 0.1, "ior": 2.42},
    "ruby": {"color": (224, 36, 36), "roughness": 0.15, "ior": 1.70},
    "sapphire": {"color": (32, 80, 224), "roughness": 0.15, "ior": 1.76},
    "emerald": {"color": (34, 139, 34), "roughness": 0.25, "ior": 1.57},
    "pearl": {"color": (255, 255, 230), "roughness": 0.8, "structural": True},
    "moissanite": {"color": (224, 236, 250), "roughness": 0.1, "ior": 2.65},
}


def metal_roughness(req: Dict[str, Any]) -> tuple[float, float]:
    mn = (req.get("metal") or "yellow gold").lower()
    return METAL_ROUGHNESS.get(mn, METAL_ROUGHNESS["yellow gold"])


def gem_spec(req: Dict[str, Any]) -> dict:
    gn = (req.get("gemstone") or "diamond").lower()
    return GEMS.get(gn, GEMS["diamond"])


class VelarisService:
    """Adapter for VELARIS project services."""

    def __init__(self, base_url: str | None = None):
        self.base_url = base_url or VELARIS_BASE
        self.client = None

    async def __aenter__(self):
        import httpx
        self.client = httpx.AsyncClient(timeout=60.0)
        return self

    async def __aexit__(self, *args):
        if self.client:
            await self.client.aclose()

    # ── Health ───────────────────────────────────────────────────────────

    async def ping(self) -> bool:
        """Check if VELARIS backend is reachable."""
        try:
            if self.client is None:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    await client.get(f"{self.base_url}/api/health")
            return True
        except Exception:
            return False

    # ── Design generation ─────────────────────────────────────────────────

    async def generate_design(self, req: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a jewellery design via VELARIS AI."""
        if self.client is None:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(f"{self.base_url}/api/generate-design", json=req)
                response.raise_for_status()
                return response.json()
        else:
            response = await self.client.post(f"{self.base_url}/api/generate-design", json=req)
            response.raise_for_status()
            return response.json()

    # ── Jewellery advisor ─────────────────────────────────────────────────

    async def jewellery_advisor(self, req: Dict[str, Any]) -> Dict[str, Any]:
        """Get gemstone recommendations and gifting advice from VELARIS."""
        if self.client is None:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(f"{self.base_url}/api/jewellery-advisor", json=req)
                response.raise_for_status()
                return response.json()
        else:
            response = await self.client.post(f"{self.base_url}/api/jewellery-advisor", json=req)
            response.raise_for_status()
            return response.json()

    # ── Design listing ────────────────────────────────────────────────────

    async def list_designs(self) -> Dict[str, Any]:
        """List available jewellery designs from VELARIS backend."""
        if self.client is None:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(f"{self.base_url}/api/trends")
                response.raise_for_status()
                return response.json()
        else:
            response = await self.client.get(f"{self.base_url}/api/trends")
            response.raise_for_status()
            return response.json()

    # ── Design classification ─────────────────────────────────────────────

    async def classify_type(self, req: Dict[str, Any]) -> Dict[str, Any]:
        """Classify a design type from sketch/photo via VELARIS."""
        if self.client is None:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(f"{self.base_url}/api/classify-type", json=req)
                response.raise_for_status()
                return response.json()
        else:
            response = await self.client.post(f"{self.base_url}/api/classify-type", json=req)
            response.raise_for_status()
            return response.json()

    # ── Similar designs ───────────────────────────────────────────────────

    async def find_similar(self, req: Dict[str, Any]) -> Dict[str, Any]:
        """Find similar jewellery designs via VELARIS."""
        if self.client is None:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(f"{self.base_url}/api/similar", json=req)
                response.raise_for_status()
                return response.json()
        else:
            response = await self.client.post(f"{self.base_url}/api/similar", json=req)
            response.raise_for_status()
            return response.json()

    # ── 3D mesh generation ────────────────────────────────────────────────

    async def generate_3d_mesh(self, design_req: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a 3D jewellery mesh via VELARIS rendering pipeline."""
        # First, generate the 2D design via the existing endpoint to get specs
        try:
            design = await self.generate_design(design_req)
        except Exception as e:
            return {"error": f"Design generation failed: {str(e)[:100]}"}

        # Extract design parameters
        gemstone = (design_req.get("gemstone") or design.get("gemstone") or "diamond").lower()
        metal = (design_req.get("metal") or design.get("metal") or "yellow gold").lower()
        carat = float(design_req.get("carat") or design.get("carat") or 1.0)
        shape = (design_req.get("shape") or design.get("shape") or "round").lower()
        jewelry_type = (design_req.get("jewelry_type") or design.get("jewelry_type") or "ring").lower()

        # Build PBR material parameters
        roughness, metal_rough = metal_roughness({"metal": metal})
        gs = gem_spec({"gemstone": gemstone})

        # Generate triangle mesh based on jewellery type
        mesh_data = await self._build_jewelry_mesh(
            jewelry_type=jewelry_type,
            gemstone=gemstone,
            metal=metal,
            carat=cart,
            shape=shape,
            roughness=roughness,
            metal_roughness=metal_rough,
            gem_color=gs["color"],
            gem_roughness=gs["roughness"],
        )

        # Encode as GLTF data URI
        try:
            scene = trimesh.Scene(mesh_data)
            gltf_bytes = scene.dump_gltf()
            gltf_base64 = base64.b64encode(gltf_bytes).decode("utf-8")
            return {
                "mesh_url": f"data:application/gltf+json;base64,{gltf_base64}",
                "format": "gltf",
                "description": f"3D jewellery mesh ({jewelry_type}, {gemstone}, {metal}, {carat}ct)",
            }
        except Exception as e:
            return {"error": f"Mesh generation failed: {str(e)[:100]}"}

    async def _build_jewelry_mesh(
        self,
        jewelry_type: str,
        gemstone: str,
        metal: str,
        carat: float,
        shape: str,
        roughness: float,
        metal_roughness: tuple[float, float],
        gem_color: tuple[int, int, int],
        gem_roughness: float,
    ) -> trimesh.Trimesh:
        """Build a parametric 3D jewellery mesh using trimesh."""
        size_scale = max(0.1, min(5.0, carat ** (1 / 3)))

        if jewelry_type == "ring":
            torus = trimesh.creation.torus(R=0.4 * size_scale, r=0.12 * size_scale, segments=32)
            torus.metadata["material"] = {
                "metal": metal,
                "roughness": roughness,
                "gemstone": gemstone,
            }
            return torus

        elif jewelry_type == "necklace" or jewelry_type == "pendant":
            n = 20
            vertices = []
            for i in range(n):
                theta = 2 * math.pi * i / n
                r_outer = 0.3 * size_scale
                x = r_outer * math.cos(theta)
                y = r_outer * math.sin(theta)
                vertices.append((x, y, 0))
                vertices.append((0, 0, 0.5 * size_scale))
            faces = [[i, (i + 1) % n, n + i] for i in range(n)]
            mesh = trimesh.Trimesh(
                vertices=np.array(vertices[::2]),
                faces=np.array(faces),
            )
            mesh.metadata["material"] = {
                "metal": metal,
                "roughness": roughness,
                "gemstone": gemstone,
            }
            return mesh

        elif jewelry_type == "earrings":
            # Simple stud earrings: hexagonal prism
            hex_verts = []
            for i in range(6):
                a = 2 * math.pi * i / 6
                hex_verts.append((0.1 * size_scale * math.cos(a), 0.1 * size_scale * math.sin(a), 0))
            hex_verts.append((0, 0, 0.3 * size_scale))
            hex_faces = [[6, i, (i + 1) % 6] for i in range(6)]
            mesh = trimesh.Trimesh(
                vertices=np.array(hex_verts),
                faces=np.array(hex_faces),
            )
            mesh.metadata["material"] = {
                "metal": metal,
                "roughness": roughness,
                "gemstone": gemstone,
            }
            return mesh

        elif jewelry_type == "bracelet":
            inner_radius = 0.3 * size_scale
            outer_radius = 0.4 * size_scale
            height = 0.15 * size_scale
            n = 32
            vertices = []
            for i in range(n):
                theta = 2 * math.pi * i / n
                x = math.cos(theta) * outer_radius
                y = math.sin(theta) * outer_radius
                vertices.append((x, y, 0))
                vertices.append((x, y, height))
            faces = []
            for i in range(n):
                i2 = (i + 1) % n
                faces.append([i, i2, i + n, i2 + n])
            mesh = trimesh.Trimesh(
                vertices=np.array(vertices),
                faces=np.array(faces),
            )
            mesh.metadata["material"] = {
                "metal": metal,
                "roughness": roughness,
                "gemstone": gemstone,
            }
            return mesh

        # Default fallback: gemstone sphere
        sphere = trimesh.creation.icosahedron(subdivisions=2)
        sphere.apply_scale(max(0.1, min(5.0, carat ** (1 / 3))))
        sphere.metadata["material"] = {
            "metal": metal,
            "roughness": roughness,
            "gemstone": gemstone,
        }
        return sphere


# Singleton instance — created lazily
_velaris_service: Optional[VelarisService] = None


def get_velaris_service() -> VelarisService:
    """Get or create the VELARIS service singleton."""
    global _velaris_service
    if _velaris_service is None:
        _velaris_service = VelarisService()
    return _velaris_service