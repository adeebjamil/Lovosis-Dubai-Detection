from __future__ import annotations

from typing import Sequence


def point_in_polygon(x: float, y: float, polygon: Sequence[Sequence[float]]) -> bool:
    """Ray casting algorithm for testing point in 2D polygon.
    polygon is a sequence of [x, y] coordinates in same scale (e.g. normalized 0..1).
    """
    n = len(polygon)
    if n < 3:
        return True

    inside = False
    p1x, p1y = polygon[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside


class ZoneChecker:
    def __init__(self, mode: str = "FULL_FRAME", points: list[list[float]] | None = None):
        self.mode = mode.upper()
        self.points = points or []

    def update(self, mode: str, points: list[list[float]] | None = None):
        self.mode = mode.upper()
        self.points = points or []

    def is_in_zone(self, norm_box: Sequence[float]) -> bool:
        """norm_box: [x1, y1, x2, y2] in 0..1 coordinates.
        Checks bottom-center foot point against zone polygon.
        """
        if self.mode == "FULL_FRAME" or len(self.points) < 3:
            return True

        foot_x = (norm_box[0] + norm_box[2]) / 2.0
        foot_y = float(norm_box[3])
        return point_in_polygon(foot_x, foot_y, self.points)
