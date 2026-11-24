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
from ..config import VELARIS_BASE_URL as VELARIS_BASE  # configured via config.VELARIS_BASE_URL in production

# HTTP client for VELARIS backend calls
import httpx


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


METAL_COLORS: Dict[str, tuple] = {
    "yellow gold": (255, 200, 60, 255),
    "white gold": (230, 230, 235, 255),
    "rose gold": (232, 160, 140, 255),
    "platinum": (225, 228, 232, 255),
    "silver": (205, 208, 214, 255),
    "sterling silver": (205, 208, 214, 255),
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
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(f"{self.base_url}/api/health")
            else:
                response = await self.client.get(f"{self.base_url}/api/health")
            return response.status_code < 500
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
        # Only call the (LLM-backed) design endpoint when the caller has not
        # already supplied the jewellery type. Fully specified requests build
        # geometry locally and do not depend on a remote model being available.
        design: Dict[str, Any] = {}
        if not design_req.get("jewelry_type"):
            try:
                design = await self.generate_design(design_req)
            except Exception as e:
                return {"error": f"Design generation failed: {str(e)[:100]}", "status_code": 502}

        # Extract design parameters with validation
        gemstone = (design_req.get("gemstone") or design.get("gemstone") or "diamond").lower()
        metal = (design_req.get("metal") or design.get("metal") or "yellow gold").lower()
        carat = self._validate_carat(design_req.get("carat") or design.get("carat") or 1.0)
        shape = (design_req.get("shape") or design.get("shape") or "round").lower()
        jewelry_type = (design_req.get("jewelry_type") or design.get("jewelry_type") or "ring").lower()

        # Validate jewelry type
        valid_types = ["ring", "necklace", "pendant", "earrings", "bracelet"]
        if jewelry_type not in valid_types:
            return {
                "error": f"Invalid jewelry_type: {jewelry_type}. Must be one of: {', '.join(valid_types)}",
                "status_code": 422,
            }

        # Build PBR material parameters
        roughness, _metal_rough = metal_roughness({"metal": metal})
        gs = gem_spec({"gemstone": gemstone})

        # Generate triangle mesh based on jewellery type
        mesh_data = await self._build_jewelry_mesh(
            jewelry_type=jewelry_type,
            gemstone=gemstone,
            metal=metal,
            carat=carat,
            shape=shape,
            roughness=roughness,
            gem_color=gs["color"],
            gem_roughness=gs["roughness"],
        )

        # Encode as GLTF data URI
        try:
            scene = trimesh.Scene(mesh_data)

            # A successful response must contain real, finite geometry.
            geoms = list(scene.geometry.values())
            if not geoms or any(len(g.faces) == 0 or len(g.vertices) == 0 for g in geoms):
                return {"error": "Mesh generation produced empty geometry", "status_code": 502}
            if any(not np.isfinite(g.vertices).all() for g in geoms):
                return {"error": "Mesh generation produced non-finite vertices", "status_code": 502}

            # Binary glTF (GLB) is the interchange format three.js loads natively.
            glb = scene.export(file_type="glb")
            if not isinstance(glb, (bytes, bytearray)) or len(glb) < 20 or bytes(glb[:4]) != b"glTF":
                return {"error": "Mesh export did not produce a valid GLB", "status_code": 502}
            glb_base64 = base64.b64encode(bytes(glb)).decode("utf-8")

            return {
                "mesh_url": f"data:model/gltf-binary;base64,{glb_base64}",
                "format": "glb",
                "watertight": bool(all(g.is_watertight for g in geoms)),
                "vertex_count": int(sum(len(g.vertices) for g in geoms)),
                "face_count": int(sum(len(g.faces) for g in geoms)),
                "description": f"3D jewellery mesh ({jewelry_type}, {gemstone}, {metal}, {carat}ct)",
            }
        except Exception as e:
            return {"error": f"Mesh generation failed: {str(e)[:100]}", "status_code": 500}

    @staticmethod
    def _validate_carat(carat: Any) -> float:
        """Validate and normalize carat value."""
        try:
            c = float(carat)
        except (TypeError, ValueError):
            c = 1.0
        # Clamp carat to reasonable range
        return max(0.1, min(5.0, c))

    # ── _build_jewelry_mesh ────────────────────────────────────────────────

    async def _build_jewelry_mesh(
        self,
        jewelry_type: str,
        gemstone: str,
        metal: str,
        carat: float,
        shape: str,
        roughness: float,
        gem_roughness: float,
        gem_color: tuple,
    ) -> trimesh.Trimesh:
        """Build a parametric, watertight 3D jewellery mesh with trimesh.

        Every piece is a union of closed primitives (tori, spheres, prisms), so
        the result is a valid manifold mesh: a metal body plus a gemstone,
        each carrying its own face colour. Units are arbitrary but consistent
        (roughly centimetres); the viewer is expected to scale to fit.
        """
        s = max(0.1, min(5.0, carat ** (1 / 3)))  # gem scale from carat
        metal_rgba = METAL_COLORS.get(metal, METAL_COLORS["yellow gold"])
        gem_rgba = tuple(int(c) for c in gem_color[:3]) + (255,)

        def paint(mesh: trimesh.Trimesh, rgba) -> trimesh.Trimesh:
            mesh.visual.face_colors = np.tile(np.array(rgba, dtype=np.uint8), (len(mesh.faces), 1))
            return mesh

        def gem_at(position, scale: float) -> trimesh.Trimesh:
            """Gemstone body; faceting style follows the requested cut."""
            if shape in ("round", "brilliant", "oval", "pear", "cabochon") or gemstone == "pearl":
                gem = trimesh.creation.icosphere(subdivisions=2, radius=1.0)
                if shape == "oval":
                    gem.apply_scale([1.0, 0.75, 0.8])
                elif shape == "pear":
                    gem.apply_scale([0.8, 1.15, 0.8])
            elif shape in ("square", "princess", "cushion", "emerald", "baguette"):
                gem = trimesh.creation.box(extents=[1.5, 1.5, 1.1])
            else:
                gem = trimesh.creation.icosphere(subdivisions=1, radius=1.0)
            gem.apply_scale(scale)
            gem.apply_translation(position)
            return paint(gem, gem_rgba)

        def band(major: float, minor: float, rotate_x: bool = False) -> trimesh.Trimesh:
            t = trimesh.creation.torus(major_radius=major, minor_radius=minor,
                                       major_sections=64, minor_sections=24)
            if rotate_x:
                t.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, [1, 0, 0]))
            return paint(t, metal_rgba)

        parts: List[trimesh.Trimesh] = []
        gem_scale = 0.18 * s

        if jewelry_type == "ring":
            major, minor = 0.95, 0.12                      # ~19 mm inner diameter band
            parts.append(band(major, minor, rotate_x=True))  # band in the XZ plane, axis along Y
            parts.append(gem_at([0.0, 0.0, major + minor + gem_scale * 0.6], gem_scale * 1.8))
            # claw/bezel seat
            seat = trimesh.creation.cylinder(radius=gem_scale * 1.5, height=0.1, sections=24)
            seat.apply_translation([0.0, 0.0, major + minor * 0.8])
            parts.append(paint(seat, metal_rgba))
        elif jewelry_type == "bracelet":
            parts.append(band(3.2, 0.14, rotate_x=True))
            parts.append(gem_at([0.0, 0.0, 3.2 + 0.14 + gem_scale], gem_scale * 2.0))
        elif jewelry_type == "necklace":
            chain = band(7.0, 0.04, rotate_x=True)
            parts.append(chain)
            parts.append(gem_at([0.0, 0.0, -7.0 - 0.1], gem_scale * 2.4))
        elif jewelry_type == "pendant":
            bail = band(0.22, 0.04)                          # hanging loop
            bail.apply_translation([0.0, 0.0, 0.9])
            parts.append(bail)
            parts.append(gem_at([0.0, 0.0, 0.0], gem_scale * 3.0))
        elif jewelry_type == "earrings":
            for sign in (-1.0, 1.0):
                x = sign * 1.2
                parts.append(gem_at([x, 0.0, 0.0], gem_scale * 1.6))
                post = trimesh.creation.cylinder(radius=0.04, height=0.8, sections=16)
                post.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, [1, 0, 0]))
                post.apply_translation([x, -0.45, 0.0])
                parts.append(paint(post, metal_rgba))
        else:
            parts.append(gem_at([0.0, 0.0, 0.0], gem_scale * 3.0))

        mesh = trimesh.util.concatenate(parts)
        mesh.metadata["material"] = {
            "metal": metal,
            "roughness": roughness,
            "gemstone": gemstone,
            "gem_roughness": gem_roughness,
        }
        return mesh


# Singleton instance — created lazily
_velaris_service: Optional[VelarisService] = None


def get_velaris_service() -> VelarisService:
    """Get or create the VELARIS service singleton."""
    global _velaris_service
    if _velaris_service is None:
        _velaris_service = VelarisService()
    return _velaris_service
