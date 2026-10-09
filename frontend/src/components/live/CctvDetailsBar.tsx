"use client";

import { useEffect, useState } from "react";
import { acquireSocket, releaseSocket } from "@/lib/socket";
import { camerasApi, detectStreamProfile, type Camera, type LiveFramePayload } from "@/lib/cameras";
import { toast } from "@/store/toast";

interface CctvDetailsBarProps {
  camera: Camera;
  className?: string;
}

export default function CctvDetailsBar({ camera, className = "" }: CctvDetailsBarProps) {
  const [counts, setCounts] = useState({
    persons: 0,
    male: 0,
    female: 0,
    emirati: 0,
    nonEmirati: 0,
    pets: 0,
    dogs: 0,
    cats: 0,
  });
  const [switching, setSwitching] = useState(false);
  const profile = detectStreamProfile(camera.rtspUrl, camera.height);

  const handleToggleStream = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (switching) return;
    setSwitching(true);
    try {
      const target = profile === "MAINSTREAM" ? "SUBSTREAM" : "MAINSTREAM";
      const res = await camerasApi.switchStream(camera.id, target);
      toast.success(res.message);
    } catch {
      toast.error("Could not switch stream profile for this camera");
    } finally {
      setSwitching(false);
    }
  };

  useEffect(() => {
    const socket = acquireSocket();
    const handleDetection = (payload: LiveFramePayload) => {
      if (payload.cameraId === camera.id && payload.counts?.live) {
        setCounts({
          persons: payload.counts.live.persons ?? 0,
          male: payload.counts.live.male ?? 0,
          female: payload.counts.live.female ?? 0,
          emirati: payload.counts.live.emirati ?? 0,
          nonEmirati: payload.counts.live.nonEmirati ?? 0,
          pets: payload.counts.live.pets ?? 0,
          dogs: payload.counts.live.dogs ?? 0,
          cats: payload.counts.live.cats ?? 0,
        });
      }
    };

    socket.on("detections:live", handleDetection);
    return () => {
      socket.off("detections:live", handleDetection);
      releaseSocket();
    };
  }, [camera.id]);

  return (
    <div
      className={`w-full h-8 bg-gray-950 border-t border-gray-800/80 px-3 flex items-center justify-between text-[11px] font-mono select-none overflow-hidden text-gray-300 flex-shrink-0 ${className}`}
      id={`cctv-details-${camera.code}`}
    >
      {/* Left: Compact Single-Line Live Stats */}
      <div className="flex items-center gap-2.5 truncate">
        <span className="flex items-center gap-1 font-semibold text-gray-200">
          <span className="opacity-70">👥</span> Live: <span className="text-white font-bold">{counts.persons}</span>
        </span>

        <span className="text-gray-700">|</span>

        <span className="flex items-center gap-1 font-semibold text-blue-400">
          <span>♂</span> Male: <span className="text-white font-bold">{counts.male}</span>
        </span>

        <span className="text-gray-700">|</span>

        <span className="flex items-center gap-1 font-semibold text-pink-400">
          <span>♀</span> Female: <span className="text-white font-bold">{counts.female}</span>
        </span>

        {(counts.emirati > 0 || counts.nonEmirati > 0) && (
          <>
            <span className="text-gray-700">|</span>
            <span className="text-emerald-400 font-medium">
              🇦🇪 {counts.emirati} · 👔 {counts.nonEmirati}
            </span>
          </>
        )}

        {counts.pets > 0 && (
          <>
            <span className="text-gray-700">|</span>
            <span className="text-amber-400 font-medium">
              🐾 {counts.pets}
            </span>
          </>
        )}
      </div>

      {/* Right: Compact Stream Specs + Stream Profile Switcher */}
      <div className="hidden sm:flex items-center gap-2 text-[10px] text-gray-400 shrink-0">
        <span className="flex items-center gap-1 font-medium">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              camera.status === "ONLINE" ? "bg-emerald-400 animate-pulse" : "bg-gray-500"
            }`}
          />
          <span className={camera.status === "ONLINE" ? "text-emerald-400 font-semibold" : "text-gray-400"}>
            {camera.status}
          </span>
        </span>

        <span className="text-gray-700">·</span>
        <span>{camera.zoneMode === "CUSTOM" ? "Custom Zone" : "Full Frame"}</span>

        {camera.width && camera.height && (
          <>
            <span className="text-gray-700">·</span>
            <span>{camera.width}×{camera.height}</span>
          </>
        )}

        {/* 1-Click Stream Switcher (Mainstream vs Substream) */}
        <span className="text-gray-700">·</span>
        <button
          type="button"
          onClick={handleToggleStream}
          disabled={switching}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
            profile === "MAINSTREAM"
              ? "bg-blue-900/60 text-blue-200 border border-blue-500/40 hover:bg-blue-800/80"
              : "bg-amber-900/60 text-amber-200 border border-amber-500/40 hover:bg-amber-800/80 animate-pulse"
          }`}
          title={
            profile === "MAINSTREAM"
              ? "Mainstream (High Res) is Active. Click to switch to Substream (Low Bandwidth)."
              : "Substream (Low Res) is Active. Click to switch to Mainstream (3x farther AI detection distance)!"
          }
        >
          {switching ? "Switching…" : profile === "MAINSTREAM" ? "🚀 HD Main" : "⚡ SD Sub (3x?)"}
        </button>

        <span className="text-gray-700">·</span>
        <span className="text-gray-400">AI: YOLOX</span>
      </div>
    </div>
  );
}

