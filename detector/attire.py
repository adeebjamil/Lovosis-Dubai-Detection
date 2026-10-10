from __future__ import annotations

import cv2
import numpy as np
from pathlib import Path
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT / "models"


class AttireClassifier:
    """Classifies person crops into:
      - Nationality: EMIRATI (Traditional UAE attire: Kandura / Abaya) | NON_EMIRATI (regular casual / western wear)
      - Gender: MALE | FEMALE (using Deep Learning Face & Gender Neural Network with Hijab/Shayla calibration)
      - AttireType: kandura | abaya | regular | unknown
    Powered by a trained 19-dimensional multi-modal neural network calibrated on authentic UAE datasets.
    """

    def __init__(self, min_crop_height: int = 40):
        self.min_crop_height = min_crop_height
        self.has_face_net = False
        self.has_mlp_model = False

        # 1. Load Deep Learning Face & Gender models
        yunet_path = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
        gender_path = MODELS_DIR / "genderage.onnx"

        if yunet_path.exists() and gender_path.exists():
            try:
                self.face_detector = cv2.FaceDetectorYN.create(
                    str(yunet_path),
                    "",
                    (320, 320),
                    score_threshold=0.25,
                    nms_threshold=0.3,
                )
                self.gender_sess = ort.InferenceSession(
                    str(gender_path),
                    providers=["CPUExecutionProvider"]
                )
                self.has_face_net = True
                print("[attire] successfully initialized Deep Learning Face & Gender neural network")
            except Exception as e:
                print(f"[attire] warning: could not initialize face network: {e}")

        # 2. Load trained MLP Attire Classifier Weights
        weights_path = MODELS_DIR / "attire_classifier_weights.npz"
        if weights_path.exists():
            try:
                data = np.load(str(weights_path))
                self.W1 = data["W1"]
                self.b1 = data["b1"]
                self.W2 = data["W2"]
                self.b2 = data["b2"]
                self.has_mlp_model = True
                print(f"[attire] loaded trained attire neural network weights from {weights_path.name}")
            except Exception as e:
                print(f"[attire] warning: could not load attire neural weights: {e}")

    def detect_face_and_gender(self, crop_bgr: np.ndarray) -> tuple[tuple[int, int, int, int] | None, tuple[str | None, float]]:
        """Runs face detection and classifies gender via deep learning.
        Returns:
            ((fx, fy, fw, fh) or None, (gender or None, confidence))
        """
        if not self.has_face_net:
            return None, (None, 0.0)

        h, w = crop_bgr.shape[:2]
        if h < 25 or w < 20:
            return None, (None, 0.0)

        try:
            # 1. First attempt: Natural upright orientation (0 deg)
            self.face_detector.setInputSize((w, h))
            faces = self.face_detector.detect(crop_bgr)[1]
            best = None
            best_score = 0.0
            best_crop = crop_bgr

            if faces is not None and len(faces) > 0:
                for f in faces:
                    sc = float(f[-1])
                    if sc > best_score:
                        best_score = sc
                        best = f

            # 2. Second attempt (for ceiling/overhead view where seated person faces opposite direction):
            rot180 = cv2.rotate(crop_bgr, cv2.ROTATE_180)
            rh, rw = rot180.shape[:2]
            self.face_detector.setInputSize((rw, rh))
            faces180 = self.face_detector.detect(rot180)[1]
            if faces180 is not None and len(faces180) > 0:
                for f in faces180:
                    sc = float(f[-1])
                    # If 180-deg face is a genuine confident face (>= 0.45) and exceeds 0-deg score
                    if sc >= 0.45 and (sc > best_score or best_score < 0.45):
                        best_score = sc
                        best = f
                        best_crop = rot180

            if best is None or best_score < 0.28:
                return None, (None, 0.0)

            fx, fy, fw, fh = best[:4].astype(int)
            bch, bcw = best_crop.shape[:2]
            fx1, fy1 = max(0, fx), max(0, fy)
            fx2, fy2 = min(bcw, fx + fw), min(bch, fy + fh)
            if fx2 <= fx1 or fy2 <= fy1:
                return None, (None, 0.0)

            # Analyze facial landmarks for profile yaw angle
            landmarks = best[4:14].reshape((5, 2))
            r_eye, l_eye = landmarks[0], landmarks[1]
            eye_dist = float(np.linalg.norm(r_eye - l_eye))
            is_profile = (eye_dist / max(1.0, float(fw))) < 0.22

            # Analyze jawline / chin region for masculine stubble / beard texture
            jaw_y1 = min(bch - 1, fy + int(fh * 0.58))
            jaw_y2 = min(bch, fy + int(fh * 1.05))
            jaw_x1 = max(0, fx)
            jaw_x2 = min(bcw, fx + fw)
            jaw = best_crop[jaw_y1:jaw_y2, jaw_x1:jaw_x2]
            has_beard = False
            if jaw.size >= 12:
                jhsv = cv2.cvtColor(jaw, cv2.COLOR_BGR2HSV)
                jgray = cv2.cvtColor(jaw, cv2.COLOR_BGR2GRAY)
                dark_ratio = np.count_nonzero(jhsv[:, :, 2] <= 90) / float(jhsv[:, :, 2].size)
                j_std = float(np.std(jgray))
                if dark_ratio >= 0.18 or (j_std >= 30.0 and dark_ratio >= 0.10):
                    has_beard = True

            # Analyze crown / head hair above face
            crown_y1 = max(0, fy - int(fh * 0.45))
            crown_y2 = max(0, fy)
            crown = best_crop[crown_y1:crown_y2, jaw_x1:jaw_x2]
            dark_hair_ratio = 0.0
            if crown.size >= 10:
                cr_hsv = cv2.cvtColor(crown, cv2.COLOR_BGR2HSV)
                dark_hair_ratio = np.count_nonzero(cr_hsv[:, :, 2] <= 65) / float(cr_hsv[:, :, 2].size)

            fc = best_crop[fy1:fy2, fx1:fx2]
            if fc is None or fc.size == 0 or fc.shape[0] < 12 or fc.shape[1] < 12:
                return None, (None, 0.0)

            blob = cv2.resize(fc, (96, 96)).transpose((2, 0, 1)).astype(np.float32)[None, ...]
            out = self.gender_sess.run(None, {"data": blob})[0]
            scores = out[0, :2]
            exp_s = np.exp(scores - np.max(scores))
            probs = exp_s / np.sum(exp_s)

            # 0: Female, 1: Male
            predicted_idx = int(np.argmax(probs))
            conf = float(probs[predicted_idx])

            # Resolve gender using multimodal biometric evidence
            if has_beard:
                # Biological certainty: trimmed facial hair/stubble is male
                gender = "MALE"
                conf = max(0.92, float(probs[1]))
            elif predicted_idx == 0:
                if is_profile:
                    # Side-angle profile faces can fool ArcFace/buffalo_l.
                    # Accept FEMALE only if very high confidence, no beard, and no short male fade
                    if conf >= 0.88 and not has_beard and dark_hair_ratio < 0.55:
                        gender = "FEMALE"
                    else:
                        gender = "MALE"
                        conf = 0.85
                else:
                    if conf >= 0.65 and not has_beard:
                        gender = "FEMALE"
                    else:
                        gender = "MALE"
                        conf = 0.80
            elif predicted_idx == 1:
                gender = "MALE"
                conf = max(0.85, float(probs[1]))
            else:
                gender = None
                conf = 0.0

            return (fx, fy, fw, fh), (gender, round(conf, 2))
        except Exception:
            return None, (None, 0.0)

    def detect_face_gender(self, crop_bgr: np.ndarray) -> tuple[str | None, float]:
        """Backward-compatible helper returning (gender, confidence)."""
        _, gender_info = self.detect_face_and_gender(crop_bgr)
        return gender_info

    def extract_features(self, crop_bgr: np.ndarray) -> tuple[np.ndarray, str | None, float]:
        """Extracts the standardized 19-dimensional multi-modal feature vector from a person crop."""
        h, w = crop_bgr.shape[:2]
        face_box, (dl_g, dl_c) = self.detect_face_and_gender(crop_bgr)
        has_face = 1.0 if face_box is not None else 0.0
        dl_m = 1.0 if dl_g == "MALE" else 0.0
        dl_f = 1.0 if dl_g == "FEMALE" else 0.0
        conf = float(dl_c)

        if face_box is not None:
            fx, fy, fw, fh = face_box
            crown = crop_bgr[max(0, fy - int(fh * 0.45)) : max(0, fy), max(0, fx - int(fw * 0.15)) : min(w, fx + int(fw * 1.15))]
            if crown is not None and crown.size > 10 and crown.shape[0] > 0 and crown.shape[1] > 0:
                chsv = cv2.cvtColor(crown, cv2.COLOR_BGR2HSV)
                c_v = float(np.mean(chsv[:, :, 2]))
                c_s = float(np.mean(chsv[:, :, 1]))
                c_blk = float(np.count_nonzero(chsv[:, :, 2] <= 70) / chsv[:, :, 2].size)
                c_wht = float(np.count_nonzero((chsv[:, :, 2] >= 140) & (chsv[:, :, 1] <= 60)) / chsv[:, :, 2].size)
            else:
                c_v, c_s, c_blk, c_wht = 128.0, 0.0, 0.0, 0.0

            left = crop_bgr[fy : min(h, fy + fh), max(0, fx - int(fw * 0.45)) : fx]
            right = crop_bgr[fy : min(h, fy + fh), min(w, fx + fw) : min(w, fx + fw + int(fw * 0.45))]
            l_std = float(cv2.meanStdDev(cv2.cvtColor(left, cv2.COLOR_BGR2GRAY))[1][0][0]) if (left is not None and left.size > 10 and left.shape[0] > 0 and left.shape[1] > 0) else 99.0
            r_std = float(cv2.meanStdDev(cv2.cvtColor(right, cv2.COLOR_BGR2GRAY))[1][0][0]) if (right is not None and right.size > 10 and right.shape[0] > 0 and right.shape[1] > 0) else 99.0
            chk_std = (l_std + r_std) / 2.0

            jaw = crop_bgr[fy + int(fh * 0.65) : fy + fh, fx + int(fw * 0.2) : fx + int(fw * 0.8)]
            jaw_t = float(cv2.meanStdDev(cv2.cvtColor(jaw, cv2.COLOR_BGR2GRAY))[1][0][0]) if (jaw is not None and jaw.size > 10 and jaw.shape[0] > 0 and jaw.shape[1] > 0) else 0.0

            neck = crop_bgr[min(h, fy + fh) : min(h, fy + int(fh * 1.35)), max(0, fx + int(fw * 0.2)) : min(w, fx + int(fw * 0.8))]
            neck_skin = 0.0
            if neck is not None and neck.size > 10 and neck.shape[0] > 0 and neck.shape[1] > 0:
                nhsv = cv2.cvtColor(neck, cv2.COLOR_BGR2HSV)
                skin = (((nhsv[:, :, 0] <= 25) | (nhsv[:, :, 0] >= 165)) & (nhsv[:, :, 1] >= 45) & (nhsv[:, :, 2] >= 75))
                neck_skin = float(np.count_nonzero(skin) / (nhsv.shape[0] * nhsv.shape[1]))

            body_y1 = min(h, fy + int(fh * 1.1))
            body_y2 = min(h, fy + int(fh * 4.5))
            if body_y2 <= body_y1:
                body_y2 = h
            center_body = crop_bgr[body_y1:body_y2, max(0, int(w * 0.25)) : min(w, int(w * 0.75))]
            if center_body is None or center_body.size == 0 or center_body.shape[0] == 0 or center_body.shape[1] == 0:
                center_body = crop_bgr[body_y1:body_y2, :]
        else:
            c_v, c_s, c_blk, c_wht = 128.0, 0.0, 0.0, 0.0
            chk_std, jaw_t, neck_skin = 99.0, 0.0, 0.0
            center_body = crop_bgr[int(h * 0.35) : int(h * 0.85), int(w * 0.25) : int(w * 0.75)]
            if center_body is None or center_body.size == 0 or center_body.shape[0] == 0 or center_body.shape[1] == 0:
                center_body = crop_bgr

        if center_body is None or center_body.size == 0 or center_body.shape[0] == 0 or center_body.shape[1] == 0:
            return np.zeros(19, dtype=np.float32), dl_g, conf

        bhsv = cv2.cvtColor(center_body, cv2.COLOR_BGR2HSV)
        bv, bs = bhsv[:, :, 2], bhsv[:, :, 1]
        tot = float(bv.size)
        b_blk = float(np.count_nonzero(bv <= 70) / tot)
        b_wht = float(np.count_nonzero((bv >= 140) & (bs <= 60)) / tot)
        b_pst = float(np.count_nonzero((bv >= 80) & (bs <= 85)) / tot)
        b_mv = float(np.mean(bv))
        b_ms = float(np.mean(bs))

        mid = center_body.shape[0] // 2
        u_v = float(np.mean(bv[:mid, :])) if mid > 0 else b_mv
        l_v = float(np.mean(bv[mid:, :])) if mid > 0 else b_mv
        v_diff = abs(u_v - l_v)

        feat = np.array([
            has_face, dl_m, dl_f, conf,
            c_v / 255.0, c_s / 255.0, c_blk, c_wht,
            chk_std / 100.0, jaw_t / 100.0, neck_skin,
            b_blk, b_wht, b_pst, b_mv / 255.0, b_ms / 255.0, v_diff / 255.0,
            u_v / 255.0, l_v / 255.0
        ], dtype=np.float32)

        return feat, dl_g, conf

    def classify_crop(self, crop_bgr: np.ndarray) -> dict:
        """Analyzes a person crop (BGR image) with Deep Learning Face/Gender analysis
        and traditional UAE attire classification.
        Returns:
            {
                "nationality": "EMIRATI" | "NON_EMIRATI" | "UNKNOWN",
                "nationalityConfidence": float,
                "gender": "MALE" | "FEMALE" | "UNKNOWN",
                "genderConfidence": float,
                "attireType": "kandura" | "abaya" | "regular" | "unknown"
            }
        """
        h, w = crop_bgr.shape[:2]
        if h < self.min_crop_height or w < 20:
            return {
                "nationality": "UNKNOWN",
                "nationalityConfidence": 0.0,
                "gender": "UNKNOWN",
                "genderConfidence": 0.0,
                "attireType": "unknown",
            }

        # 1. Detect Face & Gender with Deep Learning Model (YuNet + InsightFace)
        face_box, (dl_g, dl_c) = self.detect_face_and_gender(crop_bgr)
        has_face = face_box is not None

        # 2. Extract Regional Color and Attire Features
        if face_box is not None:
            fx, fy, fw, fh = face_box
            crown = crop_bgr[max(0, fy - int(fh * 0.45)) : max(0, fy), max(0, fx - int(fw * 0.15)) : min(w, fx + int(fw * 1.15))]
            if crown is not None and crown.size > 10 and crown.shape[0] > 0 and crown.shape[1] > 0:
                chsv = cv2.cvtColor(crown, cv2.COLOR_BGR2HSV)
                c_blk = float(np.count_nonzero(chsv[:, :, 2] <= 70) / chsv[:, :, 2].size)
                c_wht = float(np.count_nonzero((chsv[:, :, 2] >= 140) & (chsv[:, :, 1] <= 60)) / chsv[:, :, 2].size)
            else:
                c_blk, c_wht = 0.0, 0.0

            left = crop_bgr[fy : min(h, fy + fh), max(0, fx - int(fw * 0.45)) : fx]
            right = crop_bgr[fy : min(h, fy + fh), min(w, fx + fw) : min(w, fx + fw + int(fw * 0.45))]
            l_std = float(cv2.meanStdDev(cv2.cvtColor(left, cv2.COLOR_BGR2GRAY))[1][0][0]) if (left is not None and left.size > 10 and left.shape[0] > 0 and left.shape[1] > 0) else 99.0
            r_std = float(cv2.meanStdDev(cv2.cvtColor(right, cv2.COLOR_BGR2GRAY))[1][0][0]) if (right is not None and right.size > 10 and right.shape[0] > 0 and right.shape[1] > 0) else 99.0
            chk_std = (l_std + r_std) / 2.0

            body_y1 = min(h, fy + int(fh * 1.05))
            body_y2 = min(h, fy + int(fh * 4.5))
            if body_y2 <= body_y1:
                body_y2 = h
            center_body = crop_bgr[body_y1:body_y2, max(0, int(w * 0.15)) : min(w, int(w * 0.85))]
            if center_body is None or center_body.size == 0 or center_body.shape[0] == 0 or center_body.shape[1] == 0:
                center_body = crop_bgr[body_y1:body_y2, :]
        else:
            c_blk, c_wht, chk_std = 0.0, 0.0, 99.0
            center_body = crop_bgr[int(h * 0.35) : int(h * 0.85), int(w * 0.15) : int(w * 0.85)]
            if center_body is None or center_body.size == 0 or center_body.shape[0] == 0 or center_body.shape[1] == 0:
                center_body = crop_bgr

        if center_body is None or center_body.size == 0 or center_body.shape[0] == 0 or center_body.shape[1] == 0:
            return {
                "nationality": "NON_EMIRATI",
                "nationalityConfidence": 0.80,
                "gender": dl_g if dl_g in ("MALE", "FEMALE") else "UNKNOWN",
                "genderConfidence": dl_c if dl_g else 0.0,
                "attireType": "regular",
            }

        bhsv = cv2.cvtColor(center_body, cv2.COLOR_BGR2HSV)
        bv, bs = bhsv[:, :, 2], bhsv[:, :, 1]
        tot = float(bv.size)
        b_blk = float(np.count_nonzero(bv <= 75) / tot)
        b_wht = float(np.count_nonzero((bv >= 135) & (bs <= 50)) / tot)
        b_col = float(np.count_nonzero((bs >= 55) & (bv >= 50)) / tot)
        b_mv = float(np.mean(bv))
        b_ms = float(np.mean(bs))

        mid = center_body.shape[0] // 2
        u_v = float(np.mean(bv[:mid, :])) if mid > 0 else b_mv
        l_v = float(np.mean(bv[mid:, :])) if mid > 0 else b_mv
        v_diff = abs(u_v - l_v) / 255.0

        # Check for colorful casual clothing (polo shirts, tees, colored blouses)
        is_colored_casual = (b_col >= 0.22) or (b_ms >= 52)

        # 3. Ground Truth Face Gender
        verified_face_gender = dl_g if (has_face and dl_g in ("MALE", "FEMALE") and dl_c >= 0.58) else "UNKNOWN"
        verified_face_conf = round(dl_c, 2) if verified_face_gender != "UNKNOWN" else 0.0

        # 4. Rule-based strong-signal overrides for unambiguous traditional attire
        # Kandura: full white flowing robe (high b_wht) with Ghutra (c_wht) or standing robe silhouette
        has_ghutra = (c_wht >= 0.30)
        is_standing_robe = (h >= 160 and b_wht >= 0.55 and v_diff <= 0.20)
        is_kandura = (has_ghutra or is_standing_robe) and (b_wht >= 0.40) and not is_colored_casual and (verified_face_gender != "FEMALE")

        # Abaya: overwhelmingly black flowing robe with dark Shayla/Hijab
        is_abaya = (b_blk >= 0.40 or (b_mv <= 70 and b_ms <= 50)) and not is_colored_casual and (c_blk >= 0.30 or chk_std <= 30) and (verified_face_gender != "MALE")

        if is_kandura:
            return {
                "nationality": "EMIRATI",
                "nationalityConfidence": 0.95,
                "gender": "MALE",
                "genderConfidence": max(0.90, verified_face_conf),
                "attireType": "kandura",
            }
        elif is_abaya:
            return {
                "nationality": "EMIRATI",
                "nationalityConfidence": 0.95,
                "gender": "FEMALE",
                "genderConfidence": max(0.90, verified_face_conf),
                "attireType": "abaya",
            }

        # 5. MLP model inference — primary classifier for non-obvious attire
        # BUG FIX: MLP was trained and loaded but never used in classify_crop().
        # Now we run it as the primary nationality/gender decision for regular attire.
        if self.has_mlp_model:
            # Rebuild the full 19-dim feature vector (same as training)
            feat, _, _ = self.extract_features(crop_bgr)
            h1 = np.maximum(0.0, feat @ self.W1 + self.b1)
            logits = h1 @ self.W2 + self.b2
            exp_l = np.exp(logits - np.max(logits))
            probs = exp_l / np.sum(exp_l)
            # Classes: 0=emirati_female, 1=emirati_male, 2=non_emirati
            pred_idx = int(np.argmax(probs))
            pred_conf = float(probs[pred_idx])

            if pred_idx == 0:  # emirati_female
                # Only accept EMIRATI Abaya if robe is genuinely black, low saturation, and not colored casual wear
                if is_abaya or (b_blk >= 0.40 and not is_colored_casual and verified_face_gender != "MALE" and (c_blk >= 0.20 or chk_std <= 35)):
                    nat = "EMIRATI"
                    nat_conf = round(pred_conf, 2)
                    g = verified_face_gender if verified_face_gender == "FEMALE" else "FEMALE"
                    gc = max(0.88, verified_face_conf)
                    attire = "abaya"
                else:
                    nat = "NON_EMIRATI"
                    nat_conf = 0.85
                    g = verified_face_gender
                    gc = verified_face_conf
                    attire = "regular"
            elif pred_idx == 1:  # emirati_male
                # Only accept EMIRATI Kandura if robe is genuinely white, low saturation, and not colored casual wear
                if is_kandura or (b_wht >= 0.35 and not is_colored_casual and verified_face_gender != "FEMALE"):
                    nat = "EMIRATI"
                    nat_conf = round(pred_conf, 2)
                    g = verified_face_gender if verified_face_gender == "MALE" else "MALE"
                    gc = max(0.88, verified_face_conf)
                    attire = "kandura"
                else:
                    nat = "NON_EMIRATI"
                    nat_conf = 0.85
                    g = verified_face_gender
                    gc = verified_face_conf
                    attire = "regular"
            else:  # non_emirati
                nat = "NON_EMIRATI"
                nat_conf = round(pred_conf, 2)
                g = verified_face_gender if verified_face_gender != "UNKNOWN" else "MALE"
                gc = verified_face_conf if verified_face_gender != "UNKNOWN" else 0.82
                attire = "regular"

            # Only use MLP output if it's confident enough (> 0.55)
            # Below that, fall back to rule-based default
            if pred_conf >= 0.55:
                return {
                    "nationality": nat,
                    "nationalityConfidence": nat_conf,
                    "gender": g,
                    "genderConfidence": gc,
                    "attireType": attire,
                }

        # 6. Fallback: no MLP or low confidence — use face gender + NON_EMIRATI default
        g = verified_face_gender if verified_face_gender != "UNKNOWN" else "MALE"
        gc = verified_face_conf if verified_face_gender != "UNKNOWN" else 0.82
        return {
            "nationality": "NON_EMIRATI",
            "nationalityConfidence": 0.95 if is_colored_casual else 0.80,
            "gender": g,
            "genderConfidence": gc,
            "attireType": "regular",
        }
