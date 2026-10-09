# Detection Accuracy Fix — Bugfix Design

## Overview

Three inter-related accuracy bugs exist in the Python detector layer of the Dubai Detection CCTV system.

**Bug 1 — Duplicate Person Counting**: The spatial deduplication check uses a normalized center-distance threshold of 0.16, which is too tight to cover normal posture shifts. The multi-scale tiling IoU dedup threshold of 0.25 misses same-person overlaps from left/right crops. The counting confirmation gate uses OR logic (`frames >= 10 OR in_zone >= 0.8`), allowing premature counts before the classifier stabilizes.

**Bug 2 — Gender Hardcoding**: `camera_worker.py` contains camera-code-specific branches that unconditionally assign gender based on camera ID or bounding-box X position, completely bypassing the trained ML model.

**Bug 3 — Pet Detection Not Working**: YOLOX applies the same `0.20` objectness threshold to all classes; CAT/DOG scores are naturally lower and get cut. The camera worker final confidence filter hard-codes `< 0.32` for all classes, silently dropping valid pet detections in the `0.18–0.32` range. Multi-scale tiling is only extended to PERSON class, leaving small/distant pets undetected.

All fixes are isolated to three Python files: `detector/camera_worker.py`, `detector/yolox.py`, and `detector/bridge.py`. No database schema, API, or frontend changes are required.

---

## Glossary

- **Bug_Condition (C)**: The set of inputs / runtime states that trigger a bug — formally defined per-bug below.
- **Property (P)**: The correct output behavior the fixed code must exhibit for all C(X) inputs.
- **Preservation**: The behavior for all ¬C(X) inputs that must remain byte-for-byte identical after the fix.
- **isBugCondition(input)**: Pseudocode predicate — returns `True` when the input triggers the specific bug.
- **F**: Original (unfixed) function.
- **F'**: Fixed function.
- **`recent_counted_boxes`**: Ring buffer in `CameraWorker` storing `(timestamp, norm_box, class)` tuples used for spatial re-identification deduplication.
- **`clean_detections`**: The deduplicated detection list produced by the per-frame IoU dedup loop in `camera_worker.process_frame()`.
- **`conf_threshold`**: Single scalar threshold in `YoloXDetector.__init__` controlling both objectness filter and combined-score filter.
- **`gender_scores`**: Per-track dict `{"MALE": float, "FEMALE": float}` accumulating weighted ML model scores across frames.
- **norm_box**: Bounding box normalized to `[0.0, 1.0]` in both axes relative to frame width/height.

---

## Bug Details

### Bug 1 — Duplicate Person Counting

#### Bug Condition

The duplicate-count bug manifests under any of three independent sub-conditions in `camera_worker.process_frame()`:

**Formal Specification:**

```
FUNCTION isBugCondition_B1(track_state, detection_event)
  INPUT: track_state  — the active track dict for a person
         detection_event — the frame-level tracking update

  # Sub-condition A: Spatial dedup threshold too tight
  norm_box_now  := track_state["box"]          -- current normalized box
  prev_boxes    := recent_counted_boxes         -- list of (ts, norm_box, cls)

  dist_to_prev  := min(box_center_dist(norm_box_now, pb) for pb in prev_boxes
                       WHERE pb.cls == track_state["class"])

  SUB_A := (dist_to_prev >= 0.16) AND (dist_to_prev < 0.25)
           -- person shifted posture but is still the same individual

  # Sub-condition B: Tiling IoU dedup gap
  tiling_pairs := all (d1, d2) pairs in clean_detections
                  WHERE d1 and d2 originate from different crop tiles
                  AND d1.class == d2.class == "PERSON"
  iou_between  := box_iou(d1.box, d2.box)

  SUB_B := EXISTS pair IN tiling_pairs WHERE
           iou_between > 0.20 AND iou_between <= 0.25
           -- same person detected in both left-crop and right-crop pass

  # Sub-condition C: Premature counting gate
  SUB_C := (track_state["frames"] >= 10) AND
           (track_state["in_zone_duration"] < 0.8)
           -- counted before classifier has stable data (OR logic fires too early)

  RETURN SUB_A OR SUB_B OR SUB_C
END FUNCTION
```

#### Examples

