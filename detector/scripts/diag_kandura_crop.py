import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
from detector.scripts.test_calibrated import clf

img = cv2.imread("uploads/training/emirati_male/kandura_ghutra_1.jpg")
h, w = img.shape[:2]
fx, fy, fw, fh = 787, 407, 560, 779
px1 = max(0, fx - int(fw * 0.5))
py1 = max(0, fy - int(fh * 0.4))
px2 = min(w, fx + int(fw * 1.5))
py2 = min(h, fy + int(fh * 3.5))
crop = img[py1:py2, px1:px2]

face_box, (dl_g, dl_c) = clf.detect_face(crop)
print("Crop shape:", crop.shape)
print("Face:", face_box, dl_g, dl_c)

ch, cw = crop.shape[:2]
cfx, cfy, cfw, cfh = face_box

crown_y1 = max(0, cfy - int(cfh * 0.45))
crown_y2 = max(0, cfy)
crown_x1 = max(0, cfx - int(cfw * 0.15))
crown_x2 = min(cw, cfx + int(cfw * 1.15))
crown = crop[crown_y1:crown_y2, crown_x1:crown_x2]
cg = cv2.cvtColor(crown, cv2.COLOR_BGR2GRAY)
c_dark = np.count_nonzero(cg < 55) / float(cg.size)
c_light = np.count_nonzero(cg > 135) / float(cg.size)
print("Crown dark:", c_dark, "light:", c_light)

body_y1 = min(ch, cfy + int(cfh * 1.1))
body_y2 = min(ch, cfy + int(cfh * 4.5))
body = crop[body_y1:body_y2, max(0, int(cw*0.1)):min(cw, int(cw*0.9))]
bhsv = cv2.cvtColor(body, cv2.COLOR_BGR2HSV)
bv = bhsv[:,:,2]
bs = bhsv[:,:,1]
tot = float(body.shape[0]*body.shape[1])
print("Body white:", np.count_nonzero((bv>=140)&(bs<=60))/tot, "black:", np.count_nonzero(bv<=70)/tot, "mean_v:", np.mean(bv), "mean_s:", np.mean(bs))
