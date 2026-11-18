import math

import pytest

from app.geometry import FloorPlanGeometry, Floor, Room, Opening, Scale
from app.geometry.builder import rebuild, apply_scale


def rect(rid, x, y, w, d, name=None):
    return Room(id=rid, name=name or rid, polygon=[(x, y), (x + w, y), (x + w, y + d), (x, y + d)])


def metric(rooms, openings=None):
    return FloorPlanGeometry(
        units="m",
        scale=Scale(source="manual", confidence=1.0),
        floors=[Floor(rooms=rooms, openings=openings or [])],
    )


def test_single_room_walls_and_metrics():
    g = rebuild(metric([rect("a", 0, 0, 4, 3)]))
    f = g.floors[0]
    assert len(f.walls) == 4
    assert sorted(round(w.length, 3) for w in f.walls) == [3.0, 3.0, 4.0, 4.0]
    assert all(w.exterior for w in f.walls)
    assert f.rooms[0].area == pytest.approx(12.0)
    assert (f.rooms[0].width, f.rooms[0].depth) == (4.0, 3.0)
    assert len(f.footprint) == 1


def test_shared_wall_is_single_interior_wall():
    g = rebuild(metric([rect("a", 0, 0, 4, 3), rect("b", 4, 0, 3, 3)]))
    f = g.floors[0]
    interior = [w for w in f.walls if not w.exterior]
    assert len(interior) == 1
    assert interior[0].length == pytest.approx(3.0)
    assert sorted(interior[0].room_ids) == ["a", "b"]
    # 4 + 4 + 3 + 3... perimeter segments of the union plus one shared wall
    assert len(f.walls) == 7


def test_slightly_misaligned_shared_edge_is_merged():
    g = rebuild(metric([rect("a", 0, 0, 4, 3), rect("b", 4.01, 0, 3, 3)]))
    interior = [w for w in g.floors[0].walls if not w.exterior]
    assert len(interior) == 1


def test_partial_overlap_t_junction_splits_walls():
    # B is shorter than A along the shared edge -> shared part is interior, rest exterior
    g = rebuild(metric([rect("a", 0, 0, 4, 4), rect("b", 4, 0, 3, 2)]))
    f = g.floors[0]
    shared = [w for w in f.walls if sorted(w.room_ids) == ["a", "b"]]
    assert len(shared) == 1 and shared[0].length == pytest.approx(2.0)
    only_a_right = [w for w in f.walls if w.room_ids == ["a"] and abs(w.start[0] - 4) < 1e-6 and abs(w.end[0] - 4) < 1e-6]
    assert len(only_a_right) == 1 and only_a_right[0].length == pytest.approx(2.0)


def test_l_shaped_room_has_six_walls():
    l_room = Room(id="l", name="L", polygon=[(0, 0), (4, 0), (4, 2), (2, 2), (2, 4), (0, 4)])
    g = rebuild(metric([l_room]))
    assert len(g.floors[0].walls) == 6
    assert g.floors[0].rooms[0].area == pytest.approx(12.0)


def test_opening_snaps_to_wall_and_gets_offset():
    op = Opening(id="d1", type="door", position=(2.0, 0.03), width=0.9, height=2.1)
    g = rebuild(metric([rect("a", 0, 0, 4, 3)], [op]))
    o = g.floors[0].openings[0]
    assert o.wall_id is not None
    assert o.position[1] == pytest.approx(0.0, abs=1e-9)
    assert o.offset == pytest.approx(2.0)
    assert not [i for i in g.issues if i.code == "opening_not_on_wall"]


def test_opening_away_from_walls_is_flagged_not_cut():
    op = Opening(id="w1", type="window", position=(2.0, 1.5), width=1.2, height=1.2, sill_height=0.9)
    g = rebuild(metric([rect("a", 0, 0, 4, 3)], [op]))
    assert g.floors[0].openings[0].wall_id is None
    assert any(i.code == "opening_not_on_wall" for i in g.issues)


def test_opening_exceeding_wall_and_overlap_are_warned():
    ops = [
        Opening(id="d1", type="door", position=(0.2, 0.0), width=0.9, height=2.1),
        Opening(id="d2", type="door", position=(0.7, 0.0), width=0.9, height=2.1),
    ]
    g = rebuild(metric([rect("a", 0, 0, 4, 3)], ops))
    codes = {i.code for i in g.issues}
    assert "opening_exceeds_wall" in codes
    assert "openings_overlap" in codes


def test_overlapping_rooms_and_self_intersection_warned():
    g = rebuild(metric([rect("a", 0, 0, 4, 3), rect("b", 2, 0, 4, 3)]))
    assert any(i.code == "rooms_overlap" for i in g.issues)
    bow = Room(id="x", polygon=[(0, 0), (2, 2), (2, 0), (0, 2)])
    g = rebuild(metric([bow]))
    assert any(i.code == "room_self_intersecting" for i in g.issues)


def test_pixel_geometry_warns_scale_unknown():
    g = FloorPlanGeometry(units="px", scale=Scale(), floors=[Floor(wall_thickness=6, rooms=[rect("a", 10, 10, 400, 300)])])
    g = rebuild(g)
    assert any(i.code == "scale_unknown" for i in g.issues)


def test_apply_scale_converts_plan_quantities_only():
    op = Opening(id="d1", type="door", position=(210, 10), width=90, height=2.1)
    g = FloorPlanGeometry(
        units="px", scale=Scale(), image_size=(500, 400),
        floors=[Floor(wall_thickness=10, wall_height=2.7, rooms=[rect("a", 10, 10, 400, 300)], openings=[op])],
    )
    g = rebuild(g)
    out = apply_scale(g, meters_per_pixel=0.01, source="user_reference", confidence=0.9)
    f = out.floors[0]
    assert out.units == "m"
    assert out.scale.meters_per_pixel == 0.01
    assert f.rooms[0].width == pytest.approx(4.0)
    assert f.rooms[0].depth == pytest.approx(3.0)
    assert f.wall_thickness == pytest.approx(0.10)
    assert f.wall_height == 2.7  # vertical quantities untouched
    assert f.openings[0].width == pytest.approx(0.9)
    assert f.openings[0].height == 2.1
    assert not any(i.code == "scale_unknown" for i in out.issues)


def test_rescale_metric_geometry():
    g = rebuild(metric([rect("a", 0, 0, 4, 3)]))
    g.scale = Scale(meters_per_pixel=0.01, source="user_reference", confidence=0.8)
    out = apply_scale(g, scale_factor=0.5, source="user_reference", confidence=0.8)
    assert out.floors[0].rooms[0].width == pytest.approx(2.0)
    assert out.scale.meters_per_pixel == pytest.approx(0.005)


def test_schema_rejects_bad_input():
    with pytest.raises(Exception):
        Room(id="a", polygon=[(0, 0), (1, 1)])  # < 3 points
    with pytest.raises(Exception):
        Room(id="a", polygon=[(0, 0), (1, 0), (math.nan, 1)])
    with pytest.raises(Exception):
        FloorPlanGeometry(units="m", scale=Scale())  # metric requires known scale
    with pytest.raises(Exception):
        FloorPlanGeometry(units="px", scale=Scale(source="manual"))