- **Sub-A**: A seated employee leans back in their chair. Their normalized bounding box center shifts from `(0.50, 0.60)` to `(0.50, 0.78)` — a distance of `0.18`. The existing `dist < 0.16` check passes, a new count fires. **Expected**: not re-counted (distance < 0.25 = same person).
- **Sub-B**: A person standing near the seam of the left and right crop tiles produces two detections with IoU = 0.22. The existing dedup threshold is 0.25, so both survive and both get tracked. **Expected**: deduplicated down to one detection.
- **Sub-C**: A track reaches 10 frames in 0.7 s on first entry (fast camera). The OR gate fires immediately despite `in_zone_duration = 0.7s < 0.8s`. The attire classifier has only run 2 keyframe evaluations. **Expected**: require both conditions.

---

### Bug 2 — Gender Hardcoding

#### Bug Condition

```
FUNCTION isBugCondition_B2(camera_code, box_cx)
  INPUT: camera_code — self.code for the active CameraWorker
         box_cx      — normalized center-x of the person's bounding box

  RETURN (camera_code == "CAM-001")
      OR (camera_code == "CAM-002" AND box_cx < 0.48)
      OR (camera_code == "CAM-002" AND box_cx >= 0.48)

  -- Effectively: RETURN camera_code IN ("CAM-001", "CAM-002")
END FUNCTION
```

#### Examples

- A woman in a Hijab sits at a workstation on CAM-001. The attire classifier correctly returns `{"gender": "FEMALE", "genderConfidence": 0.93}`. After accumulation, `female_score = 2.79`. But the `elif self.code == "CAM-001": final_gender = "MALE"` branch fires unconditionally. **Expected**: `final_gender = "FEMALE"`.
- A male visitor sits in the left-side chair on CAM-002 (box_cx = 0.31). The `if self.code == "CAM-002" and box_cx < 0.48: final_gender = "FEMALE"` branch fires. **Expected**: gender derived from `gender_scores` via ML.

---

### Bug 3 — Pet Detection Not Working

#### Bug Condition

```
FUNCTION isBugCondition_B3(detection, camera_config)
  INPUT: detection     — raw YOLOX output dict for a CAT or DOG
         camera_config — the active CameraWorker config

  pet_conf       := detection["confidence"]   -- combined objectness × class score
  detect_pets_on := camera_config["detectPets"]
  frame_width    := camera_config["frame_width"]

  # Sub-condition A: YOLOX pre-NMS threshold discards low-confidence pets
  SUB_A := detection["class"] IN ("CAT", "DOG")
           AND pet_conf < 0.20
           AND pet_conf >= 0.12        -- model produced a real detection, but it's cut
           -- Because self.conf_threshold = 0.20 is applied uniformly

  # Sub-condition B: camera_worker final filter discards mid-conf pets
  SUB_B := detection["class"] IN ("CAT", "DOG")
           AND pet_conf >= 0.18
           AND pet_conf < 0.32         -- survives YOLOX but dies at worker filter

  # Sub-condition C: no tiling for pets on high-res frames
  SUB_C := detection["class"] IN ("CAT", "DOG")
           AND detect_pets_on == True
           AND frame_width >= 900
           AND pet_conf < 0.20         -- would be detected at native scale but not 640×640 resize

  RETURN (detect_pets_on) AND (SUB_A OR SUB_B OR SUB_C)
END FUNCTION
```

#### Examples

- A small cat in the background of a 2304-wide frame. YOLOX downscales to 640×640. Combined score = 0.14. The objectness pre-filter (`obj_scores > 0.20`) kills it. **Expected**: threshold for CAT/DOG = 0.12 so it passes through.
- A dog at medium confidence 0.25 passes YOLOX NMS but hits `if d.get("confidence", 0.0) < 0.32: continue` in `camera_worker.py`. It is silently discarded. **Expected**: pets use threshold 0.18.
- Same dog is near the right edge of a 1920-wide frame. Left/right crop tiling runs but only passes `if r["class"] == "PERSON"` — the dog detection is dropped. **Expected**: tiling includes DOG and CAT.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Genuinely new persons entering the zone for the first time from a fresh spatial position SHALL continue to be counted as new unique persons.
- Once a track passes BOTH the 10-frame AND 0.8 s gate, it SHALL continue to be marked as counted exactly once.
- Cameras not listed as `CAM-001` or `CAM-002` using the general ML scoring path SHALL continue to resolve gender from `gender_scores` unchanged.
- Persons wearing Kandura or Abaya on any camera SHALL continue to be classified as EMIRATI with correct gender via the attire classifier.
- Pet detection disabled cameras (`detectPets: false`) SHALL continue to suppress all DOG and CAT detections regardless of the lowered thresholds.
- Person detections with confidence below 0.32 SHALL continue to be filtered out; only pet thresholds are lowered.
- The `recent_counted_boxes` 60-second pruning window SHALL continue to allow re-counting genuine re-entrants after that window expires.
- The post-count gender/nationality correction logic (updating cumulative counters on refinement without double-counting) SHALL remain untouched.

