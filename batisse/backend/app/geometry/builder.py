"""Deterministic geometry reconstruction: rooms + openings -> validated geometry
with derived walls, footprint, areas and issues. Pure functions, no I/O."""
from __future__ import annotations

import math
from typing import Iterable

from shapely.geometry import LineString, MultiLineString, Point as ShPoint, Polygon
from shapely.ops import unary_union

from .schema import FloorPlanGeometry, Floor, Issue, Opening, Room, Wall

Pt = tuple[float, float]

DEFAULT_WALL_HEIGHT_NOTE = (
    "Wall height is an adjustable default assumption (not extracted from the plan)."
)


def snap_tolerance(units: str) -> float:
    """Vertex-merge tolerance in plan units (2 cm or 2 px)."""
    return 0.02 if units == "m" else 2.0


# ---------------------------------------------------------------- rooms

def room_polygon(room: Room) -> Polygon:
    return Polygon(room.polygon)


def _update_room_metrics(room: Room) -> None:
    poly = room_polygon(room)
    minx, miny, maxx, maxy = poly.bounds
    room.area = float(abs(poly.area))
    room.width = float(maxx - minx)
    room.depth = float(maxy - miny)


# ---------------------------------------------------------------- walls

def _cluster_points(rings: Iterable[list[Pt]], tol: float) -> list[list[Pt]]:
    """Merge vertices closer than ``tol`` so shared walls become exactly coincident."""
    centers: list[Pt] = []

    def snap(p: Pt) -> Pt:
        for c in centers:
            if math.hypot(c[0] - p[0], c[1] - p[1]) <= tol:
                return c
        centers.append(p)
        return p

    return [[snap(p) for p in ring] for ring in rings]


def _snap_to_segments(rings: list[list[Pt]], tol: float) -> list[list[Pt]]:
    """Insert vertices into edges where another ring's vertex lies on that edge
    (T-junctions), so noding is exact."""
    all_vertices = {p for ring in rings for p in ring}
    out: list[list[Pt]] = []
    for ring in rings:
        new_ring: list[Pt] = []
        n = len(ring)
        for i in range(n):
            a, b = ring[i], ring[(i + 1) % n]
            new_ring.append(a)
            seg = LineString([a, b])
            if seg.length == 0:
                continue
            ins = []
            for v in all_vertices:
                if v == a or v == b:
                    continue
                if seg.distance(ShPoint(v)) <= tol:
                    t = seg.project(ShPoint(v))
                    if tol < t < seg.length - tol:
                        ins.append((t, v))
            ins.sort()
            new_ring.extend(v for _, v in ins)
        out.append(new_ring)
    return out


def _segments(geom) -> list[tuple[Pt, Pt]]:
    lines = []
    if isinstance(geom, LineString):
        lines = [geom]
    elif isinstance(geom, MultiLineString):
        lines = list(geom.geoms)
    elif hasattr(geom, "geoms"):
        lines = [g for g in geom.geoms if isinstance(g, LineString)]
    segs: list[tuple[Pt, Pt]] = []
    for ln in lines:
        c = list(ln.coords)
        for i in range(len(c) - 1):
            if c[i] != c[i + 1]:
                segs.append(((c[i][0], c[i][1]), (c[i + 1][0], c[i + 1][1])))
    return segs


def _merge_collinear(segs: list[tuple[Pt, Pt]], tol: float) -> list[tuple[Pt, Pt]]:
    """Merge segments that meet at a degree-2 node and are collinear."""
    segs = list(segs)

    def key(p: Pt) -> tuple[int, int]:
        return (round(p[0] / (tol / 4)), round(p[1] / (tol / 4)))

    changed = True
    while changed:
        changed = False
        nodes: dict[tuple[int, int], list[int]] = {}
        for i, (a, b) in enumerate(segs):
            nodes.setdefault(key(a), []).append(i)
            nodes.setdefault(key(b), []).append(i)
        for _, idxs in nodes.items():
            if len(idxs) != 2 or idxs[0] == idxs[1]:
                continue
            i, j = idxs
            a1, b1 = segs[i]
            a2, b2 = segs[j]
            # find shared node, and the far ends
            ends1, ends2 = [a1, b1], [a2, b2]
            shared = None
            for p in ends1:
                for q in ends2:
                    if key(p) == key(q):
                        shared = (p, q)
            if shared is None:
                continue
            far1 = b1 if key(a1) == key(shared[0]) else a1
            far2 = b2 if key(a2) == key(shared[1]) else a2
            v1 = (shared[0][0] - far1[0], shared[0][1] - far1[1])
            v2 = (far2[0] - shared[1][0], far2[1] - shared[1][1])
            cross = v1[0] * v2[1] - v1[1] * v2[0]
            dot = v1[0] * v2[0] + v1[1] * v2[1]
            l1, l2 = math.hypot(*v1), math.hypot(*v2)
            if l1 == 0 or l2 == 0:
                continue
            if abs(cross) / (l1 * l2) < 1e-3 and dot > 0:
                for idx in sorted((i, j), reverse=True):
                    segs.pop(idx)
                segs.append((far1, far2))
                changed = True
                break
    return segs


