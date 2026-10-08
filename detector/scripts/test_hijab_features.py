import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np

def analyze_head_and_attire(img_path):
    img = cv2.imread(str(img_path))
    if img is None: return None
    h, w = img.shape[:2]
    yunet = cv2.FaceDetectorYN.create(str(ROOT / "models/face_detection_yunet_2023mar.onnx"), "", (w, h), score_threshold=0.35)
    yunet.setInputSize((w, h))
    faces = yunet.detect(img)[1]

    has_face = faces is not None and len(faces) > 0
    if not has_face:
        fx, fy, fw, fh = int(w*0.3), int(h*0.1), int(w*0.4), int(h*0.25)
    else:
        fx, fy, fw, fh = faces[0][:4].astype(int)

    # 1. Crown / Agal check (band immediately above forehead: fy - 0.45*fh to fy)
    crown_y1 = max(0, fy - int(fh * 0.45))
    crown_y2 = max(0, fy)
    crown_x1 = max(0, fx - int(fw * 0.1))
    crown_x2 = min(w, fx + int(fw * 1.1))
    crown = img[crown_y1:crown_y2, crown_x1:crown_x2]
    
    # Check for Agal: A distinct BLACK horizontal cord sitting on a LIGHTER background (Ghutra)
    has_agal = False
    agal_score = 0.0
    if crown.size > 0:
        crown_gray = cv2.cvtColor(crown, cv2.COLOR_BGR2GRAY)
        crown_black_ratio = np.count_nonzero(crown_gray < 50) / float(crown_gray.size)
        crown_white_ratio = np.count_nonzero(crown_gray > 140) / float(crown_gray.size)
        if crown_black_ratio > 0.15 and crown_white_ratio > 0.15:
            has_agal = True
            agal_score = crown_black_ratio

    # 2. Head sides: Hijab/Shayla cloth vs Open hair
    left_cheek = img[fy:min(h, fy+fh), max(0, fx - int(fw*0.4)):fx]
    right_cheek = img[fy:min(h, fy+fh), min(w, fx+fw):min(w, fx+fw+int(fw*0.4))]
    
    left_std = float(np.std(cv2.cvtColor(left_cheek, cv2.COLOR_BGR2GRAY))) if left_cheek.size > 10 else 99.0
    right_std = float(np.std(cv2.cvtColor(right_cheek, cv2.COLOR_BGR2GRAY))) if right_cheek.size > 10 else 99.0
    avg_cheek_std = (left_std + right_std) / 2.0

    # 3. Neck & chin wrap:
    chin_y1 = min(h, fy + fh)
    chin_y2 = min(h, fy + int(fh * 1.5))
    chin_x1 = max(0, fx)
    chin_x2 = min(w, fx + fw)
    neck = img[chin_y1:chin_y2, chin_x1:chin_x2]
    
    neck_skin_ratio = 0.0
    neck_v_mean = 0.0
    if neck.size > 10:
        neck_hsv = cv2.cvtColor(neck, cv2.COLOR_BGR2HSV)
        neck_v_mean = float(np.mean(neck_hsv[:,:,2]))
        skin = (((neck_hsv[:,:,0] <= 25) | (neck_hsv[:,:,0] >= 165)) & 
                (neck_hsv[:,:,1] >= 40) & (neck_hsv[:,:,1] <= 170) & 
                (neck_hsv[:,:,2] >= 80) & (neck_hsv[:,:,2] <= 245))
        neck_skin_ratio = float(np.count_nonzero(skin) / (neck_hsv.shape[0] * neck_hsv.shape[1]))

    # 4. Main body / garment:
    body_y1 = min(h, fy + int(fh * 1.2))
    body_y2 = min(h, fy + int(fh * 4.5)) if has_face else int(h * 0.9)
    if body_y2 <= body_y1:
        body_y2 = h
    body = img[body_y1:body_y2, max(0, int(w*0.1)):min(w, int(w*0.9))]
    if body.size == 0:
        body = img[int(h*0.3):, :]

    body_hsv = cv2.cvtColor(body, cv2.COLOR_BGR2HSV)
    body_v = body_hsv[:,:,2]
    body_s = body_hsv[:,:,1]
    total_px = float(body.shape[0] * body.shape[1] + 1e-5)

    black_ratio = float(np.count_nonzero(body_v <= 65) / total_px)
    white_ratio = float(np.count_nonzero((body_v >= 140) & (body_s <= 65)) / total_px)
    pastel_neutral_ratio = float(np.count_nonzero((body_v >= 80) & (body_s <= 85)) / total_px)

    return {
        "file": img_path.name,
        "has_face": has_face,
        "has_agal": has_agal,
        "agal_score": round(agal_score, 2),
        "cheek_std": round(avg_cheek_std, 1),
        "neck_skin": round(neck_skin_ratio, 2),
        "neck_v": round(neck_v_mean, 1),
        "black_ratio": round(black_ratio, 2),
        "white_ratio": round(white_ratio, 2),
        "pastel_neutral_ratio": round(pastel_neutral_ratio, 2),
        "body_v_mean": round(float(np.mean(body_v)), 1),
        "body_s_mean": round(float(np.mean(body_s)), 1),
    }

for folder in ["emirati_male", "non_emirati"]:
    print(f"\n=== {folder.upper()} ===")
    p = ROOT / "uploads/training" / folder
    for f in sorted(list(p.glob("*.*"))):
        res = analyze_head_and_attire(f)
        if res:
            print(f"{res['file'][:22]:<22} | agal={res['has_agal']}({res['agal_score']}) | chk_std={res['cheek_std']} | n_skin={res['neck_skin']} | blk={res['black_ratio']} | wht={res['white_ratio']} | pstl={res['pastel_neutral_ratio']} | bv={res['body_v_mean']}, bs={res['body_s_mean']}")
