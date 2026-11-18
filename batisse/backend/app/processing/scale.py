"""Scale *proposals* from evidence found in the plan. Nothing here is applied
automatically; the user confirms a proposal or provides a reference.

Sources:
  * ``ocr_dimension`` - room labels like ``12'-6" x 14'-0"`` or ``3.5 x 4.2 m`` that sit
    inside a detected room, compared with that room's measured size in pixels.
  * ``vector`` - a drawing-scale note like ``1:100`` on a PDF page, combined with the
    PDF's physical page size (assumes the PDF is at its intended print size).
"""
from __future__ import annotations

import statistics
from typing import Literal

import numpy as np
from pydantic import BaseModel, Field
from shapely.geometry import Point, Polygon

from .loader import TextItem
from .ocr import parse_dimensions, parse_drawing_ratio

PT_M = 0.0254 / 72.0  # meters per PDF point


class ScaleProposal(BaseModel):
    source: Literal["ocr_dimension", "vector"]
    meters_per_pixel: float = Field(gt=0)
    confidence: float = Field(ge=0, le=1)
    evidence: list[str] = Field(default_factory=list)


def proposals_from_labels(
    rooms: list[tuple[str, str, list[tuple[float, float]]]],  # (room_id, room_name, inner polygon px)
    lines: list[TextItem],
) -> tuple[list[ScaleProposal], list[str]]:
    notes: list[str] = []
    cands: list[tuple[float, str]] = []
    polys = [(rid, name, Polygon(p)) for rid, name, p in rooms]
    for line in lines:
        dims = [d for d in parse_dimensions(line.text) if d.kind == "pair"]
        if not dims:
            continue
        cx, cy = (line.bbox[0] + line.bbox[2]) / 2, (line.bbox[1] + line.bbox[3]) / 2
        host = next(((rid, name, poly) for rid, name, poly in polys if poly.is_valid and poly.contains(Point(cx, cy))), None)
        if host is None:
            continue
        rid, name, poly = host
        minx, miny, maxx, maxy = poly.bounds
        bw, bh = maxx - minx, maxy - miny
        if poly.area / max(bw * bh, 1e-9) < 0.85:
            notes.append(f"Label '{dims[0].raw}' is in non-rectangular room '{name}'; skipped for scale.")
            continue
        long_px, short_px = max(bw, bh), min(bw, bh)
        a, b = sorted((dims[0].a_m, dims[0].b_m or 0), reverse=True)
        r_long, r_short = a / long_px, b / short_px
        mean = (r_long + r_short) / 2
        if abs(r_long - r_short) / mean <= 0.10:
            cands.append((mean, f"{name}: label '{dims[0].raw}' vs measured {long_px:.0f}x{short_px:.0f}px -> {mean:.5f} m/px"))
        else:
            notes.append(
                f"Label '{dims[0].raw}' in '{name}' is inconsistent with the detected room shape "
                f"(width and depth imply different scales); ignored."
            )
    if not cands:
        return [], notes
    ratios = [c[0] for c in cands]
    med = float(statistics.median(ratios))
    spread = max(ratios) / min(ratios)
    if len(cands) >= 2 and spread > 1.15:
        notes.append(f"Dimension labels disagree with each other (spread {spread:.2f}x); no scale proposed.")
        return [], notes
    conf = 0.45 if len(cands) == 1 else min(0.8, 0.45 + 0.1 * len(cands))
    return [ScaleProposal(source="ocr_dimension", meters_per_pixel=med, confidence=conf, evidence=[c[1] for c in cands])], notes


def proposal_from_drawing_ratio(
    lines: list[TextItem], render_scale: float | None, page_size_pt: tuple[float, float] | None, transform: np.ndarray
) -> ScaleProposal | None:
    if render_scale is None or page_size_pt is None:
        return None
    for line in lines:
        ratio = parse_drawing_ratio(line.text)
        if ratio:
            s_total = float(np.sqrt(abs(np.linalg.det(transform[:2, :2]))))
            px_per_pt = render_scale * s_total
            if px_per_pt <= 0:
                return None
            mpp = PT_M * ratio / px_per_pt
            return ScaleProposal(
                source="vector", meters_per_pixel=mpp, confidence=0.5,
                evidence=[f"Drawing scale note '{line.text.strip()}' (1:{ratio}) with the PDF page size; assumes the PDF is at its intended print size."],
            )
    return None