def derive_walls(floor: Floor, units: str) -> list[Wall]:
    """Derive wall segments from room boundaries. Shared boundaries become one wall."""
    tol = snap_tolerance(units)
    rooms = [r for r in floor.rooms if len(r.polygon) >= 3]
    if not rooms:
        return []
    rings = [list(r.polygon) for r in rooms]
    rings = _cluster_points(rings, tol)
    rings = _snap_to_segments(rings, tol)

    lines = []
    for ring in rings:
        pts = ring + [ring[0]]
        for a, b in zip(pts[:-1], pts[1:]):
            if a != b:
                lines.append(LineString([a, b]))
    noded = unary_union(lines)
    segs = _merge_collinear(_segments(noded), tol)
    segs = [s for s in segs if math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) > tol]

    room_polys = [(r.id, Polygon(ring)) for r, ring in zip(rooms, rings)]
    walls: list[Wall] = []
    for n, (a, b) in enumerate(sorted(segs), start=1):
        seg = LineString([a, b])
        mid = seg.interpolate(0.5, normalized=True)
        owners = [rid for rid, poly in room_polys if poly.exterior.distance(mid) <= tol * 1.5]
        walls.append(
            Wall(
                id=f"wall-{n}",
                start=a,
                end=b,
                thickness=floor.wall_thickness,
                height=floor.wall_height,
                exterior=len(owners) <= 1,
                room_ids=sorted(owners),
                source="derived",
                length=float(seg.length),
            )
        )
    return walls


# ---------------------------------------------------------------- openings

def _closest_wall(op: Opening, walls: list[Wall]) -> tuple[Wall | None, float, float]:
    best: tuple[Wall | None, float, float] = (None, math.inf, 0.0)
    p = ShPoint(op.position)
    for w in walls:
        seg = LineString([w.start, w.end])
        d = seg.distance(p)
        if d < best[1]:
            best = (w, d, seg.project(p))
    return best


def attach_openings(floor: Floor, units: str) -> list[Issue]:
    """Snap each opening to its nearest wall and compute ``wall_id`` / ``offset``."""
    issues: list[Issue] = []
    tol = snap_tolerance(units)
    for op in floor.openings:
        wall, dist, offset = _closest_wall(op, floor.walls)
        reach = max(wall.thickness * 1.5, tol * 5) if wall else 0.0
        if wall is None or dist > reach:
            op.wall_id, op.offset = None, None
            issues.append(Issue(severity="warning", code="opening_not_on_wall",
                                message=f"{op.type.title()} '{op.id}' is not on any wall and will not be cut.",
                                ref=op.id))
            continue
        seg = LineString([wall.start, wall.end])
        snapped = seg.interpolate(offset)
        op.position = (float(snapped.x), float(snapped.y))
        op.wall_id, op.offset = wall.id, float(offset)
        half = op.width / 2
        if offset - half < -tol or offset + half > wall.length + tol:
            issues.append(Issue(severity="warning", code="opening_exceeds_wall",
                                message=f"{op.type.title()} '{op.id}' extends past the end of its wall; it will be clipped.",
                                ref=op.id))
        if op.sill_height + op.height > wall.height + 1e-6:
            issues.append(Issue(severity="warning", code="opening_taller_than_wall",
                                message=f"{op.type.title()} '{op.id}' is taller than the wall ({wall.height:.2f} m); it will be clipped.",
                                ref=op.id))
    # overlap between openings on the same wall
    by_wall: dict[str, list[Opening]] = {}
    for op in floor.openings:
        if op.wall_id:
            by_wall.setdefault(op.wall_id, []).append(op)
    for wid, ops in by_wall.items():
        ops.sort(key=lambda o: o.offset or 0.0)
        for a, b in zip(ops, ops[1:]):
            if (a.offset or 0) + a.width / 2 > (b.offset or 0) - b.width / 2 + tol:
                issues.append(Issue(severity="warning", code="openings_overlap",
                                    message=f"Openings '{a.id}' and '{b.id}' overlap on {wid}.", ref=b.id))
    return issues


# ---------------------------------------------------------------- footprint & validation

def _footprint(floor: Floor, units: str) -> list[list[Pt]]:
    polys = [room_polygon(r) for r in floor.rooms if len(r.polygon) >= 3]
    polys = [p.buffer(0) if not p.is_valid else p for p in polys]
    if not polys:
        return []
    tol = snap_tolerance(units)
    merged = unary_union(polys).buffer(tol).buffer(-tol)
    geoms = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
    return [[(float(x), float(y)) for x, y in g.exterior.coords[:-1]] for g in geoms if not g.is_empty]


