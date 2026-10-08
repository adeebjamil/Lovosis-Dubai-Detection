import cv2
import numpy as np
from pathlib import Path

ROOT = Path(".")
yunet = cv2.FaceDetectorYN.create("models/face_detection_yunet_2023mar.onnx", "", (320, 320), score_threshold=0.3)

for name, p in [
    ("kandura_1", ROOT / "uploads/training/emirati_male/kandura_ghutra_1.jpg"),
    ("casual_1", ROOT / "uploads/training/non_emirati/casual_western_1.jpg"),
]:
    img = cv2.imread(str(p))
    h, w = img.shape[:2]
    # Resize for faster face detection
    scale = 640.0 / max(h, w)
    small = cv2.resize(img, (int(w*scale), int(h*scale)))
    yunet.setInputSize((small.shape[1], small.shape[0]))
    faces = yunet.detect(small)[1]
    if faces is not None:
        for fi, f in enumerate(faces):
            fx, fy, fw, fh = (f[:4] / scale).astype(int)
            print(f"{name} face {fi}: box=({fx},{fy},{fw},{fh}), score={f[-1]:.2f}")
    else:
        print(f"{name}: no face")
