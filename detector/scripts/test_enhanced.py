import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
import onnxruntime as ort

class EnhancedAttireClassifier:
    def __init__(self):
        yunet_path = ROOT / "models" / "face_detection_yunet_2023mar.onnx"
        gender_path = ROOT / "models" / "genderage.onnx"
        self.face_detector = cv2.FaceDetectorYN.create(str(yunet_path), "", (320, 320), score_threshold=0.30, nms_threshold=0.3)
        self.gender_sess = ort.InferenceSession(str(gender_path), providers=["CPUExecutionProvider"])

    def detect_face(self, img_bgr):
        h, w = img_bgr.shape[:2]
        self.face_detector.setInputSize((w, h))
        faces = self.face_detector.detect(img_bgr)[1]
        if faces is None or len(faces) == 0:
            return None, (None, 0.0)
        
        best = faces[0]
        fx, fy, fw, fh = best[:4].astype(int)
        fx1, fy1 = max(0, fx), max(0, fy)
        fx2, fy2 = min(w, fx + fw), min(h, fy + fh)
        if fx2 <= fx1 or fy2 <= fy1:
            return None, (None, 0.0)

        # Deep learning gender
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

    def classify(self, img_bgr):
        h, w = img_bgr.shape[:2]
        face_box, (dl_g, dl_c) = self.detect_face(img_bgr)
        has_face = face_box is not None

        if has_face:
            fx, fy, fw, fh = face_box
            # Agal check: Only exists on men with light ghutra
            crown_y1 = max(0, fy - int(fh * 0.45))
            crown_y2 = max(0, fy)
            crown_x1 = max(0, fx - int(fw * 0.1))
            crown_x2 = min(w, fx + int(fw * 1.1))
            crown = img_bgr[crown_y1:crown_y2, crown_x1:crown_x2]
            
            # Male Agal is a thick black double ring sitting atop white Ghutra
            # Crucial: Male Ghutra leaves neck open and Adam's apple visible
            has_male_agal = False
            if crown.size > 0:
                crown_gray = cv2.cvtColor(crown, cv2.COLOR_BGR2GRAY)
                c_blk = np.count_nonzero(crown_gray < 50) / float(crown_gray.size)
                c_wht = np.count_nonzero(crown_gray > 140) / float(crown_gray.size)
                if c_blk >= 0.40 and c_wht >= 0.20:
                    has_male_agal = True

            # Cheek margins (Hijab cloth vs open hair)
            left_cheek = img_bgr[fy:min(h, fy+fh), max(0, fx - int(fw*0.4)):fx]
            right_cheek = img_bgr[fy:min(h, fy+fh), min(w, fx+fw):min(w, fx+fw+int(fw*0.4))]
            l_std = float(np.std(cv2.cvtColor(left_cheek, cv2.COLOR_BGR2GRAY))) if left_cheek.size > 10 else 99.0
            r_std = float(np.std(cv2.cvtColor(right_cheek, cv2.COLOR_BGR2GRAY))) if right_cheek.size > 10 else 99.0
            cheek_std = (l_std + r_std) / 2.0

            # Neck area
            chin_y1 = min(h, fy + fh)
            chin_y2 = min(h, fy + int(fh * 1.5))
            neck = img_bgr[chin_y1:chin_y2, max(0, fx):min(w, fx+fw)]
            neck_skin_ratio = 0.0
            if neck.size > 10:
                neck_hsv = cv2.cvtColor(neck, cv2.COLOR_BGR2HSV)
                skin = (((neck_hsv[:,:,0] <= 25) | (neck_hsv[:,:,0] >= 165)) & 
                        (neck_hsv[:,:,1] >= 40) & (neck_hsv[:,:,1] <= 170) & 
                        (neck_hsv[:,:,2] >= 80) & (neck_hsv[:,:,2] <= 245))
                neck_skin_ratio = float(np.count_nonzero(skin) / (neck_hsv.shape[0] * neck_hsv.shape[1]))

            body_y1 = min(h, fy + int(fh * 1.1))
            body_y2 = min(h, fy + int(fh * 4.5))
            if body_y2 <= body_y1: body_y2 = h
            body = img_bgr[body_y1:body_y2, max(0, int(w*0.1)):min(w, int(w*0.9))]
            if body.size == 0: body = img_bgr[int(h*0.3):, :]

        else:
            has_male_agal = False
            cheek_std = 99.0
            neck_skin_ratio = 0.1
            body = img_bgr[int(h*0.25):int(h*0.9), int(w*0.15):int(w*0.85)]
            if body.size == 0: body = img_bgr

        # Garment color metrics
        body_hsv = cv2.cvtColor(body, cv2.COLOR_BGR2HSV)
        bv = body_hsv[:, :, 2]
        bs = body_hsv[:, :, 1]
        tot_body_px = float(body.shape[0] * body.shape[1] + 1e-5)

        black_ratio = float(np.count_nonzero(bv <= 70) / tot_body_px)
        white_ratio = float(np.count_nonzero((bv >= 140) & (bs <= 70)) / tot_body_px)
        pastel_ratio = float(np.count_nonzero((bv >= 80) & (bs <= 90)) / tot_body_px)
        mean_v = float(np.mean(bv))
        mean_s = float(np.mean(bs))

        mid_y = body.shape[0] // 2
        upper_v = float(np.mean(bv[:mid_y, :])) if mid_y > 0 else mean_v
        lower_v = float(np.mean(bv[mid_y:, :])) if mid_y > 0 else mean_v
        v_diff = abs(upper_v - lower_v)

        has_shayla = (cheek_std < 85 or neck_skin_ratio < 0.50)

        # --- RULE 1: Classic Black Abaya (Emirati Female) ---
        # Any flowing black garment (black ratio >= 0.25 or deep dark mean_v <= 85)
        # Emirati men NEVER wear black robes. This is exclusively Emirati female.
        if black_ratio >= 0.25 or (mean_v <= 85 and mean_s <= 110):
            conf = min(0.99, float(0.80 + black_ratio * 0.18))
            return {
                "nationality": "EMIRATI",
                "nationalityConfidence": round(conf, 2),
                "gender": "FEMALE",
                "genderConfidence": 0.98,
                "attireType": "abaya"
            }

        # --- RULE 2: White Kandura (Emirati Male) ---
        # Pure white/off-white flowing robe with Ghutra & Agal or male face
        if white_ratio >= 0.45 and mean_s <= 45 and (has_male_agal or (dl_g == "MALE" and neck_skin_ratio > 0.10)):
            conf = min(0.99, float(0.75 + white_ratio * 0.22))
            return {
                "nationality": "EMIRATI",
                "nationalityConfidence": round(conf, 2),
                "gender": "MALE",
                "genderConfidence": 0.96,
                "attireType": "kandura"
            }

        # --- RULE 3: Contemporary Pastel / Earth-tone / White / Modest Abaya with Shayla / Hijab (Emirati Female) ---
        # Women wearing pastel, beige, cream, gold, or white abayas with Shayla or female headdress
        if has_shayla and (pastel_ratio >= 0.35 or white_ratio >= 0.35 or (mean_v >= 90 and mean_s <= 145 and v_diff < 75)):
            conf = min(0.96, float(0.76 + max(pastel_ratio, white_ratio) * 0.20))
            return {
                "nationality": "EMIRATI",
                "nationalityConfidence": round(conf, 2),
                "gender": "FEMALE",
                "genderConfidence": 0.96,
                "attireType": "abaya"
            }

        # --- RULE 4: Non-Emirati Regular / Casual ---
        return {
            "nationality": "NON_EMIRATI",
            "nationalityConfidence": 0.88,
            "gender": dl_g or "FEMALE",
            "genderConfidence": dl_c if dl_g else 0.75,
            "attireType": "regular"
        }

