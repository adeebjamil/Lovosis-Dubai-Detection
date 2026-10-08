import cv2
from pathlib import Path
from detector.attire import AttireClassifier

clf = AttireClassifier()
p = Path("uploads/training/emirati_female/Female_emiratis")
images = sorted(list(p.glob("*.*")))
print(f"Total images in Female_emiratis: {len(images)}")

for img_p in images:
    img = cv2.imread(str(img_p))
    if img is None:
        continue
    res = clf.classify_crop(img)
    face_g, face_c = clf.detect_face_gender(img)
    print(f"{img_p.name[:28]} -> Nat: {res['nationality']} ({res['nationalityConfidence']:.2f}) | Gender: {res['gender']} ({res['genderConfidence']:.2f}) | Attire: {res['attireType']} | DL_Face: {face_g} ({face_c})")
