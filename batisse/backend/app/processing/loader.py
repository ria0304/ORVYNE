"""Safe loading of floor-plan inputs (JPG/PNG/PDF) and PDF page rendering."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

import cv2
import numpy as np
import pymupdf
from PIL import Image

FileKind = Literal["png", "jpeg", "pdf"]

MAX_IMAGE_PIXELS = 60_000_000
MAX_RENDER_DIM = 4000
DEFAULT_PDF_DPI = 200


class InputError(ValueError):
    """The uploaded file is unusable; the message is safe to show to the user."""


def sniff_kind(head: bytes) -> Optional[FileKind]:
    """Identify file type from magic bytes (never trust the extension alone)."""
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head.lstrip()[:5] == b"%PDF-":
        return "pdf"
    return None


@dataclass
class FileInfo:
    kind: FileKind
    page_count: int
    width: int  # pixels for images; points for PDFs (page 0)
    height: int


@dataclass
class TextItem:
    text: str
    bbox: tuple[float, float, float, float]  # x0, y0, x1, y1 in the loaded image's pixels
    confidence: float  # 0..1
    source: Literal["pdf_text", "ocr"]


@dataclass
class LoadedPage:
    image: np.ndarray  # BGR uint8
    kind: FileKind
    page_index: int
    page_count: int
    render_scale: Optional[float] = None  # px per PDF point (PDF only)
    page_size_pt: Optional[tuple[float, float]] = None
    vector_path_count: int = 0
    text_items: list[TextItem] = field(default_factory=list)  # PDF text layer, if present


def inspect_file(path: Path, kind: FileKind) -> FileInfo:
    """Validate that the file really is what it claims and report its basic shape."""
    if kind == "pdf":
        try:
            doc = pymupdf.open(path)
        except Exception as exc:  # noqa: BLE001
            raise InputError("The PDF could not be opened. It may be corrupted.") from exc
        with doc:
            if doc.needs_pass or doc.is_encrypted:
                raise InputError("The PDF is password-protected. Please upload an unlocked copy.")
            if doc.page_count < 1:
                raise InputError("The PDF has no pages.")
            rect = doc[0].rect
            return FileInfo("pdf", doc.page_count, int(rect.width), int(rect.height))
    try:
        with Image.open(path) as im:
            w, h = im.size
            im.verify()
    except Exception as exc:  # noqa: BLE001
        raise InputError("The image could not be decoded. It may be corrupted.") from exc
    if w * h > MAX_IMAGE_PIXELS:
        raise InputError(f"The image is too large ({w}x{h}). Maximum is {MAX_IMAGE_PIXELS // 1_000_000} megapixels.")
    if w < 200 or h < 200:
        raise InputError("The image is too small to contain a readable floor plan (minimum 200x200 px).")
    return FileInfo(kind, 1, w, h)


def load_page(path: Path, kind: FileKind, page_index: int = 0, dpi: int = DEFAULT_PDF_DPI) -> LoadedPage:
    if kind == "pdf":
        return _load_pdf_page(path, page_index, dpi)
    if page_index != 0:
        raise InputError("Images have a single page (page_index must be 0).")
    data = np.fromfile(str(path), dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise InputError("The image could not be decoded.")
    return LoadedPage(image=img, kind=kind, page_index=0, page_count=1)


def _load_pdf_page(path: Path, page_index: int, dpi: int) -> LoadedPage:
    try:
        doc = pymupdf.open(path)
    except Exception as exc:  # noqa: BLE001
        raise InputError("The PDF could not be opened.") from exc
    with doc:
        if doc.needs_pass or doc.is_encrypted:
            raise InputError("The PDF is password-protected.")
        if not 0 <= page_index < doc.page_count:
            raise InputError(f"Page {page_index + 1} does not exist; the PDF has {doc.page_count} page(s).")
        page = doc[page_index]
        rect = page.rect
        scale = dpi / 72.0
        longest = max(rect.width, rect.height) * scale
        if longest > MAX_RENDER_DIM:
            scale *= MAX_RENDER_DIM / longest
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        img = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR) if pix.n >= 3 else cv2.cvtColor(arr, cv2.COLOR_GRAY2BGR)
        try:
            vector_paths = len(page.get_drawings())
        except Exception:  # noqa: BLE001
            vector_paths = 0
        items: list[TextItem] = []
        try:
            for x0, y0, x1, y1, text, *_ in page.get_text("words"):
                if text.strip():
                    items.append(TextItem(text.strip(), (x0 * scale, y0 * scale, x1 * scale, y1 * scale), 1.0, "pdf_text"))
        except Exception:  # noqa: BLE001
            items = []
        return LoadedPage(
            image=np.ascontiguousarray(img), kind="pdf", page_index=page_index, page_count=doc.page_count,
            render_scale=scale, page_size_pt=(rect.width, rect.height),
            vector_path_count=vector_paths, text_items=items,
        )


def render_preview_png(path: Path, kind: FileKind, page_index: int = 0, max_dim: int = 600) -> bytes:
    """Small PNG preview (used for page selection)."""
    dpi = 72 if kind == "pdf" else DEFAULT_PDF_DPI
    page = load_page(path, kind, page_index, dpi=dpi)
    img = page.image
    h, w = img.shape[:2]
    s = max_dim / max(h, w)
    if s < 1:
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise InputError("Could not render a preview.")
    return buf.tobytes()


def encode_png(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise InputError("Could not encode image.")
    return buf.tobytes()