clf = EnhancedAttireClassifier()

print("--- TESTING FEMALE EMIRATIS (24 images) ---")
fem_dir = ROOT / "uploads/training/emirati_female/Female_emiratis"
fem_correct = 0
for f in sorted(list(fem_dir.glob("*.*"))):
    img = cv2.imread(str(f))
    res = clf.classify(img)
    is_ok = (res["nationality"] == "EMIRATI" and res["gender"] == "FEMALE" and res["attireType"] == "abaya")
    if is_ok: fem_correct += 1
    mark = "✔" if is_ok else "❌"
    print(f"  {mark} {f.name[:25]:<25} -> {res['nationality']:<11} | {res['gender']:<6} | {res['attireType']:<7} ({res['nationalityConfidence']:.2f})")
print(f"Female Accuracy: {fem_correct}/24 ({fem_correct/24*100:.1f}%)")

print("\n--- TESTING MALE EMIRATI ---")
for f in sorted(list((ROOT / "uploads/training/emirati_male").glob("*.*"))):
    img = cv2.imread(str(f))
    res = clf.classify(img)
    print(f"  {f.name[:25]:<25} -> {res['nationality']:<11} | {res['gender']:<6} | {res['attireType']:<7}")

print("\n--- TESTING NON EMIRATI ---")
for f in sorted(list((ROOT / "uploads/training/non_emirati").glob("*.*"))):
    img = cv2.imread(str(f))
    res = clf.classify(img)
    print(f"  {f.name[:25]:<25} -> {res['nationality']:<11} | {res['gender']:<6} | {res['attireType']:<7}")
