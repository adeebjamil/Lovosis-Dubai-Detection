"""Standalone, high-performance ByteTrack implementation (Foundation Vision).
Paper: "ByteTrack: Multi-Object Tracking by Associating Every Detection Box" (ECCV 2022)
License: MIT (Zero-AGPL compliant).

Features:
- 8-State Kalman Filter [x, y, a, h, vx, vy, va, vh] for linear motion prediction
- Two-stage association:
    Stage 1: Confident detections (conf >= track_thresh) matched with tracked tracklets
    Stage 2: Low-confidence detections (low_thresh <= conf < track_thresh) matched with unmatched tracklets (recovering occluded & fast-moving persons)
- Deadband micro-movement stabilization to keep stationary persons 100% jitter-free
- Seamless integration with the Dubai Mall surveillance pipeline
"""

from __future__ import annotations

import numpy as np
import scipy.linalg
from scipy.optimize import linear_sum_assignment


class KalmanFilter:
    """Standard 8-dimensional Kalman filter for bounding box tracking in image coordinates.
    State: [x_center, y_center, aspect_ratio (w/h), height, vx, vy, va, vh]
    """

    def __init__(self):
        ndim, dt = 4, 1.0
        self._motion_mat = np.eye(2 * ndim, 2 * ndim, dtype=np.float64)
        for i in range(ndim):
            self._motion_mat[i, ndim + i] = dt
        self._update_mat = np.eye(ndim, 2 * ndim, dtype=np.float64)

        self._std_weight_position = 1.0 / 20.0
        self._std_weight_velocity = 1.0 / 160.0

    def initiate(self, measurement: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """measurement: [cx, cy, a, h]"""
        mean_pos = measurement.astype(np.float64)
        mean_vel = np.zeros_like(mean_pos)
        mean = np.r_[mean_pos, mean_vel]

        h = measurement[3]
        std = [
            2 * self._std_weight_position * h,
            2 * self._std_weight_position * h,
            1e-2,
            2 * self._std_weight_position * h,
            10 * self._std_weight_velocity * h,
            10 * self._std_weight_velocity * h,
            1e-5,
            10 * self._std_weight_velocity * h,
        ]
        covariance = np.diag(np.square(std))
        return mean, covariance

    def predict(self, mean: np.ndarray, covariance: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        h = mean[3]
        std_pos = [
            self._std_weight_position * h,
            self._std_weight_position * h,
            1e-2,
            self._std_weight_position * h,
        ]
        std_vel = [
            self._std_weight_velocity * h,
            self._std_weight_velocity * h,
            1e-5,
            self._std_weight_velocity * h,
        ]
        motion_cov = np.diag(np.square(np.r_[std_pos, std_vel]))
        mean = np.dot(mean, self._motion_mat.T)
        covariance = np.linalg.multi_dot((self._motion_mat, covariance, self._motion_mat.T)) + motion_cov
        return mean, covariance

    def project(self, mean: np.ndarray, covariance: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        h = mean[3]
        std = [
            self._std_weight_position * h,
            self._std_weight_position * h,
            1e-1,
            self._std_weight_position * h,
        ]
        innovation_cov = np.diag(np.square(std))
        mean = np.dot(self._update_mat, mean)
        covariance = np.linalg.multi_dot((self._update_mat, covariance, self._update_mat.T))
        return mean, covariance + innovation_cov

    def update(
        self, mean: np.ndarray, covariance: np.ndarray, measurement: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray]:
        projected_mean, projected_cov = self.project(mean, covariance)
        chol_factor, lower = scipy.linalg.cho_factor(projected_cov, lower=True, check_finite=False)
        kalman_gain = scipy.linalg.cho_solve(
            (chol_factor, lower),
            np.dot(self._update_mat, covariance.T),
            check_finite=False,
        ).T
        innovation = measurement - projected_mean
        new_mean = mean + np.dot(innovation, kalman_gain.T)
        new_covariance = covariance - np.linalg.multi_dot((kalman_gain, projected_cov, kalman_gain.T))
        return new_mean, new_covariance


def tlbr_to_xyah(box: list[float] | np.ndarray) -> np.ndarray:
    """Converts [x1, y1, x2, y2] to [center_x, center_y, aspect_ratio (w/h), height]."""
    w = max(1.0, float(box[2] - box[0]))
    h = max(1.0, float(box[3] - box[1]))
    cx = float(box[0] + w / 2.0)
    cy = float(box[1] + h / 2.0)
    return np.array([cx, cy, w / h, h], dtype=np.float64)


def xyah_to_tlbr(xyah: np.ndarray) -> list[float]:
    """Converts [center_x, center_y, aspect_ratio, height] back to [x1, y1, x2, y2]."""
    cx, cy, a, h = float(xyah[0]), float(xyah[1]), float(xyah[2]), float(xyah[3])
    w = a * h
    return [cx - w / 2.0, cy - h / 2.0, cx + w / 2.0, cy + h / 2.0]


def iou_matrix(boxes1: list[list[float]], boxes2: list[list[float]]) -> np.ndarray:
    """Computes pairwise IoU matrix between boxes1 (N) and boxes2 (M)."""
    if not boxes1 or not boxes2:
        return np.empty((len(boxes1), len(boxes2)), dtype=np.float32)

    b1 = np.array(boxes1, dtype=np.float32)
    b2 = np.array(boxes2, dtype=np.float32)

    area1 = (b1[:, 2] - b1[:, 0]) * (b1[:, 3] - b1[:, 1])
    area2 = (b2[:, 2] - b2[:, 0]) * (b2[:, 3] - b2[:, 1])

    iw = np.maximum(0.0, np.minimum(b1[:, 2:3], b2[:, 2:3].T) - np.maximum(b1[:, 0:1], b2[:, 0:1].T))
    ih = np.maximum(0.0, np.minimum(b1[:, 3:4], b2[:, 3:4].T) - np.maximum(b1[:, 1:2], b2[:, 1:2].T))
    inter = iw * ih
    union = area1[:, None] + area2[None, :] - inter
    return np.clip(inter / np.maximum(union, 1e-6), 0.0, 1.0)


class ByteTrackItem:
    """A tracked object managed by ByteTrack with Kalman filter state."""

    def __init__(
        self,
        track_id: int,
        box: list[float],
        confidence: float,
        item_class: str,
        timestamp: float,
        kf: KalmanFilter,
    ):
        self.track_id = track_id
        self.box = [float(x) for x in box]
        self.confidence = float(confidence)
        self.item_class = item_class
        self.first_ts = timestamp
        self.last_ts = timestamp
        self.frames = 1
        self.conf_sum = float(confidence)
        self.is_active = True

        self.kf = kf
        measurement = tlbr_to_xyah(box)
        self.mean, self.covariance = self.kf.initiate(measurement)

    def predict(self):
        self.mean, self.covariance = self.kf.predict(self.mean, self.covariance)
        predicted_box = xyah_to_tlbr(self.mean[:4])
        # Deadband stabilization: preserve physical continuity if delta is microscopic
        max_shift = max(abs(predicted_box[k] - self.box[k]) for k in range(4))
        if max_shift > 3.0:
            self.box = predicted_box

    def update(self, box: list[float], confidence: float, timestamp: float):
        measurement = tlbr_to_xyah(box)
        self.mean, self.covariance = self.kf.update(self.mean, self.covariance, measurement)

        # Deadband + velocity-adaptive EMA smoothing
        edge_deltas = [abs(box[k] - self.box[k]) for k in range(4)]
        max_delta = max(edge_deltas)

        if max_delta > 14.0:
            alpha = 0.85 if max_delta > 55.0 else 0.40
            self.box = [
                float(alpha * box[k] + (1.0 - alpha) * self.box[k])
                for k in range(4)
            ]
        # else: preserve existing smoothed position (deadband for seated subjects)

        self.confidence = float(0.80 * self.confidence + 0.20 * confidence)
        self.last_ts = timestamp
        self.frames += 1
        self.conf_sum += float(confidence)
        self.is_active = True


class ByteTracker:
    """ByteTrack Multi-Object Tracker (Foundation Vision).
    Recovers occluded subjects and fast motion using dual-threshold association.
    """

    def __init__(
        self,
        track_thresh: float = 0.35,     # High-confidence threshold
        low_thresh: float = 0.12,       # Low-confidence threshold (recovers occlusions)
        match_thresh: float = 0.45,     # Max IoU distance for matching (1.0 - IoU)
        max_lost_seconds: float = 7.0,  # Temporal memory grace period
    ):
        self.track_thresh = track_thresh
        self.low_thresh = low_thresh
        self.match_thresh = match_thresh
        self.max_lost_seconds = max_lost_seconds

        self.kf = KalmanFilter()
        self.next_track_id = 1
        self.tracks: dict[int, ByteTrackItem] = {}

    def update(self, detections: list[dict], now_ts: float) -> list[dict]:
        """Runs the two-stage ByteTrack association algorithm.
        Input: list of { 'box': [x1, y1, x2, y2], 'confidence': float, 'class': str }
        Output: list of active tracked objects with track_id, smooth boxes, and status.
        """
        # Step 0: Kalman Predict for all existing tracks
        for track in self.tracks.values():
            track.predict()

        # Partition detections into High-Score (dets_high) and Low-Score (dets_low)
        dets_high: list[dict] = []
        dets_low: list[dict] = []
        for d in detections:
            conf = float(d.get("confidence", 0.0))
            if conf >= self.track_thresh:
                dets_high.append(d)
            elif conf >= self.low_thresh:
                dets_low.append(d)

        active_track_ids = list(self.tracks.keys())
        matched_track_ids = set()
        matched_high_dets = set()

        # -------------------------------------------------------------
        # STAGE 1: Associate High-Confidence Detections with Active Tracks
        # -------------------------------------------------------------
        if active_track_ids and dets_high:
            track_boxes = [self.tracks[tid].box for tid in active_track_ids]
            det_boxes = [d["box"] for d in dets_high]
            iou_mat = iou_matrix(track_boxes, det_boxes)
            cost_mat = 1.0 - iou_mat

            # Filter mismatched classes (cannot match person to dog)
            for r_idx, tid in enumerate(active_track_ids):
                t_cls = self.tracks[tid].item_class
                for c_idx, d in enumerate(dets_high):
                    if d["class"] != t_cls:
                        cost_mat[r_idx, c_idx] = 100.0

            row_ind, col_ind = linear_sum_assignment(cost_mat)
            for r, c in zip(row_ind, col_ind):
                tid = active_track_ids[r]
                det = dets_high[c]
                # Check match threshold or center distance proximity
                t_box = self.tracks[tid].box
                d_box = det["box"]
                cx_dist = float(np.hypot((t_box[0] + t_box[2]) / 2.0 - (d_box[0] + d_box[2]) / 2.0,
                                         (t_box[1] + t_box[3]) / 2.0 - (d_box[1] + d_box[3]) / 2.0))
                reach = max(80.0, max(abs(t_box[2] - t_box[0]), abs(t_box[3] - t_box[1])) * 1.25)

                if cost_mat[r, c] <= self.match_thresh or cx_dist <= reach:
                    self.tracks[tid].update(d_box, det["confidence"], now_ts)
                    matched_track_ids.add(tid)
                    matched_high_dets.add(c)

        # -------------------------------------------------------------
        # STAGE 2: Associate Low-Confidence Detections with Unmatched Tracks
        # This is ByteTrack's key innovation: recovering occluded/blurred people
        # -------------------------------------------------------------
        unmatched_tids = [tid for tid in active_track_ids if tid not in matched_track_ids]
        if unmatched_tids and dets_low:
            track_boxes = [self.tracks[tid].box for tid in unmatched_tids]
            det_boxes = [d["box"] for d in dets_low]
            iou_mat = iou_matrix(track_boxes, det_boxes)
            cost_mat = 1.0 - iou_mat

            for r_idx, tid in enumerate(unmatched_tids):
                t_cls = self.tracks[tid].item_class
                for c_idx, d in enumerate(dets_low):
                    if d["class"] != t_cls:
                        cost_mat[r_idx, c_idx] = 100.0

            row_ind, col_ind = linear_sum_assignment(cost_mat)
            for r, c in zip(row_ind, col_ind):
                tid = unmatched_tids[r]
                det = dets_low[c]
                t_box = self.tracks[tid].box
                d_box = det["box"]
                cx_dist = float(np.hypot((t_box[0] + t_box[2]) / 2.0 - (d_box[0] + d_box[2]) / 2.0,
                                         (t_box[1] + t_box[3]) / 2.0 - (d_box[1] + d_box[3]) / 2.0))
                reach = max(80.0, max(abs(t_box[2] - t_box[0]), abs(t_box[3] - t_box[1])) * 1.25)

                # Use a slightly more forgiving threshold (0.65) for occluded recovery
                if cost_mat[r, c] <= 0.65 or cx_dist <= reach:
                    self.tracks[tid].update(d_box, det["confidence"], now_ts)
                    matched_track_ids.add(tid)

        # -------------------------------------------------------------
        # STAGE 3: Initialize New Tracks from Unmatched High-Confidence Detections
        # -------------------------------------------------------------
        for c, det in enumerate(dets_high):
            if c in matched_high_dets:
                continue

            d_box = det["box"]
            # Deduplicate against any existing active track
            is_dup = False
            for tr in self.tracks.values():
                if tr.item_class == det["class"]:
                    iou_val = float(iou_matrix([d_box], [tr.box])[0, 0])
                    cx_dist = float(np.hypot((tr.box[0] + tr.box[2]) / 2.0 - (d_box[0] + d_box[2]) / 2.0,
                                             (tr.box[1] + tr.box[3]) / 2.0 - (d_box[1] + d_box[3]) / 2.0))
                    if iou_val > 0.40 or cx_dist < 65.0:
                        is_dup = True
                        break

            if not is_dup:
                new_id = self.next_track_id
                self.next_track_id += 1
                self.tracks[new_id] = ByteTrackItem(
                    track_id=new_id,
                    box=d_box,
                    confidence=float(det["confidence"]),
                    item_class=det["class"],
                    timestamp=now_ts,
                    kf=self.kf,
                )
                matched_track_ids.add(new_id)

        # -------------------------------------------------------------
        # STAGE 4: Compile Results & Clean Dead Tracks
        # -------------------------------------------------------------
        results = []
        dead_ids = []

        for tid, track in list(self.tracks.items()):
            time_lost = now_ts - track.last_ts
            if time_lost > self.max_lost_seconds:
                dead_ids.append(tid)
            else:
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
