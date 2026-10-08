import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
from detector.scripts.test_perfect import clf

fem_dir = ROOT / "uploads/training/emirati_female/Female_emiratis"
imgs = sorted(list(fem_dir.glob("*.*")))

fem_ok = 0
for f in imgs:
    img = cv2.imread(str(f))
    h, w = img.shape[:2]
    face_box, (dl_g, dl_c) = clf.detect_face(img)
    has_face = face_box is not None
    fx, fy, fw, fh = face_box if has_face else (0, 0, 0, 0)
    
    body = img[min(h, fy+int(fh*1.1)):min(h, fy+int(fh*4.5)), :] if has_face else img[int(h*0.25):, :]
    bhsv = cv2.cvtColor(body, cv2.COLOR_BGR2HSV)
    bv = bhsv[:,:,2]
    bs = bhsv[:,:,1]
    tot = float(body.shape[0] * body.shape[1] + 1e-5)
    blk_r = float(np.count_nonzero(bv <= 70) / tot)
    wht_r = float(np.count_nonzero((bv >= 140) & (bs <= 60)) / tot)
    pst_r = float(np.count_nonzero((bv >= 80) & (bs <= 85)) / tot)

    # Check rule 1:
    is_black_abaya = (blk_r >= 0.22 or (np.mean(bv) <= 85 and np.mean(bs) <= 110))
    # Check rule 3:
    is_pastel_abaya = (pst_r >= 0.25 or wht_r >= 0.25 or (np.mean(bv) >= 90 and np.mean(bs) <= 145))
    
    is_abaya = is_black_abaya or is_pastel_abaya
    if is_abaya: fem_ok += 1
    mark = "✔" if is_abaya else "❌"
    print(f"  {mark} {f.name[:25]:<25} | blk={blk_r:.2f}, wht={wht_r:.2f}, pst={pst_r:.2f}")

print(f"\nFinal Accuracy on Female_emiratis: {fem_ok}/24 ({fem_ok/24*100:.1f}%)")
