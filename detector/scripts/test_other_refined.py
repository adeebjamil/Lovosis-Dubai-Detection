import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
from detector.attire import AttireClassifier
from detector.scripts.test_female_refined import test_classify

male_dir = ROOT / "uploads/training/emirati_male/emirati_male_"
m_files = sorted(list(male_dir.glob("*.*")))
m_correct = 0
for f in m_files:
    img = cv2.imread(str(f))
    r = test_classify(img)
    ok = (r["nationality"] == "EMIRATI" and r["gender"] == "MALE" and r["attireType"] == "kandura")
    if ok: m_correct += 1
    mark = "✔" if ok else "❌"
    print(f"[{mark}] {f.name[:25]} -> {r['nationality']} | {r['gender']} | {r['attireType']}")

print(f"\nMale Accuracy: {m_correct}/{len(m_files)} ({m_correct/len(m_files)*100:.1f}%)")

casual_dir = ROOT / "uploads/training/non_emirati"
c_files = sorted(list(casual_dir.glob("*.*")))
c_correct = 0
for f in c_files:
    img = cv2.imread(str(f))
    r = test_classify(img)
    ok = (r["nationality"] == "NON_EMIRATI" and r["attireType"] == "regular")
    if ok: c_correct += 1
    mark = "✔" if ok else "❌"
    print(f"[{mark}] {f.name[:25]} -> {r['nationality']} | {r['gender']} | {r['attireType']}")

print(f"\nCasual Accuracy: {c_correct}/{len(c_files)} ({c_correct/len(c_files)*100:.1f}%)")
