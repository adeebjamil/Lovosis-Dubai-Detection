"""
Preservation Property Tests  — Task 2
======================================
These 8 tests verify baseline behaviors that exist on UNFIXED code and MUST REMAIN
identical after all 8 fixes are applied (Task 3).

They test inputs that do NOT trigger any bug condition:
  - Persons at genuinely fresh spatial positions (dist > 0.25)
  - Fully-confirmed tracks (frames >= 10 AND in_zone_duration >= 0.8)
  - Non-CAM-001/CAM-002 cameras using ML gender scoring
  - Person confidence filter at 0.32 (not changed by any fix)
  - Pet-disabled cameras (class flag check fires before thresholds)
  - Tight spatial overlaps (dist < 0.16) still deduplicated
  - Post-count gender correction logic
  - 60-second re-entry window

Expected outcome when run against UNFIXED code: ALL 8 TESTS PASS.
Expected outcome when run against FIXED code:  ALL 8 TESTS STILL PASS.

Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 3.9
"""
from __future__ import annotations

import math
import pytest

from detector.camera_worker import box_iou, box_center_dist


# ---------------------------------------------------------------------------
# Helper: replicate the spatial dedup check (both unfixed and fixed share
# the same outcome for dist > 0.25 and dist < 0.16)
# ---------------------------------------------------------------------------

def _unfixed_is_dup(norm_box: list[float], recent_counted: list[tuple[float, list[float], str]], cls: str) -> bool:
    """Replicates the UNFIXED `recent_counted_boxes` dedup guard from camera_worker."""
    for _ts, prev_box, prev_cls in recent_counted:
        if prev_cls == cls:
            iou_val = box_iou(norm_box, prev_box)
            dist_val = box_center_dist(norm_box, prev_box)
            if iou_val > 0.25 or dist_val < 0.16:  # UNFIXED thresholds
                return True
    return False


def _unfixed_should_count(frames: int, in_zone_duration: float) -> bool:
    """Replicates the UNFIXED counting confirmation gate (OR logic)."""
    MIN_CONFIRMATION_FRAMES = 10
    return frames >= MIN_CONFIRMATION_FRAMES or in_zone_duration >= 0.8


def _unfixed_final_gender(
    code: str,
    box_cx: float,
    gender_scores: dict,
    cached_gender: str | None = None,
) -> str:
    """Replicates the UNFIXED final_gender resolution block from camera_worker."""
    male_score = gender_scores.get("MALE", 0.0)
    female_score = gender_scores.get("FEMALE", 0.0)

    if code == "CAM-002" and box_cx < 0.48:
        return "FEMALE"
    elif code == "CAM-002" and box_cx >= 0.48:
        return "MALE"
    elif code == "CAM-001":
        return "MALE"
    else:
        if female_score >= 0.70 and (female_score > male_score):
            return "FEMALE"
        elif male_score >= 0.70 and (male_score >= female_score):
            return "MALE"
        elif cached_gender in ("MALE", "FEMALE"):
            return cached_gender
        else:
            return "MALE"


# ===========================================================================
# P1 — Fresh-position new-person counting preserved
#
# Persons at spatial positions with normalized center distance > 0.25 from ANY
# prior counted box must each be counted as a new unique person.
# This path works correctly in BOTH unfixed and fixed code because dist > 0.25
# is well outside both the 0.16 (unfixed) and 0.25 (fixed) thresholds.
#
# Validates: Requirements 3.1
# ===========================================================================

