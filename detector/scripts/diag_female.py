import cv2
import numpy as np
from pathlib import Path
from detector.attire import AttireClassifier

clf = AttireClassifier()
p = Path("uploads/training/emirati_female/Female_emiratis")
images = sorted(list(p.glob("*.*")))

for i, img_p in enumerate(images):
    img = cv2.imread(str(img_p))
    if img is None:
        continue
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    mid_y = int(h * 0.50)
    torso = hsv[int(h * 0.25):mid_y, int(w * 0.15):int(w * 0.85)]
    lower = hsv[mid_y:int(h * 0.90), int(w * 0.15):int(w * 0.85)]

    torso_v = torso[:, :, 2]
    torso_s = torso[:, :, 1]
    lower_v = lower[:, :, 2]
    lower_s = lower[:, :, 1]

    total_lower_px = float(lower.shape[0] * lower.shape[1] + 1e-5)
    total_torso_px = float(torso.shape[0] * torso.shape[1] + 1e-5)

    white_mask_torso = (torso_v >= 150) & (torso_s <= 70)
    white_mask_lower = (lower_v >= 140) & (lower_s <= 70)
    white_ratio_torso = np.count_nonzero(white_mask_torso) / total_torso_px
    white_ratio_lower = np.count_nonzero(white_mask_lower) / total_lower_px

    black_mask_torso = (torso_v <= 65)
    black_mask_lower = (lower_v <= 65)
    black_ratio_torso = np.count_nonzero(black_mask_torso) / total_torso_px
    black_ratio_lower = np.count_nonzero(black_mask_lower) / total_lower_px

    neck_y1, neck_y2 = int(h * 0.15), int(h * 0.35)
    head_left = hsv[int(h * 0.08):int(h * 0.30), :max(1, int(w * 0.28))]
    head_right = hsv[int(h * 0.08):int(h * 0.30), int(w * 0.72):]
    neck_center = hsv[neck_y1:neck_y2, int(w * 0.25):int(w * 0.75)]

    shayla_cloth_v = float(np.mean(neck_center[:, :, 2])) if neck_center.size > 0 else 0
    shayla_cloth_s = float(np.mean(neck_center[:, :, 1])) if neck_center.size > 0 else 0
    shayla_cloth_h = float(np.mean(neck_center[:, :, 0])) if neck_center.size > 0 else 0
    head_sides_v = float(np.mean(head_left[:, :, 2]) + np.mean(head_right[:, :, 2])) / 2.0 if (head_left.size > 0 and head_right.size > 0) else 0
    head_sides_s = float(np.mean(head_left[:, :, 1]) + np.mean(head_right[:, :, 1])) / 2.0 if (head_left.size > 0 and head_right.size > 0) else 0

    is_bare_neck_skin = (shayla_cloth_h <= 25 and shayla_cloth_s >= 45 and shayla_cloth_v >= 120)
    has_shayla_wrap = (
        not is_bare_neck_skin
        and abs(head_sides_v - shayla_cloth_v) < 45
        and abs(head_sides_s - shayla_cloth_s) < 30
    )

    lower_v_mean = float(np.mean(lower_v)) if lower.size > 0 else 0
    lower_s_mean = float(np.mean(lower_s)) if lower.size > 0 else 0
    torso_s_mean = float(np.mean(torso_s)) if torso.size > 0 else 0
    torso_v_mean = float(np.mean(torso_v)) if torso.size > 0 else 0

    v_diff = abs(torso_v_mean - lower_v_mean)
    s_diff = abs(torso_s_mean - lower_s_mean)
    is_continuous_robe = (v_diff < 55 and s_diff < 40)
    is_colored_casual = (torso_s_mean >= 55 and torso_v_mean >= 65 and v_diff > 25) or (v_diff >= 45)

    head_crop_top = img[:int(h * 0.25), :]
    has_agal = False
    dark_cord_ratio = 0.0
    if head_crop_top.size > 0:
        top_gray = cv2.cvtColor(head_crop_top, cv2.COLOR_BGR2GRAY)
        dark_cord_ratio = float(np.count_nonzero(top_gray < 55) / top_gray.size)
        if dark_cord_ratio > 0.20:
            has_agal = True

    res = clf.classify_crop(img)
    face_g, face_c = clf.detect_face_gender(img)

    print(f"[{i+1:02d}] {res['nationality'][:7]}/{res['attireType'][:6]} | dl_g={face_g}({face_c:.2f}) | black_r=({black_ratio_torso:.2f},{black_ratio_lower:.2f}) | white_r=({white_ratio_torso:.2f},{white_ratio_lower:.2f}) | tv={torso_v_mean:.0f},lv={lower_v_mean:.0f},vdiff={v_diff:.0f} | ts={torso_s_mean:.0f},ls={lower_s_mean:.0f} | shayla={has_shayla_wrap}(bare={is_bare_neck_skin}) | agal={has_agal}({dark_cord_ratio:.2f}) | casual={is_colored_casual}")
