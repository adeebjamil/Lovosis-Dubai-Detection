import cv2
import numpy as np

img = cv2.imread("uploads/training/emirati_male/kandura_ghutra_1.jpg")
fx, fy, fw, fh = 787, 407, 560, 779

# Crown region above forehead
crown = img[max(0, fy - int(fh*0.45)):fy, max(0, fx-int(fw*0.1)):min(img.shape[1], fx+int(fw*1.1))]
cg = cv2.cvtColor(crown, cv2.COLOR_BGR2GRAY)

print("Male Agal patch shape:", crown.shape)
# Look at horizontal row profiles
row_means = np.mean(cg, axis=1)
for r in range(0, len(row_means), max(1, len(row_means)//10)):
    print(f"row {r:02d}: mean={row_means[r]:.1f}, min={np.min(cg[r]):.1f}")
