import cv2
import time
import numpy as np
from pathlib import Path
from detector.yolox import YoloXDetector
from detector.attire import AttireClassifier

detector = YoloXDetector(Path("models/yolox_s.onnx"))
attire = AttireClassifier(min_crop_height=30)

rtsp_url = "rtsp://127.0.0.1:8554/cam-001"
print(f"Connecting to {rtsp_url}...")
cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
if not cap.isOpened():
    print("Failed to open local RTSP stream, trying direct camera...")
    rtsp_url = "rtsp://admin:admin-123@72.61.246.121:6002/media/video1"
    cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)

frames_checked = 0
persons_found = 0

start = time.time()
while time.time() - start < 15 and persons_found < 3:
    ret, frame = cap.read()
    if not ret or frame is None:
        time.sleep(0.1)
        continue
    frames_checked += 1
    detections = detector.detect(frame)
    for d in detections:
        if d['class'] == 'PERSON':
            persons_found += 1
            b = d['box']
            px1 = max(0, int(b[0]))
            py1 = max(0, int(b[1]))
            px2 = min(frame.shape[1], int(b[2]))
            py2 = min(frame.shape[0], int(b[3]))
            crop = frame[py1:py2, px1:px2]
            res = attire.classify_crop(crop)
            print(f"Person detected! Box: {b}, Crop: {crop.shape}")
            print(f"Result: {res}")

print(f"Done. Checked {frames_checked} frames, found {persons_found} persons.")
cap.release()
