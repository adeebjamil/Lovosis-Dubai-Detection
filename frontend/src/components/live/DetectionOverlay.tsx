"use client";

import { useEffect, useState } from "react";
import { acquireSocket, releaseSocket } from "@/lib/socket";
import type { Camera, LiveFramePayload } from "@/lib/cameras";

interface OverlayProps {
  camera: Camera;
  showOverlay: boolean;
}

export default function DetectionOverlay({ camera, showOverlay }: OverlayProps) {
  const [frame, setFrame] = useState<LiveFramePayload | null>(null);

  useEffect(() => {
    const socket = acquireSocket();
    const handleDetection = (payload: LiveFramePayload) => {
      if (payload.cameraId === camera.id) {
        setFrame(payload);
      }
    };

    socket.on("detections:live", handleDetection);
    return () => {
      socket.off("detections:live", handleDetection);
      releaseSocket();
    };
  }, [camera.id]);

  if (!frame) return null;

  const live = frame.counts.live;
  const boxes = frame.boxes || [];
  const customPoints = (camera.customZonePoints ?? []) as [number, number][];

  const zonePath =
    camera.zoneMode === "CUSTOM" && customPoints.length >= 3
      ? customPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0] * 100}% ${p[1] * 100}%`).join(" ") + " Z"
      : null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-2">
      {/* Top live counter chip */}
      <div className="flex flex-wrap items-center gap-1.5 self-start">
        <span className="rounded bg-black/75 px-2 py-0.5 font-mono text-[11px] font-semibold text-white shadow backdrop-blur-sm">
          👥 Live: {live.persons}
        </span>
        {(live.male > 0 || live.female > 0) && (
          <span className="rounded bg-black/75 px-2 py-0.5 font-mono text-[11px] font-medium text-cyan-300 shadow backdrop-blur-sm">
            ♂ {live.male} · ♀ {live.female}
          </span>
        )}
        {(live.emirati > 0 || live.nonEmirati > 0) && (
          <span className="rounded bg-black/75 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-300 shadow backdrop-blur-sm">
            🇦🇪 {live.emirati} · 👔 {live.nonEmirati}
          </span>
        )}
        {live.pets > 0 && (
          <span className="rounded bg-black/75 px-2 py-0.5 font-mono text-[11px] font-medium text-amber-300 shadow backdrop-blur-sm">
            🐾 {live.pets} (🐕 {live.dogs} · 🐈 {live.cats})
          </span>
        )}
      </div>

      {/* SVG overlay for bounding boxes & custom zone outline */}
      {showOverlay && (
        <svg className="absolute inset-0 h-full w-full">
          {/* Custom zone boundary line */}
          {zonePath && (
            <path
              d={zonePath}
              fill="rgba(23, 165, 206, 0.12)"
              stroke="#17A5CE"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          )}

          {/* Detections */}
          {boxes.map((b) => {
            const [x1, y1, x2, y2] = b.box;
            const w = (x2 - x1) * 100;
            const h = (y2 - y1) * 100;
            const left = x1 * 100;
            const top = y1 * 100;

            let color = "#3B82F6"; // default blue
            let tag: string = b.class;

            if (b.class === "PERSON") {
              const genderPrefix = b.gender === "MALE" ? "♂ " : b.gender === "FEMALE" ? "♀ " : "";
              if (b.nationality === "EMIRATI") {
                color = "#10B981"; // emerald for Emirati traditional dress
                tag = `${genderPrefix}Emirati`;
              } else if (b.nationality === "NON_EMIRATI") {
                color = "#2563EB"; // blue for regular clothes
                tag = `${genderPrefix}Non-Emirati`;
              } else {
                tag = genderPrefix ? `${genderPrefix}Person` : "Person";
              }
            } else if (b.class === "DOG") {
              color = "#F59E0B"; // amber for dog
              tag = "🐕 Dog";
            } else if (b.class === "CAT") {
              color = "#EC4899"; // pink for cat
              tag = "🐈 Cat";
            }

            const dwellText =
              b.dwellSeconds != null
                ? b.isCounted
                  ? ` · ${Math.floor(b.dwellSeconds)}s`
                  : ` · ${b.dwellSeconds.toFixed(1)}s`
                : "";
            const labelText = `#${b.trackId} ${tag} (${Math.round(b.confidence * 100)}%)${dwellText}`;
            const badgeWidth = Math.max(78, labelText.length * 6.7 + 14);
            const badgeTop = Math.max(0, top - 3.2);

            return (
              <g key={b.trackId} className="detection-box-group">
                {/* Main Bounding Box with smooth interpolation */}
                <rect
                  x={`${left}%`}
                  y={`${top}%`}
                  width={`${w}%`}
                  height={`${h}%`}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.5"
                  rx="4"
                  style={{
                    transition: "all 0.08s ease-out",
                    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
                  }}
                />
                {/* Header Tag Badge */}
                <g
                  style={{
                    transition: "all 0.08s ease-out",
                  }}
                >
                  <rect
                    x={`${left}%`}
                    y={`${badgeTop}%`}
                    width={badgeWidth}
                    height="19"
                    rx="3"
                    fill={color}
                    style={{
                      transition: "all 0.08s ease-out",
                    }}
                  />
                  <text
                    x={`${left + 0.8}%`}
                    y={`${badgeTop + 2.2}%`}
                    fill="#FFFFFF"
                    fontSize="11"
                    fontFamily="monospace"
                    fontWeight="bold"
                    style={{
                      transition: "all 0.08s ease-out",
                    }}
                  >
                    {labelText}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
