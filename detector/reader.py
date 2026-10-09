from __future__ import annotations

import os
import threading
import time
import cv2
import numpy as np


class RtspReader:
    """Threaded RTSP frame reader that always delivers the latest frame (zero latency)."""

    def __init__(self, rtsp_url: str, reconnect_delay: float = 2.0):
        self.rtsp_url = rtsp_url
        self.reconnect_delay = reconnect_delay

        self._lock = threading.Lock()
        self._latest_frame: np.ndarray | None = None
        self._running = False
        self._thread: threading.Thread | None = None
        self._connected = False

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)
        self._thread = None

    @property
    def is_connected(self) -> bool:
        return self._connected

    def get_latest_frame(self) -> np.ndarray | None:
        with self._lock:
            if self._latest_frame is None:
                return None
            return self._latest_frame.copy()

    def _worker(self):
        # Reliable TCP transport for both H.264 and H.265 (HEVC) IP streams
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"

        while self._running:
            cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            if not cap.isOpened():
                self._connected = False
                time.sleep(self.reconnect_delay)
                continue

            self._connected = True
            last_decode_time = 0.0

            while self._running:
                # 1. Grab incoming frame packet immediately (consumes from socket, ~0.05ms)
                # This ensures the internal ffmpeg queue NEVER accumulates stale frames!
                if not cap.grab():
                    break

                now = time.time()
                # 2. Decode at ~20-25 FPS to deliver ultra-low latency frames
                if now - last_decode_time >= 0.04:
                    try:
                        ret, frame = cap.retrieve()
                        if not ret or frame is None:
                            break
                        # Reject dummy blank/grey frames (emitted during HEVC/H.265 keyframe sync)
                        if float(np.std(frame[:80, :80])) < 3.0:
                            continue
                        with self._lock:
                            self._latest_frame = frame
                        last_decode_time = now
                    except Exception as err:
                        # Corrupted or incomplete frame over WAN; skip to next packet
                        continue

            cap.release()
            self._connected = False
            time.sleep(self.reconnect_delay)
