"""Train and calibrate the UAE traditional attire classifier from authentic dataset photos.
Trains on:
  - uploads/training/emirati_female/Female_emiratis (24 authentic photos: black abayas, pastel/cream abayas, hijabs)
  - uploads/training/emirati_male/emirati_male_ (38 authentic photos: kanduras, ghutras, agals, bishts)
  - uploads/training/non_emirati (western & casual attire)
Saves:
  - models/attire_classifier_weights.npz
  - models/attire_classifier.json
"""

from __future__ import annotations

import json
import time
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

import cv2
import numpy as np
from detector.attire import AttireClassifier

DATASET_DIR = ROOT / "uploads" / "training"
MODELS_DIR = ROOT / "models"


def get_person_crop(img: np.ndarray, clf: AttireClassifier) -> np.ndarray:
    """If image is a full scene (>800px), extract the person crop anchored around face."""
    h, w = img.shape[:2]
    if max(h, w) <= 800:
        return img

    face_box, _ = clf.detect_face_and_gender(img)
    if face_box is not None:
        fx, fy, fw, fh = face_box
        px1 = max(0, fx - int(fw * 0.7))
        py1 = max(0, fy - int(fh * 0.4))
        px2 = min(w, fx + int(fw * 1.7))
        py2 = min(h, fy + int(fh * 4.0))
        crop = img[py1:py2, px1:px2]
        if crop.size > 0:
            return crop
    return img


def extract_features(crop: np.ndarray, clf: AttireClassifier) -> np.ndarray:
    """Extracts a 19-dimensional multimodal feature vector covering face, crown, cheeks, jaw, and body."""
    h, w = crop.shape[:2]
    fb, (dl_g, dl_c) = clf.detect_face_and_gender(crop)
    has_face = 1.0 if fb else 0.0
    dl_m = 1.0 if dl_g == "MALE" else 0.0
    dl_f = 1.0 if dl_g == "FEMALE" else 0.0
    conf = float(dl_c)

    if fb:
        fx, fy, fw, fh = fb
        crown = crop[max(0, fy - int(fh * 0.45)) : max(0, fy), max(0, fx - int(fw * 0.15)) : min(w, fx + int(fw * 1.15))]
        if crown.size > 10:
            chsv = cv2.cvtColor(crown, cv2.COLOR_BGR2HSV)
            c_v = float(np.mean(chsv[:, :, 2]))
            c_s = float(np.mean(chsv[:, :, 1]))
            c_blk = float(np.count_nonzero(chsv[:, :, 2] <= 70) / chsv[:, :, 2].size)
            c_wht = float(np.count_nonzero((chsv[:, :, 2] >= 140) & (chsv[:, :, 1] <= 60)) / chsv[:, :, 2].size)
        else:
            c_v, c_s, c_blk, c_wht = 128.0, 0.0, 0.0, 0.0

        left = crop[fy : min(h, fy + fh), max(0, fx - int(fw * 0.45)) : fx]
        right = crop[fy : min(h, fy + fh), min(w, fx + fw) : min(w, fx + fw + int(fw * 0.45))]
        l_std = float(cv2.meanStdDev(cv2.cvtColor(left, cv2.COLOR_BGR2GRAY))[1][0][0]) if left.size > 10 else 99.0
        r_std = float(cv2.meanStdDev(cv2.cvtColor(right, cv2.COLOR_BGR2GRAY))[1][0][0]) if right.size > 10 else 99.0
        chk_std = (l_std + r_std) / 2.0

        jaw = crop[fy + int(fh * 0.65) : fy + fh, fx + int(fw * 0.2) : fx + int(fw * 0.8)]
        jaw_t = float(cv2.meanStdDev(cv2.cvtColor(jaw, cv2.COLOR_BGR2GRAY))[1][0][0]) if jaw.size > 10 else 0.0

        neck = crop[min(h, fy + fh) : min(h, fy + int(fh * 1.35)), max(0, fx + int(fw * 0.2)) : min(w, fx + int(fw * 0.8))]
        neck_skin = 0.0
        if neck.size > 10:
            nhsv = cv2.cvtColor(neck, cv2.COLOR_BGR2HSV)
            skin = (((nhsv[:, :, 0] <= 25) | (nhsv[:, :, 0] >= 165)) & (nhsv[:, :, 1] >= 45) & (nhsv[:, :, 2] >= 75))
            neck_skin = float(np.count_nonzero(skin) / (nhsv.shape[0] * nhsv.shape[1]))

        body_y1 = min(h, fy + int(fh * 1.1))
        body_y2 = min(h, fy + int(fh * 4.5))
        if body_y2 <= body_y1:
            body_y2 = h
        center_body = crop[body_y1:body_y2, max(0, int(w * 0.25)) : min(w, int(w * 0.75))]
        if center_body.size == 0:
            center_body = crop[body_y1:body_y2, :]
    else:
        c_v, c_s, c_blk, c_wht = 128.0, 0.0, 0.0, 0.0
        chk_std, jaw_t, neck_skin = 99.0, 0.0, 0.0
        center_body = crop[int(h * 0.35) : int(h * 0.85), int(w * 0.25) : int(w * 0.75)]
        if center_body.size == 0:
            center_body = crop

    if center_body is None or center_body.size == 0 or center_body.shape[0] == 0 or center_body.shape[1] == 0:
        center_body = crop
    bhsv = cv2.cvtColor(center_body, cv2.COLOR_BGR2HSV)
    bv, bs = bhsv[:, :, 2], bhsv[:, :, 1]
    tot = float(bv.size)
    b_blk = float(np.count_nonzero(bv <= 70) / tot)
    b_wht = float(np.count_nonzero((bv >= 140) & (bs <= 60)) / tot)
    b_pst = float(np.count_nonzero((bv >= 80) & (bs <= 85)) / tot)
    b_mv = float(np.mean(bv))
    b_ms = float(np.mean(bs))

    mid = center_body.shape[0] // 2
    u_v = float(np.mean(bv[:mid, :])) if mid > 0 else b_mv
    l_v = float(np.mean(bv[mid:, :])) if mid > 0 else b_mv
    v_diff = abs(u_v - l_v)

    return np.array([
        has_face, dl_m, dl_f, conf,
        c_v / 255.0, c_s / 255.0, c_blk, c_wht,
        chk_std / 100.0, jaw_t / 100.0, neck_skin,
        b_blk, b_wht, b_pst, b_mv / 255.0, b_ms / 255.0, v_diff / 255.0,
        u_v / 255.0, l_v / 255.0
    ], dtype=np.float32)


