from __future__ import annotations

import time
from datetime import datetime, timezone
import numpy as np
import supervision as sv

from detector.reader import RtspReader
from detector.yolox import YoloXDetector
from detector.zone import ZoneChecker
from detector.attire import AttireClassifier


def box_iou(b1: list[float], b2: list[float]) -> float:
    """Computes Intersection-over-Union between two normalized boxes [x1, y1, x2, y2]."""
    xa = max(b1[0], b2[0])
    ya = max(b1[1], b2[1])
    xb = min(b1[2], b2[2])
    yb = min(b1[3], b2[3])
    inter = max(0.0, xb - xa) * max(0.0, yb - ya)
    area1 = max(0.0, b1[2] - b1[0]) * max(0.0, b1[3] - b1[1])
    area2 = max(0.0, b2[2] - b2[0]) * max(0.0, b2[3] - b2[1])
    union = area1 + area2 - inter
    return (inter / union) if union > 0 else 0.0


class CameraWorker:
    def __init__(self, camera_config: dict, detector: YoloXDetector, attire: AttireClassifier):
        self.camera_id = camera_config["id"]
        self.code = camera_config["code"]
        self.name = camera_config["name"]
        self.local_rtsp = camera_config["localRtspUrl"]
        self.analytics_fps = max(1, min(25, camera_config.get("analyticsFps", 10)))

        self.detect_persons = camera_config.get("detectPersons", True)
        self.detect_gender = camera_config.get("detectGender", True)
        self.detect_pets = camera_config.get("detectPets", True)
        self.detect_nationality = camera_config.get("detectNationality", True)

        self.zone_checker = ZoneChecker(
            mode=camera_config.get("zoneMode", "FULL_FRAME"),
            points=camera_config.get("customZonePoints", []),
        )

        self.detector = detector
        self.attire = attire
        self.tracker = sv.ByteTrack(
            track_activation_threshold=0.25,
            lost_track_buffer=60,
            minimum_matching_threshold=0.85,
            frame_rate=max(15, self.analytics_fps),
        )
        self.reader = RtspReader(self.local_rtsp)

        # Track management
        # track_id -> { "class", "first_seen", "last_seen", "counted", "is_duplicate", "in_zone_duration", "gender_votes", "nat_votes", "conf_sum", "frames", "box" }
        self.active_tracks: dict[int, dict] = {}
        self.counted_ids: set[int] = set()

        # Spatial re-identification memory to prevent re-counting the same person if tracking flickers
        # List of (timestamp, box, class)
        self.recent_counted_boxes: list[tuple[float, list[float], str]] = []

        # Cumulative today stats
        self.today_counts = {
            "persons": 0,
            "male": 0,
            "female": 0,
            "emirati": 0,
            "nonEmirati": 0,
            "pets": 0,
            "dogs": 0,
            "cats": 0,
        }

    def start(self):
        self.reader.start()

    def stop(self):
        self.reader.stop()

    def update_config(self, camera_config: dict):
        self.detect_persons = camera_config.get("detectPersons", True)
        self.detect_gender = camera_config.get("detectGender", True)
        self.detect_pets = camera_config.get("detectPets", True)
        self.detect_nationality = camera_config.get("detectNationality", True)
        self.zone_checker.update(
            mode=camera_config.get("zoneMode", "FULL_FRAME"),
            points=camera_config.get("customZonePoints", []),
        )

    def reset_counts(self):
        """Resets in-memory today counters, active tracks, and spatial deduplication history."""
        self.today_counts = {
            "persons": 0,
            "male": 0,
            "female": 0,
            "emirati": 0,
            "nonEmirati": 0,
            "pets": 0,
            "dogs": 0,
            "cats": 0,
        }
        self.active_tracks.clear()
        self.recent_counted_boxes.clear()
        self.counted_ids.clear()
        print(f"[detector] reset all active tracks and today counts for camera {self.camera_id}")

    def process_frame(self) -> tuple[dict | None, list[dict]]:
        """Processes the latest frame from the camera stream.
        Returns:
            (live_frame_payload, finished_tracks_list)
        """
        frame = self.reader.get_latest_frame()
        if frame is None:
            return None, []

        h, w = frame.shape[:2]
        raw_detections = self.detector.detect(frame)
        now_ts = time.time()
        now_iso = datetime.now(timezone.utc).isoformat()

        # Filter by enabled class flags
        valid_detections = []
        for d in raw_detections:
            cls = d["class"]
            if cls == "PERSON" and not self.detect_persons:
                continue
            if cls in ("DOG", "CAT") and not self.detect_pets:
                continue
            valid_detections.append(d)

        # Build supervision Detections object for ByteTrack
        boxes_out = []
        live_counts = {
            "persons": 0,
            "male": 0,
            "female": 0,
            "unknownGender": 0,
            "emirati": 0,
            "nonEmirati": 0,
            "unknownNationality": 0,
            "pets": 0,
            "dogs": 0,
            "cats": 0,
        }

        if len(valid_detections) > 0:
            xyxy = np.array([d["box"] for d in valid_detections], dtype=np.float32)
            confidence = np.array([d["confidence"] for d in valid_detections], dtype=np.float32)
            class_id = np.array([0 if d["class"] == "PERSON" else (1 if d["class"] == "DOG" else 2) for d in valid_detections], dtype=int)

            sv_detections = sv.Detections(
                xyxy=xyxy,
                confidence=confidence,
                class_id=class_id,
            )
            tracked = self.tracker.update_with_detections(sv_detections)

            # Map tracker outputs
            class_names = ["PERSON", "DOG", "CAT"]
            for i in range(len(tracked)):
                t_box = tracked.xyxy[i]
                t_conf = float(tracked.confidence[i]) if tracked.confidence is not None else 0.8
                t_cls = class_names[tracked.class_id[i]]
                t_id = int(tracked.tracker_id[i]) if tracked.tracker_id is not None else (i + 1)

                norm_box = [
                    float(t_box[0] / w),
                    float(t_box[1] / h),
                    float(t_box[2] / w),
                    float(t_box[3] / h),
                ]
                in_zone = self.zone_checker.is_in_zone(norm_box)

                # Attire & Gender classification with Track-Level Caching
                tr_prev = self.active_tracks.get(t_id)

                # Evaluate classification on keyframes:
                # - First frame of track
                # - Early frames (3, 6, 11) until high confidence
                # - Periodically every 20 frames (~1.2s)
                needs_eval = False
                if tr_prev is None:
                    needs_eval = True
                elif not tr_prev.get("classified", False):
                    if tr_prev["frames"] in (2, 4, 7, 11) or tr_prev["frames"] % 6 == 0:
                        needs_eval = True
                elif tr_prev["frames"] % 20 == 0:
                    needs_eval = True

                gender = tr_prev.get("cached_gender", "UNKNOWN") if tr_prev else "UNKNOWN"
                nationality = tr_prev.get("cached_nat", "UNKNOWN") if tr_prev else "UNKNOWN"
                gender_conf = tr_prev.get("cached_gconf", 0.0) if tr_prev else 0.0
                nat_conf = tr_prev.get("cached_nconf", 0.0) if tr_prev else 0.0

                if needs_eval and t_cls == "PERSON" and (self.detect_gender or self.detect_nationality):
                    px1 = max(0, int(t_box[0]))
                    py1 = max(0, int(t_box[1]))
                    px2 = min(w, int(t_box[2]))
                    py2 = min(h, int(t_box[3]))
                    crop_h = py2 - py1
                    crop_w = px2 - px1

                    # Only run deep face detection if person crop has adequate pixel resolution
                    if crop_w >= 22 and crop_h >= 55:
                        crop = frame[py1:py2, px1:px2]
                        attire_res = self.attire.classify_crop(crop)
                        if self.detect_nationality:
                            nationality = attire_res["nationality"]
                            nat_conf = attire_res["nationalityConfidence"]
                        if self.detect_gender:
                            gender = attire_res["gender"]
                            gender_conf = attire_res["genderConfidence"]

                # Track state management
                if t_id not in self.active_tracks:
                    self.active_tracks[t_id] = {
                        "class": t_cls,
                        "first_seen": now_iso,
                        "last_seen": now_iso,
                        "last_ts": now_ts,
                        "in_zone_duration": 0.0,
                        "counted": False,
                        "is_duplicate": False,
                        "conf_sum": t_conf,
                        "frames": 1,
                        "gender_scores": {gender: gender_conf} if gender != "UNKNOWN" else {},
                        "nat_scores": {nationality: nat_conf} if nationality != "UNKNOWN" else {},
                        "cached_gender": gender,
                        "cached_nat": nationality,
                        "cached_gconf": gender_conf,
                        "cached_nconf": nat_conf,
                        "classified": (gender != "UNKNOWN" and gender_conf >= 0.75),
                        "box": norm_box,
                    }
                else:
                    tr = self.active_tracks[t_id]
                    dt = now_ts - tr["last_ts"]
                    tr["last_seen"] = now_iso
                    tr["last_ts"] = now_ts
                    tr["frames"] += 1
                    tr["conf_sum"] += t_conf
                    tr["box"] = norm_box
                    if in_zone:
                        tr["in_zone_duration"] += dt

                    if needs_eval:
                        if gender != "UNKNOWN":
                            tr["gender_scores"][gender] = tr["gender_scores"].get(gender, 0.0) + gender_conf
                        if nationality != "UNKNOWN":
                            tr["nat_scores"][nationality] = tr["nat_scores"].get(nationality, 0.0) + nat_conf

                        if gender != "UNKNOWN" and gender_conf >= 0.75:
                            tr["classified"] = True

                        tr["cached_gender"] = gender
                        tr["cached_nat"] = nationality
                        tr["cached_gconf"] = gender_conf
                        tr["cached_nconf"] = nat_conf

                tr = self.active_tracks[t_id]

                # Resolve best gender with strict score margin (prevents 50/50 flickering or guessing on distant figures)
                male_score = tr["gender_scores"].get("MALE", 0.0)
                female_score = tr["gender_scores"].get("FEMALE", 0.0)
                final_gender = "UNKNOWN"
                if male_score >= 1.4 and (male_score - female_score >= 0.5):
                    final_gender = "MALE"
                elif female_score >= 1.4 and (female_score - male_score >= 0.5):
                    final_gender = "FEMALE"
                elif tr.get("cached_gender") in ("MALE", "FEMALE") and tr.get("cached_gconf", 0.0) >= 0.82:
                    final_gender = tr["cached_gender"]

                # Resolve nationality
                emirati_score = tr["nat_scores"].get("EMIRATI", 0.0)
                non_emirati_score = tr["nat_scores"].get("NON_EMIRATI", 0.0)
                final_nat = "NON_EMIRATI"
                if emirati_score >= 1.2 and (emirati_score - non_emirati_score >= 0.4):
                    final_nat = "EMIRATI"
                elif non_emirati_score >= 0.8:
                    final_nat = "NON_EMIRATI"

                # Prune spatial memory older than 60 seconds
                self.recent_counted_boxes = [item for item in self.recent_counted_boxes if (now_ts - item[0]) < 60.0]

                # Instant Unique ID-Based Counting:
                # Every detected person or pet is assigned a persistent Unique Track ID (e.g. #1, #2, #3...).
                # Once confirmed over 3 consecutive frames (~150ms to reject single-frame camera noise),
                # that Unique ID is counted ONCE and locked in counted_ids so it can NEVER be double-counted!
                # Live dwell time continues to tick up in real-time in the background.
                MIN_CONFIRMATION_FRAMES = 3

                if in_zone and not tr["counted"] and tr["frames"] >= MIN_CONFIRMATION_FRAMES:
                    tr["counted"] = True

                    # Spatial deduplication check: has an object of this class been counted in almost the same spot recently?
                    is_dup = False
                    for prev_ts, prev_box, prev_cls in self.recent_counted_boxes:
                        if prev_cls == t_cls and box_iou(norm_box, prev_box) > 0.38:
                            is_dup = True
                            break

                    tr["is_duplicate"] = is_dup
                    # Keep memory fresh while person remains in the room
                    self.recent_counted_boxes.append((now_ts, norm_box, t_cls))

                    if not is_dup:
                        self.counted_ids.add(t_id)

                        # Update cumulative today counters
                        if t_cls == "PERSON":
                            self.today_counts["persons"] += 1
                            if final_gender == "MALE":
                                self.today_counts["male"] += 1
                            elif final_gender == "FEMALE":
                                self.today_counts["female"] += 1
                            tr["counted_gender"] = final_gender

                            if final_nat == "EMIRATI":
                                self.today_counts["emirati"] += 1
                            elif final_nat == "NON_EMIRATI":
                                self.today_counts["nonEmirati"] += 1
                            tr["counted_nat"] = final_nat
                        else:
                            self.today_counts["pets"] += 1
                            if t_cls == "DOG":
                                self.today_counts["dogs"] += 1
                            elif t_cls == "CAT":
                                self.today_counts["cats"] += 1
                    else:
                        tr["counted_gender"] = "NONE"
                        tr["counted_nat"] = "NONE"
                elif in_zone and tr["counted"] and not tr.get("is_duplicate", False):
                    # Person was counted earlier, but gender/nationality was confirmed or refined after additional frames
                    if t_cls == "PERSON":
                        old_g = tr.get("counted_gender", "UNKNOWN")
                        if old_g != final_gender and final_gender in ("MALE", "FEMALE"):
                            if old_g == "MALE":
                                self.today_counts["male"] = max(0, self.today_counts["male"] - 1)
                            elif old_g == "FEMALE":
                                self.today_counts["female"] = max(0, self.today_counts["female"] - 1)

                            if final_gender == "MALE":
                                self.today_counts["male"] += 1
                            elif final_gender == "FEMALE":
                                self.today_counts["female"] += 1
                            tr["counted_gender"] = final_gender

                        old_n = tr.get("counted_nat", "UNKNOWN")
                        if old_n != final_nat and final_nat in ("EMIRATI", "NON_EMIRATI"):
                            if old_n == "EMIRATI":
                                self.today_counts["emirati"] = max(0, self.today_counts["emirati"] - 1)
                            elif old_n == "NON_EMIRATI":
                                self.today_counts["nonEmirati"] = max(0, self.today_counts["nonEmirati"] - 1)

                            if final_nat == "EMIRATI":
                                self.today_counts["emirati"] += 1
                            elif final_nat == "NON_EMIRATI":
                                self.today_counts["nonEmirati"] += 1
                            tr["counted_nat"] = final_nat

                # If currently in zone, increment live count
                if in_zone:
                    if t_cls == "PERSON":
                        live_counts["persons"] += 1
                        if final_gender == "MALE":
                            live_counts["male"] += 1
                        elif final_gender == "FEMALE":
                            live_counts["female"] += 1
                        else:
                            live_counts["unknownGender"] += 1

                        if final_nat == "EMIRATI":
                            live_counts["emirati"] += 1
                        elif final_nat == "NON_EMIRATI":
                            live_counts["nonEmirati"] += 1
                        else:
                            live_counts["unknownNationality"] += 1
                    else:
                        live_counts["pets"] += 1
                        if t_cls == "DOG":
                            live_counts["dogs"] += 1
                        elif t_cls == "CAT":
                            live_counts["cats"] += 1

                boxes_out.append({
                    "trackId": t_id,
                    "class": t_cls,
                    "gender": final_gender,
                    "nationality": final_nat,
                    "box": norm_box,
                    "inZone": in_zone,
                    "confidence": round(t_conf, 2),
                    "dwellSeconds": round(tr["in_zone_duration"], 1),
                    "isCounted": tr["counted"],
                })

        # Cleanup lost tracks (> 10.0 seconds inactivity)
        finished = []
        lost_ids = []
        for t_id, tr in self.active_tracks.items():
            if now_ts - tr["last_ts"] > 10.0:
                lost_ids.append(t_id)
                if tr["counted"] and not tr.get("is_duplicate", False) and tr["in_zone_duration"] >= 2.0:
                    best_gender = "UNKNOWN"
                    if tr.get("gender_scores"):
                        best_g, score_g = max(tr["gender_scores"].items(), key=lambda kv: kv[1])
                        if score_g >= 1.2:
                            best_gender = best_g

                    best_nat = "UNKNOWN"
                    if tr.get("nat_scores"):
                        best_n, score_n = max(tr["nat_scores"].items(), key=lambda kv: kv[1])
                        if score_n >= 0.8:
                            best_nat = best_n
                    avg_conf = float(tr["conf_sum"] / max(1, tr["frames"]))

                    finished.append({
                        "cameraId": self.camera_id,
                        "trackKey": f"{self.code}-{t_id}",
                        "class": tr["class"],
                        "gender": best_gender,
                        "genderConfidence": 0.85 if best_gender != "UNKNOWN" else None,
                        "nationality": best_nat,
                        "nationalityConfidence": 0.85 if best_nat != "UNKNOWN" else None,
                        "confidence": round(avg_conf, 2),
                        "firstSeenAt": tr["first_seen"],
                        "lastSeenAt": tr["last_seen"],
                        "dwellSeconds": round(tr["in_zone_duration"]),
                    })

        for t_id in lost_ids:
            del self.active_tracks[t_id]

        live_payload = {
            "cameraId": self.camera_id,
            "timestamp": int(now_ts * 1000),
            "counts": {
                "live": live_counts,
                "today": dict(self.today_counts),
            },
            "boxes": boxes_out,
        }

        return live_payload, finished
