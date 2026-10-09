# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Duplicate Count / Gender Override / Pet Suppression Bugs
  - **CRITICAL**: Write these tests BEFORE implementing any fix — they MUST FAIL on unfixed code
  - **DO NOT attempt to fix the test or the code when tests fail**
  - **GOAL**: Surface counterexamples that confirm all 8 buggy code paths exist
  - **Scoped PBT Approach**: Scope each property to the concrete failing boundary values for reproducibility
  - Create `detector/tests/test_bug_conditions.py` with the following test cases on UNFIXED code:
    - **1A — Spatial dedup gap**: feed two sequential detections for the same person class where `box_center_dist` returns a value in `[0.16, 0.25)` (e.g. `0.20`). Assert `today_counts["persons"] == 1`. On unfixed code (`dist_val < 0.16`) the check misses and count becomes 2.
    - **1B — Tiling IoU gap**: inject two PERSON detections with `box_iou == 0.22` into the `clean_detections` dedup loop. Assert only one survives. On unfixed code (`iou_v > 0.25` threshold) both survive.
    - **1C — Premature OR gate**: build a track state with `frames = 10` and `in_zone_duration = 0.65`. Assert `counted == False`. On unfixed code (OR logic) `counted == True`.
    - **1D — CAM-001 gender override**: create a `CameraWorker` with `code = "CAM-001"`, accumulate `gender_scores = {"FEMALE": 2.5, "MALE": 0.3}`. Assert `final_gender == "FEMALE"`. On unfixed code always returns `"MALE"`.
    - **1E — CAM-002 position override (left)**: `code = "CAM-002"`, `box_cx = 0.31`, `gender_scores = {"MALE": 1.8, "FEMALE": 0.2}`. Assert `final_gender == "MALE"`. On unfixed code returns `"FEMALE"`.
    - **1F — YOLOX pet threshold**: mock ONNX output with a CAT combined score = 0.15. Assert `YoloXDetector.detect()` returns a non-empty list. On unfixed code (threshold 0.20) returns `[]`.
    - **1G — Worker confidence filter**: build a detection dict `{"class": "DOG", "confidence": 0.25, "box": [...]}`. Assert it passes the `valid_detections` filter. On unfixed code (`< 0.32` cut-off) it is discarded.
    - **1H — Pet tiling exclusion**: mock `detector.detect()` on the right-crop to return `{"class": "DOG", "confidence": 0.55, "box": [10, 20, 80, 120]}`. Assert the DOG appears in `raw_detections` after the tiling block runs with `detect_pets = True`. On unfixed code the `if r["class"] == "PERSON"` guard drops it.
  - Run all tests on UNFIXED code — **EXPECTED OUTCOME**: all 8 tests FAIL (confirms all bugs exist)
  - Document each counterexample found (concrete inputs and wrong outputs)
  - Mark task complete when all tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Counting / Gender / Pet-Disabled Baseline Behaviors
  - **IMPORTANT**: Follow observation-first methodology — run UNFIXED code with non-buggy inputs first
  - Create `detector/tests/test_preservation.py` using `pytest` + `hypothesis` with the following properties:
    - **P1 — Fresh-position new-person counting**: generate random tracks at `box_center_dist > 0.25` from any prior counted box. Observe and assert `today_counts["persons"]` increments by exactly 1 per new spatial position.
    - **P2 — Fully-confirmed track counted once**: generate tracks with `frames >= 10 AND in_zone_duration >= 0.8`. Observe and assert `counted == True` and total-person delta == 1 (counted exactly once).
    - **P3 — Non-CAM-001/CAM-002 gender from ML scores**: generate detections on cameras with codes other than `CAM-001`/`CAM-002` with `female_score >= 0.70` and `female_score > male_score`. Observe and assert `final_gender == "FEMALE"`.
    - **P4 — Person confidence filter unchanged**: generate PERSON detections at `confidence = 0.28`. Observe and assert detection is filtered out (threshold 0.32 for persons is NOT changed).
    - **P5 — Pet-disabled camera suppresses all pets**: set `detectPets = False`. For all DOG/CAT detections at any confidence. Observe and assert none reach `valid_detections`.
    - **P6 — Spatial dedup still fires for tight overlaps**: generate same-class detection pairs with `box_center_dist < 0.16` or `box_iou > 0.25`. Observe and assert they are still suppressed as duplicates.
    - **P7 — Post-count gender correction**: count a track as MALE then accumulate `female_score >= 0.70` on later frames. Observe and assert `today_counts["male"]` decrements by 1 and `today_counts["female"]` increments by 1, with no change to total `today_counts["persons"]`.
    - **P8 — 60-second re-entry accepted**: count a person, advance `now_ts` by 61 s (beyond the prune window), re-present the same spatial box. Observe and assert it is counted as a new person.
  - Verify all property tests **PASS on UNFIXED code** (confirms these are the baselines to preserve)
  - Mark task complete when tests are written, run, and all pass on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 3.9_

