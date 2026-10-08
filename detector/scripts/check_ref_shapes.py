import cv2
import numpy as np
from pathlib import Path

ROOT = Path(".")
for name, p in [
    ("kandura_1", ROOT / "uploads/training/emirati_male/kandura_ghutra_1.jpg"),
    ("casual_1", ROOT / "uploads/training/non_emirati/casual_western_1.jpg"),
]:
    img = cv2.imread(str(p))
    print(name, "shape:", img.shape)
