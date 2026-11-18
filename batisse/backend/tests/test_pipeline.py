import shutil

import cv2
import numpy as np
import pytest

from app.processing.detect import detect
from app.processing.loader import InputError, LoadedPage, inspect_file, load_page, sniff_kind
from app.processing.pipeline import process_page
from app.processing.preprocess import preprocess
from synth import render_plan

ROOMS = [(100, 100, 500, 500), (500, 100, 900, 500), (100, 500, 500, 700)]
DOORS = [(500, 300, 80, "v"), (300, 500, 80, "h")]
WINDOWS = [(300, 100, 100, "h")]


def plan(**kw):
    return render_plan(ROOMS, doors=DOORS, windows=WINDOWS, **kw)


def loaded(img):
    return LoadedPage(image=img, kind="png", page_index=0, page_count=1)


def test_detects_three_rooms_with_centerline_polygons():
    r = detect(preprocess(plan()).ink)
    assert r.mode == "solid" and len(r.rooms) == 3
    areas = sorted(round(Polygon_area(rm.polygon)) for rm in r.rooms)
    # centerline rectangles: 400x400, 400x400, 400x200
    assert areas == pytest.approx([80000, 160000, 160000], rel=0.03)
    assert all(0.05 <= rm.confidence <= 0.85 for rm in r.rooms)  # never claims certainty


def Polygon_area(pts):
    from shapely.geometry import Polygon
    return Polygon(pts).area


def test_openings_found_and_flagged_unverified():
    out = process_page(loaded(plan()), run_text=False)
    ops = out.geometry.floors[0].openings
    assert len(ops) == 3
    assert all(o.needs_review and o.source == "detected" and o.confidence <= 0.5 for o in ops)
    assert {o.type for o in ops} == {"door", "window"}
    assert all(o.wall_id for o in ops)  # snapped onto derived walls


def test_deskew_corrects_small_rotation_and_still_finds_rooms():
    img = plan(skew_deg=3.0)
    pre = preprocess(img)
    assert any(s.name == "deskew" and s.applied for s in pre.steps)
    assert abs(abs(pre.rotation_deg) - 3.0) < 0.6
    assert len(detect(pre.ink).rooms) == 3


def test_pixel_geometry_blocks_3d_until_scale_known():
    out = process_page(loaded(plan()), run_text=False)
    assert out.geometry.units == "px"
    assert out.geometry.scale.source == "unknown"
    assert any(i.code == "scale_unknown" for i in out.geometry.issues)
    assert out.report.scale_proposals == []
    assert any("scale" in w.lower() for w in out.report.warnings)


def test_thin_outline_plan_is_reported_as_unreliable():
    img = np.full((800, 1000, 3), 255, np.uint8)
    cv2.rectangle(img, (100, 100), (900, 700), (0, 0, 0), 2)
    cv2.line(img, (500, 100), (500, 700), (0, 0, 0), 2)
    out = process_page(loaded(img), run_text=False)
    assert out.report.detection_mode in ("thin", "none")
    assert any("thin" in w.lower() or "no thick" in w.lower() or "almost no wall" in w.lower() for w in out.report.warnings)


def test_blank_page_yields_no_rooms_not_fake_ones():
    out = process_page(loaded(np.full((800, 1000, 3), 255, np.uint8)), run_text=False)
    assert out.report.rooms_found == 0
    assert out.geometry.floors[0].rooms == []


def test_unclosed_walls_do_not_create_rooms():
    img = np.full((800, 1000, 3), 255, np.uint8)
    cv2.line(img, (100, 100), (900, 100), (0, 0, 0), 12)
    cv2.line(img, (100, 100), (100, 700), (0, 0, 0), 12)
    out = process_page(loaded(img), run_text=False)
    assert out.report.rooms_found == 0


@pytest.mark.skipif(shutil.which("tesseract") is None, reason="tesseract not installed")
def test_ocr_reads_labels_and_proposes_scale_from_real_pixels():
    # 0.01 m/px; inner room size ~3.88 m
    labels = [("LIVING 3.9 x 3.9 m", 130, 300), ("KITCHEN 3.9 x 3.9 m", 530, 300)]
    img = render_plan(ROOMS[:2], doors=[(500, 300, 80, "v")], labels=labels, size=(1000, 700))
    out = process_page(loaded(img))
    assert out.report.ocr_engine == "tesseract" and out.report.text_lines_read > 0
    types = {r.room_type for r in out.geometry.floors[0].rooms}
    assert "living" in types or "kitchen" in types, out.report.text_matches
    assert out.report.scale_proposals, out.report.warnings
    assert out.report.scale_proposals[0].meters_per_pixel == pytest.approx(0.01, rel=0.12)
    assert out.report.scale_proposals[0].source == "ocr_dimension"


def test_sniff_and_inspect(tmp_path):
    png = tmp_path / "a.png"
    cv2.imwrite(str(png), plan())
    assert sniff_kind(png.read_bytes()[:16]) == "png"
    assert sniff_kind(b"hello world") is None
    assert inspect_file(png, "png").width == 1000
    tiny = tmp_path / "t.png"
    cv2.imwrite(str(tiny), np.zeros((50, 50, 3), np.uint8))
    with pytest.raises(InputError):
        inspect_file(tiny, "png")
    bad = tmp_path / "bad.png"
    bad.write_bytes(b"\x89PNG\r\n\x1a\n" + b"junk" * 10)
    with pytest.raises(InputError):
        inspect_file(bad, "png")


def test_pdf_page_selection_and_bounds(tmp_path):
    import pymupdf

    png = tmp_path / "plan.png"
    cv2.imwrite(str(png), plan())
    pdf = tmp_path / "two.pdf"
    doc = pymupdf.open()
    doc.new_page(width=595, height=842)  # blank page 1
    p2 = doc.new_page(width=842, height=595)
    p2.insert_image(p2.rect, filename=str(png))
    doc.save(pdf)
    doc.close()
    info = inspect_file(pdf, "pdf")
    assert info.page_count == 2
    blank = process_page(load_page(pdf, "pdf", 0), run_text=False)
    assert blank.report.rooms_found == 0
    real = process_page(load_page(pdf, "pdf", 1), run_text=False)
    assert real.report.rooms_found == 3 and real.report.page_index == 1 and real.report.page_count == 2
    with pytest.raises(InputError):
        load_page(pdf, "pdf", 5)
