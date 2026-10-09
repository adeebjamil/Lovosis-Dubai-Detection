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

  const boxes = frame.boxes || [];
  const customPoints = (camera.customZonePoints ?? []) as [number, number][];

  // Pure mathematical SVG path with 0..1000 coordinates (100% valid SVG syntax, no % symbols)
  const zonePath =
    camera.zoneMode === "CUSTOM" && customPoints.length >= 3
      ? customPoints
          .map((p, i) => `${i === 0 ? "M" : "L"} ${Math.round(p[0] * 1000)} ${Math.round(p[1] * 1000)}`)
          .join(" ") + " Z"
      : null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden select-none">
      {/* SVG overlay strictly for bounding boxes & custom zone outline */}
      {showOverlay && (
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
        >
          {/* Custom zone dotted boundary line & shaded region */}
          {zonePath && (
            <path
              d={zonePath}
              fill="rgba(23, 165, 206, 0.16)"
              stroke="#17A5CE"
              strokeWidth="2.5"
              strokeDasharray="8 6"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Detections Bounding Boxes */}
          {boxes.map((b) => {
            const [x1, y1, x2, y2] = b.box;
            const left = Math.round(x1 * 1000);
            const top = Math.round(y1 * 1000);
            const w = Math.round((x2 - x1) * 1000);
            const h = Math.round((y2 - y1) * 1000);

            let color = "#2563EB"; // default blue for male
            if (b.class === "PERSON") {
              if (b.gender === "FEMALE") {
                color = "#EC4899"; // Vibrant Pink for Female
              } else if (b.gender === "MALE") {
                color = "#2563EB"; // Vibrant Blue for Male
              } else {
                color = "#0EA5E9"; // Cyan for unclassified person
              }
            } else if (b.class === "DOG") {
              color = "#F59E0B"; // amber for dog
            } else if (b.class === "CAT") {
              color = "#EC4899"; // pink for cat
            }

            return (
              <rect
                key={b.trackId}
                x={left}
                y={top}
                width={w}
                height={h}
                fill={color === "#EC4899" ? "rgba(236, 72, 153, 0.04)" : "rgba(37, 99, 235, 0.04)"}
                stroke={color}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                rx="4"
              />
            );
          })}
        </svg>
      )}

      {/* HTML Micro-Badges for Detected Targets */}
      {showOverlay && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {boxes.map((b) => {
            const [x1, y1] = b.box;
            let color = "#2563EB";
            let tag: string = b.class;

            if (b.class === "PERSON") {
              if (b.gender === "FEMALE") {
                color = "#EC4899";
                tag = "♀ Female";
              } else if (b.gender === "MALE") {
                color = "#2563EB";
                tag = "♂ Male";
              } else {
                color = "#0EA5E9";
                tag = "Person";
              }

              if (b.nationality === "EMIRATI") {
                tag += " (Emirati)";
              }
            } else if (b.class === "DOG") {
              color = "#F59E0B";
              tag = "🐕 Dog";
            } else if (b.class === "CAT") {
              color = "#EC4899";
              tag = "🐈 Cat";
            }

            const dwellText =
              b.dwellSeconds != null && b.dwellSeconds >= 2.0 ? ` · ${Math.floor(b.dwellSeconds)}s` : "";
            const labelText = `#${b.trackId} ${tag} ${Math.round(b.confidence * 100)}%${dwellText}`;

            return (
              <div
                key={b.trackId}
                className="absolute px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-white shadow-md whitespace-nowrap"
                style={{
                  left: `${x1 * 100}%`,
                  top: `${y1 * 100}%`,
                  transform: y1 > 0.035 ? "translateY(-100%)" : "translateY(0%)",
                  backgroundColor: "rgba(10, 15, 30, 0.92)",
                  border: `1px solid ${color}`,
                }}
              >
                {labelText}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
