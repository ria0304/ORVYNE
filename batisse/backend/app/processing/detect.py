"""Classical (non-ML) floor-plan detector: walls, rooms, and door/window candidates.

Scope and honesty
-----------------
* Works for plans whose walls are drawn as solid / thick strokes and are roughly
  axis-aligned after deskew. Thin double-line walls, curved walls and diagonal walls
  are NOT reliably supported; the detector says so instead of pretending.
* Door/window "detections" are gap candidates between collinear wall runs. They are
  unverified and flagged ``needs_review``.
* Confidence values are transparent heuristics, NOT calibrated accuracy.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

import cv2
import numpy as np
from shapely.geometry import Polygon

Pt = tuple[float, float]


@dataclass
class DetectorParams:
    min_room_area_frac: float = 0.002
    wall_open_frac: float = 0.6
    max_gap_wall_mult: float = 12.0
    max_gap_img_frac: float = 0.15
    max_room_frac: float = 0.6


@dataclass
class DetectedRoom:
    polygon_inner: list[Pt]  # at wall inner faces (px) - used for dimension matching
    polygon: list[Pt]  # offset to wall centerlines (px) - used for geometry
    area_px: float
    confidence: float
    bridged_gaps: int = 0


@dataclass
class DetectedOpening:
    center: Pt
    width_px: float
    orientation: Literal["h", "v"]
    kind: Literal["door", "window"]
    confidence: float
    note: str = ""


@dataclass
class DetectionResult:
    rooms: list[DetectedRoom] = field(default_factory=list)
    openings: list[DetectedOpening] = field(default_factory=list)
    wall_thickness_px: float = 0.0
    wall_mask: np.ndarray | None = None
    wall_coverage: float = 0.0
    mode: Literal["solid", "thin", "none"] = "none"
    warnings: list[str] = field(default_factory=list)


# --------------------------------------------------------------- wall thickness

def estimate_wall_thickness(ink: np.ndarray) -> float | None:
    """Most common thick stroke width (px), from ridges of the distance transform."""
    h, w = ink.shape[:2]
    dist = cv2.distanceTransform(ink, cv2.DIST_L2, 5)
    ridge = (dist >= cv2.dilate(dist, np.ones((3, 3), np.float32)) - 1e-6) & (dist > 1.5)
    widths = np.round(dist[ridge] * 2).astype(int)
    # A wall stroke must be clearly thicker than text/dimension lines: at least ~0.4% of the image size.
    min_w = max(5, int(round(0.004 * max(h, w))))
    widths = widths[(widths >= min_w) & (widths <= 120)]
    if widths.size == 0:
        return None
    hist = np.bincount(widths, minlength=122).astype(float)
    smooth = np.convolve(hist, np.ones(3), mode="same")
    peak = int(np.argmax(smooth))
    if smooth[peak] < 0.4 * (w + h):  # not enough long thick strokes to be walls
        return None
    return float(peak)


def extract_wall_mask(ink: np.ndarray, t: float, open_frac: float) -> np.ndarray:
    k = max(3, int(round(t * open_frac)))
    walls = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((k, k), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(walls, connectivity=8)
    keep = np.zeros_like(walls)
    min_area = (2 * t) ** 2
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_area and max(stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]) >= 3 * t:
            keep[labels == i] = 255
    return keep


# --------------------------------------------------------------- gaps

@dataclass
class _Gap:
    cx: float
    cy: float
    width: float
    thick: float
    orient: Literal["h", "v"]
    rect: tuple[int, int, int, int]  # x0, y0, x1, y1 (inclusive) to fill


def _runs(walls: np.ndarray, t: float, orient: Literal["h", "v"]) -> list[tuple[int, int, int, int]]:
    L = max(int(3 * t), 12)
    kernel = np.ones((1, L), np.uint8) if orient == "h" else np.ones((L, 1), np.uint8)
    runs = cv2.morphologyEx(walls, cv2.MORPH_OPEN, kernel)
    n, _, stats, _ = cv2.connectedComponentsWithStats(runs, connectivity=8)
    segs = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        thick = h if orient == "h" else w
        length = w if orient == "h" else h
        if length < L or not (0.5 * t <= thick <= 2.6 * t):
            continue
        if area / float(w * h) < 0.7:
            continue
        segs.append((int(x), int(y), int(x + w - 1), int(y + h - 1)))
    return segs


def find_gaps(walls: np.ndarray, t: float, p: DetectorParams) -> list[_Gap]:
    h, w = walls.shape[:2]
    max_gap = min(p.max_gap_wall_mult * t, p.max_gap_img_frac * max(h, w))
    gaps: list[_Gap] = []
    for orient in ("h", "v"):
        segs = _runs(walls, t, orient)
        # position of the wall band across, and along the wall
        def across(s):
            return (s[1] + s[3]) / 2 if orient == "h" else (s[0] + s[2]) / 2

        def start(s):
            return s[0] if orient == "h" else s[1]

        def end(s):
            return s[2] if orient == "h" else s[3]

        def thick(s):
            return (s[3] - s[1] + 1) if orient == "h" else (s[2] - s[0] + 1)

        segs.sort(key=lambda s: (round(across(s) / max(t, 1)), start(s)))
        for a, b in zip(segs, segs[1:]):
            if abs(across(a) - across(b)) > 0.6 * max(thick(a), thick(b)):
                continue
            g = start(b) - end(a) - 1
            if g < t or g > max_gap:
                continue
            th = max(thick(a), thick(b))
            mid_along = (end(a) + start(b)) / 2
            mid_across = (across(a) + across(b)) / 2
            # Overlap the bridge a few px into the neighbouring wall ends (already wall) so
            # ragged wall ends cannot leave a one-pixel leak between rooms.
            ov = max(2, int(round(0.25 * t)))
            half = int(np.ceil(th / 2)) + 1
            if orient == "h":
                rect = (end(a) + 1 - ov, int(mid_across) - half, start(b) - 1 + ov, int(mid_across) + half)
                gaps.append(_Gap(mid_along, mid_across, g, th, "h", rect))
            else:
                rect = (int(mid_across) - half, end(a) + 1 - ov, int(mid_across) + half, start(b) - 1 + ov)
                gaps.append(_Gap(mid_across, mid_along, g, th, "v", rect))
    return gaps


# --------------------------------------------------------------- clustering

def _cluster_1d(values: list[float], tol: float) -> dict[float, float]:
    vs = sorted(set(values))
    mapping: dict[float, float] = {}
    group: list[float] = []

    def flush():
        if group:
            m = float(np.mean(group))
            for g in group:
                mapping[g] = m

    for v in vs:
        if group and v - group[0] > tol:
            flush()
            group = []
        group.append(v)
    flush()
    return mapping


def _snap_polygons(polys: list[list[Pt]], tol: float) -> list[list[Pt]]:
    xs = _cluster_1d([p[0] for poly in polys for p in poly], tol)
    ys = _cluster_1d([p[1] for poly in polys for p in poly], tol)
    out = []
    for poly in polys:
        snapped = [(xs[x], ys[y]) for x, y in poly]
        dedup = [p for i, p in enumerate(snapped) if p != snapped[i - 1]]
        out.append(dedup)
    return out


# --------------------------------------------------------------- main

def _label_at(labels: np.ndarray, x: float, y: float) -> int:
    h, w = labels.shape[:2]
    xi, yi = int(round(x)), int(round(y))
    win = labels[max(0, yi - 1):min(h, yi + 2), max(0, xi - 1):min(w, xi + 2)]
    vals = win[win > 0]
    if vals.size == 0:
        return 0
    return int(np.bincount(vals).argmax())


def detect(ink: np.ndarray, params: DetectorParams | None = None) -> DetectionResult:
    p = params or DetectorParams()
    res = DetectionResult()
    h, w = ink.shape[:2]
    t = estimate_wall_thickness(ink)
    if t is None:
        res.mode = "thin"
        res.warnings.append(
            "No thick wall strokes were found. The plan may draw walls as thin outlines, which this "
            "detector does not support reliably. Use manual room entry or trace over the plan."
        )
        t = 3.0
        walls = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    else:
        res.mode = "solid"
        walls = extract_wall_mask(ink, t, p.wall_open_frac)
    res.wall_thickness_px = float(t)
    res.wall_mask = walls
    res.wall_coverage = float((walls > 0).mean())
    if res.wall_coverage < 0.002:
        res.mode = "none"
        res.warnings.append("Almost no wall pixels were detected; no rooms could be extracted.")
        return res

    gaps = find_gaps(walls, t, p) if res.mode == "solid" else []
    closed = walls.copy()
    for g in gaps:
        x0, y0, x1, y1 = g.rect
        cv2.rectangle(closed, (x0, y0), (x1, y1), 255, thickness=-1)

    free = (closed == 0).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(free, connectivity=4)
    border = set(np.unique(np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])).tolist())

    accepted: dict[int, tuple[list[Pt], float]] = {}
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if i in border:
            continue
        if area < p.min_room_area_frac * w * h or min(bw, bh) < 3 * t:
            continue
        if area > p.max_room_frac * w * h:
            res.warnings.append("A very large enclosed region was ignored (possibly a page border or title block).")
            continue
        mask = (labels == i).astype(np.uint8)
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        c = max(cnts, key=cv2.contourArea)
        approx = cv2.approxPolyDP(c, max(2.0, 0.012 * cv2.arcLength(c, True)), True)
        pts = [(float(a), float(b)) for a, b in approx.reshape(-1, 2)]
        if len(pts) < 3:
            continue
        accepted[i] = (pts, float(cv2.contourArea(c)))

    if not accepted:
        res.warnings.append("No enclosed rooms were found. Walls may not form closed rooms, or gaps are too wide.")
        return res

    ids = list(accepted)
    inner = _snap_polygons([accepted[i][0] for i in ids], tol=max(2.0, 0.5 * t))
    centre: list[list[Pt]] = []
    for pts in inner:
        poly = Polygon(pts)
        if not poly.is_valid:
            poly = poly.buffer(0)
        off = poly.buffer(t / 2, join_style=2, mitre_limit=2.0)
        if off.geom_type != "Polygon":
            off = max(off.geoms, key=lambda g: g.area)
        centre.append([(float(x), float(y)) for x, y in off.exterior.coords[:-1]])
    centre = _snap_polygons(centre, tol=max(2.0, 0.5 * t))

    # openings + per-room bridged-gap counts
    bridged: dict[int, int] = {i: 0 for i in ids}
    for g in gaps:
        if g.orient == "h":
            a = _label_at(labels, g.cx, g.cy - g.thick / 2 - 3)
            b = _label_at(labels, g.cx, g.cy + g.thick / 2 + 3)
        else:
            a = _label_at(labels, g.cx - g.thick / 2 - 3, g.cy)
            b = _label_at(labels, g.cx + g.thick / 2 + 3, g.cy)
        for side in (a, b):
            if side in bridged:
                bridged[side] += 1
        if a == b:
            continue
        a_in, b_in = a in accepted, b in accepted
        if a_in and b_in:
            kind, conf, note = "door", 0.40, "Gap between two rooms."
        elif a_in or b_in:
            kind, conf, note = "window", 0.30, "Gap in an outer wall; could be a window or an entrance door."
        else:
            continue
        res.openings.append(DetectedOpening((g.cx, g.cy), float(g.width), g.orient, kind, conf, note))

    for idx, i in enumerate(ids):
        pts_inner, carea = inner[idx], accepted[i][1]
        poly_area = Polygon(pts_inner).area if len(pts_inner) >= 3 else 0.0
        fidelity = min(poly_area, carea) / max(poly_area, carea, 1e-9)
        conf = 0.35 + 0.5 * fidelity - 0.12 * min(2, bridged[i]) - (0.15 if res.mode == "thin" else 0.0)
        conf = float(max(0.05, min(0.85, conf)))
        res.rooms.append(DetectedRoom(pts_inner, centre[idx], float(carea), conf, bridged[i]))

    res.warnings.append(
        "Detection is heuristic. Confidence scores are not calibrated accuracy; verify every room and opening."
    )
    return res