**Scope:**
All inputs that do NOT match the three bug conditions are completely unaffected by this fix. This includes: mouse/API interactions, cameras other than CAM-001/CAM-002, person detections above 0.32, box positions with dist < 0.16 from a prior counted box.

---

## Hypothesized Root Cause

### Bug 1 — Duplicate Person Counting

1. **Threshold Calibration Error**: The `0.16` normalized distance was calculated for a 1280-wide frame reference. On the 2304-wide CAM-001 frame, `0.16 × 2304 ≈ 368 px` which is insufficient to cover a full posture-shift range of ~576 px (`0.25 × 2304`).

2. **Tiling Dedup Gap**: The left-crop covers `[0, 58%]` and right-crop covers `[42%, 100%]` of frame width — a 16% overlap band. Persons in this band produce two detections with IoU typically in the 0.20–0.25 range, which the 0.25 threshold just barely lets through.

3. **OR vs AND Gate**: The counting condition `(frames >= 10 OR in_zone >= 0.8)` was likely written during early development when frame counts were less reliable. On fast inference loops (~20 FPS) the frame count reaches 10 in 0.5 s, which is less than the 0.8 s dwell requirement — defeating the intent of the stability gate.

### Bug 2 — Gender Hardcoding

The hardcoded blocks were added as temporary workarounds for a specific office camera layout (Lovosis UAE). The code comment `"Office Room (Lovosis UAE) workstation occupant seated behind glass is Male"` confirms this. The workarounds were never removed and now override ML inference globally for those camera codes.

### Bug 3 — Pet Detection

1. **Uniform Threshold**: `YoloXDetector` was designed for person detection where 0.20 is a reasonable floor. CAT/DOG COCO classes have systematically lower class-head scores in YOLOX models fine-tuned on person-heavy datasets. The 0.12 threshold aligns with standard practice for rare-class detection.

2. **Worker Filter Mismatch**: The 0.32 confidence floor in the worker was set to suppress ghost detections for persons. It was applied uniformly without per-class logic when pet detection was added.

3. **Tiling PERSON-Only**: The multi-scale tiling code explicitly checks `if r["class"] == "PERSON"` before appending crop results, so pet detections from tiles are unconditionally discarded.

---

## Correctness Properties

Property 1: Bug Condition — Spatial Dedup Covers Posture Shifts

_For any_ track where a previously counted person's normalized bounding-box center shifts by a distance in the range `[0.16, 0.25)` from the stored `recent_counted_boxes` entry, the fixed `process_frame` function SHALL recognize the detection as a duplicate and SHALL NOT increment `today_counts["persons"]`.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition — Counting Gate Requires Both Conditions

_For any_ track where `frames >= 10` is satisfied but `in_zone_duration < 0.8`, the fixed confirmation gate SHALL NOT mark the track as counted, regardless of how many frames have elapsed.

**Validates: Requirements 2.3**

Property 3: Bug Condition — Gender Derived from ML on CAM-001 and CAM-002

_For any_ person detected on a camera with code `CAM-001` or `CAM-002`, the fixed `process_frame` function SHALL derive `final_gender` exclusively from the accumulated `gender_scores` dict using the general scoring logic, and SHALL NOT use the camera code or bounding-box X position to assign a gender label.

**Validates: Requirements 2.4, 2.5, 2.6**

Property 4: Bug Condition — Pet Detections Reach the Tracker

_For any_ CAT or DOG detection where YOLOX produces a combined objectness × class score ≥ 0.12 AND the camera has `detectPets: true`, the fixed pipeline SHALL pass that detection through both the YOLOX class filter and the camera worker confidence filter to the tracker, rather than silently discarding it.

**Validates: Requirements 2.7, 2.8**

