"""Image preprocessing: resize, optional perspective correction, deskew, ink mask.

Every step reports whether it was applied and why, so the UI never has to guess.
All geometric steps are accumulated into one 3x3 homography (``transform``) mapping
original-render pixels to processed pixels, so text boxes from a PDF text layer can
be carried along.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import cv2
import numpy as np

MAX_PROCESS_DIM = 2400


@dataclass
class Step:
    name: str
    applied: bool
    detail: str
    confidence: float | None = None


@dataclass
class PreprocessResult:
    image: np.ndarray  # BGR, processed
    gray: np.ndarray
    ink: np.ndarray  # uint8 0/255, 255 = drawn lines/walls
    transform: np.ndarray  # 3x3, original -> processed
    steps: list[Step] = field(default_factory=list)
    rotation_deg: float = 0.0
    perspective_applied: bool = False
    inverted_background: bool = False


def _order_quad(pts: np.ndarray) -> np.ndarray:
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]], dtype=np.float32)


def _angle_dev(quad: np.ndarray) -> float:
    """Max deviation (deg) of the quad's corner angles from 90."""
    worst = 0.0
    for i in range(4):
        a, b, c = quad[i - 1], quad[i], quad[(i + 1) % 4]
        v1, v2 = a - b, c - b
        cosang = float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9))
        worst = max(worst, abs(math.degrees(math.acos(max(-1, min(1, cosang)))) - 90))
    return worst


def correct_perspective(img: np.ndarray) -> tuple[np.ndarray, np.ndarray, Step]:
    """Heuristic: find a large, visibly skewed quadrilateral (a photographed sheet of
    paper) and warp it to a rectangle. Axis-aligned rectangles are left alone (they are
    most likely the drawing itself, not a distorted page)."""
    h, w = img.shape[:2]
    eye = np.eye(3)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    cnts, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    best, best_area = None, 0.0
    for c in sorted(cnts, key=cv2.contourArea, reverse=True)[:8]:
        area = cv2.contourArea(c)
        if area < 0.25 * w * h:
            break
        approx = cv2.approxPolyDP(c, 0.02 * cv2.arcLength(c, True), True)
        if len(approx) == 4 and cv2.isContourConvex(approx):
            best, best_area = _order_quad(approx), area
            break
    if best is None:
        return img, eye, Step("perspective", False, "No page boundary quadrilateral found; left unchanged.")
    dev = _angle_dev(best)
    if dev < 4.0 or best_area > 0.97 * w * h:
        return img, eye, Step("perspective", False, "Page boundary is already rectangular; no correction needed.")
    tl, tr, br, bl = best
    out_w = int(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl)))
    out_h = int(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr)))
    if out_w < 200 or out_h < 200:
        return img, eye, Step("perspective", False, "Detected quadrilateral too small; left unchanged.")
    dst = np.array([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]], dtype=np.float32)
    m = cv2.getPerspectiveTransform(best, dst)
    warped = cv2.warpPerspective(img, m, (out_w, out_h), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))
    conf = float(min(0.8, 0.4 + best_area / (w * h) * 0.4))
    return warped, m.astype(np.float64), Step(
        "perspective", True, f"Warped a skewed page quadrilateral (max corner deviation {dev:.1f}°).", conf
    )


def estimate_skew(gray: np.ndarray) -> tuple[float, float, int]:
    """Dominant orientation of long straight lines, folded into [-45, 45) deg.
    Returns (angle_deg, agreement 0..1, n_lines)."""
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    h, w = gray.shape[:2]
    min_len = max(40, int(0.06 * min(h, w)))
    lines = cv2.HoughLinesP(edges, 1, np.pi / 720, threshold=80, minLineLength=min_len, maxLineGap=6)
    if lines is None:
        return 0.0, 0.0, 0
    angles, weights = [], []
    for x1, y1, x2, y2 in np.asarray(lines).reshape(-1, 4):
        ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
        ang = (ang + 45) % 90 - 45  # fold to [-45, 45)
        angles.append(ang)
        weights.append(math.hypot(x2 - x1, y2 - y1))
    a, wt = np.array(angles), np.array(weights)
    order = np.argsort(a)
    cum = np.cumsum(wt[order])
    med = float(a[order][np.searchsorted(cum, cum[-1] / 2)])
    agree = float(wt[np.abs(a - med) <= 2.0].sum() / wt.sum())
    return med, agree, len(angles)


def deskew(img: np.ndarray) -> tuple[np.ndarray, np.ndarray, float, Step]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    angle, agree, n = estimate_skew(gray)
    if n < 5:
        return img, np.eye(3), 0.0, Step("deskew", False, "Too few straight lines to estimate orientation.")
    if abs(angle) < 0.25:
        return img, np.eye(3), 0.0, Step("deskew", False, f"Already aligned (residual {angle:.2f}°).", agree)
    if abs(angle) > 20 or agree < 0.3:
        return img, np.eye(3), 0.0, Step(
            "deskew", False, f"Orientation unclear (estimated {angle:.1f}°, agreement {agree:.0%}); left unchanged.", agree
        )
    h, w = img.shape[:2]
    m2 = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    cos, sin = abs(m2[0, 0]), abs(m2[0, 1])
    nw, nh = int(h * sin + w * cos), int(h * cos + w * sin)
    m2[0, 2] += nw / 2 - w / 2
    m2[1, 2] += nh / 2 - h / 2
    rotated = cv2.warpAffine(img, m2, (nw, nh), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255))
    m3 = np.vstack([m2, [0, 0, 1]])
    return rotated, m3, angle, Step("deskew", True, f"Rotated by {-angle:.2f}° to level walls.", agree)


def ink_mask(gray: np.ndarray) -> tuple[np.ndarray, bool]:
    """Binary mask of drawn content (255 = ink). Handles light-on-dark drawings."""
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    inverted = float(np.mean(blur)) < 110
    src = 255 - blur if inverted else blur
    _, ink = cv2.threshold(src, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return ink, inverted


def preprocess(img_bgr: np.ndarray, max_dim: int = MAX_PROCESS_DIM) -> PreprocessResult:
    steps: list[Step] = []
    transform = np.eye(3)
    img = img_bgr
    h, w = img.shape[:2]
    s = max_dim / max(h, w)
    if s < 1:
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        transform = np.diag([s, s, 1.0]) @ transform
        steps.append(Step("resize", True, f"Downscaled {w}x{h} -> {img.shape[1]}x{img.shape[0]} for processing."))
    else:
        steps.append(Step("resize", False, f"Kept at {w}x{h}."))

    img, m, pstep = correct_perspective(img)
    steps.append(pstep)
    transform = m @ transform

    img, m, angle, dstep = deskew(img)
    steps.append(dstep)
    transform = m @ transform

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    ink, inverted = ink_mask(gray)
    steps.append(Step("binarize", True, "Otsu threshold" + (" (light-on-dark drawing inverted)." if inverted else ".")))
    return PreprocessResult(
        image=img, gray=gray, ink=ink, transform=transform, steps=steps,
        rotation_deg=-angle if dstep.applied else 0.0, perspective_applied=pstep.applied, inverted_background=inverted,
    )
