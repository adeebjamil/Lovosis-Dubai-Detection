import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
import onnxruntime as ort

class CalibratedAttireClassifier:
    def __init__(self):
        yunet_path = ROOT / "models" / "face_detection_yunet_2023mar.onnx"
        gender_path = ROOT / "models" / "genderage.onnx"
        self.face_detector = cv2.FaceDetectorYN.create(str(yunet_path), "", (320, 320), score_threshold=0.30, nms_threshold=0.3)
        self.gender_sess = ort.InferenceSession(str(gender_path), providers=["CPUExecutionProvider"])

    def detect_face(self, img_bgr):
        h, w = img_bgr.shape[:2]
        search_h = int(h * 0.70)
        search_crop = img_bgr[:search_h, :]
        sh, sw = search_crop.shape[:2]
        if sh < 20 or sw < 20:
            return None, (None, 0.0)

        self.face_detector.setInputSize((sw, sh))
        faces = self.face_detector.detect(search_crop)[1]
        if faces is None or len(faces) == 0:
            scale = 1.0
            if max(h, w) > 800:
                scale = 800.0 / max(h, w)
                resized = cv2.resize(img_bgr, (int(w*scale), int(h*scale)))
                self.face_detector.setInputSize((resized.shape[1], resized.shape[0]))
                faces = self.face_detector.detect(resized)[1]
            else:
                self.face_detector.setInputSize((w, h))
                faces = self.face_detector.detect(img_bgr)[1]

            if faces is None or len(faces) == 0:
                return None, (None, 0.0)
            
            best = faces[0]
            fx, fy, fw, fh = (best[:4] / scale).astype(int)
        else:
            best = faces[0]
            fx, fy, fw, fh = best[:4].astype(int)

        fx1, fy1 = max(0, fx), max(0, fy)
        fx2, fy2 = min(w, fx + fw), min(h, fy + fh)
        if fx2 <= fx1 or fy2 <= fy1:
            return None, (None, 0.0)

        # Deep learning gender from InsightFace
        fc = img_bgr[fy1:fy2, fx1:fx2]
        blob = cv2.resize(fc, (96, 96)).transpose((2, 0, 1)).astype(np.float32)[None, ...]
        out = self.gender_sess.run(None, {"data": blob})[0]
        scores = out[0, :2]
        exp_s = np.exp(scores - np.max(scores))
        probs = exp_s / np.sum(exp_s)
        g_idx = int(np.argmax(probs))
        dl_gender = "FEMALE" if g_idx == 0 else "MALE"
        dl_conf = float(probs[g_idx])

        return (fx, fy, fw, fh), (dl_gender, round(dl_conf, 2))

    def classify_crop(self, crop_bgr: np.ndarray) -> dict:
        h, w = crop_bgr.shape[:2]
        if h < 40 or w < 20:
            return {
                "nationality": "UNKNOWN", "nationalityConfidence": 0.0,
                "gender": "UNKNOWN", "genderConfidence": 0.0,
                "attireType": "unknown"
            }

        face_box, (dl_g, dl_c) = self.detect_face(crop_bgr)
        has_face = face_box is not None

        if has_face:
            fx, fy, fw, fh = face_box

            # 1. Agal Check (Crown band above forehead)
            crown_y1 = max(0, fy - int(fh * 0.50))
            crown_y2 = max(0, fy)
            crown_x1 = max(0, fx - int(fw * 0.15))
            crown_x2 = min(w, fx + int(fw * 1.15))
            crown = crop_bgr[crown_y1:crown_y2, crown_x1:crown_x2]
            
            has_male_agal = False
            if crown.size > 0:
                crown_gray = cv2.cvtColor(crown, cv2.COLOR_BGR2GRAY)
                c_dark = np.count_nonzero(crown_gray < 55) / float(crown_gray.size)
                c_light = np.count_nonzero(crown_gray > 135) / float(crown_gray.size)
                if c_dark >= 0.15 and c_light >= 0.40 and dl_g == "MALE":
                    has_male_agal = True

            # 2. Shayla / Hijab cheeks framing (smooth fabric next to cheeks vs open hair)
            left_cheek = crop_bgr[fy:min(h, fy+fh), max(0, fx - int(fw*0.45)):fx]
            right_cheek = crop_bgr[fy:min(h, fy+fh), min(w, fx+fw):min(w, fx+fw+int(fw*0.45))]
            l_std = float(np.std(cv2.cvtColor(left_cheek, cv2.COLOR_BGR2GRAY))) if left_cheek.size > 10 else 99.0
            r_std = float(np.std(cv2.cvtColor(right_cheek, cv2.COLOR_BGR2GRAY))) if right_cheek.size > 10 else 99.0
            cheek_std = (l_std + r_std) / 2.0

            # 3. Neck & Throat skin exposure check:
            chin_y1 = min(h, fy + fh)
            chin_y2 = min(h, fy + int(fh * 1.5))
            chin_x1 = max(0, fx + int(fw * 0.15))
            chin_x2 = min(w, fx + int(fw * 0.85))
            neck = crop_bgr[chin_y1:chin_y2, chin_x1:chin_x2]
            
            neck_skin_ratio = 0.0
            if neck.size > 10:
                neck_hsv = cv2.cvtColor(neck, cv2.COLOR_BGR2HSV)
                skin = (((neck_hsv[:,:,0] <= 25) | (neck_hsv[:,:,0] >= 165)) & 
                        (neck_hsv[:,:,1] >= 35) & (neck_hsv[:,:,1] <= 175) & 
                        (neck_hsv[:,:,2] >= 75) & (neck_hsv[:,:,2] <= 245))
                neck_skin_ratio = float(np.count_nonzero(skin) / (neck_hsv.shape[0] * neck_hsv.shape[1]))

            # 4. Body garment region anchored below face:
            body_y1 = min(h, fy + int(fh * 1.1))
            body_y2 = min(h, fy + int(fh * 4.5))
            if body_y2 <= body_y1:
                body_y2 = h
            body = crop_bgr[body_y1:body_y2, max(0, int(w*0.1)):min(w, int(w*0.9))]
            if body.size == 0:
                body = crop_bgr[int(h*0.3):, :]

            # Shayla / Hijab indicator
            has_hijab_wrap = (neck_skin_ratio < 0.35 or cheek_std < 72) and not has_male_agal

        else:
            has_male_agal = False
            cheek_std = 99.0
            neck_skin_ratio = 0.0
            body = crop_bgr[int(h*0.25):int(h*0.9), int(w*0.15):int(w*0.85)]
            if body.size == 0:
                body = crop_bgr
            
            # For headless or back-view crops: check if continuous flowing abaya robe
            body_hsv_temp = cv2.cvtColor(body, cv2.COLOR_BGR2HSV)
            temp_v = body_hsv_temp[:, :, 2]
            temp_s = body_hsv_temp[:, :, 1]
            tot_p = float(body.shape[0] * body.shape[1] + 1e-5)
            has_hijab_wrap = (np.count_nonzero(temp_v <= 70) / tot_p >= 0.50) or \
                             (np.count_nonzero((temp_v >= 80) & (temp_s <= 85)) / tot_p >= 0.65)

        # Garment color & saturation analysis
        body_hsv = cv2.cvtColor(body, cv2.COLOR_BGR2HSV)
        bv = body_hsv[:, :, 2]
        bs = body_hsv[:, :, 1]
        tot_body_px = float(body.shape[0] * body.shape[1] + 1e-5)

        black_ratio = float(np.count_nonzero(bv <= 70) / tot_body_px)
        white_ratio = float(np.count_nonzero((bv >= 140) & (bs <= 60)) / tot_body_px)
        pastel_ratio = float(np.count_nonzero((bv >= 80) & (bs <= 85)) / tot_body_px)
        mean_v = float(np.mean(bv))
        mean_s = float(np.mean(bs))

        mid_y = body.shape[0] // 2
        upper_v = float(np.mean(bv[:mid_y, :])) if mid_y > 0 else mean_v
        lower_v = float(np.mean(bv[mid_y:, :])) if mid_y > 0 else mean_v
        v_diff = abs(upper_v - lower_v)

        # ---------------------------------------------------------------------
        # DECISION ENGINE
        # ---------------------------------------------------------------------

        # 1. Classic Black Abaya (Emirati Female):
        # Continuous black robe or high black ratio. Emirati men NEVER wear black robes.
        if (black_ratio >= 0.22 or (mean_v <= 85 and mean_s <= 110)) and not has_male_agal:
            conf = min(0.99, float(0.85 + black_ratio * 0.14))
            return {
                "nationality": "EMIRATI",
                "nationalityConfidence": round(conf, 2),
                "gender": "FEMALE",
                "genderConfidence": 0.98,
                "attireType": "abaya"
            }

        # 2. Modern Pastel / Earth-Tone / White Abaya with Shayla / Hijab (Emirati Female):
        # Women wearing pastel, cream, beige, gold, olive, or white abayas with Shayla headscarf.
        # IMPORTANT: When hair is covered under a tight Shayla, generic face models have a strong false-MALE bias.
        # When a Shayla/Hijab is present without a male Agal, gender is FEMALE.
        if has_hijab_wrap and not has_male_agal:
            # Check robe metrics: pastel, neutral, or modest robe
            if pastel_ratio >= 0.30 or white_ratio >= 0.30 or (mean_v >= 90 and mean_s <= 145 and v_diff < 75):
                conf = min(0.98, float(0.80 + max(pastel_ratio, white_ratio) * 0.18))
                return {
                    "nationality": "EMIRATI",
                    "nationalityConfidence": round(conf, 2),
                    "gender": "FEMALE",
                    "genderConfidence": 0.97,
                    "attireType": "abaya"
                }

        # 3. White Kandura (Emirati Male):
        # White/off-white flowing robe on an Emirati male with Ghutra/Agal
        is_white_robe = (white_ratio >= 0.40 and mean_s <= 50)
        if is_white_robe and (has_male_agal or (dl_g == "MALE" and not has_hijab_wrap)):
            conf = min(0.99, float(0.78 + white_ratio * 0.20))
            return {
                "nationality": "EMIRATI",
                "nationalityConfidence": round(conf, 2),
                "gender": "MALE",
                "genderConfidence": round(max(0.92, dl_c if dl_g == "MALE" else 0.90), 2),
                "attireType": "kandura"
            }

        # 4. Non-Emirati Regular / Casual Wear:
        gender_pred = dl_g or "FEMALE"
        gender_conf = dl_c if dl_g else 0.75
        return {
            "nationality": "NON_EMIRATI",
            "nationalityConfidence": 0.88,
            "gender": gender_pred,
            "genderConfidence": gender_conf,
            "attireType": "regular"
        }

