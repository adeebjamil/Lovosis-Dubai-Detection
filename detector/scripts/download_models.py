"""Download the pretrained, licence-clean models used by the detector into /models.

    python detector/scripts/download_models.py

- YOLOX-s (COCO, Apache-2.0)  — person / dog / cat detection
- YuNet 2023mar (MIT)         — face detection for the gender model

Writes /models/manifest.json with size + SHA-256 for each file (verify on later runs).
"""

from __future__ import annotations

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "models"

FILES = {
    "yolox_m.onnx": {
        "url": "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_m.onnx",
        "license": "Apache-2.0 (Megvii YOLOX)",
        "task": "DETECTOR",
    },
    "yolox_s.onnx": {
        "url": "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx",
        "license": "Apache-2.0 (Megvii YOLOX)",
        "task": "DETECTOR",
    },
    "face_detection_yunet_2023mar.onnx": {
        "url": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "license": "MIT (OpenCV Zoo YuNet)",
        "task": "FACE",
    },
    "genderage.onnx": {
        "url": "https://huggingface.co/lithiumice/insightface/resolve/main/models/buffalo_l/genderage.onnx",
        "license": "MIT (InsightFace buffalo_l)",
        "task": "GENDER_AGE",
    },
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    MODELS.mkdir(exist_ok=True)
    manifest_path = MODELS / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    for name, meta in FILES.items():
        dest = MODELS / name
        if not dest.exists():
            print(f"↓ {name}")
            tmp = dest.with_suffix(".part")
            req = urllib.request.Request(meta["url"], headers={"User-Agent": "lovosis-detection/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r, tmp.open("wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            tmp.replace(dest)

        digest = sha256(dest)
        known = manifest.get(name, {}).get("sha256")
        if known and known != digest:
            print(f"✖ {name}: SHA-256 mismatch (expected {known}, got {digest})")
            return 1
        manifest[name] = {**meta, "sha256": digest, "bytes": dest.stat().st_size}
        print(f"✔ {name}  {dest.stat().st_size / 1e6:.1f} MB  sha256={digest[:16]}…")

    manifest_path.write_text(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