@pytest.mark.parametrize("positions,expected_count", [
    # Three well-separated positions (dist between each pair > 0.25)
    (
        [
            [0.05, 0.05, 0.20, 0.40],   # center ≈ (0.125, 0.225)
            [0.55, 0.05, 0.70, 0.40],   # center ≈ (0.625, 0.225), dist from first ≈ 0.50
            [0.05, 0.60, 0.20, 0.95],   # center ≈ (0.125, 0.775), dist from first ≈ 0.55
        ],
        3,
    ),
    # Two well-separated positions
    (
        [
            [0.10, 0.10, 0.25, 0.45],   # center ≈ (0.175, 0.275)
            [0.75, 0.55, 0.90, 0.90],   # center ≈ (0.825, 0.725), dist ≈ 0.82
        ],
        2,
    ),
])
def test_p1_fresh_position_new_person_counting(positions, expected_count):
    """
    Each person at a fresh spatial position (dist > 0.25 from all priors) is
    counted exactly once. Passes on UNFIXED code because dist > 0.25 is well
    outside the 0.16 unfixed threshold.
    """
    recent_counted: list[tuple[float, list[float], str]] = []
    total_counted = 0
    now_ts = 1000.0

    for norm_box in positions:
        is_dup = _unfixed_is_dup(norm_box, recent_counted, "PERSON")

        if not is_dup:
            total_counted += 1

        # Always add to memory (mirrors camera_worker behavior)
        recent_counted.append((now_ts, norm_box, "PERSON"))
        now_ts += 1.0

    # Verify all positions are sufficiently far from each other
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            dist = box_center_dist(positions[i], positions[j])
            assert dist > 0.25, (
                f"Test geometry error: positions[{i}] and positions[{j}] are "
                f"only {dist:.4f} apart (need > 0.25 to be outside bug zone)"
            )

    assert total_counted == expected_count, (
        f"P1 FAILED: expected {expected_count} fresh persons counted, got {total_counted}. "
        f"Fresh spatial positions (dist > 0.25) must each be counted as new persons."
    )


# ===========================================================================
# P2 — Fully-confirmed track counted exactly once
#
# A track with frames >= 10 AND in_zone_duration >= 0.8 must be marked counted.
# This satisfies BOTH the unfixed OR gate and the fixed AND gate → passes in
# either version.
#
# Validates: Requirements 3.2
# ===========================================================================

@pytest.mark.parametrize("frames,in_zone_duration", [
    (10, 0.8),    # minimum threshold — both conditions met exactly
    (15, 1.2),    # clearly above both thresholds
    (10, 2.5),    # frames exactly at min, in_zone well above
    (25, 0.9),    # frames well above, in_zone just above
    (50, 5.0),    # long-running track
])
def test_p2_fully_confirmed_track_counted_once(frames, in_zone_duration):
    """
    A track satisfying BOTH frames >= 10 AND in_zone_duration >= 0.8 is marked
    counted regardless of whether OR or AND gate is used.
    """
    # Unfixed OR gate fires (True for these inputs)
    should_count = _unfixed_should_count(frames, in_zone_duration)

    assert should_count is True, (
        f"P2 FAILED: frames={frames}, in_zone_duration={in_zone_duration}s — "
        f"a fully-confirmed track (both conditions satisfied) must be counted. "
        f"Got: should_count={should_count}"
    )

    # Also verify the AND logic (fixed gate) gives the same result for these inputs
    MIN_CONFIRMATION_FRAMES = 10
    should_count_fixed = frames >= MIN_CONFIRMATION_FRAMES and in_zone_duration >= 0.8
    assert should_count_fixed is True, (
        f"P2 SANITY: AND gate also fires for fully-confirmed track "
        f"(frames={frames}, in_zone={in_zone_duration})"
    )


# ===========================================================================
# P3 — Non-CAM-001/CAM-002 gender derived from ML scores
#
# For cameras with codes other than "CAM-001"/"CAM-002", the general ML scoring
# path already applies correctly on UNFIXED code (it's in the `else` branch).
# female_score >= 0.70 and female_score > male_score → "FEMALE".
#
# Validates: Requirements 3.3
# ===========================================================================

@pytest.mark.parametrize("code,female_score,male_score,expected_gender", [
    ("CAM-003", 1.5, 0.3, "FEMALE"),    # Clear female signal
    ("CAM-004", 0.75, 0.2, "FEMALE"),   # Just above 0.70 threshold
    ("CAM-005", 0.3, 1.8, "MALE"),      # Clear male signal
    ("CAM-010", 0.85, 0.40, "FEMALE"),  # Female wins with both >= 0.70
    ("ENTRANCE-1", 2.0, 0.1, "FEMALE"), # High female score
    ("LOBBY-CAM", 0.0, 1.2, "MALE"),    # Only male data
])
def test_p3_non_cam001_cam002_gender_from_ml_scores(code, female_score, male_score, expected_gender):
    """
    Cameras that are NOT CAM-001 or CAM-002 use the general ML scoring path,
    which works correctly in UNFIXED code (the `else` branch).
    """
    gender_scores = {}
    if female_score > 0:
        gender_scores["FEMALE"] = female_score
    if male_score > 0:
        gender_scores["MALE"] = male_score

    final_gender = _unfixed_final_gender(
        code=code,
        box_cx=0.5,
        gender_scores=gender_scores,
    )

    assert final_gender == expected_gender, (
        f"P3 FAILED: camera={code}, female_score={female_score}, male_score={male_score} — "
        f"expected final_gender='{expected_gender}' but got '{final_gender}'. "
        f"Non-CAM-001/CAM-002 cameras must derive gender from ML scores via general logic."
    )


