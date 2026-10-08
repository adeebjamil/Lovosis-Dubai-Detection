import cv2
import numpy as np

def detect_attire_and_nationality(crop_bgr: np.ndarray) -> dict:
    h, w = crop_bgr.shape[:2]
    if h < 40 or w < 20:
        return {
            "nationality": "UNKNOWN",
            "nationalityConfidence": 0.0,
            "gender": "UNKNOWN",
            "genderConfidence": 0.0,
            "attireType": "unknown",
        }

    hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
    v_chan = hsv[:, :, 2]
    s_chan = hsv[:, :, 1]

    # 1. Head & Neck Region (top 5% to 35% of height)
    head_y1, head_y2 = int(h * 0.05), int(h * 0.35)
    neck_y1, neck_y2 = int(h * 0.18), int(h * 0.38)
    head_crop = crop_bgr[head_y1:head_y2, int(w * 0.15):int(w * 0.85)]
    hsv_head = hsv[head_y1:head_y2, int(w * 0.15):int(w * 0.85)]

    # 2. Torso & Lower Body
    mid_y = int(h * 0.50)
    torso = hsv[int(h * 0.30):mid_y, int(w * 0.15):int(w * 0.85)]
    lower = hsv[mid_y:int(h * 0.90), int(w * 0.15):int(w * 0.85)]

    torso_v = torso[:, :, 2]
    torso_s = torso[:, :, 1]
    lower_v = lower[:, :, 2]
    lower_s = lower[:, :, 1]

    total_lower_px = float(lower.shape[0] * lower.shape[1] + 1e-5)
    total_torso_px = float(torso.shape[0] * torso.shape[1] + 1e-5)

    # Metrics
    white_mask_torso = (torso_v >= 165) & (torso_s <= 55)
    white_mask_lower = (lower_v >= 165) & (lower_s <= 55)
    white_ratio_torso = np.count_nonzero(white_mask_torso) / total_torso_px
    white_ratio_lower = np.count_nonzero(white_mask_lower) / total_lower_px

    black_mask_torso = (torso_v <= 65)
    black_mask_lower = (lower_v <= 65)
    black_ratio_torso = np.count_nonzero(black_mask_torso) / total_torso_px
    black_ratio_lower = np.count_nonzero(black_mask_lower) / total_lower_px

    # --- SHAYLA / HIJAB DETECTION ---
    # Check if fabric covers head sides & neck (headscarf framing face)
    # Headscarf fabric typically has consistent hue and low-medium saturation across forehead, sides, and neck drape
    head_left = hsv[int(h * 0.08):int(h * 0.30), :int(w * 0.30)]
    head_right = hsv[int(h * 0.08):int(h * 0.30), int(w * 0.70):]
    neck_center = hsv[neck_y1:neck_y2, int(w * 0.30):int(w * 0.70)]

    # In western women, neck center has skin color (Hue 0-25, Saturation 35-130, bright V) or shirt collar
    # In hijab/shayla, neck center is covered by cloth (either black, beige, pastel, or dark)
    # Also check if headscarf drapes over shoulders/chest
    shayla_cloth_v = np.mean(neck_center[:, :, 2])
    shayla_cloth_s = np.mean(neck_center[:, :, 1])
    head_sides_v = (np.mean(head_left[:, :, 2]) + np.mean(head_right[:, :, 2])) / 2.0
    head_sides_s = (np.mean(head_left[:, :, 1]) + np.mean(head_right[:, :, 1])) / 2.0

    # Shayla score: cloth covering sides of head + neck area
    has_shayla_wrap = abs(head_sides_v - shayla_cloth_v) < 45 and abs(head_sides_s - shayla_cloth_s) < 30

    # --- LOWER ROBE (ABAYA / KANDURA) MONOCHROME CONTINUITY ---
    # In a gown/robe (Abaya/Kandura), the lower half is a single solid color with low color variance and no two-piece pants divide
    lower_s_mean = np.mean(lower_s)
    lower_v_mean = np.mean(lower_v)
    lower_std = np.std(lower_v)
    
    # Check if lower garment is an earth-tone or dark abaya:
    # Abayas are typically: Black (V < 75), Dark Charcoal/Navy (V < 95), or Earth tone (Taupe, Olive, Mocha, Sage: V < 145, S < 60)
    is_dark_or_earth_robe = (lower_v_mean <= 145 and lower_s_mean <= 65 and lower_std < 55)

    print(f"Debug:")
    print(f"  White torso: {white_ratio_torso:.2f}, lower: {white_ratio_lower:.2f}")
    print(f"  Black torso: {black_ratio_torso:.2f}, lower: {black_ratio_lower:.2f}")
    print(f"  Has shayla wrap: {has_shayla_wrap} (head sides V: {head_sides_v:.1f}, neck V: {shayla_cloth_v:.1f})")
    print(f"  Lower robe: V={lower_v_mean:.1f}, S={lower_s_mean:.1f}, std={lower_std:.1f}, is_earth_robe={is_dark_or_earth_robe}")

    # RULE 1: Kandura (White continuous robe) -> Emirati Male
    if white_ratio_torso >= 0.40 and white_ratio_lower >= 0.40:
        conf = min(0.98, float(0.65 + (white_ratio_torso + white_ratio_lower) * 0.20))
        return {
            "nationality": "EMIRATI",
            "nationalityConfidence": round(conf, 2),
            "gender": "MALE",
            "genderConfidence": round(conf, 2),
            "attireType": "kandura",
        }

    # RULE 2: Classic Black Abaya -> Emirati Female
    if (black_ratio_torso >= 0.40 and black_ratio_lower >= 0.45) or (black_ratio_lower >= 0.60):
        conf = min(0.98, float(0.70 + (black_ratio_torso + black_ratio_lower) * 0.20))
        return {
            "nationality": "EMIRATI",
            "nationalityConfidence": round(conf, 2),
            "gender": "FEMALE",
            "genderConfidence": round(conf, 2),
            "attireType": "abaya",
        }

    # RULE 3: Modern UAE Colored/Earth-tone Abaya with Shayla (or flowing dark/earth robe with headscarf)
    if (has_shayla_wrap and is_dark_or_earth_robe) or (has_shayla_wrap and lower_v_mean < 155 and lower_s_mean < 70):
        conf = 0.92
        return {
            "nationality": "EMIRATI",
            "nationalityConfidence": conf,
            "gender": "FEMALE",
            "genderConfidence": 0.95,
            "attireType": "abaya",
        }

    # Fallback to Non-Emirati (Regular / Western)
    # Perform gender estimation
    neck_margin_left = crop_bgr[int(h * 0.15):int(h * 0.28), :max(1, int(w * 0.22))]
    neck_margin_right = crop_bgr[int(h * 0.15):int(h * 0.28), int(w * 0.78):]
    hair_pixels = 0
    total_margin_pixels = 1
    if neck_margin_left.size > 0 and neck_margin_right.size > 0:
        hair_pixels = int((cv2.cvtColor(neck_margin_left, cv2.COLOR_BGR2GRAY) < 75).sum()) + \
                      int((cv2.cvtColor(neck_margin_right, cv2.COLOR_BGR2GRAY) < 75).sum())
        total_margin_pixels = max(1, (neck_margin_left.size + neck_margin_right.size) // 3)

    hair_ratio = float(hair_pixels / total_margin_pixels)
    chest_crop = gray[int(h * 0.25):int(h * 0.35), :]
    waist_crop = gray[int(h * 0.45):int(h * 0.55), :]
    chest_w = int(np.count_nonzero(chest_crop < 240)) if chest_crop.size > 0 else 0
    waist_w = int(np.count_nonzero(waist_crop < 240)) if waist_crop.size > 0 else 0
    ratio = (chest_w / max(1, waist_w)) if waist_w > 0 else 1.0

    est_gender = "FEMALE" if (hair_ratio >= 0.32 or ratio < 1.06) else "MALE"
    return {
        "nationality": "NON_EMIRATI",
        "nationalityConfidence": 0.88,
        "gender": est_gender,
        "genderConfidence": 0.85,
        "attireType": "regular",
    }

# Test on user image
user_img = cv2.imread(r'C:\Users\Adeeb\.gemini\antigravity-ide\brain\359c4fab-04a7-445f-9ae3-1a0f06ed28a6\.user_uploaded\media_1791381680395.png')
print("USER IMAGE RESULT:")
print(detect_attire_and_nationality(user_img))

# Test on kandura image
kandura_img = cv2.imread('uploads/training/emirati_male/kandura_ghutra_1.jpg')
print("\nKANDURA IMAGE RESULT:")
print(detect_attire_and_nationality(kandura_img))
