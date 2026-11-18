"""End-to-end floor-plan processing: load -> preprocess -> detect -> text -> geometry."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field
from shapely.geometry import Point, Polygon

from ..geometry import Floor, FloorPlanGeometry, Opening, Room, Scale
from ..geometry.builder import rebuild
from . import detect as det
from .loader import LoadedPage, TextItem, encode_png
from .ocr import (OcrOutcome, classify_label, clean_label, group_words_into_lines, map_bbox,
                  parse_dimensions, run_ocr)
from .preprocess import PreprocessResult, preprocess
from .scale import ScaleProposal, proposal_from_drawing_ratio, proposals_from_labels

DETECTOR_NAME = "classical-v1"

NOT_ATTEMPTED = [
    "Stairs, furniture, fixtures and annotations are not interpreted.",
    "Diagonal or curved walls are not supported by the classical detector.",
    "Multi-storey plans are treated as one floor; page = one floor.",
    "Wall heights, door heights and window sill heights are NOT detected (adjustable defaults are used).",
]


class StepOut(BaseModel):
    name: str
    applied: bool
    detail: str
    confidence: Optional[float] = None


class TextMatch(BaseModel):
    text: str
    kind: Literal["room_label", "dimension"]
    room_id: Optional[str] = None
    confidence: float


class ProcessingReport(BaseModel):
    detector: str = DETECTOR_NAME
    is_ml_model: bool = False
    input_kind: str
    page_index: int
    page_count: int
    image_size: tuple[int, int]
    pdf_vector_paths: int = 0
    preprocess: list[StepOut]
    detection_mode: str
    wall_thickness_px: float
    wall_coverage: float
    rooms_found: int
    openings_found: int
    ocr_engine: str
    ocr_available: bool
    ocr_note: str = ""
    text_lines_read: int = 0
    text_matches: list[TextMatch] = Field(default_factory=list)
    scale_proposals: list[ScaleProposal] = Field(default_factory=list)
    overall_confidence: Optional[float] = None
    warnings: list[str] = Field(default_factory=list)
    not_attempted: list[str] = Field(default_factory=lambda: list(NOT_ATTEMPTED))


class ProcessingOutput(BaseModel):
    model_config = {"arbitrary_types_allowed": True}
    geometry: FloorPlanGeometry
    report: ProcessingReport
    plan_png: bytes = b""


def _collect_text(loaded: LoadedPage, pre: PreprocessResult) -> OcrOutcome:
    if loaded.text_items:
        mapped = [
            TextItem(t.text, map_bbox(t.bbox, pre.transform), t.confidence, "pdf_text")
            for t in loaded.text_items
        ]
        return OcrOutcome(group_words_into_lines(mapped), "pdf_text", True, "Read from the PDF text layer (exact, not OCR).")
    return run_ocr(pre.gray)


def process_page(loaded: LoadedPage, *, run_text: bool = True) -> ProcessingOutput:
    pre = preprocess(loaded.image)
    h, w = pre.image.shape[:2]
    result = det.detect(pre.ink)

    rooms: list[Room] = []
    for i, dr in enumerate(result.rooms, start=1):
        rooms.append(Room(
            id=f"room-{i}", name=f"Room {i}", room_type="other",
            polygon=[(round(x, 2), round(y, 2)) for x, y in dr.polygon],
            source="detected", confidence=round(dr.confidence, 3),
        ))

    openings: list[Opening] = []
    for i, do in enumerate(result.openings, start=1):
        is_door = do.kind == "door"
        openings.append(Opening(
            id=f"opening-{i}", type=do.kind, position=(round(do.center[0], 2), round(do.center[1], 2)),
            width=round(do.width_px, 2), height=2.1 if is_door else 1.2, sill_height=0.0 if is_door else 0.9,
            source="detected", confidence=do.confidence, needs_review=True,
        ))

    # --- text: labels + scale evidence
    ocr = _collect_text(loaded, pre) if (run_text and rooms) else OcrOutcome([], "none", False, "Text reading skipped (no rooms detected).")
    matches: list[TextMatch] = []
    inner = [Polygon(dr.polygon_inner) for dr in result.rooms]
    for line in ocr.lines:
        cx, cy = (line.bbox[0] + line.bbox[2]) / 2, (line.bbox[1] + line.bbox[3]) / 2
        host_idx = next((i for i, p in enumerate(inner) if p.is_valid and p.contains(Point(cx, cy))), None)
        if parse_dimensions(line.text):
            matches.append(TextMatch(text=line.text, kind="dimension",
                                     room_id=rooms[host_idx].id if host_idx is not None else None, confidence=round(line.confidence, 2)))
        rtype = classify_label(line.text)
        if rtype and host_idx is not None and rooms[host_idx].room_type == "other":
            name = clean_label(line.text) or rooms[host_idx].name
            rooms[host_idx].name, rooms[host_idx].room_type, rooms[host_idx].label_text = name, rtype, line.text
            matches.append(TextMatch(text=line.text, kind="room_label", room_id=rooms[host_idx].id, confidence=round(line.confidence, 2)))

    proposals: list[ScaleProposal] = []
    notes: list[str] = []
    if ocr.available and rooms:
        props, notes = proposals_from_labels(
            [(r.id, r.name, dr.polygon_inner) for r, dr in zip(rooms, result.rooms)], ocr.lines
        )
        proposals.extend(props)
        vec = proposal_from_drawing_ratio(ocr.lines, loaded.render_scale, loaded.page_size_pt, pre.transform)
        if vec:
            proposals.append(vec)
    proposals.sort(key=lambda p: -p.confidence)

    floor = Floor(wall_thickness=max(1.0, result.wall_thickness_px), rooms=rooms, openings=openings)
    geometry = rebuild(FloorPlanGeometry(units="px", scale=Scale(), image_size=(w, h), floors=[floor]))

    warnings = list(result.warnings) + notes
    if not ocr.available and ocr.note:
        warnings.append(ocr.note)
    if not proposals and rooms:
        warnings.append("No reliable scale evidence was found. Provide a scale reference (a known length) before generating 3D.")
    if rooms and any(s.name == "perspective" and s.applied for s in pre.steps):
        warnings.append("Perspective correction was applied; straight-line accuracy depends on the page boundary being detected correctly.")
    if loaded.kind == "pdf" and loaded.vector_path_count > 0:
        warnings.append(
            f"This PDF contains {loaded.vector_path_count} vector paths, but the current pipeline measures the rendered "
            "image rather than the vector geometry."
        )

    report = ProcessingReport(
        input_kind=loaded.kind, page_index=loaded.page_index, page_count=loaded.page_count, image_size=(w, h),
        pdf_vector_paths=loaded.vector_path_count,
        preprocess=[StepOut(name=s.name, applied=s.applied, detail=s.detail, confidence=s.confidence) for s in pre.steps],
        detection_mode=result.mode, wall_thickness_px=round(result.wall_thickness_px, 2),
        wall_coverage=round(result.wall_coverage, 4), rooms_found=len(rooms), openings_found=len(openings),
        ocr_engine=ocr.engine, ocr_available=ocr.available, ocr_note=ocr.note, text_lines_read=len(ocr.lines),
        text_matches=matches, scale_proposals=proposals,
        overall_confidence=round(sum(r.confidence for r in rooms) / len(rooms), 3) if rooms else None,
        warnings=warnings,
    )
    return ProcessingOutput(geometry=geometry, report=report, plan_png=encode_png(pre.image))