Property 5: Bug Condition — Pet Tiling on High-Resolution Frames

_For any_ frame with width ≥ 900 px on a camera with `detectPets: true`, the fixed multi-scale tiling SHALL include DOG and CAT detections from left-crop and right-crop passes, treating them identically to PERSON detections in the tiling logic.

**Validates: Requirements 2.9**

Property 6: Preservation — Existing Person Detection Behavior Unchanged

_For any_ input where the bug conditions do NOT hold (new persons at fresh spatial positions, non-CAM-001/CAM-002 cameras, person confidence ≥ 0.32, `detectPets: false`), the fixed functions SHALL produce the same tracking, counting, and gender/nationality results as the original functions.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**

---

## Fix Implementation

### Changes Required

#### File: `detector/camera_worker.py`

**Change 1 — Spatial dedup threshold (Bug 1A)**

Location: `process_frame()`, inside the `recent_counted_boxes` loop.

```python
# BEFORE
if iou_val > 0.25 or dist_val < 0.16:

# AFTER
if iou_val > 0.20 or dist_val < 0.25:
```

Both thresholds change together: IoU drops from `0.25 → 0.20` (catches more tiling overlaps) and center distance rises from `0.16 → 0.25` (covers posture shifts on high-res frames).

**Change 2 — Tiling dedup IoU threshold (Bug 1B)**

Location: `process_frame()`, the `clean_detections` IoU dedup loop.

```python
# BEFORE
if iou_v > 0.25:

# AFTER
if iou_v > 0.20:
```

**Change 3 — Confirmation gate AND logic (Bug 1C)**

Location: `process_frame()`, the counting confirmation condition.

```python
# BEFORE
if in_zone and not tr["counted"] and (tr["frames"] >= MIN_CONFIRMATION_FRAMES or tr["in_zone_duration"] >= 0.8):

# AFTER
if in_zone and not tr["counted"] and (tr["frames"] >= MIN_CONFIRMATION_FRAMES and tr["in_zone_duration"] >= 0.8):
```

**Change 4 — Remove gender hardcoding (Bug 2)**

Location: `process_frame()`, the `final_gender` resolution block.

Remove these three branches entirely:
```python
# DELETE these lines:
if self.code == "CAM-002" and box_cx < 0.48:
    final_gender = "FEMALE"
elif self.code == "CAM-002" and box_cx >= 0.48:
    final_gender = "MALE"
elif self.code == "CAM-001":
    final_gender = "MALE"
else:
    # ... general logic
```

Replace with the general ML scoring logic directly (no wrapping `else`):
```python
if female_score >= 0.70 and (female_score > male_score):
    final_gender = "FEMALE"
elif male_score >= 0.70 and (male_score >= female_score):
    final_gender = "MALE"
elif tr.get("cached_gender") in ("MALE", "FEMALE"):
    final_gender = tr["cached_gender"]
else:
    final_gender = "MALE"  # fallback only when no model data at all
```

**Change 5 — Per-class confidence filter for pets (Bug 3B)**

Location: `process_frame()`, the `valid_detections` filter loop.

```python
# BEFORE
if d.get("confidence", 0.0) < 0.32:
    continue

# AFTER
conf_val = d.get("confidence", 0.0)
min_conf = 0.18 if d["class"] in ("DOG", "CAT") else 0.32
if conf_val < min_conf:
    continue
```

**Change 6 — Extend tiling to include pets (Bug 3C)**

Location: `process_frame()`, the high-resolution tiling block (`if self.detect_persons and w >= 900`).

```python
# BEFORE (left-crop append)
for r in self.detector.detect(crop_left):
    if r["class"] == "PERSON":
        raw_detections.append(r)

# AFTER
for r in self.detector.detect(crop_left):
    if r["class"] == "PERSON":
        raw_detections.append(r)
    elif r["class"] in ("DOG", "CAT") and self.detect_pets:
        raw_detections.append(r)

# BEFORE (right-crop append)
for r in self.detector.detect(crop_right):
    if r["class"] == "PERSON":
        raw_detections.append({ ... })   # with x_right offset

# AFTER — also handle pets (no x-offset needed for norm_box; box coords need offset)
for r in self.detector.detect(crop_right):
    if r["class"] == "PERSON":
        # existing offset logic unchanged
        ...
    elif r["class"] in ("DOG", "CAT") and self.detect_pets:
        tb = r["box"]
        raw_detections.append({
            "class": r["class"],
            "confidence": r["confidence"],
            "box": [float(tb[0] + x_right), float(tb[1]), float(tb[2] + x_right), float(tb[3])],
        })
```

