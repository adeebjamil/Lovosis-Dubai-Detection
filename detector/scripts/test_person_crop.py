import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
from detector.scripts.test_calibrated import clf

img = cv2.imread("uploads/training/emirati_male/kandura_ghutra_1.jpg")
h, w = img.shape[:2]
fx, fy, fw, fh = 787, 407, 560, 779

px1 = max(0, fx - int(fw * 0.5))
py1 = max(0, fy - int(fh * 0.4))
px2 = min(w, fx + int(fw * 1.5))
py2 = min(h, fy + int(fh * 3.5))

person_crop = img[py1:py2, px1:px2]
print("Person crop shape:", person_crop.shape)
res = clf.classify_crop(person_crop)
print("Person crop classification:", res)
