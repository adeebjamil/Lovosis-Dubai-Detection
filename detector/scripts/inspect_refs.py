import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np

def inspect(name, p):
    img = cv2.imread(str(p))
    if img is None: return
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    v = hsv[:, :, 2]
    s = hsv[:, :, 1]
    h_c = hsv[:, :, 0]
    print(f"{name} ({w}x{h}): mean_V={np.mean(v):.1f}, mean_S={np.mean(s):.1f}, black_px={np.count_nonzero(v<65)/(h*w):.2f}, white_px={np.count_nonzero((v>150)&(s<70))/(h*w):.2f}")

inspect("non_emirati/casual_western_2", ROOT / "uploads/training/non_emirati/casual_western_2.jpg")
inspect("emirati_male/kandura_ghutra_2", ROOT / "uploads/training/emirati_male/kandura_ghutra_2.jpg")
inspect("emirati_male/kandura_ghutra_3", ROOT / "uploads/training/emirati_male/kandura_ghutra_3.jpg")
inspect("emirati_female/abaya_shayla_2", ROOT / "uploads/training/emirati_female/abaya_shayla_2.jpg")