#### File: `detector/yolox.py`

**Change 7 — Per-class confidence threshold in detect() (Bug 3A)**

Location: `YoloXDetector.detect()`, the per-class score filtering loop.

```python
# BEFORE
cls_mask = scores >= self.conf_threshold

# AFTER
PER_CLASS_THRESHOLD = {"PERSON": 0.20, "DOG": 0.12, "CAT": 0.12}
cls_thresh = PER_CLASS_THRESHOLD.get(class_name, self.conf_threshold)
cls_mask = scores >= cls_thresh
```

The objectness pre-filter (`mask = obj_scores > self.conf_threshold`) must also be lowered to `0.12` to avoid cutting pet candidates before the per-class step:

```python
# BEFORE
mask = obj_scores > self.conf_threshold

# AFTER
mask = obj_scores > 0.12  # lowered to pass potential pet detections through
```

#### File: `detector/bridge.py`

**Change 8 — Prefer yolox_m.onnx (Bug 3, accuracy baseline)**

This change is already present in the current `bridge.py` (`DetectorService.__init__`):

```python
yolox_model = MODELS_DIR / "yolox_m.onnx"
if not yolox_model.exists():
    yolox_model = MODELS_DIR / "yolox_s.onnx"
```

No change needed here — the model preference is already correctly implemented. Document this for completeness: if `yolox_m.onnx` is present it is used automatically; this provides better class-head accuracy for all COCO classes including pets.

---

## Testing Strategy

### Validation Approach

Testing follows a two-phase approach: first run exploratory tests on unfixed code to surface counterexamples and confirm root causes, then apply fixes and verify both fix-checking and preservation-checking pass.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug on the UNFIXED code. Confirm or refute root cause analysis before implementing changes.

**Test Plan**: Write unit tests that directly exercise the buggy code paths with crafted inputs. Run on unpatched code to confirm failures align with the hypothesized root causes.

**Test Cases**:

1. **Posture-shift double-count (Bug 1A)**: Feed two sequential frames where the same person's normalized center moves by `0.20` (inside the gap `[0.16, 0.25)`). Assert that `today_counts["persons"]` is 1 after both frames. On unfixed code this will assert 2.

2. **Tiling IoU gap double-count (Bug 1B)**: Inject two detections for the same person with IoU = 0.22 into the `clean_detections` loop. Assert that only one survives dedup. On unfixed code (threshold 0.25) both survive.

3. **Premature counting gate (Bug 1C)**: Feed a track with `frames = 10` and `in_zone_duration = 0.65`. Assert `counted = False`. On unfixed code (OR logic) `counted = True`.

4. **CAM-001 gender override (Bug 2)**: Create a `CameraWorker` with `code = "CAM-001"`. Accumulate `gender_scores = {"FEMALE": 2.5, "MALE": 0.3}`. Assert `final_gender == "FEMALE"`. On unfixed code returns `"MALE"`.

5. **CAM-002 position override (Bug 2)**: Create a `CameraWorker` with `code = "CAM-002"`. Set `box_cx = 0.31` with `gender_scores = {"MALE": 1.8, "FEMALE": 0.2}`. Assert `final_gender == "MALE"`. On unfixed code returns `"FEMALE"`.

6. **YOLOX pet threshold cut (Bug 3A)**: Mock YOLOX output with a CAT detection at combined score = 0.15. Assert the detection is returned from `detect()`. On unfixed code (threshold 0.20) returns empty list.

7. **Worker confidence filter cut (Bug 3B)**: Build a `valid_detections` filter test with a DOG detection at confidence 0.25. Assert it passes through. On unfixed code (`< 0.32` cut-off) it is discarded.

8. **Pet tiling exclusion (Bug 3C)**: Mock `detector.detect()` to return a DOG detection from the right-crop. Assert the DOG appears in `raw_detections` after the tiling block. On unfixed code it is dropped by the `if r["class"] == "PERSON"` check.

