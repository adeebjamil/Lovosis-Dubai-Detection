import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
from detector.attire import AttireClassifier

clf = AttireClassifier()

categories = [
    ("emirati_female", "abaya", "EMIRATI", "FEMALE"),
    ("emirati_male", "kandura", "EMIRATI", "MALE"),
    ("non_emirati", "regular", "NON_EMIRATI", "UNKNOWN"),
]

for cat, exp_attire, exp_nat, exp_gender in categories:
    p = ROOT / "uploads/training" / cat
    files = sorted(list(p.rglob("*.jpg")) + list(p.rglob("*.jpeg")) + list(p.rglob("*.png")))
    correct = 0
    print(f"\n=== CATEGORY: {cat} ({len(files)} files) ===")
    for f in files:
        img = cv2.imread(str(f))
        if img is None: continue
        r = clf.classify_crop(img)
        ok = (r["attireType"] == exp_attire and r["nationality"] == exp_nat)
        if exp_gender != "UNKNOWN":
            ok = ok and (r["gender"] == exp_gender)
        if ok: correct += 1
        mark = "✔" if ok else "❌"
        print(f"  {mark} {f.name[:25]:<25} -> {r['nationality']:<11} | {r['gender']:<6} | {r['attireType']:<7} ({r['nationalityConfidence']:.2f})")
    print(f">> {cat} Accuracy: {correct}/{len(files)} ({correct/len(files)*100:.1f}%)")
