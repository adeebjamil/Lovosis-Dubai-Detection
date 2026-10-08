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
print(f"Total authentic male images: {len(imgs)}")

correct = 0
for idx, f in enumerate(imgs):
    img = cv2.imread(str(f))
    r = clf.classify_crop(img)
    is_ok = (r['nationality'] == 'EMIRATI' and r['gender'] == 'MALE' and r['attireType'] == 'kandura')
    if is_ok: correct += 1
    mark = "✔" if is_ok else "❌"
    print(f"[{idx+1:02d}] {mark} {f.name[:25]:<25} -> {r['nationality']:<11} | {r['gender']:<6} | {r['attireType']:<7} ({r['nationalityConfidence']:.2f})")

print(f"\nAuthentic Male Accuracy: {correct}/{len(imgs)} ({correct/len(imgs)*100:.1f}%)")