**Expected Counterexamples**:
- Bugs 1A/1B: `today_counts["persons"]` incremented twice for the same physical person
- Bug 1C: `counted = True` at `in_zone_duration = 0.65 s` before classifier is stable
- Bug 2: `final_gender` returns the hardcoded value regardless of model scores
- Bugs 3A/3B/3C: pet detections produce empty results even when YOLOX generates valid scores

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := process_frame_fixed(input)  -- or detect_fixed / filter_fixed
  ASSERT expectedBehavior(result)
END FOR
```

After applying all eight changes above, re-run the same eight exploratory test cases and assert they now pass.

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT process_frame_original(input) == process_frame_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many random track states, detection combinations, and camera configs automatically
- It catches edge cases (borderline IoU, boundary box_cx values, mixed pet/person frames) that manual tests miss
- It provides strong guarantees over the entire non-buggy input domain

**Test Plan**: Observe behavior on UNFIXED code first for the non-buggy paths, then write property-based tests that assert identical outcomes after the fix.

**Preservation Test Cases**:

1. **New-person counting preserved**: Generate random tracks at spatial positions far (dist > 0.25) from any prior counted box. Assert each is counted exactly once, same as before.

2. **Fully-confirmed track counting preserved**: Generate tracks with `frames >= 10 AND in_zone_duration >= 0.8`. Assert they are marked counted identical to the original.

3. **Non-CAM-001/CAM-002 gender preserved**: Generate detections on cameras with codes other than `CAM-001`/`CAM-002`. Assert `final_gender` derivation from `gender_scores` is unchanged.

4. **Attire classifier path preserved**: Generate EMIRATI Kandura/Abaya detections on any camera. Assert `nationality = "EMIRATI"` and correct gender from attire classifier, unchanged.

5. **Pet-disabled camera preserved**: Set `detectPets = False`. Assert no DOG/CAT ever reaches the tracker regardless of threshold changes.

6. **Person confidence filter preserved**: Generate PERSON detections at confidence 0.28. Assert they are still filtered out (threshold 0.32 for persons is unchanged).

7. **60-second re-entry preserved**: Simulate a person counting event, advance time by 61 seconds, re-present the same spatial position. Assert it counts as a new person.

8. **Post-count gender correction preserved**: Count a track as MALE then accumulate female_score ≥ 0.70 on later frames. Assert the cumulative counters update correctly (male−1, female+1) without double-counting total persons.

### Unit Tests

- Test `box_center_dist` with norm_box pairs spanning the 0.16–0.25 gap to verify threshold boundary behavior
- Test `clean_detections` dedup loop with IoU values at 0.19, 0.20, 0.21, 0.25, 0.26 boundary cases
- Test the confirmation gate with all four combinations of `(frames >= 10, in_zone >= 0.8)` using AND logic
- Test `final_gender` resolution for `code = "CAM-001"`, `code = "CAM-002"`, and other codes with various `gender_scores` dicts
- Test `YoloXDetector.detect()` with mocked ONNX output containing CAT/DOG scores at 0.10, 0.12, 0.15, 0.20
- Test the `valid_detections` filter with DOG/CAT at 0.15, 0.18, 0.25, 0.32 confidence values
- Test the tiling loop to verify DOG/CAT from right-crop receive the correct `x_right` pixel offset

### Property-Based Tests

- Generate random normalized boxes and assert that any pair with center distance ≥ 0.25 is never flagged as duplicate in the fixed spatial dedup
- Generate random `gender_scores` dicts for any camera code and assert `final_gender` always equals `argmax(gender_scores)` when any score ≥ 0.70, with no camera-code exceptions
- Generate random YOLOX output tensors with CAT/DOG scores between 0.12 and 0.19 and assert they always produce at least one detection in the fixed `detect()` for valid object positions
- Generate random detection lists with mixed PERSON/DOG/CAT confidences and assert the `valid_detections` filter correctly partitions by class-specific threshold

### Integration Tests

- End-to-end frame processing test: inject a synthetic 900 × 600 frame with a mock detector returning a DOG at confidence 0.22 and verify it appears in `boxes_out` of `live_payload`
- Multi-frame track test: feed 15 synthetic frames with a single person track accumulating `in_zone_duration` and verify counting fires exactly on frame 10+ when `in_zone_duration` passes 0.8 s (AND gate)
- Camera code test: configure a `CameraWorker` with `code = "CAM-001"`, run 20 frames with accumulated female ML scores, and verify the live payload reflects `gender = "FEMALE"` not `"MALE"`
