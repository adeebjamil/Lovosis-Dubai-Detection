import cv2
from pathlib import Path

ROOT = Path(".")
non_dir = ROOT / "uploads/training/non_emirati"

# Crop clean casual persons
img2 = cv2.imread(str(non_dir / "casual_western_2.jpg"))
if img2 is not None:
    # Woman in casual red/colored jacket
    c2 = img2[780:1280, 720:960]
    cv2.imwrite(str(non_dir / "casual_person_female_1.jpg"), c2)
    print("Saved casual_person_female_1.jpg", c2.shape)

img1 = cv2.imread(str(non_dir / "casual_western_1.jpg"))
if img1 is not None:
    # Man in casual shirt
    c1 = img1[1300:1750, 2240:2420]
    cv2.imwrite(str(non_dir / "casual_person_male_1.jpg"), c1)
    print("Saved casual_person_male_1.jpg", c1.shape)
