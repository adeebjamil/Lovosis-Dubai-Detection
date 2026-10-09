from __future__ import annotations

import os
import threading
import time
import cv2
import numpy as np

# Suppress verbose FFmpeg HEVC/H.265 decoder warnings to stderr
os.environ["OPENCV_FFMPEG_LOGLEVEL"] = "-8"
os.environ["OPENCV_LOG_LEVEL"] = "OFF"


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
        # Configure robust TCP transport and low-delay flags for H.264 & HEVC/H.265
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay"

        while self._running:
            cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            if not cap.isOpened():
                self._connected = False
                time.sleep(self.reconnect_delay)
                continue

            self._connected = True

            while self._running:
                # Read next frame sequentially. Sequential reading ensures FFmpeg's HEVC
                # Decoded Picture Buffer (DPB) never drops intermediate reference frames (POC),
                # completely eliminating "Could not find ref with POC 0" decoder errors.
                ret, frame = cap.read()
                if not ret or frame is None:
                    break

                # Reject blank/grey frames emitted during initial camera keyframe handshake
                if float(np.std(frame[:80, :80])) < 3.0:
                    continue

                with self._lock:
                    self._latest_frame = frame

            cap.release()
            self._connected = False
            time.sleep(self.reconnect_delay)