- [ ] 3. Apply all 8 bugfix changes

  - [x] 3.1 Fix YOLOX objectness pre-filter (Change 1 — `detector/yolox.py`)
    - In `YoloXDetector.detect()`, change `mask = obj_scores > self.conf_threshold` to `mask = obj_scores > 0.12`
    - This lowers the objectness gate so CAT/DOG candidates with scores in `[0.12, 0.20)` are no longer killed before the per-class filter
    - _Bug_Condition: isBugCondition_B3 SUB_A — CAT/DOG combined score ≥ 0.12 but < 0.20 discarded by uniform objectness filter_
    - _Expected_Behavior: pet detections with score ≥ 0.12 pass the objectness pre-filter and reach the per-class threshold step_
    - _Preservation: PERSON objectness pre-filter is still effectively 0.20 because the per-class step enforces 0.20 for PERSON_
    - _Requirements: 2.7_

  - [ ] 3.2 Add per-class confidence threshold in YOLOX detect loop (Change 2 — `detector/yolox.py`)
    - Add constant `PER_CLASS_THRESHOLD = {"PERSON": 0.20, "DOG": 0.12, "CAT": 0.12}` at module level in `yolox.py`
    - In the per-class score loop, replace `cls_mask = scores >= self.conf_threshold` with:
      ```python
      cls_thresh = PER_CLASS_THRESHOLD.get(class_name, self.conf_threshold)
      cls_mask = scores >= cls_thresh
      ```
    - _Bug_Condition: isBugCondition_B3 SUB_A — uniform `self.conf_threshold = 0.20` applied to CAT/DOG class scores that are naturally lower_
    - _Expected_Behavior: CAT and DOG use threshold 0.12; PERSON continues to use 0.20_
    - _Preservation: PERSON threshold unchanged at 0.20; only CAT/DOG thresholds differ_
    - _Requirements: 2.7_

  - [ ] 3.3 Fix spatial dedup threshold (Change 3 — `detector/camera_worker.py`)
    - In `process_frame()`, inside the `recent_counted_boxes` loop, change:
      `if iou_val > 0.25 or dist_val < 0.16:` → `if iou_val > 0.20 or dist_val < 0.25:`
    - _Bug_Condition: isBugCondition_B1 SUB_A — posture shift moves normalized center by distance in `[0.16, 0.25)`, triggering re-count_
    - _Expected_Behavior: any re-detection within normalized center distance < 0.25 from a prior counted box is suppressed as duplicate_
    - _Preservation: positions with dist ≥ 0.25 from any prior counted box are still counted as new unique persons_
    - _Requirements: 2.1_

  - [ ] 3.4 Fix clean-detections IoU dedup threshold (Change 4 — `detector/camera_worker.py`)
    - In `process_frame()`, the `clean_detections` per-frame IoU dedup loop, change:
      `if iou_v > 0.25:` → `if iou_v > 0.20:`
    - _Bug_Condition: isBugCondition_B1 SUB_B — tiling overlap band produces same-person detection pairs with IoU in `(0.20, 0.25]` that both survive the 0.25 threshold_
    - _Expected_Behavior: any two detections of the same class with IoU > 0.20 are deduplicated; the higher-confidence one is kept_
    - _Preservation: detection pairs with IoU ≤ 0.20 that are genuinely different persons continue to both be retained_
    - _Requirements: 2.2_

  - [ ] 3.5 Fix counting confirmation gate from OR to AND (Change 5 — `detector/camera_worker.py`)
    - In `process_frame()`, the counting confirmation condition, change:
      `(tr["frames"] >= MIN_CONFIRMATION_FRAMES or tr["in_zone_duration"] >= 0.8)` → `(tr["frames"] >= MIN_CONFIRMATION_FRAMES and tr["in_zone_duration"] >= 0.8)`
    - _Bug_Condition: isBugCondition_B1 SUB_C — OR gate fires on `frames >= 10` at `in_zone_duration = 0.65 s`, before the classifier has stable data_
    - _Expected_Behavior: a track is marked counted ONLY when BOTH `frames >= 10` AND `in_zone_duration >= 0.8` are satisfied simultaneously_
    - _Preservation: tracks that have BOTH conditions satisfied continue to be counted exactly once, identical to before_
    - _Requirements: 2.3_

  - [ ] 3.6 Remove hardcoded gender branches for CAM-001 and CAM-002 (Change 6 — `detector/camera_worker.py`)
    - Delete the three camera-code-specific gender branches:
      - `if self.code == "CAM-002" and box_cx < 0.48: final_gender = "FEMALE"`
      - `elif self.code == "CAM-002" and box_cx >= 0.48: final_gender = "MALE"`
      - `elif self.code == "CAM-001": final_gender = "MALE"`
    - Replace with the general ML scoring logic applied directly (removing the wrapping `else`):
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
    - _Bug_Condition: isBugCondition_B2 — camera_code IN ("CAM-001", "CAM-002") causes unconditional gender override bypassing all ML model inference_
    - _Expected_Behavior: final_gender for all cameras derived exclusively from accumulated gender_scores using identical general logic_
    - _Preservation: cameras other than CAM-001/CAM-002 already use this general path — behavior unchanged for them_
    - _Requirements: 2.4, 2.5, 2.6_

  - [ ] 3.7 Add per-class confidence filter for pets (Change 7 — `detector/camera_worker.py`)
    - In `process_frame()`, the `valid_detections` filter loop, change the uniform confidence check to:
      ```python
      conf_val = d.get("confidence", 0.0)
      min_conf = 0.18 if d["class"] in ("DOG", "CAT") else 0.32
      if conf_val < min_conf:
          continue
      ```
    - _Bug_Condition: isBugCondition_B3 SUB_B — DOG/CAT detections with confidence in `[0.18, 0.32)` are silently discarded by the uniform 0.32 floor_
    - _Expected_Behavior: DOG/CAT detections with confidence ≥ 0.18 pass through to the tracker; PERSON threshold remains 0.32_
    - _Preservation: PERSON detections below 0.32 continue to be filtered out; pet-disabled cameras unaffected (class filter fires before confidence check)_
    - _Requirements: 2.8, 3.6_

  - [ ] 3.8 Extend high-resolution tiling to include DOG and CAT (Change 8 — `detector/camera_worker.py`)
    - In `process_frame()`, inside the `if self.detect_persons and w >= 900:` tiling block:
      - After the left-crop PERSON append, add:
        ```python
        elif r["class"] in ("DOG", "CAT") and self.detect_pets:
            raw_detections.append(r)
        ```
      - After the right-crop PERSON offset-append, add:
        ```python
        elif r["class"] in ("DOG", "CAT") and self.detect_pets:
            tb = r["box"]
            raw_detections.append({
                "class": r["class"],
                "confidence": r["confidence"],
                "box": [float(tb[0] + x_right), float(tb[1]), float(tb[2] + x_right), float(tb[3])],
            })
        ```
    - _Bug_Condition: isBugCondition_B3 SUB_C — tiling block checks `if r["class"] == "PERSON"` exclusively; DOG/CAT detections from crop tiles are unconditionally dropped_
    - _Expected_Behavior: DOG/CAT detections from left-crop pass through; DOG/CAT from right-crop receive the correct `x_right` pixel offset before appending_
    - _Preservation: PERSON tiling logic is untouched; `detect_pets` flag still gates all pet tiling appends_
    - _Requirements: 2.9, 3.5_

  - [ ] 3.9 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - All 8 Bug Conditions Fixed
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - The 8 tests from task 1 encode the expected behavior for all bug conditions
    - Run `pytest detector/tests/test_bug_conditions.py -v` on the FIXED code
    - **EXPECTED OUTCOME**: all 8 tests PASS (confirms all bugs are fixed)
    - If any test still fails, revisit the corresponding change in 3.1–3.8 before proceeding
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [ ] 3.10 Verify preservation property tests still pass
    - **Property 2: Preservation** - No Regressions in Baseline Behaviors
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run `pytest detector/tests/test_preservation.py -v` on the FIXED code
    - **EXPECTED OUTCOME**: all property tests PASS (confirms no regressions)
    - Confirm all 8 preservation properties (P1–P8) pass end-to-end after all changes
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [ ] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite: `pytest detector/tests/ -v`
  - Confirm `test_bug_conditions.py` — all 8 exploration tests PASS
  - Confirm `test_preservation.py` — all property-based preservation tests PASS
  - Verify no new failures in any pre-existing tests
  - Ask the user if any questions arise before closing the spec
