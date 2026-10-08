from __future__ import annotations

import cv2
import numpy as np
import onnxruntime as ort
from pathlib import Path


COCO_CLASSES = {
    0: "PERSON",
    15: "CAT",
    16: "DOG",
}


def nms(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float, containment_threshold: float = 0.60) -> list[int]:
    """Pure numpy fast NMS with Part-in-Whole (nested limb/fragment) suppression."""
    if len(boxes) == 0:
        return []

    areas = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    order = scores.argsort()[::-1]
    keep = []

    while order.size > 0:
        i = order[0]
        box_i = boxes[i]
        area_i = areas[i]

        rem = order[1:]
        if len(rem) == 0:
            keep.append(int(i))
            break

        boxes_rem = boxes[rem]
        areas_rem = areas[rem]

        xx1 = np.maximum(box_i[0], boxes_rem[:, 0])
        yy1 = np.maximum(box_i[1], boxes_rem[:, 1])
        xx2 = np.minimum(box_i[2], boxes_rem[:, 2])
        yy2 = np.minimum(box_i[3], boxes_rem[:, 3])

        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        inter = w * h

        iou = inter / (area_i + areas_rem - inter + 1e-6)
        in_i = inter / (areas_rem + 1e-6)      # fraction of rem inside i
        in_rem = inter / (area_i + 1e-6)     # fraction of i inside rem

        # If box i is a small fragment inside a larger remaining body, prefer the whole body
        is_subpart = (in_rem > 0.70) & (area_i < areas_rem * 0.55)
        if np.any(is_subpart):
            order = rem
            continue

        keep.append(int(i))
        # Suppress any remaining box that either has high IoU or is a subpart/limb inside box i
        valid = (iou <= iou_threshold) & (in_i <= containment_threshold)
        order = rem[valid]

    return keep


class YoloXDetector:
    def __init__(self, model_path: str | Path, conf_threshold: float = 0.35, nms_threshold: float = 0.45):
        self.model_path = str(model_path)
        self.conf_threshold = conf_threshold
        self.nms_threshold = nms_threshold

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        # Try CUDA first, fall back to CPU silently
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        self.session = ort.InferenceSession(self.model_path, opts, providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name
        self.input_size = (640, 640)

        # Precompute YOLOX grids and strides for 640x640 input
        strides = [8, 16, 32]
        grids = []
        expanded_strides = []
        for stride in strides:
            hsize = 640 // stride
            wsize = 640 // stride
            xv, yv = np.meshgrid(np.arange(wsize), np.arange(hsize))
            grid = np.stack((xv, yv), 2).reshape(1, -1, 2)
            grids.append(grid)
            shape = grid.shape[:2]
            expanded_strides.append(np.full((*shape, 1), stride, dtype=np.float32))
        self.grids = np.concatenate(grids, 1).astype(np.float32)
        self.expanded_strides = np.concatenate(expanded_strides, 1).astype(np.float32)

    def preprocess(self, img: np.ndarray) -> tuple[np.ndarray, float]:
        """Pads and resizes image to 640x640 with aspect ratio preserved."""
        h, w = img.shape[:2]
        target_w, target_h = self.input_size
        scale = min(target_w / w, target_h / h)
        nw, nh = int(w * scale), int(h * scale)

        resized = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LINEAR)
        canvas = np.full((target_h, target_w, 3), 114, dtype=np.uint8)
        canvas[:nh, :nw] = resized

        # YOLOX expects float32 BGR [1, 3, 640, 640]
        blob = canvas.transpose((2, 0, 1)).astype(np.float32)
        blob = np.ascontiguousarray(blob[None, ...])
        return blob, scale

    def detect(self, img: np.ndarray) -> list[dict]:
        """Runs detection on a BGR image.
        Returns list of dicts:
            { 'class': 'PERSON'|'DOG'|'CAT', 'confidence': float, 'box': [x1, y1, x2, y2], 'norm_box': [x1, y1, x2, y2] }
        """
        img_h, img_w = img.shape[:2]
        blob, scale = self.preprocess(img)

        outputs = self.session.run([self.output_name], {self.input_name: blob})[0]

        # Decode YOLOX raw grid offsets and scale log-dimensions
        outputs[..., :2] = (outputs[..., :2] + self.grids) * self.expanded_strides
        outputs[..., 2:4] = np.exp(outputs[..., 2:4]) * self.expanded_strides

        predictions = outputs[0]  # shape: [8400, 85]

        boxes = predictions[:, :4]
        obj_scores = predictions[:, 4]
        class_scores = predictions[:, 5:]

        # Filter candidates by objectness first
        mask = obj_scores > self.conf_threshold
        if not np.any(mask):
            return []

        boxes = boxes[mask]
        obj_scores = obj_scores[mask]
        class_scores = class_scores[mask]

        results = []
        for coco_id, class_name in COCO_CLASSES.items():
            scores = obj_scores * class_scores[:, coco_id]
            cls_mask = scores >= self.conf_threshold
            if not np.any(cls_mask):
                continue

            cls_boxes = boxes[cls_mask]
            cls_scores = scores[cls_mask]

            # Convert from [cx, cy, w, h] to [x1, y1, x2, y2] in original image coordinates
            cx = cls_boxes[:, 0] / scale
            cy = cls_boxes[:, 1] / scale
            w = cls_boxes[:, 2] / scale
            h = cls_boxes[:, 3] / scale

            x1 = np.clip(cx - w / 2, 0, img_w)
            y1 = np.clip(cy - h / 2, 0, img_h)
            x2 = np.clip(cx + w / 2, 0, img_w)
            y2 = np.clip(cy + h / 2, 0, img_h)
            xyxy = np.stack([x1, y1, x2, y2], axis=1)

            keep = nms(xyxy, cls_scores, self.nms_threshold)
            for idx in keep:
                b = xyxy[idx]
                results.append({
                    "class": class_name,
                    "confidence": float(cls_scores[idx]),
                    "box": [float(b[0]), float(b[1]), float(b[2]), float(b[3])],
                    "norm_box": [
                        float(b[0] / img_w),
                        float(b[1] / img_h),
                        float(b[2] / img_w),
                        float(b[3] / img_h),
                    ],
                })

        return results