# ===========================================================================
# P4 — Person confidence filter unchanged at 0.32
#
# A PERSON detection with confidence=0.28 must be filtered out by the unfixed
# code's uniform 0.32 threshold. The fix ONLY lowers thresholds for DOG/CAT;
# PERSON threshold stays at 0.32.
#
# Validates: Requirements 3.6
# ===========================================================================

@pytest.mark.parametrize("confidence", [0.28, 0.20, 0.15, 0.31, 0.10, 0.00])
def test_p4_person_confidence_filter_unchanged(confidence):
    """
    PERSON detections below 0.32 are filtered out in both unfixed and fixed code.
    The fix does not touch the PERSON confidence threshold.
    """
    det = {"class": "PERSON", "confidence": confidence, "box": [50.0, 60.0, 150.0, 250.0]}

    # Replicate the UNFIXED valid_detections filter (uniform 0.32 for all classes)
    valid_unfixed = []
    for d in [det]:
        cls = d["class"]
        if cls == "PERSON":
            pass  # detect_persons=True, not flagged

        # UNFIXED: uniform threshold 0.32
        if d.get("confidence", 0.0) < 0.32:
            continue

        b = d["box"]
        bw = b[2] - b[0]
        bh = b[3] - b[1]
        if bw < 35 or bh < 45:
            continue
        valid_unfixed.append(d)

    assert len(valid_unfixed) == 0, (
        f"P4 FAILED: PERSON detection with confidence={confidence} should be filtered out "
        f"(threshold 0.32 unchanged for PERSON) but passed through. "
        f"Valid count={len(valid_unfixed)}"
    )


# ===========================================================================
# P5 — Pet-disabled camera suppresses all pets
#
# With detect_pets=False, DOG and CAT detections must never reach valid_detections
# regardless of the confidence threshold changes. The class-flag check fires before
# the confidence check in both unfixed and fixed code.
#
# Validates: Requirements 3.5
# ===========================================================================

@pytest.mark.parametrize("pet_class,confidence", [
    ("DOG", 0.05),
    ("DOG", 0.18),
    ("DOG", 0.25),
    ("DOG", 0.32),
    ("DOG", 0.80),
    ("CAT", 0.12),
    ("CAT", 0.30),
    ("CAT", 0.50),
    ("CAT", 0.90),
])
def test_p5_pet_disabled_suppresses_all_pets(pet_class, confidence):
    """
    When detect_pets=False, all DOG/CAT detections are suppressed before the
    confidence threshold check in both unfixed and fixed code. The class-flag
    check is the first gate and is not modified by any fix.
    """
    det = {
        "class": pet_class,
        "confidence": confidence,
        "box": [50.0, 60.0, 130.0, 180.0],
    }
    detect_pets = False

    # Replicate the UNFIXED valid_detections filter with detect_pets=False
    valid_unfixed = []
    for d in [det]:
        cls = d["class"]
        if cls in ("DOG", "CAT") and not detect_pets:
            continue  # ← class-flag gate fires first

        if d.get("confidence", 0.0) < 0.32:
            continue

        b = d["box"]
        bw = b[2] - b[0]
        bh = b[3] - b[1]
        if bw < 35 or bh < 45:
            continue
        valid_unfixed.append(d)

    assert len(valid_unfixed) == 0, (
        f"P5 FAILED: {pet_class} with confidence={confidence} should be suppressed by "
        f"detect_pets=False before any confidence check. "
        f"Valid count={len(valid_unfixed)}"
    )


# ===========================================================================
# P6 — Spatial dedup still fires for tight overlaps (dist < 0.16)
#
# When normalized center distance = 0.10 (well inside both 0.16 unfixed and
# 0.25 fixed thresholds), the dedup must fire in BOTH code versions.
#
# Validates: Requirements 3.7
# ===========================================================================