def main():
    print("[trainer] starting advanced UAE attire & cultural identity classifier training...", flush=True)
    start_time = time.time()

    categories = {
        "emirati_female": 0,
        "emirati_male": 1,
        "non_emirati": 2,
    }

    cat_metadata = {
        "emirati_female": ("EMIRATI", "FEMALE", "abaya", "Classic Black Abayas, Modern Pastel/Earth-Tone Abayas, Shayla, and Hijab"),
        "emirati_male": ("EMIRATI", "MALE", "kandura", "White & Colored Kanduras, Ghutra headdress, Agal cord, Bisht formal wear"),
        "non_emirati": ("NON_EMIRATI", "UNKNOWN", "regular", "Regular Casual / Western Wear"),
    }

    clf = AttireClassifier()

    X = []
    y = []
    filenames = []
    category_counts = {}

    for cat, label_idx in categories.items():
        cat_path = DATASET_DIR / cat
        cat_path.mkdir(parents=True, exist_ok=True)
        img_files = sorted(
            list(cat_path.rglob("*.jpg")) +
            list(cat_path.rglob("*.jpeg")) +
            list(cat_path.rglob("*.png"))
        )
        category_counts[cat] = len(img_files)
        print(f"[trainer] processing '{cat}' ({len(img_files)} images, recursive)...", flush=True)

        for f in img_files:
            img = cv2.imread(str(f))
            if img is None:
                continue
            crop = get_person_crop(img, clf)
            feat = extract_features(crop, clf)
            X.append(feat)
            y.append(label_idx)
            filenames.append((cat, f.name))

    if not X:
        print("[trainer] ⚠ No samples found in uploads/training.", flush=True)
        return 1

    X = np.array(X, dtype=np.float32)
    y = np.array(y, dtype=np.int32)
    N, D = X.shape
    K = len(categories)
    H = 48

    print(f"[trainer] feature matrix: {N} samples, {D} dimensions. Training 2-layer neural network (H={H})...", flush=True)

    np.random.seed(101)
    W1 = np.random.randn(D, H).astype(np.float32) * np.sqrt(2.0 / D)
    b1 = np.zeros(H, dtype=np.float32)
    W2 = np.random.randn(H, K).astype(np.float32) * np.sqrt(2.0 / H)
    b2 = np.zeros(K, dtype=np.float32)

    Y = np.zeros((N, K), dtype=np.float32)
    for i in range(N):
        Y[i, y[i]] = 1.0

    class_counts = [int(np.sum(y == i)) for i in range(K)]
    weights = np.array([N / (K * max(1, c)) for c in class_counts], dtype=np.float32)
    sample_weights = weights[y][:, None]

    lr = 0.05
    for epoch in range(4000):
        h = np.maximum(0, X @ W1 + b1)
        logits = h @ W2 + b2
        exp_l = np.exp(logits - np.max(logits, axis=1, keepdims=True))
        probs = exp_l / np.sum(exp_l, axis=1, keepdims=True)

        dlogits = sample_weights * (probs - Y) / N
        dW2 = h.T @ dlogits
        db2 = np.sum(dlogits, axis=0)

        dh = dlogits @ W2.T
        dh[h <= 0] = 0.0
        dW1 = X.T @ dh
        db1 = np.sum(dh, axis=0)

        W1 -= lr * dW1
        b1 -= lr * db1
        W2 -= lr * dW2
        b2 -= lr * db2

    # Evaluate trained model
    h = np.maximum(0, X @ W1 + b1)
    logits = h @ W2 + b2
    preds = np.argmax(logits, axis=1)

    cat_accuracies = {}
    total_correct = 0
    cat_names = list(categories.keys())

    for cat, label_idx in categories.items():
        mask = (y == label_idx)
        c_correct = int(np.sum(preds[mask] == label_idx))
        c_total = int(np.sum(mask))
        acc_pct = round((c_correct / max(1, c_total)) * 100, 1)
        cat_accuracies[cat] = {
            "total": c_total,
            "correct": c_correct,
            "accuracy_pct": acc_pct,
        }
        total_correct += c_correct

    overall_acc = round((total_correct / N) * 100, 1)
    elapsed = round(time.time() - start_time, 2)

    # Save trained weights
    weights_path = MODELS_DIR / "attire_classifier_weights.npz"
    np.savez_compressed(
        str(weights_path),
        W1=W1,
        b1=b1,
        W2=W2,
        b2=b2,
        feature_dim=D,
        hidden_dim=H,
        classes=np.array(cat_names),
    )
    print(f"✔ Neural weights saved to {weights_path}", flush=True)

    metadata = {
        "model_name": "UAE Attire & Cultural Identity Classifier (Deep Neural Network)",
        "version": f"v3.{int(time.time())}",
        "architecture": "Deep 19-dim Multi-Modal Feature Vector + 48-Neuron ReLU Neural Network + Softmax",
        "trained_at": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "dataset_source": "Authentic UAE Emirati Female Dataset (Female_emiratis) + Authentic Male Dataset (emirati_male_) + Western Casual Sets",
        "weights_file": "attire_classifier_weights.npz",
        "total_training_samples": N,
        "samples_per_category": category_counts,
        "category_performance": cat_accuracies,
        "training_accuracy_pct": overall_acc,
        "training_duration_seconds": elapsed,
        "status": "ACTIVE_PRODUCTION",
    }

    meta_file = MODELS_DIR / "attire_classifier.json"
    meta_file.write_text(json.dumps(metadata, indent=2))
    print(f"✔ Metadata saved to {meta_file}", flush=True)

    print(f"\n=======================================================", flush=True)
    print(f"✔ MODEL TRAINING COMPLETE! Overall Accuracy: {overall_acc}%", flush=True)
    for cat, stat in cat_accuracies.items():
        print(f"   ★ {cat}: {stat['correct']}/{stat['total']} ({stat['accuracy_pct']}%)", flush=True)
    print(f"=======================================================\n", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
