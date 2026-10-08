import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
from detector.attire import AttireClassifier

clf = AttireClassifier()
p = ROOT / "uploads/training/emirati_female/Female_emiratis"
imgs = sorted(list(p.glob("*.*")))

for idx in [0, 5, 9, 10, 11, 13, 14, 16, 17, 20, 22, 23]:
    img_p = imgs[idx]
    img = cv2.imread(str(img_p))
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    clf.face_detector.setInputSize((w, h))
    faces = clf.face_detector.detect(img)[1]
    has_face = faces is not None and len(faces) > 0
    fx, fy, fw, fh = faces[0][:4].astype(int) if has_face else (0, 0, 0, 0)
    dl_g, dl_c = clf.detect_face_gender(img)

    # Calculate garment metrics
    # If face is detected, we can analyze face surroundings:
    # 1. Head top, sides, and chin
    # 2. Body below face
    if has_face:
        # region above head
        above_head = img[max(0, fy - int(fh*0.6)):max(0, fy), max(0, fx):min(w, fx+fw)]
        left_head = img[fy:min(h, fy+fh), max(0, fx - int(fw*0.5)):fx]
        right_head = img[fy:min(h, fy+fh), min(w, fx+fw):min(w, fx+fw+int(fw*0.5))]
        neck_area = img[min(h, fy+fh):min(h, fy+int(fh*1.6)), max(0, fx - int(fw*0.2)):min(w, fx+fw+int(fw*0.2))]
        chest_area = img[min(h, fy+int(fh*1.4)):min(h, fy+int(fh*3.0)), max(0, fx - int(fw*0.8)):min(w, fx+fw+int(fw*0.8))]
    else:
        above_head = img[:int(h*0.2), :]
        left_head = img[:int(h*0.3), :int(w*0.3)]
        right_head = img[:int(h*0.3), int(w*0.7):]
        neck_area = img[int(h*0.15):int(h*0.35), int(w*0.25):int(w*0.75)]
        chest_area = img[int(h*0.35):int(h*0.65), int(w*0.2):int(w*0.8)]

    # Check skin in neck area:
    # Skin in HSV: H in [0..25] or [165..180], S in [40..170], V in [80..240]
    neck_hsv = cv2.cvtColor(neck_area, cv2.COLOR_BGR2HSV) if neck_area.size > 0 else np.zeros((1,1,3), dtype=np.uint8)
    neck_skin_mask = (((neck_hsv[:,:,0] <= 25) | (neck_hsv[:,:,0] >= 165)) & 
                      (neck_hsv[:,:,1] >= 40) & (neck_hsv[:,:,1] <= 170) & 
                      (neck_hsv[:,:,2] >= 80) & (neck_hsv[:,:,2] <= 240))
    neck_skin_ratio = np.count_nonzero(neck_skin_mask) / float(neck_hsv.shape[0] * neck_hsv.shape[1] + 1e-5)

    # Check if neck area has dark or neutral cloth:
    neck_v_mean = np.mean(neck_hsv[:,:,2])
    neck_s_mean = np.mean(neck_hsv[:,:,1])

    # Check chest / body cloth
    chest_hsv = cv2.cvtColor(chest_area, cv2.COLOR_BGR2HSV) if chest_area.size > 0 else np.zeros((1,1,3), dtype=np.uint8)
    chest_v_mean = np.mean(chest_hsv[:,:,2])
    chest_s_mean = np.mean(chest_hsv[:,:,1])
    chest_black_ratio = np.count_nonzero(chest_hsv[:,:,2] < 70) / float(chest_hsv.shape[0] * chest_hsv.shape[1] + 1e-5)

    print(f"[{idx+1:02d}] {img_p.name[:25]} | Face: {has_face} DL: {str(dl_g):<6} ({dl_c:.2f}) | neck_skin: {neck_skin_ratio:.2f} (neck_V: {neck_v_mean:.0f}, S: {neck_s_mean:.0f}) | chest_V: {chest_v_mean:.0f}, S: {chest_s_mean:.0f}, black: {chest_black_ratio:.2f}")
