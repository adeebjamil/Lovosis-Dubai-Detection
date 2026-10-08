import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
from detector.scripts.test_perfect import clf

def classify(img):
    h, w = img.shape[:2]
    if h < 40 or w < 20:
        return {"nationality": "UNKNOWN", "gender": "UNKNOWN", "attireType": "unknown"}

    face_box, (dl_g, dl_c) = clf.detect_face(img)
    has_face = face_box is not None
    fx, fy, fw, fh = face_box if has_face else (0,0,0,0)

    # Cheeks
    left = img[fy:fy+fh, max(0, fx-int(fw*0.45)):fx] if has_face else img[:0,:0]
    right = img[fy:fy+fh, fx+fw:min(w, fx+fw+int(fw*0.45))] if has_face else img[:0,:0]
    l_std = float(cv2.meanStdDev(cv2.cvtColor(left, cv2.COLOR_BGR2GRAY))[1][0][0]) if left.size > 10 else 99.0
    r_std = float(cv2.meanStdDev(cv2.cvtColor(right, cv2.COLOR_BGR2GRAY))[1][0][0]) if right.size > 10 else 99.0
    chk_std = (l_std + r_std) / 2.0

    # Body
    body = img[min(h, fy+int(fh*1.1)):min(h, fy+int(fh*4.5)), :] if has_face else img[int(h*0.25):, :]
    bhsv = cv2.cvtColor(body, cv2.COLOR_BGR2HSV)
    bv = bhsv[:,:,2]
    bs = bhsv[:,:,1]
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

    # 1. Classic Black Abaya (Emirati Female)
    # Men in UAE never wear black robes.
    if blk_r >= 0.22 or (mean_v <= 85 and mean_s <= 110):
        return {"nationality": "EMIRATI", "gender": "FEMALE", "attireType": "abaya", "conf": 0.98}

    # 2. White / Light Kandura (Emirati Male)
    # Candidate white robe: high white ratio, low saturation
    is_white_robe = (wht_r >= 0.35 and mean_s <= 55) or (pst_r >= 0.45 and mean_s <= 55 and dl_g == "MALE")
    # Female white abaya has ultra-smooth cheek wrapping (chk_std < 22) and female appearance
    is_female_white = is_white_robe and (chk_std < 22 and dl_g != "MALE")

    if is_white_robe and not is_female_white and (dl_g == "MALE" or chk_std >= 25):
        return {"nationality": "EMIRATI", "gender": "MALE", "attireType": "kandura", "conf": 0.97}

    # 3. Modern Pastel / Earth-Tone / Modest Abaya with Shayla (Emirati Female)
    # Covers pastel, cream, sand, gold, and earth-tone abayas
    is_modest_robe = (pst_r >= 0.25 or wht_r >= 0.25 or (mean_v >= 90 and mean_s <= 145 and v_diff < 75))
    if is_modest_robe and (chk_std < 75 or dl_g == "FEMALE" or is_female_white):
        return {"nationality": "EMIRATI", "gender": "FEMALE", "attireType": "abaya", "conf": 0.96}

    # 4. Casual / Western (Non-Emirati)
    return {"nationality": "NON_EMIRATI", "gender": dl_g or "FEMALE", "attireType": "regular", "conf": 0.88}

# Evaluate all
for cat, label in [("emirati_female", "abaya"), ("emirati_male", "kandura"), ("non_emirati", "regular")]:
    p = ROOT / "uploads/training" / cat
    files = sorted(list(p.rglob("*.jpg")) + list(p.rglob("*.jpeg")) + list(p.rglob("*.png")))
    correct = 0
    for f in files:
        img = cv2.imread(str(f))
        if img is None: continue
        res = classify(img)
        ok = (res["attireType"] == label)
        if ok: correct += 1
    print(f"{cat}: {correct}/{len(files)} ({correct/len(files)*100:.1f}%)")
