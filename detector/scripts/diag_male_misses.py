import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
from detector.attire import AttireClassifier

clf = AttireClassifier()
p_male = ROOT / "uploads/training/emirati_male/emirati_male_"
imgs = sorted(list(p_male.glob("*.*")))

for idx in [3, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19]:
    f = imgs[idx]
    img = cv2.imread(str(f))
    h, w = img.shape[:2]
    face_box, (dl_g, dl_c) = clf.detect_face_and_gender(img)
    fx, fy, fw, fh = face_box if face_box else (0,0,0,0)
    
    body = img[min(h, fy+int(fh*1.1)):min(h, fy+int(fh*4.5)), :] if face_box else img[int(h*0.25):, :]
    bhsv = cv2.cvtColor(body, cv2.COLOR_BGR2HSV)
    bv = bhsv[:,:,2]
    bs = bhsv[:,:,1]
    tot = float(body.shape[0] * body.shape[1] + 1e-5)
    blk_r = float(np.count_nonzero(bv <= 70) / tot)
    wht_r = float(np.count_nonzero((bv >= 140) & (bs <= 60)) / tot)
    pst_r = float(np.count_nonzero((bv >= 80) & (bs <= 85)) / tot)
    
    # Cheek std
    left = img[fy:fy+fh, max(0, fx-int(fw*0.45)):fx] if face_box else img[:0,:0]
    right = img[fy:fy+fh, fx+fw:min(w, fx+fw+int(fw*0.45))] if face_box else img[:0,:0]
    l_std = float(cv2.meanStdDev(cv2.cvtColor(left, cv2.COLOR_BGR2GRAY))[1][0][0]) if left.size > 10 else 99.0
    r_std = float(cv2.meanStdDev(cv2.cvtColor(right, cv2.COLOR_BGR2GRAY))[1][0][0]) if right.size > 10 else 99.0
    chk_std = (l_std + r_std) / 2.0
    
    print(f"[{idx+1:02d}] {f.name[:25]} | dl_g={dl_g}({dl_c:.2f}) | chk_std={chk_std:.1f} | blk={blk_r:.2f}, wht={wht_r:.2f}, pst={pst_r:.2f}, mean_v={np.mean(bv):.1f}")
