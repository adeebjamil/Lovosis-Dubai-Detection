from __future__ import annotations

import os
import sys
import time
import threading
from pathlib import Path
import socketio

from detector.yolox import YoloXDetector
from detector.attire import AttireClassifier
from detector.camera_worker import CameraWorker

ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT / "models"


class DetectorService:
    def __init__(self, backend_url: str = "http://localhost:5000", token: str = "lovosis-detector-local-secret-32ch"):
        self.backend_url = backend_url
        self.token = token
        self.sio = socketio.Client(reconnection=True, reconnection_delay=2)

        # Shared models (Prefer YOLOX-M for higher precision bounding boxes, fallback to YOLOX-S)
        yolox_model = MODELS_DIR / "yolox_m.onnx"
        if not yolox_model.exists():
            yolox_model = MODELS_DIR / "yolox_s.onnx"
        if not yolox_model.exists():
            raise FileNotFoundError(f"No YOLOX model found in {MODELS_DIR}. Please run download_models.py first.")

        print(f"[detector] loading YOLOX model from {yolox_model}...")
        self.detector = YoloXDetector(yolox_model)
        self.attire = AttireClassifier()

        self.workers: dict[str, CameraWorker] = {}
        self.workers_lock = threading.Lock()
        self.running = False
        self._loop_thread: threading.Thread | None = None

        self._setup_socket_events()

    def _setup_socket_events(self):
        @self.sio.on("connect", namespace="/detector")
        def on_connect():
            print("[detector] successfully connected to backend /detector namespace")

        @self.sio.on("disconnect", namespace="/detector")
        def on_disconnect():
            print("[detector] disconnected from backend, will auto-reconnect...")

        @self.sio.on("config:cameras", namespace="/detector")
        def on_config(cameras: list[dict]):
            print(f"[detector] received camera config updates: {len(cameras)} cameras")
            self._sync_cameras(cameras)

        @self.sio.on("reset:analytics", namespace="/detector")
        def on_reset_analytics():
            print("[detector] received reset:analytics command from backend")
            with self.workers_lock:
                for worker in self.workers.values():
                    worker.reset_counts()

    def _sync_cameras(self, camera_configs: list[dict]):
        active_ids = set()
        with self.workers_lock:
            for cfg in camera_configs:
                cid = cfg["id"]
                active_ids.add(cid)
                if cid in self.workers:
                    self.workers[cid].update_config(cfg)
                else:
                    worker = CameraWorker(cfg, self.detector, self.attire)
                    worker.start()
                    self.workers[cid] = worker
                    print(f"[detector] started worker for {cfg['code']} ({cfg['name']}) -> {cfg['localRtspUrl']}")

            # Stop removed cameras
            to_remove = [cid for cid in self.workers if cid not in active_ids]
            for cid in to_remove:
                print(f"[detector] stopping worker for camera {cid}")
                self.workers[cid].stop()
                del self.workers[cid]

    def start(self):
        self.running = True
        try:
            print(f"[detector] connecting to backend at {self.backend_url}/detector...")
            self.sio.connect(
                self.backend_url,
                namespaces=["/detector"],
                auth={"token": self.token},
                wait_timeout=10,
            )
        except Exception as e:
            print(f"[detector] initial connection warning: {e}. Will retry in background.")

        self._loop_thread = threading.Thread(target=self._inference_loop, daemon=True)
        self._loop_thread.start()

    def stop(self):
        self.running = False
        with self.workers_lock:
            for w in self.workers.values():
                w.stop()
            self.workers.clear()
        if self.sio.connected:
            self.sio.disconnect()

    def _inference_loop(self):
        target_interval = 0.05  # target ~20 FPS loop rate
        while self.running:
            t0 = time.time()
            with self.workers_lock:
                workers_snapshot = list(self.workers.values())

            for worker in workers_snapshot:
                if not self.running:
                    break
                try:
                    live_payload, finished_tracks = worker.process_frame()
                    if live_payload and self.sio.connected:
                        self.sio.emit("detections:frame", live_payload, namespace="/detector")

                    for tr in finished_tracks:
                        if self.sio.connected:
                            self.sio.emit("detections:track_finished", tr, namespace="/detector")
                except Exception as e:
                    print(f"[detector] error processing frame for {worker.code}: {e}")

            elapsed = time.time() - t0
            sleep_needed = max(0.005, target_interval - elapsed)
            time.sleep(sleep_needed)


def run():
    token = os.environ.get("DETECTOR_SECRET", "lovosis-detector-local-secret-32ch")
    backend_url = os.environ.get("BACKEND_URL", "http://localhost:5000")

    service = DetectorService(backend_url=backend_url, token=token)
    service.start()

    print("[detector] service started. Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("[detector] shutting down...")
        service.stop()


if __name__ == "__main__":
    run()
