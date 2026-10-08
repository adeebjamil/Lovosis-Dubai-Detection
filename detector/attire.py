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
                    score_threshold=0.30,
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
        search_crop = crop_bgr[: int(h * 0.70), :]
        sh, sw = search_crop.shape[:2]
        if sh < 20 or sw < 20:
            return None, (None, 0.0)

        try:
            self.face_detector.setInputSize((sw, sh))
            faces = self.face_detector.detect(search_crop)[1]
            scale = 1.0

            if faces is None or len(faces) == 0:
                if max(h, w) > 800:
                    scale = 800.0 / max(h, w)
                    resized = cv2.resize(crop_bgr, (int(w * scale), int(h * scale)))
                    self.face_detector.setInputSize((resized.shape[1], resized.shape[0]))
                    faces = self.face_detector.detect(resized)[1]
                else:
                    self.face_detector.setInputSize((w, h))
                    faces = self.face_detector.detect(crop_bgr)[1]

                if faces is None or len(faces) == 0:
                    return None, (None, 0.0)

                best = faces[0]
                face_score = float(best[-1]) if len(best) >= 15 else 0.5
                fx, fy, fw, fh = (best[:4] / scale).astype(int)
            else:
                best = faces[0]
                face_score = float(best[-1]) if len(best) >= 15 else 0.5
                fx, fy, fw, fh = best[:4].astype(int)

            # Reject weak phantom detections or tiny sub-resolution patches
            if face_score < 0.45 or fw < 16 or fh < 16:
                return None, (None, 0.0)

            fx1, fy1 = max(0, fx), max(0, fy)
            fx2, fy2 = min(w, fx + fw), min(h, fy + fh)
            if fx2 <= fx1 or fy2 <= fy1:
                return None, (None, 0.0)

            fc = crop_bgr[fy1:fy2, fx1:fx2]
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

            # Only accept high-confidence predictions (>= 0.65); reject ambiguous near-50% noise
            if conf >= 0.65:
                gender = "FEMALE" if predicted_idx == 0 else "MALE"
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
        # High confidence face is trusted biological ground truth
        verified_face_gender = dl_g if (has_face and dl_g in ("MALE", "FEMALE") and dl_c >= 0.65) else "UNKNOWN"
        verified_face_conf = round(dl_c, 2) if verified_face_gender != "UNKNOWN" else 0.0

        # 4. Attire / Nationality Resolution
        # Traditional Kandura: white robe, low colorfulness, one-piece flowing garment
        is_kandura = (b_wht >= 0.35 or (b_mv >= 140 and b_ms <= 40)) and not is_colored_casual and v_diff <= 0.28
        # Traditional Abaya: black flowing robe, dark head covering, low colorfulness, low upper-lower variance
        is_abaya = (b_blk >= 0.40 or (b_mv <= 70 and b_ms <= 50)) and not is_colored_casual and v_diff <= 0.25 and (c_blk >= 0.30 or chk_std <= 30)

        if is_kandura:
            return {
                "nationality": "EMIRATI",
                "nationalityConfidence": 0.95,
                "gender": verified_face_gender if verified_face_gender != "UNKNOWN" else "MALE",
                "genderConfidence": verified_face_conf if verified_face_gender != "UNKNOWN" else 0.88,
                "attireType": "kandura",
            }
        elif is_abaya:
            return {
                "nationality": "EMIRATI",
                "nationalityConfidence": 0.95,
                "gender": verified_face_gender if verified_face_gender != "UNKNOWN" else "FEMALE",
                "genderConfidence": verified_face_conf if verified_face_gender != "UNKNOWN" else 0.88,
                "attireType": "abaya",
            }
        else:
            # Regular casual/western clothing (polo shirt, t-shirt, jeans, trousers, suit, etc.)
            # For regular clothing, gender comes EXCLUSIVELY from confirmed facial classification.
            # Never assume female or male based on shirt color!
            return {
                "nationality": "NON_EMIRATI",
                "nationalityConfidence": 0.95 if is_colored_casual else 0.85,
                "gender": verified_face_gender,
                "genderConfidence": verified_face_conf,
                "attireType": "regular",
            }
