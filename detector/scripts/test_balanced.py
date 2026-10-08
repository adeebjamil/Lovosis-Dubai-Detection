import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
from detector.scripts.test_perfect import clf

# Test Male
p_male = ROOT / "uploads/training/emirati_male/emirati_male_"
m_imgs = sorted(list(p_male.glob("*.*")))
m_ok = 0
for f in m_imgs:
    img = cv2.imread(str(f))
    h, w = img.shape[:2]
    face_box, (dl_g, dl_c) = clf.detect_face(img)
    has_face = face_box is not None
    fx, fy, fw, fh = face_box if has_face else (0,0,0,0)
    
    # Cheek std
    left = img[fy:fy+fh, max(0, fx-int(fw*0.45)):fx] if has_face else img[:0,:0]
    right = img[fy:fy+fh, fx+fw:min(w, fx+fw+int(fw*0.45))] if has_face else img[:0,:0]
    l_std = float(cv2.meanStdDev(cv2.cvtColor(left, cv2.COLOR_BGR2GRAY))[1][0][0]) if left.size > 10 else 99.0
    r_std = float(cv2.meanStdDev(cv2.cvtColor(right, cv2.COLOR_BGR2GRAY))[1][0][0]) if right.size > 10 else 99.0
    chk_std = (l_std + r_std) / 2.0

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

    # Candidate Kandura
    is_kandura = False
    if wht_r >= 0.35 and mean_s <= 55:
        if dl_g == "MALE" or chk_std >= 25:
            is_kandura = True
    elif pst_r >= 0.40 and mean_s <= 60 and dl_g == "MALE":
        is_kandura = True

    if is_kandura: m_ok += 1
    mark = "✔" if is_kandura else "❌"
    print(f"Male [{f.name[:20]}] {mark} -> dl_g={dl_g}, wht={wht_r:.2f}, chk={chk_std:.1f}")

print(f"\nMale Accuracy: {m_ok}/{len(m_imgs)} ({m_ok/len(m_imgs)*100:.1f}%)")

# Test Female
p_fem = ROOT / "uploads/training/emirati_female/Female_emiratis"
f_imgs = sorted(list(p_fem.glob("*.*")))
f_ok = 0
for f in f_imgs:
    img = cv2.imread(str(f))
    h, w = img.shape[:2]
    face_box, (dl_g, dl_c) = clf.detect_face(img)
    has_face = face_box is not None
    fx, fy, fw, fh = face_box if has_face else (0,0,0,0)
    
    left = img[fy:fy+fh, max(0, fx-int(fw*0.45)):fx] if has_face else img[:0,:0]
    right = img[fy:fy+fh, fx+fw:min(w, fx+fw+int(fw*0.45))] if has_face else img[:0,:0]
    l_std = float(cv2.meanStdDev(cv2.cvtColor(left, cv2.COLOR_BGR2GRAY))[1][0][0]) if left.size > 10 else 99.0
    r_std = float(cv2.meanStdDev(cv2.cvtColor(right, cv2.COLOR_BGR2GRAY))[1][0][0]) if right.size > 10 else 99.0
    chk_std = (l_std + r_std) / 2.0

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

    is_abaya = False
    if blk_r >= 0.22 or (mean_v <= 85 and mean_s <= 110):
        is_abaya = True # Black Abaya
    elif chk_std < 25:
        is_abaya = True # White / Pastel Shayla Wrap
    elif pst_r >= 0.25 or (mean_v >= 90 and mean_s <= 145):
        if not (wht_r >= 0.40 and mean_s <= 55 and dl_g == "MALE"):
            is_abaya = True # Pastel / Earth-tone Abaya

    if is_abaya: f_ok += 1

print(f"Female Accuracy: {f_ok}/{len(f_imgs)} ({f_ok/len(f_imgs)*100:.1f}%)")
