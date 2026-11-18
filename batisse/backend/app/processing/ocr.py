"""Text extraction (PDF text layer or Tesseract OCR) and dimension/label parsing.

Parsing is deliberately conservative: bare numbers without a unit are never
interpreted as lengths, because guessing units would invent dimensions.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

from .loader import TextItem

MIN_LEN_M, MAX_LEN_M = 0.5, 30.0
FT = 0.3048
IN = 0.0254


@dataclass
class OcrOutcome:
    lines: list[TextItem]
    engine: str  # "pdf_text" | "tesseract" | "none"
    available: bool
    note: str = ""


@dataclass
class Dimension:
    kind: str  # "pair" | "single"
    a_m: float
    b_m: Optional[float]
    raw: str


# ------------------------------------------------------------------ extraction

def group_words_into_lines(words: list[TextItem]) -> list[TextItem]:
    """Merge word boxes (e.g. from a PDF text layer) into reading-order lines."""
    if not words:
        return []
    ws = sorted(words, key=lambda t: ((t.bbox[1] + t.bbox[3]) / 2, t.bbox[0]))
    rows: list[list[TextItem]] = []
    for w in ws:
        cy, hh = (w.bbox[1] + w.bbox[3]) / 2, max(1.0, w.bbox[3] - w.bbox[1])
        placed = False
        for row in rows:
            ry = sum((r.bbox[1] + r.bbox[3]) / 2 for r in row) / len(row)
            if abs(cy - ry) < 0.6 * hh:
                row.append(w)
                placed = True
                break
        if not placed:
            rows.append([w])
    lines: list[TextItem] = []
    for row in rows:
        row.sort(key=lambda t: t.bbox[0])
        cur = [row[0]]
        for w in row[1:]:
            prev = cur[-1]
            gap = w.bbox[0] - prev.bbox[2]
            if gap < 1.8 * max(1.0, prev.bbox[3] - prev.bbox[1]):
                cur.append(w)
            else:
                lines.append(_merge(cur))
                cur = [w]
        lines.append(_merge(cur))
    return lines


def _merge(items: list[TextItem]) -> TextItem:
    return TextItem(
        text=" ".join(i.text for i in items),
        bbox=(min(i.bbox[0] for i in items), min(i.bbox[1] for i in items),
              max(i.bbox[2] for i in items), max(i.bbox[3] for i in items)),
        confidence=float(sum(i.confidence for i in items) / len(items)),
        source=items[0].source,
    )


def map_bbox(bbox: tuple[float, float, float, float], transform: np.ndarray) -> tuple[float, float, float, float]:
    x0, y0, x1, y1 = bbox
    pts = np.array([[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]], dtype=np.float64)
    out = cv2.perspectiveTransform(pts, transform)[0]
    return (float(out[:, 0].min()), float(out[:, 1].min()), float(out[:, 0].max()), float(out[:, 1].max()))


def run_ocr(gray: np.ndarray, timeout_s: int = 40) -> OcrOutcome:
    try:
        import pytesseract
        from pytesseract import Output
    except Exception:  # noqa: BLE001
        return OcrOutcome([], "none", False, "pytesseract is not installed; text and dimensions were not read.")
    try:
        data = pytesseract.image_to_data(gray, config="--psm 11", output_type=Output.DICT, timeout=timeout_s)
    except pytesseract.TesseractNotFoundError:
        return OcrOutcome([], "none", False, "The Tesseract binary is not installed; text and dimensions were not read.")
    except RuntimeError:
        return OcrOutcome([], "tesseract", False, "OCR timed out; text and dimensions were not read.")
    groups: dict[tuple[int, int, int], list[TextItem]] = {}
    for i, txt in enumerate(data["text"]):
        txt = (txt or "").strip()
        try:
            conf = float(data["conf"][i])
        except (TypeError, ValueError):
            continue
        if not txt or conf < 0:
            continue
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        groups.setdefault(key, []).append(TextItem(txt, (x, y, x + w, y + h), conf / 100.0, "ocr"))
    lines = []
    for items in groups.values():
        items.sort(key=lambda t: t.bbox[0])
        line = _merge(items)
        if line.confidence >= 0.4:
            lines.append(line)
    return OcrOutcome(lines, "tesseract", True)


# ------------------------------------------------------------------ parsing

def _len_re(sfx: str) -> str:
    return (
        rf"(?:(?P<ft{sfx}>\d+(?:\.\d+)?)\s*(?:'|’|′|ft)\s*(?:[-\s]?\s*(?P<in{sfx}>\d+(?:\.\d+)?)\s*(?:\"|”|″|''|in)?)?"
        rf"|(?P<num{sfx}>\d+(?:[.,]\d+)?)\s*(?P<unit{sfx}>mm|cm|m)(?![a-zA-Z]))"
    )


_PAIR = re.compile(_len_re("a") + r"\s*[xX×]\s*" + _len_re("b"))
_PAIR_INHERIT = re.compile(
    r"(?P<a>\d+(?:[.,]\d+)?)\s*[xX×]\s*(?P<b>\d+(?:[.,]\d+)?)\s*(?P<u>mm|cm|m|ft|'|’|′)(?![a-zA-Z])"
)
_SINGLE = re.compile(_len_re("a"))
_RATIO = re.compile(r"(?:scale\s*)?\b1\s*[:/]\s*(\d{1,4})\b", re.I)


def _to_m(m: re.Match, sfx: str) -> Optional[float]:
    g = m.groupdict()
    if g.get(f"ft{sfx}") is not None:
        v = float(g[f"ft{sfx}"]) * FT + (float(g[f"in{sfx}"]) * IN if g.get(f"in{sfx}") else 0.0)
    elif g.get(f"num{sfx}") is not None:
        n = float(g[f"num{sfx}"].replace(",", "."))
        v = n * {"mm": 0.001, "cm": 0.01, "m": 1.0}[g[f"unit{sfx}"]]
    else:
        return None
    return v if MIN_LEN_M <= v <= MAX_LEN_M else None


def parse_dimensions(text: str) -> list[Dimension]:
    """Extract length dimensions in meters. Returns pair dims (``W x D``) first."""
    out: list[Dimension] = []
    for m in _PAIR.finditer(text):
        a, b = _to_m(m, "a"), _to_m(m, "b")
        if a and b:
            out.append(Dimension("pair", a, b, m.group(0)))
    if out:
        return out
    for m in _PAIR_INHERIT.finditer(text):
        u = m.group("u")
        f = {"mm": 0.001, "cm": 0.01, "m": 1.0}.get(u, FT)
        a, b = float(m.group("a").replace(",", ".")) * f, float(m.group("b").replace(",", ".")) * f
        if MIN_LEN_M <= a <= MAX_LEN_M and MIN_LEN_M <= b <= MAX_LEN_M:
            out.append(Dimension("pair", a, b, m.group(0)))
    if out:
        return out
    for m in _SINGLE.finditer(text):
        a = _to_m(m, "a")
        if a:
            out.append(Dimension("single", a, None, m.group(0)))
    return out


def parse_drawing_ratio(text: str) -> Optional[int]:
    """Drawing scale like ``1:100`` -> 100."""
    m = _RATIO.search(text)
    if not m:
        return None
    r = int(m.group(1))
    return r if 2 <= r <= 2000 else None


_ROOM_WORDS: list[tuple[str, tuple[str, ...]]] = [
    ("bedroom", ("bedroom", "bed room", "master", "bed", "br", "guest room", "kids")),
    ("bathroom", ("bathroom", "bath", "toilet", "wc", "washroom", "lavatory", "powder")),
    ("kitchen", ("kitchen", "kitchenette", "pantry")),
    ("living", ("living", "lounge", "drawing", "family room", "hall room")),
    ("dining", ("dining", "dinning")),
    ("hallway", ("hall", "hallway", "corridor", "passage", "foyer", "entry", "lobby")),
    ("balcony", ("balcony", "terrace", "patio", "porch", "deck", "verandah")),
    ("utility", ("utility", "laundry", "wash")),
    ("storage", ("store", "storage", "closet", "wardrobe", "garage")),
]


def classify_label(text: str) -> Optional[str]:
    lower = text.lower()
    t = re.sub(r"[^a-z ]", " ", lower)
    words = set(t.split())
    words.add(re.sub(r"[^a-z]", "", lower))  # "W.C." -> "wc"
    for rtype, keys in _ROOM_WORDS:
        for k in keys:
            if (" " in k and k in t) or k in words:
                return rtype
    return None


def clean_label(text: str) -> str:
    """Strip dimension fragments from a label, keep words."""
    t = _PAIR.sub("", text)
    t = _PAIR_INHERIT.sub("", t)
    t = re.sub(r"[^A-Za-z ]", " ", t)
    return re.sub(r"\s+", " ", t).strip().title()
