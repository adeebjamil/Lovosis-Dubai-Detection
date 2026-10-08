import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
from detector.attire import AttireClassifier

clf = AttireClassifier()
root = ROOT / "uploads" / "training"

for cat in ["emirati_female", "emirati_male", "non_emirati"]:
    p = root / cat
    imgs = sorted(list(p.rglob("*.jpg")) + list(p.rglob("*.jpeg")) + list(p.rglob("*.png")))
    print(f"\n=== CATEGORY: {cat} (Total {len(imgs)}) ===", flush=True)
    for img_p in imgs:
        img = cv2.imread(str(img_p))
        if img is None:
            continue
        res = clf.classify_crop(img)
        dl_g, dl_c = clf.detect_face_gender(img)
        print(f"  {img_p.name[:25]:<25} -> Nat: {res['nationality']:<11} | Gender: {res['gender']:<6} | Attire: {res['attireType']:<7} | DL: {str(dl_g):<6} ({dl_c:.2f})", flush=True)
