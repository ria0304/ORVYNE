import pytest

from app.processing.loader import TextItem
from app.processing.ocr import classify_label, clean_label, group_words_into_lines, parse_dimensions, parse_drawing_ratio
from app.processing.scale import proposals_from_labels

FT, IN = 0.3048, 0.0254


def test_feet_inches_pair():
    d = parse_dimensions("LIVING 12'-6\" x 14'-0\"")
    assert len(d) == 1 and d[0].kind == "pair"
    assert d[0].a_m == pytest.approx(12 * FT + 6 * IN)
    assert d[0].b_m == pytest.approx(14 * FT)


def test_metric_pair_inherits_unit():
    d = parse_dimensions("Bedroom 3.5 x 4.2 m")
    assert d[0].a_m == pytest.approx(3.5) and d[0].b_m == pytest.approx(4.2)


def test_mm_and_comma_decimal():
    assert parse_dimensions("3500mm")[0].a_m == pytest.approx(3.5)
    assert parse_dimensions("3,5 m")[0].a_m == pytest.approx(3.5)


def test_bare_numbers_are_never_guessed():
    assert parse_dimensions("3600") == []
    assert parse_dimensions("3600 x 4200") == []
    assert parse_dimensions("Room 12") == []


def test_implausible_values_rejected():
    assert parse_dimensions("5 mm") == []
    assert parse_dimensions("500 m") == []


def test_drawing_ratio():
    assert parse_drawing_ratio("SCALE 1:100") == 100
    assert parse_drawing_ratio("scale 1 : 50") == 50
    assert parse_drawing_ratio("no scale here") is None
    assert parse_drawing_ratio("1:1") is None


def test_room_labels():
    assert classify_label("MASTER BEDROOM 4x5 m") == "bedroom"
    assert classify_label("W.C.") == "bathroom"
    assert classify_label("Kitchen") == "kitchen"
    assert classify_label("random words") is None
    assert clean_label("LIVING 12'-6\" x 14'-0\"") == "Living"


def test_group_words_into_lines():
    words = [
        TextItem("Living", (10, 10, 60, 30), 1.0, "pdf_text"),
        TextItem("3.5", (65, 10, 90, 30), 1.0, "pdf_text"),
        TextItem("x", (93, 10, 100, 30), 1.0, "pdf_text"),
        TextItem("4.2", (103, 10, 128, 30), 1.0, "pdf_text"),
        TextItem("m", (131, 10, 145, 30), 1.0, "pdf_text"),
        TextItem("Kitchen", (10, 200, 80, 220), 1.0, "pdf_text"),
    ]
    lines = group_words_into_lines(words)
    assert [l.text for l in lines] == ["Living 3.5 x 4.2 m", "Kitchen"]


def _room(rid, x0, y0, x1, y1):
    return (rid, rid, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def test_scale_proposal_from_consistent_labels():
    # 0.01 m/px: 388x388 px inner = 3.88 m
    rooms = [_room("a", 106, 106, 494, 494), _room("b", 506, 106, 894, 494)]
    lines = [
        TextItem("3.9 x 3.9 m", (250, 300, 350, 320), 0.9, "ocr"),
        TextItem("3.9 x 3.9 m", (650, 300, 750, 320), 0.9, "ocr"),
    ]
    props, _ = proposals_from_labels(rooms, lines)
    assert len(props) == 1
    assert props[0].meters_per_pixel == pytest.approx(0.01, rel=0.05)
    assert props[0].confidence > 0.5


def test_scale_not_proposed_when_labels_conflict_with_each_other():
    rooms = [_room("a", 100, 100, 500, 500), _room("b", 600, 100, 1000, 500)]
    lines = [
        TextItem("4 x 4 m", (250, 300, 350, 320), 0.9, "ocr"),
        TextItem("8 x 8 m", (750, 300, 850, 320), 0.9, "ocr"),
    ]
    props, notes = proposals_from_labels(rooms, lines)
    assert props == []
    assert any("disagree" in n for n in notes)


def test_scale_not_proposed_when_width_depth_inconsistent_with_shape():
    rooms = [_room("a", 100, 100, 500, 500)]  # square in pixels
    lines = [TextItem("4 x 8 m", (250, 300, 350, 320), 0.9, "ocr")]
    props, notes = proposals_from_labels(rooms, lines)
    assert props == [] and any("inconsistent" in n for n in notes)