def validate_floor(floor: Floor, units: str) -> list[Issue]:
    issues: list[Issue] = []
    tol = snap_tolerance(units)
    ids = [r.id for r in floor.rooms]
    for rid in {i for i in ids if ids.count(i) > 1}:
        issues.append(Issue(severity="error", code="duplicate_room_id", message=f"Duplicate room id '{rid}'.", ref=rid))
    min_area = 0.5 if units == "m" else 100.0
    polys: list[tuple[Room, Polygon]] = []
    for r in floor.rooms:
        poly = room_polygon(r)
        if not poly.is_valid:
            issues.append(Issue(severity="warning", code="room_self_intersecting",
                                message=f"Room '{r.name}' has a self-intersecting outline.", ref=r.id))
        elif poly.area < min_area:
            issues.append(Issue(severity="warning", code="room_tiny",
                                message=f"Room '{r.name}' is very small ({poly.area:.2f} {units}²).", ref=r.id))
        if r.source == "detected" and r.confidence < 0.5:
            issues.append(Issue(severity="warning", code="low_confidence_room",
                                message=f"Room '{r.name}' was detected with low confidence ({r.confidence:.0%}). Please verify.",
                                ref=r.id))
        if poly.is_valid:
            polys.append((r, poly))
    for i in range(len(polys)):
        for j in range(i + 1, len(polys)):
            inter = polys[i][1].intersection(polys[j][1]).area
            if inter > max(tol * tol * 4, 0.02 * min(polys[i][1].area, polys[j][1].area)):
                issues.append(Issue(severity="warning", code="rooms_overlap",
                                    message=f"Rooms '{polys[i][0].name}' and '{polys[j][0].name}' overlap.",
                                    ref=polys[j][0].id))
    for op in floor.openings:
        if op.needs_review:
            issues.append(Issue(severity="info", code="opening_needs_review",
                                message=f"{op.type.title()} '{op.id}' is an unverified detection candidate.", ref=op.id))
    return issues


# ---------------------------------------------------------------- public API

def rebuild(geometry: FloorPlanGeometry) -> FloorPlanGeometry:
    """Recompute all derived data (walls, footprint, metrics, issues) from rooms and openings."""
    g = geometry.model_copy(deep=True)
    issues: list[Issue] = []
    if g.units == "px":
        issues.append(Issue(severity="warning", code="scale_unknown",
                            message="Scale is unknown. Set a scale reference or enter a known dimension before generating 3D; dimensions are never guessed."))
    for floor in g.floors:
        for r in floor.rooms:
            _update_room_metrics(r)
        issues.extend(validate_floor(floor, g.units))
        floor.walls = derive_walls(floor, g.units)
        issues.extend(attach_openings(floor, g.units))
        floor.footprint = _footprint(floor, g.units)
        if floor.rooms:
            issues.append(Issue(severity="info", code="wall_height_assumed", message=DEFAULT_WALL_HEIGHT_NOTE, ref=floor.id))
    g.issues = issues
    return g


def scale_plan_quantities(geometry: FloorPlanGeometry, factor: float) -> FloorPlanGeometry:
    """Multiply all plan-plane quantities by ``factor`` (vertical ones are untouched)."""
    g = geometry.model_copy(deep=True)
    for f in g.floors:
        f.wall_thickness *= factor
        for r in f.rooms:
            r.polygon = [(x * factor, y * factor) for x, y in r.polygon]
        for o in f.openings:
            o.position = (o.position[0] * factor, o.position[1] * factor)
            o.width *= factor
            o.offset = None
            o.wall_id = None
    return g


def apply_scale(
    geometry: FloorPlanGeometry,
    *,
    meters_per_pixel: float | None = None,
    scale_factor: float | None = None,
    source: str,
    confidence: float,
    note: str | None = None,
) -> FloorPlanGeometry:
    """Convert pixel geometry to meters (``meters_per_pixel``), or correct metric
    geometry by ``scale_factor`` (new_size / old_size)."""
    if geometry.units == "px":
        if meters_per_pixel is None or meters_per_pixel <= 0:
            raise ValueError("meters_per_pixel is required to convert pixel geometry")
        g = scale_plan_quantities(geometry, meters_per_pixel)
        g.units = "m"
        g.scale = type(geometry.scale)(meters_per_pixel=meters_per_pixel, source=source, confidence=confidence, note=note)
    else:
        if scale_factor is None or scale_factor <= 0:
            raise ValueError("scale_factor is required to rescale metric geometry")
        g = scale_plan_quantities(geometry, scale_factor)
        old = geometry.scale.meters_per_pixel
        g.scale = type(geometry.scale)(
            meters_per_pixel=(old * scale_factor) if old else None,
            source=source, confidence=confidence, note=note,
        )
    return rebuild(g)
