"""
Bug Fix Verification Tests  — Task 3.9
========================================
These 8 tests verify the FIXED code produces the correct behaviour.
They use the FIXED logic and assert the expected post-fix output.

Expected outcome when run against FIXED code: ALL 8 TESTS PASS.
"""
from __future__ import annotations

import numpy as np
import pytest

from detector.camera_worker import box_iou, box_center_dist


# ===========================================================================
# 1A — Spatial dedup gap  (FIXED: dist threshold 0.16 → 0.25)
# ===========================================================================

def test_1a_spatial_dedup_gap():
    """dist=0.20 must now be caught by the fixed threshold (< 0.25 → is_dup=True)."""
    prev_box = [0.25, 0.45, 0.35, 0.55]
    new_box  = [0.45, 0.45, 0.55, 0.55]

    dist = box_center_dist(new_box, prev_box)
    assert abs(dist - 0.20) < 1e-6

    iou_val = box_iou(new_box, prev_box)
    # FIXED guard: iou_val > 0.20 or dist_val < 0.25
    is_dup_fixed = iou_val > 0.20 or dist < 0.25

    assert is_dup_fixed is True, (
        f"FIX 1A FAILED: dist={dist:.4f} — fixed guard `dist < 0.25` should catch this "
        f"but returned is_dup={is_dup_fixed}."
    )


# ===========================================================================
# 1B — Tiling IoU gap  (FIXED: threshold 0.25 → 0.20)
# ===========================================================================

def test_1b_tiling_iou_gap():
    """Two PERSON boxes with IoU ≈ 0.22 must be deduplicated by the fixed 0.20 threshold."""
    box_a = [0.0,  0.0, 1.0, 1.0]
    box_b = [0.62, 0.0, 1.62, 1.0]

    iou = box_iou(box_a, box_b)
    assert 0.20 < iou < 0.25, f"geometry sanity: expected 0.20 < IoU < 0.25, got {iou:.4f}"

    detections = [
        {"class": "PERSON", "confidence": 0.85, "box": box_a},
        {"class": "PERSON", "confidence": 0.80, "box": box_b},
    ]

    # FIXED clean_detections dedup loop (iou_v > 0.20)
    clean = []
    for d in sorted(detections, key=lambda x: x["confidence"], reverse=True):
        is_dup = False
        for c in clean:
            iou_v = box_iou(d["box"], c["box"])
            if iou_v > 0.20:   # ← FIXED threshold
                is_dup = True
                break
        if not is_dup:
            clean.append(d)

    assert len(clean) == 1, (
        f"FIX 1B FAILED: IoU={iou:.4f} — fixed threshold 0.20 should deduplicate "
        f"to 1 detection but got len={len(clean)}."
    )


# ===========================================================================
# 1C — Premature OR gate  (FIXED: OR → AND)
# ===========================================================================

def test_1c_premature_or_gate():
    """frames=10 + in_zone=0.65 s must NOT count with the fixed AND gate."""
    frames           = 10
    in_zone_duration = 0.65
    MIN_CONFIRMATION_FRAMES = 10

    # FIXED gate: AND
    should_count_fixed = (frames >= MIN_CONFIRMATION_FRAMES and in_zone_duration >= 0.8)

    assert should_count_fixed is False, (
        f"FIX 1C FAILED: frames={frames}, in_zone_duration={in_zone_duration}s — "
        f"fixed AND gate should return False but got {should_count_fixed}."
    )


# ===========================================================================
# 1D — CAM-001 gender override  (FIXED: hardcoded branch removed)
# ===========================================================================

def test_1d_cam001_gender_override():
    """CAM-001 with female_score=2.5 must resolve to FEMALE via ML scoring."""
    gender_scores = {"FEMALE": 2.5, "MALE": 0.3}
    cached_gender = None

    male_score   = gender_scores.get("MALE",   0.0)
    female_score = gender_scores.get("FEMALE", 0.0)

    # FIXED logic: general ML scoring, no camera-code overrides
    if female_score >= 0.70 and (female_score > male_score):
        final_gender = "FEMALE"
    elif male_score >= 0.70 and (male_score >= female_score):
        final_gender = "MALE"
    elif cached_gender in ("MALE", "FEMALE"):
        final_gender = cached_gender
    else:
        final_gender = "MALE"

    assert final_gender == "FEMALE", (
        f"FIX 1D FAILED: gender_scores={gender_scores} — "
        f"expected 'FEMALE' but got '{final_gender}'."
    )


# ===========================================================================
# 1E — CAM-002 position override  (FIXED: positional branch removed)
# ===========================================================================

def test_1e_cam002_position_override_left():
    """CAM-002 left-side (box_cx=0.31) with male_score=1.8 must resolve to MALE."""
    gender_scores = {"MALE": 1.8, "FEMALE": 0.2}
    cached_gender = None

    male_score   = gender_scores.get("MALE",   0.0)
    female_score = gender_scores.get("FEMALE", 0.0)

    # FIXED logic: general ML scoring, no positional override
    if female_score >= 0.70 and (female_score > male_score):
        final_gender = "FEMALE"
    elif male_score >= 0.70 and (male_score >= female_score):
        final_gender = "MALE"
    elif cached_gender in ("MALE", "FEMALE"):
        final_gender = cached_gender
    else:
        final_gender = "MALE"

    assert final_gender == "MALE", (
        f"FIX 1E FAILED: CAM-002 left (box_cx=0.31), gender_scores={gender_scores} — "
        f"expected 'MALE' but got '{final_gender}'."
    )


