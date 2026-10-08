import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
import cv2
from detector.yolox import YoloXDetector

det = YoloXDetector(ROOT / "models/yolox_tiny.onnx")
for cat in ["emirati_male", "non_emirati"]:
    print(f"=== {cat} ===")
    for p in (ROOT / "uploads/training" / cat).glob("*.*"):
        img = cv2.imread(str(p))
        if img is None: continue
        res = det.detect(img)
        classes = [d["class"] for d in res]
        print(f"{p.name}: {len(res)} detections -> {classes}")
