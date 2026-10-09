# Bugfix Requirements Document

## Introduction

Three inter-related accuracy bugs in the Dubai Detection CCTV system cause person counts to inflate via duplicate counting, gender labels to be wrong due to camera-level hardcoding that bypasses the ML model, and pet detections (dogs/cats) to never surface in the UI due to thresholds that are too aggressive for CAT/DOG COCO class scores. All three bugs affect live analytics and persisted daily counts. The target accuracy after the fix is ≥ 99% for person counting and reliable pet detection across all connected cameras.

---

## Bug Analysis

### Current Behavior (Defect)

#### Bug 1 — Duplicate Person Counting

1.1 WHEN a tracked person stands up, shifts posture, or briefly leaves and re-enters the frame causing their normalized bounding box center to move by a distance between 0.16 and ~0.30 in normalized coordinates, THEN the system treats them as a new unique person and increments the person count again.

1.2 WHEN multi-scale left-crop and right-crop tiling produces two overlapping detections for the same person whose IoU is below 0.25 (the clean-dedup threshold) but who is clearly the same individual, THEN both detections survive deduplication and the person is counted twice in the same frame.

1.3 WHEN a person first enters the detection zone and their `in_zone_duration` reaches 0.8 seconds (even if they have been tracked for fewer than 10 frames, e.g. on the very first processed second), THEN the system immediately marks the track as counted before the classifier has accumulated enough frames to make a stable gender/nationality decision.

#### Bug 2 — Gender Classification Hardcoded / Inaccurate

1.4 WHEN any person is detected on a camera with the code `CAM-001`, THEN the system always assigns gender `MALE` regardless of what the face-detection and attire-classification ML models infer.

1.5 WHEN a person is detected on `CAM-002` and their normalized bounding-box center x is less than 0.48, THEN the system assigns gender `FEMALE` based solely on horizontal screen position, ignoring any ML inference.

1.6 WHEN a person is detected on `CAM-002` and their normalized bounding-box center x is greater than or equal to 0.48, THEN the system assigns gender `MALE` based solely on horizontal screen position, ignoring any ML inference.

#### Bug 3 — Pet Detection Not Working

1.7 WHEN a dog or cat is present in the camera frame, THEN the YOLOX detector frequently assigns a combined objectness × class score below the 0.20 confidence threshold for CAT/DOG COCO classes (IDs 15/16), causing the detection to be discarded before it reaches the tracker.

1.8 WHEN a valid pet detection with confidence between 0.20 and 0.32 is produced by the YOLOX model, THEN the camera worker final filter (`confidence < 0.32`) silently discards it, resulting in zero pet detections reaching the tracker.

1.9 WHEN a dog or cat is located in a distant or peripheral region of a high-resolution frame (≥ 900 px wide), THEN multi-scale tiling is only applied for the PERSON class and not for DOG or CAT, so the downscaled 640 × 640 YOLOX input makes the pet too small to detect reliably.

---

### Expected Behavior (Correct)

#### Bug 1 — Duplicate Person Counting

2.1 WHEN a tracked person's normalized bounding-box center shifts by up to 0.25 in normalized coordinates from the position at which they were previously counted, THEN the system SHALL recognize it as the same person and SHALL NOT increment the person count again.

2.2 WHEN multi-scale tiling produces two detections for the same physical person whose center distance (in normalized coordinates) is below 0.22 OR whose IoU is above 0.20, THEN the system SHALL deduplicate them and retain only the higher-confidence detection before passing results to the tracker.

2.3 WHEN a person enters the detection zone, THEN the system SHALL require BOTH a minimum of 10 confirmed tracking frames AND an `in_zone_duration` of at least 0.8 seconds before the track is marked as counted, so that the classifier has adequate frames to produce a stable prediction.

#### Bug 2 — Gender Classification

2.4 WHEN any person is detected on `CAM-001`, THEN the system SHALL derive the final gender label from the accumulated ML model scores (`gender_scores`) using the same general scoring logic applied to all other cameras, without any camera-code-specific override.

2.5 WHEN a person is detected on `CAM-002`, THEN the system SHALL derive the final gender label from the accumulated ML model scores (`gender_scores`), not from the horizontal position of the bounding box.

2.6 WHEN ML model scores have not yet accumulated sufficient confidence for a given track (both `male_score` and `female_score` below 0.70), THEN the system SHALL fall back to the cached model prediction or `UNKNOWN`, not to a hardcoded positional or camera-level default.

#### Bug 3 — Pet Detection

2.7 WHEN a dog or cat is present in the camera frame, THEN the system SHALL use a per-class confidence threshold of 0.12 for CAT and DOG COCO classes so that valid low-score pet detections are not discarded before NMS.

2.8 WHEN the camera worker filters detections by confidence, THEN the system SHALL apply a minimum confidence of 0.18 for pet detections (DOG/CAT) rather than the 0.32 threshold used for persons, so that valid pet detections are not silently dropped.

2.9 WHEN a high-resolution frame (≥ 900 px wide) is processed and pet detection is enabled, THEN the system SHALL apply the same left-crop and right-crop multi-scale tiling to DOG and CAT detections as it currently applies to PERSON detections, so that small or distant pets are not missed.

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a genuinely new person enters the detection zone for the first time from a position that has not been occupied by any recently counted person, THEN the system SHALL CONTINUE TO count them as a new unique person and increment the cumulative person counter.

3.2 WHEN a person's track has accumulated at least 10 frames and at least 0.8 seconds of in-zone dwell time, THEN the system SHALL CONTINUE TO mark them as counted exactly once.

3.3 WHEN a person not on `CAM-001` or `CAM-002` is detected and the ML model scores cross the 0.70 confidence threshold for a gender, THEN the system SHALL CONTINUE TO resolve final gender from those scores using the existing general logic.

3.4 WHEN a person wearing a Kandura or Abaya is detected on any camera other than `CAM-001` / `CAM-002`, THEN the system SHALL CONTINUE TO classify them as EMIRATI with the attire type (`kandura` / `abaya`) and correct gender using the existing attire classifier logic.

3.5 WHEN pet detection is disabled for a camera (via `detectPets: false`), THEN the system SHALL CONTINUE TO suppress all DOG and CAT detections for that camera regardless of the lowered thresholds.

3.6 WHEN a person detection with confidence below 0.32 is produced for a human-class box, THEN the system SHALL CONTINUE TO filter it out to avoid noise and ghost detections for persons.

3.7 WHEN a spatial deduplication check finds that a newly completed track's bounding box overlaps with a recently counted box (center distance < 0.25 or IoU > 0.20), THEN the system SHALL CONTINUE TO mark the new track as a duplicate and SHALL NOT double-count it.

3.8 WHEN the tracker's `recent_counted_boxes` memory is pruned after 60 seconds, THEN the system SHALL CONTINUE TO accept a new count for a person who genuinely re-enters the zone after that time window.

3.9 WHEN gender or nationality is refined on subsequent frames after an initial count (the existing post-count correction logic), THEN the system SHALL CONTINUE TO update the cumulative male/female/emirati/nonEmirati counters to reflect the corrected classification without adding a new person to the total count.