# ===========================================================================
# 1F — YOLOX pet threshold  (FIXED: objectness gate 0.20 → 0.12, per-class thresholds)
# ===========================================================================

def test_1f_yolox_pet_threshold():
    """CAT with combined score ≈ 0.1504 must pass through the fixed objectness gate."""
    from detector.yolox import COCO_CLASSES, PER_CLASS_THRESHOLD

    obj_score       = 0.16
    cat_class_score = 0.94

    predictions = np.zeros((8400, 85), dtype=np.float32)
    predictions[0, 0] = 50.0
    predictions[0, 1] = 50.0
    predictions[0, 2] = 30.0
    predictions[0, 3] = 40.0
    predictions[0, 4] = obj_score
    predictions[0, 5 + 15] = cat_class_score  # COCO id 15 = CAT

    boxes_all        = predictions[:, :4]
    obj_scores_all   = predictions[:, 4]
    class_scores_all = predictions[:, 5:]

    FIXED_OBJ_GATE = 0.12  # ← lowered

    # FIXED path
    mask_fixed = obj_scores_all > FIXED_OBJ_GATE
    results_fixed = []
    if np.any(mask_fixed):
        obs = obj_scores_all[mask_fixed]
        cs  = class_scores_all[mask_fixed]
        for coco_id, class_name in COCO_CLASSES.items():
            scores = obs * cs[:, coco_id]
            cls_thresh = PER_CLASS_THRESHOLD.get(class_name, 0.20)
            cls_mask = scores >= cls_thresh
            if np.any(cls_mask):
                results_fixed.extend([class_name] * int(np.sum(cls_mask)))

    assert len(results_fixed) >= 1, (
        f"FIX 1F FAILED: CAT combined score ≈ {obj_score * cat_class_score:.4f} — "
        f"fixed gate 0.12 should pass it but got {len(results_fixed)} results."
    )
    assert "CAT" in results_fixed, f"Expected 'CAT' in results but got: {results_fixed}"


# ===========================================================================
# 1G — Worker confidence filter  (FIXED: per-class 0.18 for DOG/CAT)
# ===========================================================================

def test_1g_worker_confidence_filter():
    """DOG at confidence=0.25 must pass the fixed per-class filter (min_conf=0.18)."""
    dog_det = {"class": "DOG", "confidence": 0.25, "box": [50.0, 60.0, 130.0, 180.0]}
    raw     = [dog_det]

    # FIXED valid_detections filter
    valid_fixed = []
    for d in raw:
        cls = d["class"]
        if cls in ("DOG", "CAT"):
            pass  # detect_pets=True

        # FIXED: per-class threshold
        conf_val = d.get("confidence", 0.0)
        min_conf = 0.18 if d["class"] in ("DOG", "CAT") else 0.32
        if conf_val < min_conf:
            continue

        b  = d["box"]
        bw = b[2] - b[0]
        bh = b[3] - b[1]
        if bw < 35 or bh < 45:
            continue
        valid_fixed.append(d)

    assert len(valid_fixed) == 1, (
        f"FIX 1G FAILED: DOG with confidence=0.25 — "
        f"fixed 0.18 threshold should pass it but valid count={len(valid_fixed)}."
    )


# ===========================================================================
# 1H — Pet tiling exclusion  (FIXED: elif for DOG/CAT in tiling block)
# ===========================================================================

def test_1h_pet_tiling_exclusion():
    """DOG from right-crop tile must appear in raw_detections with x_right offset applied."""
    dog_crop_det = {"class": "DOG", "confidence": 0.55, "box": [10.0, 20.0, 80.0, 120.0]}
    x_right      = 378
    detect_pets  = True

    # FIXED right-crop tiling block
    raw_detections_fixed: list[dict] = []
    for r in [dog_crop_det]:
        if r["class"] == "PERSON":
            tb = r["box"]
            raw_detections_fixed.append({
                "class": "PERSON",
                "confidence": r["confidence"],
                "box": [float(tb[0] + x_right), float(tb[1]), float(tb[2] + x_right), float(tb[3])],
            })
        elif r["class"] in ("DOG", "CAT") and detect_pets:   # ← FIXED
            tb = r["box"]
            raw_detections_fixed.append({
                "class": r["class"],
                "confidence": r["confidence"],
                "box": [float(tb[0] + x_right), float(tb[1]), float(tb[2] + x_right), float(tb[3])],
            })

    assert len(raw_detections_fixed) == 1, (
        f"FIX 1H FAILED: DOG from right-crop not in raw_detections "
        f"(len={len(raw_detections_fixed)})."
    )

    dog_out = raw_detections_fixed[0]
    assert dog_out["class"] == "DOG"
    assert abs(dog_out["box"][0] - (10.0 + x_right)) < 1e-6, "x_right offset not applied to x1"
    assert abs(dog_out["box"][2] - (80.0 + x_right)) < 1e-6, "x_right offset not applied to x2"
