"""Synthetic floor-plan renderer used ONLY by tests (never by the app)."""
from __future__ import annotations

import cv2
import numpy as np

WALL = 12  # px thickness


def render_plan(rooms_px, doors=(), windows=(), size=(1000, 800), labels=(), skew_deg=0.0):
    """rooms_px: list of (x0,y0,x1,y1) centerline rectangles. doors/windows: (cx,cy,width,orient) gaps cut in walls.
    labels: (text, x, y)."""
    w, h = size
    img = np.full((h, w, 3), 255, np.uint8)
    for x0, y0, x1, y1 in rooms_px:
        cv2.rectangle(img, (x0, y0), (x1, y1), (0, 0, 0), WALL)
    for cx, cy, width, orient in list(doors) + list(windows):
        if orient == "h":
            cv2.rectangle(img, (cx - width // 2, cy - WALL), (cx + width // 2, cy + WALL), (255, 255, 255), -1)
        else:
            cv2.rectangle(img, (cx - WALL, cy - width // 2), (cx + WALL, cy + width // 2), (255, 255, 255), -1)
    for text, x, y in labels:
        cv2.putText(img, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 0), 2, cv2.LINE_AA)
    if skew_deg:
        m = cv2.getRotationMatrix2D((w / 2, h / 2), skew_deg, 1.0)
        img = cv2.warpAffine(img, m, (w, h), borderValue=(255, 255, 255))
    return img
