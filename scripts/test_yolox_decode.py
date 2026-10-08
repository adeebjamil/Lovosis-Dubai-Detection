import cv2
import numpy as np
from pathlib import Path
import onnxruntime as ort

COCO_CLASSES = {0: "PERSON", 15: "CAT", 16: "DOG"}

def make_grids(img_size=(640, 640)):
    strides = [8, 16, 32]
    grids = []
    expanded_strides = []
    for stride in strides:
        hsize = img_size[0] // stride
        wsize = img_size[1] // stride
        xv, yv = np.meshgrid(np.arange(wsize), np.arange(hsize))
        grid = np.stack((xv, yv), 2).reshape(1, -1, 2)
        grids.append(grid)
        shape = grid.shape[:2]
        expanded_strides.append(np.full((*shape, 1), stride, dtype=np.float32))
    grids = np.concatenate(grids, 1).astype(np.float32)
    expanded_strides = np.concatenate(expanded_strides, 1).astype(np.float32)
    return grids, expanded_strides

grids, expanded_strides = make_grids((640, 640))

sess = ort.InferenceSession("models/yolox_s.onnx", providers=["CPUExecutionProvider"])
cap = cv2.VideoCapture("rtsp://127.0.0.1:8554/cam-001", cv2.CAP_FFMPEG)
ret, frame = cap.read()
cap.release()

if not ret or frame is None:
    print("Could not grab frame from RTSP")
    exit(1)

h, w = frame.shape[:2]
scale = min(640 / w, 640 / h)
nw, nh = int(w * scale), int(h * scale)
resized = cv2.resize(frame, (nw, nh))
canvas = np.full((640, 640, 3), 114, dtype=np.uint8)
canvas[:nh, :nw] = resized
blob = canvas.transpose((2, 0, 1)).astype(np.float32)[None, ...]

outputs = sess.run(None, {"images": blob})[0]

# DECODE GRIDS
outputs[..., :2] = (outputs[..., :2] + grids) * expanded_strides
outputs[..., 2:4] = np.exp(outputs[..., 2:4]) * expanded_strides

preds = outputs[0]
boxes = preds[:, :4]
obj_scores = preds[:, 4]
class_scores = preds[:, 5:]

print(f"Max obj score: {obj_scores.max():.4f}")

from detector.attire import AttireClassifier
attire = AttireClassifier()

for coco_id, name in COCO_CLASSES.items():
    scores = obj_scores * class_scores[:, coco_id]
    mask = scores > 0.35
    if np.any(mask):
        print(f"Found {name} with max score {scores[mask].max():.2f}")
        for idx in np.where(mask)[0]:
            cx, cy, bw, bh = boxes[idx]
            x1 = max(0, int((cx - bw / 2) / scale))
            y1 = max(0, int((cy - bh / 2) / scale))
            x2 = min(w, int((cx + bw / 2) / scale))
            y2 = min(h, int((cy + bh / 2) / scale))
            print(f"  Box: [{x1}, {y1}, {x2}, {y2}], Score: {scores[idx]:.2f}")
            if name == "PERSON" and x2 > x1 and y2 > y1:
                crop = frame[y1:y2, x1:x2]
                res = attire.classify_crop(crop)
                print(f"  CLASSIFICATION: {res}")