clf = CalibratedAttireClassifier()

print("\n--- RESULTS: FEMALE EMIRATIS (24 images) ---")
fem_dir = ROOT / "uploads/training/emirati_female/Female_emiratis"
fem_ok = 0
for f in sorted(list(fem_dir.glob("*.*"))):
    img = cv2.imread(str(f))
    r = clf.classify_crop(img)
    ok = (r["nationality"] == "EMIRATI" and r["gender"] == "FEMALE" and r["attireType"] == "abaya")
    if ok: fem_ok += 1
    mark = "✔" if ok else "❌"
    print(f"  {mark} {f.name[:25]:<25} -> {r['nationality']:<11} | {r['gender']:<6} | {r['attireType']:<7} ({r['nationalityConfidence']:.2f})")
print(f"Female Accuracy: {fem_ok}/24 ({fem_ok/24*100:.1f}%)")

print("\n--- RESULTS: MALE EMIRATI (person crops) ---")
img_m1 = cv2.imread("uploads/training/emirati_male/kandura_ghutra_1.jpg")
m1_crop = img_m1[int(407 - 779*0.4):int(407 + 779*3.5), max(0, int(787 - 560*0.5)):int(787 + 560*1.5)]
r_m1 = clf.classify_crop(m1_crop)
print(f"  kandura_ghutra_1 crop     -> {r_m1['nationality']:<11} | {r_m1['gender']:<6} | {r_m1['attireType']:<7} ({r_m1['nationalityConfidence']:.2f})")
