"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleNotch, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { api, apiErrorMessage } from "@/lib/api";

type PlayerState = { phase: "connecting" } | { phase: "playing" } | { phase: "retrying"; message: string };

const RETRY_MS = 5_000;
const ICE_GATHER_MS = 2_000;

function waitIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    const timer = setTimeout(done, ICE_GATHER_MS);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

/**
 * Low-latency live video via WebRTC (WHEP) through the authenticated API proxy.
 * Signalling: POST /api/streams/:id/whep (SDP offer → answer). Media: UDP direct from MediaMTX.
 * Auto-reconnects every 5 s on failure.
 */
export default function WebRtcPlayer({ cameraId, label }: { cameraId: string; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<PlayerState>({ phase: "connecting" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let closed = false;
    let sessionId: string | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const pc = new RTCPeerConnection({ iceServers: [] }); // LAN only — no STUN/TURN

    const retry = (message: string) => {
      if (closed || retryTimer) return;
      setState({ phase: "retrying", message });
      retryTimer = setTimeout(() => setAttempt((a) => a + 1), RETRY_MS);
    };

    pc.addTransceiver("video", { direction: "recvonly" });
    pc.ontrack = (ev) => {
      const video = videoRef.current;
      if (video && ev.track.kind === "video") {
        video.srcObject = ev.streams[0] ?? new MediaStream([ev.track]);
        video.play().catch(() => undefined);

        // Request lowest possible jitter buffer delay from browser
        try {
          const receivers = pc.getReceivers();
          receivers.forEach((r) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyR = r as any;
            if ("playoutDelayHint" in anyR) anyR.playoutDelayHint = 0;
            if ("jitterBufferTarget" in anyR) anyR.jitterBufferTarget = 0;
          });
        } catch {
          // ignore unsupported browser hint
        }
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setState({ phase: "playing" });
      else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") retry("Connection lost — reconnecting…");
    };

    // Auto catch-up interval: if video element falls behind the WebRTC live edge by > 0.3s,
    // immediately fast-forward it to the real-time frame
    const catchupTimer = setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused && video.buffered.length > 0) {
        const liveEnd = video.buffered.end(video.buffered.length - 1);
        if (liveEnd - video.currentTime > 0.35) {
          video.currentTime = Math.max(0, liveEnd - 0.04);
        }
      }
    }, 1000);

    (async () => {
      await pc.setLocalDescription(await pc.createOffer());
      await waitIceGathering(pc);
      if (closed) return;
      const { data } = await api.post<{ data: { answer: string; sessionId: string | null } }>(
        `/streams/${cameraId}/whep`,
        pc.localDescription?.sdp,
        { headers: { "content-type": "application/sdp" } },
      );
      sessionId = data.data.sessionId;
      if (closed) return;
      await pc.setRemoteDescription({ type: "answer", sdp: data.data.answer });
    })().catch((e) => retry(apiErrorMessage(e, "Stream unavailable — retrying…")));

    return () => {
      closed = true;
      clearTimeout(retryTimer);
      clearInterval(catchupTimer);
      pc.close();
      if (sessionId) api.delete(`/streams/${cameraId}/whep/${sessionId}`).catch(() => undefined);
    };
  }, [cameraId, attempt]);

  return (
    <>
      <video ref={videoRef} autoPlay muted playsInline aria-label={`Live video: ${label}`} />
      {state.phase !== "playing" && (
        <div className="live-tile-center">
          {state.phase === "connecting" ? (
            <><FontAwesomeIcon icon={faCircleNotch} spin className="text-xl" /> Connecting…</>
          ) : (
            <><FontAwesomeIcon icon={faTriangleExclamation} className="text-xl text-warning" /> {state.message}</>
          )}
        </div>
      )}
    </>
  );
}
