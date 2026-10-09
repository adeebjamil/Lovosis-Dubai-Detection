from __future__ import annotations

import numpy as np


def box_iou(b1: list[float] | np.ndarray, b2: list[float] | np.ndarray) -> float:
    """Computes Intersection over Union (IoU) of two boxes [x1, y1, x2, y2]."""
    xA = max(b1[0], b2[0])
    yA = max(b1[1], b2[1])
    xB = min(b1[2], b2[2])
    yB = min(b1[3], b2[3])
    inter = max(0.0, xB - xA) * max(0.0, yB - yA)
    areaA = max(0.0, b1[2] - b1[0]) * max(0.0, b1[3] - b1[1])
    areaB = max(0.0, b2[2] - b2[0]) * max(0.0, b2[3] - b2[1])
    union = areaA + areaB - inter
    if union <= 1e-6:
        return 0.0
    return float(inter / union)


def box_center_dist(b1: list[float] | np.ndarray, b2: list[float] | np.ndarray) -> float:
    """Computes Euclidean distance between centers of two boxes in pixel coordinates."""
    c1x = (b1[0] + b1[2]) / 2.0
    c1y = (b1[1] + b1[3]) / 2.0
    c2x = (b2[0] + b2[2]) / 2.0
    c2y = (b2[1] + b2[3]) / 2.0
    return float(np.hypot(c1x - c2x, c1y - c2y))


class TrackedItem:
    def __init__(
        self,
        track_id: int,
        box: list[float],
        confidence: float,
        item_class: str,
        timestamp: float,
    ):
        self.track_id = track_id
        self.box = [float(x) for x in box]
        self.confidence = float(confidence)
        self.display_conf = float(confidence)
        self.item_class = item_class
        self.first_ts = timestamp
        self.last_ts = timestamp
        self.frames = 1
        self.conf_sum = float(confidence)
        self.is_active = True

    def update(self, box: list[float], confidence: float, timestamp: float):
        """Updates box with Deadband stabilization to eliminate visible jitter/flicker.
        If a seated person exhibits micro-movements (< 14px), box stays 100% frozen.
        """
        # Calculate maximum pixel edge shift
        edge_deltas = [abs(box[k] - self.box[k]) for k in range(4)]
        max_delta = max(edge_deltas)

        if max_delta > 14.0:
            # Significant intentional movement (person shifting or walking) -> smooth with EMA
            alpha = 0.25
            self.box = [
                float(alpha * box[k] + (1.0 - alpha) * self.box[k])
                for k in range(4)
            ]
        # else: max_delta <= 14px -> Deadband filter: keep self.box 100% frozen in place (0 jitter)

        # Smooth confidence to stop badge expansion/contraction flickering
        self.confidence = float(0.85 * self.confidence + 0.15 * confidence)
        self.last_ts = timestamp
        self.frames += 1
        self.conf_sum += float(confidence)
        self.is_active = True


class SpatialTracker:
    """High-reliability object tracker designed for CCTV surveillance and seated office monitoring.
    Uses two-stage association (IoU + Desk Proximity) and temporal grace memory to ensure
    seated persons never flicker, shake, or drop track IDs when motionless.
    """

    def __init__(
        self,
        max_lost_seconds: float = 7.0,
        iou_threshold: float = 0.15,
        max_center_distance: float = 80.0,
        activation_conf: float = 0.05,
    ):
        self.max_lost_seconds = max_lost_seconds
        self.iou_threshold = iou_threshold
        self.max_center_distance = max_center_distance
        self.activation_conf = activation_conf
        self.next_track_id = 1
        self.tracks: dict[int, TrackedItem] = {}

    def update(
        self,
        detections: list[dict],
        now_ts: float,
    ) -> list[dict]:
        """Updates active tracks with incoming detections.
        detections format:
            [{ 'box': [x1, y1, x2, y2], 'confidence': float, 'class': str }, ...]
        Returns:
            list of dicts for currently visible tracks:
            [{ 'track_id': int, 'box': [x1, y1, x2, y2], 'confidence': float, 'class': str, 'frames': int, 'is_fresh': bool }, ...]
        """
        matched_det_indices = set()
        matched_track_ids = set()

        # Step 1: Match existing tracks with detections by IoU and Centroid distance (same class only)
        # Sort tracks by most recently seen first
        sorted_track_ids = sorted(
            self.tracks.keys(),
            key=lambda tid: self.tracks[tid].last_ts,
            reverse=True,
        )

        for tid in sorted_track_ids:
            track = self.tracks[tid]
            best_det_idx = -1
            best_dist = 9999.0

            for i, det in enumerate(detections):
                if i in matched_det_indices:
                    continue
                if det["class"] != track.item_class:
                    continue

                d_box = det["box"]
                iou_sc = box_iou(track.box, d_box)
                dist = box_center_dist(track.box, d_box)

                # Prioritize matching by nearest center distance within reach
                is_valid = (iou_sc >= self.iou_threshold) or (dist <= self.max_center_distance)
                if is_valid and dist < best_dist:
                    best_dist = dist
                    best_det_idx = i

            if best_det_idx != -1:
                matched_det_indices.add(best_det_idx)
                matched_track_ids.add(tid)
                det = detections[best_det_idx]
                track.update(det["box"], det["confidence"], now_ts)

        # Step 2: Initialize new tracks only for genuinely new persons
        for i, det in enumerate(detections):
            if i in matched_det_indices:
                continue

            conf = float(det["confidence"])
            if conf < self.activation_conf:
                continue

            d_box = det["box"]
            # Spatial deduplication: if this detection is right on top of an existing track (< 65px),
            # it is part of that same person's body and MUST NOT spawn a duplicate ID.
            # Two adjacent coworkers sit ~95-110px apart and will each get their own unique ID!
            duplicate = False
            for tr in self.tracks.values():
                if tr.item_class == det["class"]:
                    iou_val = box_iou(d_box, tr.box)
                    dist_val = box_center_dist(d_box, tr.box)
                    if iou_val > 0.40 or dist_val < 65.0:
                        duplicate = True
                        break

            if not duplicate:
                new_id = self.next_track_id
                self.next_track_id += 1
                self.tracks[new_id] = TrackedItem(
                    track_id=new_id,
                    box=d_box,
                    confidence=conf,
                    item_class=det["class"],
                    timestamp=now_ts,
                )
                matched_track_ids.add(new_id)

        # Step 3: Evict dead tracks (exceeded max_lost_seconds) and compile active output
        results = []
        dead_ids = []

        for tid, track in list(self.tracks.items()):
            time_since_seen = now_ts - track.last_ts
            if time_since_seen > self.max_lost_seconds:
                dead_ids.append(tid)
            else:
                # Active track: visible on screen if seen within grace period
                is_fresh = (tid in matched_track_ids)
                results.append({
                    "track_id": track.track_id,
                    "box": list(track.box),
                    "confidence": track.confidence,
                    "avg_confidence": round(track.conf_sum / max(1, track.frames), 2),
                    "class": track.item_class,
                    "frames": track.frames,
                    "last_ts": track.last_ts,
                    "first_ts": track.first_ts,
                    "is_fresh": is_fresh,
                })

        for tid in dead_ids:
            del self.tracks[tid]

        return results
