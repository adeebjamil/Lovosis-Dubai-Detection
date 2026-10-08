import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
from detector.attire import AttireClassifier

clf = AttireClassifier()

def test_classify(crop_bgr):
    h, w = crop_bgr.shape[:2]
    if h < 40 or w < 20:
        return {"nationality": "UNKNOWN", "gender": "UNKNOWN", "attireType": "unknown"}

    face_box, (dl_g, dl_c) = clf.detect_face_and_gender(crop_bgr)
    has_face = face_box is not None

    if has_face:
        fx, fy, fw, fh = face_box

        # Agal check
        crown_y1 = max(0, fy - int(fh * 0.45))
        crown_y2 = max(0, fy)
        crown_x1 = max(0, fx - int(fw * 0.15))
        crown_x2 = min(w, fx + int(fw * 1.15))
        crown = crop_bgr[crown_y1:crown_y2, crown_x1:crown_x2]
        
        has_male_agal = False
        if crown.size > 20:
            cg = cv2.cvtColor(crown, cv2.COLOR_BGR2GRAY)
            row_means = np.mean(cg, axis=1) if len(cg) > 0 else []
            has_dark_row = any(rm < 75 for rm in row_means[-max(1, len(row_means)//3):])
            c_light = np.count_nonzero(cg > 140) / float(cg.size)
            if has_dark_row and c_light > 0.30 and dl_g == "MALE":
                has_male_agal = True

        # Cheeks
        left = crop_bgr[fy:min(h, fy+fh), max(0, fx - int(fw*0.45)):fx]
        right = crop_bgr[fy:min(h, fy+fh), min(w, fx+fw):min(w, fx+fw+int(fw*0.45))]
        l_std = float(cv2.meanStdDev(cv2.cvtColor(left, cv2.COLOR_BGR2GRAY))[1][0][0]) if left.size > 10 else 99.0
        r_std = float(cv2.meanStdDev(cv2.cvtColor(right, cv2.COLOR_BGR2GRAY))[1][0][0]) if right.size > 10 else 99.0
        cheek_std = (l_std + r_std) / 2.0

        # Neck skin
        chin_y1 = min(h, fy + fh)
        chin_y2 = min(h, fy + int(fh * 1.5))
        chin_x1 = max(0, fx + int(fw * 0.15))
        chin_x2 = min(w, fx + int(fw * 0.85))
        neck = crop_bgr[chin_y1:chin_y2, chin_x1:chin_x2]
        neck_skin_ratio = 0.0
        if neck.size > 10:
            nhsv = cv2.cvtColor(neck, cv2.COLOR_BGR2HSV)
            skin = (((nhsv[:,:,0] <= 25) | (nhsv[:,:,0] >= 165)) & (nhsv[:,:,1] >= 35) & (nhsv[:,:,2] >= 75))
            neck_skin_ratio = float(np.count_nonzero(skin) / (nhsv.shape[0] * nhsv.shape[1]))

        body_y1 = min(h, fy + int(fh * 1.1))
        body_y2 = min(h, fy + int(fh * 4.5))
        if body_y2 <= body_y1: body_y2 = h
        body = crop_bgr[body_y1:body_y2, max(0, int(w*0.1)):min(w, int(w*0.9))]
        if body.size == 0: body = crop_bgr[int(h*0.3):, :]

        has_shayla_hijab = (cheek_std < 75 or neck_skin_ratio < 0.25) and not has_male_agal

    else:
        has_male_agal = False
        body = crop_bgr[int(h*0.25):int(h*0.9), int(w*0.15):int(w*0.85)]
        if body.size == 0: body = crop_bgr
        bhsv = cv2.cvtColor(body, cv2.COLOR_BGR2HSV)
        tot_p = float(body.shape[0] * body.shape[1] + 1e-5)
        has_shayla_hijab = (np.count_nonzero(bhsv[:, :, 2] <= 70) / tot_p >= 0.40) or \
                           (np.count_nonzero((bhsv[:, :, 2] >= 80) & (bhsv[:, :, 1] <= 85)) / tot_p >= 0.50)

    body_hsv = cv2.cvtColor(body, cv2.COLOR_BGR2HSV)
    bv = body_hsv[:, :, 2]
    bs = body_hsv[:, :, 1]
    tot = float(body.shape[0] * body.shape[1] + 1e-5)

    blk_r = float(np.count_nonzero(bv <= 70) / tot)
    wht_r = float(np.count_nonzero((bv >= 140) & (bs <= 60)) / tot)
    pst_r = float(np.count_nonzero((bv >= 80) & (bs <= 85)) / tot)
    mean_v = float(np.mean(bv))
    mean_s = float(np.mean(bs))

    mid_y = body.shape[0] // 2
    upper_v = float(np.mean(bv[:mid_y, :])) if mid_y > 0 else mean_v
    lower_v = float(np.mean(bv[mid_y:, :])) if mid_y > 0 else mean_v
    v_diff = abs(upper_v - lower_v)

    # 1. Classic Black Abaya
    if (blk_r >= 0.22 or (mean_v <= 85 and mean_s <= 110)):
        return {"nationality": "EMIRATI", "gender": "FEMALE", "attireType": "abaya", "conf": 0.98}

    # 2. Shayla / Hijab with Modern Pastel / Earth-Tone / Modest Abaya
    if has_shayla_hijab and not has_male_agal:
        if pst_r >= 0.25 or wht_r >= 0.25 or (mean_v >= 85 and mean_s <= 145 and v_diff < 75):
            return {"nationality": "EMIRATI", "gender": "FEMALE", "attireType": "abaya", "conf": 0.97}

    # 3. White Kandura (Emirati Male)
    is_white_robe = (wht_r >= 0.35 and mean_s <= 55) or (pst_r >= 0.40 and mean_s <= 55 and dl_g == "MALE")
    if is_white_robe and (has_male_agal or (dl_g == "MALE" and not has_shayla_hijab)):
        return {"nationality": "EMIRATI", "gender": "MALE", "attireType": "kandura", "conf": 0.96}

    # 4. Casual
    return {"nationality": "NON_EMIRATI", "gender": dl_g or "FEMALE", "attireType": "regular", "conf": 0.88}

# Test female
fem_dir = ROOT / "uploads/training/emirati_female/Female_emiratis"
f_files = sorted(list(fem_dir.glob("*.*")))
f_correct = 0
for f in f_files:
    img = cv2.imread(str(f))
    r = test_classify(img)
    ok = (r["nationality"] == "EMIRATI" and r["gender"] == "FEMALE" and r["attireType"] == "abaya")
    if ok: f_correct += 1
    mark = "✔" if ok else "❌"
    print(f"[{mark}] {f.name[:25]} -> {r['nationality']} | {r['gender']} | {r['attireType']}")

print(f"\nFemale Accuracy: {f_correct}/{len(f_files)} ({f_correct/len(f_files)*100:.1f}%)")
