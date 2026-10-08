"use client";

import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faDrawPolygon,
  faExpand,
  faFloppyDisk,
  faRotateRight,
  faTrashCan,
  faVideo,
} from "@fortawesome/free-solid-svg-icons";
import { camerasApi, type Camera } from "@/lib/cameras";
import { toast } from "@/store/toast";

interface ZoneEditorProps {
  camera: Camera;
  onUpdate: (updated: Camera) => void;
}

export default function ZoneEditor({ camera, onUpdate }: ZoneEditorProps) {
  const [zoneMode, setZoneMode] = useState<"FULL_FRAME" | "CUSTOM">(camera.zoneMode ?? "FULL_FRAME");
  const [points, setPoints] = useState<[number, number][]>(
    () => (Array.isArray(camera.customZonePoints) ? (camera.customZonePoints as [number, number][]) : [])
  );
  const [snapshotKey, setSnapshotKey] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const refreshSnapshot = () => {
    setSnapshotKey((prev) => prev + 1);
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (zoneMode !== "CUSTOM") return;
    if (draggingIdx !== null) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (points.length >= 20) {
      toast.error("Maximum 20 points allowed for custom zone");
      return;
    }

    setPoints((prev) => [...prev, [Number(x.toFixed(4)), Number(y.toFixed(4))]]);
  };

  const handlePointerDown = (idx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    setDraggingIdx(idx);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingIdx === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    setPoints((prev) => {
      const next = [...prev];
      next[draggingIdx] = [Number(x.toFixed(4)), Number(y.toFixed(4))];
      return next;
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingIdx !== null) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setDraggingIdx(null);
    }
  };

  const handleRemovePoint = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPoints((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (zoneMode === "CUSTOM" && points.length > 0 && points.length < 3) {
      toast.error("A custom zone polygon must have at least 3 points");
      return;
    }

    setSaving(true);
    try {
      const updated = await camerasApi.updateZone(camera.id, {
        zoneMode,
        customZonePoints: zoneMode === "CUSTOM" ? points : null,
      });

      onUpdate(updated);
      toast.success(
        `Zone saved for ${camera.code} (${zoneMode === "FULL_FRAME" ? "Full View" : "Custom Zone"})`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save zone";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const polygonPath =
    points.length >= 2
      ? points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0] * 100}% ${p[1] * 100}%`).join(" ") +
        (points.length >= 3 ? " Z" : "")
      : "";

  return (
    <div className="space-y-6">
      {/* Top controls card */}
      <div className="card p-5 !shadow-volt flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="font-semibold text-primary">
            {camera.code} · {camera.name}
          </div>

          {/* Mode Switcher Toggle */}
          <div className="inline-flex rounded-lg bg-gray-200 p-1">
            <button
              type="button"
              onClick={() => setZoneMode("FULL_FRAME")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-semibold transition ${
                zoneMode === "FULL_FRAME" ? "bg-primary text-white shadow-sm" : "text-gray-600 hover:text-primary"
              }`}
            >
              <FontAwesomeIcon icon={faExpand} className="text-xs" />
              Full View (Whole CCTV)
            </button>
            <button
              type="button"
              onClick={() => setZoneMode("CUSTOM")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-semibold transition ${
                zoneMode === "CUSTOM" ? "bg-secondary text-white shadow-sm" : "text-gray-600 hover:text-primary"
              }`}
            >
              <FontAwesomeIcon icon={faDrawPolygon} className="text-xs" />
              Custom Zone
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={refreshSnapshot}
            className="btn btn-outline-secondary btn-sm flex items-center gap-1.5"
            title="Reload snapshot frame"
          >
            <FontAwesomeIcon icon={faRotateRight} />
            Refresh Frame
          </button>

          {zoneMode === "CUSTOM" && (
            <button
              type="button"
              onClick={() => setPoints([])}
              className="btn btn-outline-danger btn-sm flex items-center gap-1.5"
              title="Clear all points"
            >
              <FontAwesomeIcon icon={faTrashCan} />
              Clear Points
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary btn-sm flex items-center gap-1.5"
          >
            <FontAwesomeIcon icon={saving ? faRotateRight : faFloppyDisk} className={saving ? "animate-spin" : ""} />
            {saving ? "Saving..." : "Save Zone"}
          </button>
        </div>
      </div>

      {/* Editor canvas area */}
      <div className="card overflow-hidden !shadow-volt">
        <div className="border-b border-gray-200 bg-gray-50 px-5 py-3 flex items-center justify-between text-xs text-muted">
          <div>
            {zoneMode === "FULL_FRAME" ? (
              <span className="font-semibold text-success flex items-center gap-1.5">
                <FontAwesomeIcon icon={faCheck} />
                Full CCTV view is active — all detections across the entire camera frame are counted.
              </span>
            ) : (
              <span className="font-medium text-gray-700">
                Click anywhere on the frame to add polygon corners. Drag points to adjust. Right-click point to delete. (
                {points.length} points defined)
              </span>
            )}
          </div>
          <div className="font-mono text-[11px] text-gray-500">
            {camera.code} · {camera.width ? `${camera.width}×${camera.height}` : "Stream snapshot"}
          </div>
        </div>

        <div className="relative aspect-video w-full bg-black select-none" ref={containerRef} onPointerMove={handlePointerMove}>
          {/* Camera snapshot background */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={`${camera.id}-${snapshotKey}`}
            src={`/api/cameras/${camera.id}/snapshot?t=${snapshotKey}`}
            alt={camera.name}
            className="absolute inset-0 h-full w-full object-contain pointer-events-none"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />

          {/* Fallback pattern when no snapshot */}
          <div className="absolute inset-0 -z-10 flex items-center justify-center text-gray-600">
            <div className="text-center">
              <FontAwesomeIcon icon={faVideo} className="mb-2 text-3xl opacity-40" />
              <p className="text-xs">Connecting to camera feed...</p>
            </div>
          </div>

          {/* SVG Overlay for Zone Polygon */}
          <svg
            className={`absolute inset-0 h-full w-full ${zoneMode === "CUSTOM" ? "cursor-crosshair" : "pointer-events-none"}`}
            onClick={handleSvgClick}
          >
            {zoneMode === "FULL_FRAME" ? (
              <rect
                x="1.5%"
                y="1.5%"
                width="97%"
                height="97%"
                fill="rgba(46, 204, 113, 0.08)"
                stroke="#2ecc71"
                strokeWidth="3"
                strokeDasharray="8 6"
                rx="6"
              />
            ) : (
              <>
                {polygonPath && (
                  <path
                    d={polygonPath}
                    fill="rgba(23, 165, 206, 0.25)"
                    stroke="#17A5CE"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}

                {points.map((pt, idx) => (
                  <g key={idx}>
                    <circle
                      cx={`${pt[0] * 100}%`}
                      cy={`${pt[1] * 100}%`}
                      r="7"
                      fill="#FFFFFF"
                      stroke="#17A5CE"
                      strokeWidth="3"
                      className="cursor-move hover:r-9 transition-all"
                      onPointerDown={(e) => handlePointerDown(idx, e)}
                      onPointerUp={handlePointerUp}
                      onContextMenu={(e) => handleRemovePoint(idx, e)}
                    />
                    <text
                      x={`${pt[0] * 100}%`}
                      y={`${pt[1] * 100 - 1.5}%`}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="10"
                      fontWeight="bold"
                      className="pointer-events-none"
                    >
                      {idx + 1}
                    </text>
                  </g>
                ))}
              </>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