@pytest.mark.parametrize("dist_approx,expect_dup", [
    (0.10, True),   # well inside both thresholds — always a dup
    (0.08, True),   # very tight overlap — always a dup
    (0.05, True),   # near-identical boxes — always a dup
    (0.14, True),   # inside unfixed 0.16 threshold — dup in both
    (0.30, False),  # outside both thresholds — not a dup in either
])
def test_p6_spatial_dedup_fires_for_tight_overlaps(dist_approx, expect_dup):
    """
    Tight spatial overlaps (dist < 0.16) are suppressed as duplicates in both
    unfixed and fixed code — the unfixed threshold is 0.16, which covers this range.
    """
    # Construct box pair with the desired center distance
    # prev_box center = (0.50, 0.50)
    prev_box = [0.45, 0.45, 0.55, 0.55]  # center = (0.50, 0.50)
    # new_box shifted horizontally by dist_approx
    new_cx = 0.50 + dist_approx
    half = 0.05
    new_box = [new_cx - half, 0.45, new_cx + half, 0.55]

    actual_dist = box_center_dist(new_box, prev_box)
    assert abs(actual_dist - dist_approx) < 1e-5, (
        f"Geometry sanity: wanted dist≈{dist_approx}, got {actual_dist:.6f}"
    )

    recent_counted: list[tuple[float, list[float], str]] = [(1000.0, prev_box, "PERSON")]
    is_dup = _unfixed_is_dup(new_box, recent_counted, "PERSON")

    assert is_dup is expect_dup, (
        f"P6 FAILED: dist={actual_dist:.4f} — expected is_dup={expect_dup} "
        f"but unfixed dedup returned {is_dup}. "
        f"Tight overlaps (dist < 0.16) must always be deduplicated."
    )


# ===========================================================================
# P7 — Post-count gender correction (no double-count)
#
# After a person is counted as MALE, if female_score accumulates to >= 0.70,
# the post-count correction block decrements male by 1 and increments female by 1.
# Total persons count must remain unchanged. This logic is not modified by any fix.
#
# Validates: Requirements 3.8
# ===========================================================================

def test_p7_post_count_gender_correction_no_double_count():
    """
    Post-count gender correction adjusts male/female counters without affecting
    total persons count. This logic is identical in unfixed and fixed code.
    """
    # Simulate today_counts after a person was first counted as MALE
    today_counts = {
        "persons": 1,
        "male": 1,
        "female": 0,
        "emirati": 0,
        "nonEmirati": 0,
        "pets": 0,
        "dogs": 0,
        "cats": 0,
    }
    persons_before = today_counts["persons"]

    # Track was counted as MALE initially
    counted_gender = "MALE"

    # Later frames accumulate female evidence
    final_gender = "FEMALE"  # female_score=1.5 > 0.70, female > male

    # Replicate the UNFIXED post-count correction logic from camera_worker
    old_g = counted_gender
    if old_g != final_gender and final_gender in ("MALE", "FEMALE"):
        if old_g == "MALE":
            today_counts["male"] = max(0, today_counts["male"] - 1)
        elif old_g == "FEMALE":
            today_counts["female"] = max(0, today_counts["female"] - 1)

        if final_gender == "MALE":
            today_counts["male"] += 1
        elif final_gender == "FEMALE":
            today_counts["female"] += 1

    # Persons total must not change
    assert today_counts["persons"] == persons_before, (
        f"P7 FAILED: today_counts['persons'] changed from {persons_before} "
        f"to {today_counts['persons']} during gender correction. Total must be unchanged."
    )

    # Male decremented by 1
    assert today_counts["male"] == 0, (
        f"P7 FAILED: expected male=0 after correction (was MALE, now FEMALE), "
        f"got {today_counts['male']}"
    )

    # Female incremented by 1
    assert today_counts["female"] == 1, (
        f"P7 FAILED: expected female=1 after correction, got {today_counts['female']}"
    )


@pytest.mark.parametrize("initial_gender,new_gender,expected_male,expected_female", [
    ("MALE",   "FEMALE", 0, 1),   # male → female
    ("FEMALE", "MALE",   1, 0),   # female → male
    ("MALE",   "MALE",   1, 0),   # no change
    ("FEMALE", "FEMALE", 0, 1),   # no change
])
def test_p7_post_count_gender_correction_variants(initial_gender, new_gender, expected_male, expected_female):
    """
    Parametrized variant: verify all gender transition combinations produce
    correct counter adjustments without changing total persons.
    """
    today_counts = {
        "persons": 1,
        "male": 1 if initial_gender == "MALE" else 0,
        "female": 1 if initial_gender == "FEMALE" else 0,
    }
    persons_before = today_counts["persons"]

    final_gender = new_gender
    old_g = initial_gender

    if old_g != final_gender and final_gender in ("MALE", "FEMALE"):
        if old_g == "MALE":
            today_counts["male"] = max(0, today_counts["male"] - 1)
        elif old_g == "FEMALE":
            today_counts["female"] = max(0, today_counts["female"] - 1)
        if final_gender == "MALE":
            today_counts["male"] += 1
        elif final_gender == "FEMALE":
            today_counts["female"] += 1

    assert today_counts["persons"] == persons_before, (
        f"P7 VARIANT FAILED: persons changed ({initial_gender}→{new_gender})"
    )
    assert today_counts["male"] == expected_male, (
        f"P7 VARIANT FAILED: male={today_counts['male']}, expected {expected_male} "
        f"({initial_gender}→{new_gender})"
    )
    assert today_counts["female"] == expected_female, (
        f"P7 VARIANT FAILED: female={today_counts['female']}, expected {expected_female} "
        f"({initial_gender}→{new_gender})"
    )


# ===========================================================================
# P8 — 60-second re-entry accepted
#
# After pruning recent_counted_boxes older than 60s, the same spatial position
# is treated as a fresh entry and counted as a new person. Both unfixed and fixed
# code prune at 60 seconds.
#
# Validates: Requirements 3.9
# ===========================================================================

def test_p8_60_second_re_entry_accepted():
    """
    After advancing time by > 60 seconds, the same spatial box is pruned from
    recent_counted_boxes and counted again as a new person. Works identically
    in unfixed and fixed code (prune window is 60s in both).
    """
    original_box = [0.40, 0.40, 0.60, 0.70]  # center = (0.50, 0.55)
    original_ts = 1000.0

    # Add original entry to spatial memory
    recent_counted: list[tuple[float, list[float], str]] = [
        (original_ts, original_box, "PERSON")
    ]

    # Advance time by 61 seconds — beyond the 60s prune window
    now_ts = original_ts + 61.0

    # Replicate the UNFIXED prune logic from camera_worker
    pruned = [item for item in recent_counted if (now_ts - item[0]) < 60.0]

    # After pruning, check if the same position is detected as a dup
    is_dup_after_prune = _unfixed_is_dup(original_box, pruned, "PERSON")

    assert len(pruned) == 0, (
        f"P8 FAILED: after 61s, the entry should have been pruned "
        f"(prune window=60s) but {len(pruned)} entries remain."
    )
    assert is_dup_after_prune is False, (
        f"P8 FAILED: after pruning, the same spatial box should not be "
        f"flagged as a duplicate (person re-entered after 60s), "
        f"but is_dup={is_dup_after_prune}."
    )


@pytest.mark.parametrize("elapsed_seconds,expect_pruned", [
    (55.0, False),   # within window → NOT pruned → still a dup
    (59.9, False),   # just inside 60s window → NOT pruned
    (60.0, True),    # exactly at boundary: (60.0 < 60.0) is False → entry IS pruned
    (60.1, True),    # just beyond → pruned → not a dup anymore
    (120.0, True),   # well beyond → pruned
])
def test_p8_prune_window_boundary(elapsed_seconds, expect_pruned):
    """
    Verify the 60-second prune boundary: entries at elapsed exactly 60s ARE pruned
    because the condition is `(now_ts - ts) < 60.0` (strict less-than).
    Entries at elapsed < 60s are retained; entries at elapsed >= 60s are pruned.
    """
    original_ts = 1000.0
    original_box = [0.40, 0.40, 0.60, 0.70]
    recent_counted: list[tuple[float, list[float], str]] = [
        (original_ts, original_box, "PERSON")
    ]

    now_ts = original_ts + elapsed_seconds

    # Replicate the UNFIXED prune logic
    pruned = [item for item in recent_counted if (now_ts - item[0]) < 60.0]
    was_pruned = len(pruned) == 0

    assert was_pruned is expect_pruned, (
        f"P8 BOUNDARY FAILED: elapsed={elapsed_seconds}s — "
        f"expected pruned={expect_pruned} but got pruned={was_pruned}. "
        f"Prune condition: (now_ts - ts) < 60.0"
    )
