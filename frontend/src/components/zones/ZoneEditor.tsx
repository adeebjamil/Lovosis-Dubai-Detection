"use client";

import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBorderAll,
  faCheck,
  faDrawPolygon,
  faExpand,
  faFloppyDisk,
  faRotateRight,
  faSquare,
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

  // Dragging individual corner handles
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  // Dragging to draw a new zone box
  const [boxStart, setBoxStart] = useState<[number, number] | null>(null);
  const [boxCurrent, setBoxCurrent] = useState<[number, number] | null>(null);

  // Moving the entire zone box
  const [movingZoneStart, setMovingZoneStart] = useState<[number, number] | null>(null);
  const [initialZonePoints, setInitialZonePoints] = useState<[number, number][]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const refreshSnapshot = () => {
    setSnapshotKey((prev) => prev + 1);
  };

  const getNormCoords = (e: React.PointerEvent | React.MouseEvent): [number, number] => {
    if (!containerRef.current) return [0, 0];
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return [Number(x.toFixed(4)), Number(y.toFixed(4))];
  };

  const handlePointerDownContainer = (e: React.PointerEvent) => {
    if (zoneMode !== "CUSTOM") return;
    if (draggingIdx !== null || movingZoneStart !== null) return;

    const [x, y] = getNormCoords(e);
    // Initiating drag to draw a box
    setBoxStart([x, y]);
    setBoxCurrent([x, y]);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMoveContainer = (e: React.PointerEvent) => {
    if (zoneMode !== "CUSTOM") return;
    const [x, y] = getNormCoords(e);

    // 1. Updating box drag
    if (boxStart) {
      setBoxCurrent([x, y]);
      return;
    }

    // 2. Dragging a single corner handle
    if (draggingIdx !== null) {
      setPoints((prev) => {
        const next = [...prev];
        next[draggingIdx] = [x, y];
        return next;
      });
      return;
    }

    // 3. Moving the entire zone box
    if (movingZoneStart && initialZonePoints.length > 0) {
      const dx = x - movingZoneStart[0];
      const dy = y - movingZoneStart[1];
      setPoints(
        initialZonePoints.map(([px, py]) => [
          Math.max(0, Math.min(1, Number((px + dx).toFixed(4)))),
          Math.max(0, Math.min(1, Number((py + dy).toFixed(4)))),
        ])
      );
    }
  };

  const handlePointerUpContainer = (e: React.PointerEvent) => {
    // Finish drawing box
    if (boxStart && boxCurrent) {
      const w = Math.abs(boxCurrent[0] - boxStart[0]);
      const h = Math.abs(boxCurrent[1] - boxStart[1]);

      if (w > 0.02 && h > 0.02) {
        const x1 = Number(Math.min(boxStart[0], boxCurrent[0]).toFixed(4));
        const y1 = Number(Math.min(boxStart[1], boxCurrent[1]).toFixed(4));
        const x2 = Number(Math.max(boxStart[0], boxCurrent[0]).toFixed(4));
        const y2 = Number(Math.max(boxStart[1], boxCurrent[1]).toFixed(4));

        setPoints([
          [x1, y1], // 1: top-left
          [x2, y1], // 2: top-right
          [x2, y2], // 3: bottom-right
          [x1, y2], // 4: bottom-left
        ]);
        toast.success("Zone box drawn! Drag corners to fine-tune or drag the box to move it.");
      }
      setBoxStart(null);
      setBoxCurrent(null);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }

    // Finish dragging single handle
    if (draggingIdx !== null) {
      setDraggingIdx(null);
    }

    // Finish moving entire zone
    if (movingZoneStart !== null) {
      setMovingZoneStart(null);
    }
  };

  const handleHandlePointerDown = (idx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    setDraggingIdx(idx);
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleHandlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    setDraggingIdx(null);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePolygonBodyPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const [x, y] = getNormCoords(e);
    setMovingZoneStart([x, y]);
    setInitialZonePoints([...points]);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePresetCenterBox = () => {
    setZoneMode("CUSTOM");
    setPoints([
      [0.2, 0.2],
      [0.8, 0.2],
      [0.8, 0.8],
      [0.2, 0.8],
    ]);
    toast.success("Center box preset applied! Drag corners or body as needed.");
  };

  const handleSave = async () => {
    if (zoneMode === "CUSTOM" && points.length > 0 && points.length < 3) {
      toast.error("A custom zone must have at least 3 points");
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
        `Zone saved for ${camera.code} (${zoneMode === "FULL_FRAME" ? "Full CCTV View" : "Custom Box Zone"})`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save zone";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // Pure mathematical SVG path with 0..1000 coordinates (100% valid SVG syntax)
  const polygonPath =
    points.length >= 3
      ? points
          .map((p, i) => `${i === 0 ? "M" : "L"} ${Math.round(p[0] * 1000)} ${Math.round(p[1] * 1000)}`)
          .join(" ") + " Z"
      : "";

  // Active dragging box preview
  let boxPreview: { x: number; y: number; w: number; h: number } | null = null;
  if (boxStart && boxCurrent) {
    const x = Math.min(boxStart[0], boxCurrent[0]);
    const y = Math.min(boxStart[1], boxCurrent[1]);
    const w = Math.abs(boxCurrent[0] - boxStart[0]);
    const h = Math.abs(boxCurrent[1] - boxStart[1]);
    boxPreview = { x, y, w, h };
  }

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
                zoneMode === "FULL_FRAME" ? "bg-white text-primary shadow-sm" : "text-gray-600 hover:text-primary"
              }`}
            >
              <FontAwesomeIcon icon={faExpand} className="text-xs" />
              Full Frame
            </button>
            <button
              type="button"
              onClick={() => setZoneMode("CUSTOM")}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-semibold transition ${
                zoneMode === "CUSTOM" ? "bg-secondary text-white shadow-sm" : "text-gray-600 hover:text-primary"
              }`}
            >
              <FontAwesomeIcon icon={faSquare} className="text-xs" />
              Custom Zone
            </button>
          </div>

          {/* Mode Indicator Pill when Custom Zone is selected */}
          {zoneMode === "CUSTOM" && (
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 border border-cyan-200 px-3 py-1 text-xs font-semibold text-cyan-800 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
              Drag to Draw Box
            </div>
          )}
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
            <>
              <button
                type="button"
                onClick={handlePresetCenterBox}
                className="btn btn-outline-secondary btn-sm flex items-center gap-1.5"
                title="Apply center rectangular zone"
              >
                <FontAwesomeIcon icon={faBorderAll} />
                Center Preset
              </button>
              <button
                type="button"
                onClick={() => setPoints([])}
                className="btn btn-outline-danger btn-sm flex items-center gap-1.5"
                title="Clear zone box"
              >
                <FontAwesomeIcon icon={faTrashCan} />
                Clear
              </button>
            </>
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
              <span className="font-medium text-gray-700 flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-secondary animate-pulse" />
                <strong className="text-secondary">Drag to Draw Box:</strong> Click and drag anywhere on the video to draw your custom zone. Drag corner handles or the body to adjust.
              </span>
            )}
          </div>
          <div className="font-mono text-[11px] text-gray-500">
            {camera.code} · {camera.width ? `${camera.width}×${camera.height}` : "Stream snapshot"}
          </div>
        </div>

        <div
          className={`relative aspect-video w-full bg-black select-none ${
            zoneMode === "CUSTOM" ? "cursor-crosshair" : ""
          }`}
          ref={containerRef}
          onPointerDown={handlePointerDownContainer}
          onPointerMove={handlePointerMoveContainer}
          onPointerUp={handlePointerUpContainer}
        >
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

          {/* SVG Overlay for Zone Polygon and Box Drawing */}
          <svg
            className="absolute inset-0 h-full w-full pointer-events-none"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
          >
            {zoneMode === "FULL_FRAME" ? (
              <rect
                x="15"
                y="15"
                width="970"
                height="970"
                fill="rgba(46, 204, 113, 0.08)"
                stroke="#2ecc71"
                strokeWidth="3.5"
                strokeDasharray="10 6"
                vectorEffect="non-scaling-stroke"
                rx="6"
              />
            ) : (
              <>
                {/* Established Zone Box with High-Contrast Dotted Cyan Boundary Line */}
                {polygonPath && (
                  <path
                    d={polygonPath}
                    fill="rgba(23, 165, 206, 0.22)"
                    stroke="#17A5CE"
                    strokeWidth="3.5"
                    strokeDasharray="10 6"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className="pointer-events-auto cursor-move transition-colors hover:fill-[rgba(23,165,206,0.32)]"
                    onPointerDown={handlePolygonBodyPointerDown}
                  >
                    <title>Click and drag to move the entire zone box</title>
                  </path>
                )}

                {/* Move Hint icon in center of zone box */}
                {points.length >= 3 && (
                  <g className="pointer-events-none opacity-80">
                    <circle
                      cx={Math.round((points.reduce((a, b) => a + b[0], 0) / points.length) * 1000)}
                      cy={Math.round((points.reduce((a, b) => a + b[1], 0) / points.length) * 1000)}
                      r="16"
                      fill="#17A5CE"
                      vectorEffect="non-scaling-stroke"
                    />
                    <text
                      x={Math.round((points.reduce((a, b) => a + b[0], 0) / points.length) * 1000)}
                      y={Math.round((points.reduce((a, b) => a + b[1], 0) / points.length) * 1000 + 4)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#FFFFFF"
                      fontSize="14"
                      fontWeight="bold"
                    >
                      ✥
                    </text>
                  </g>
                )}

                {/* Live Dragging Box Preview */}
                {boxPreview && (
                  <g className="pointer-events-none">
                    <rect
                      x={Math.round(boxPreview.x * 1000)}
                      y={Math.round(boxPreview.y * 1000)}
                      width={Math.round(boxPreview.w * 1000)}
                      height={Math.round(boxPreview.h * 1000)}
                      fill="rgba(23, 165, 206, 0.25)"
                      stroke="#17A5CE"
                      strokeWidth="3"
                      strokeDasharray="8 6"
                      vectorEffect="non-scaling-stroke"
                      rx="4"
                    />
                  </g>
                )}

                {/* Corner Vertex Handles (1, 2, 3, 4) */}
                {points.map((pt, idx) => (
                  <g key={idx} className="pointer-events-auto">
                    {/* Pulsing halo ring */}
                    <circle
                      cx={Math.round(pt[0] * 1000)}
                      cy={Math.round(pt[1] * 1000)}
                      r="16"
                      fill="none"
                      stroke="#17A5CE"
                      strokeWidth="2"
                      strokeDasharray="4 3"
                      vectorEffect="non-scaling-stroke"
                      className="opacity-80"
                    />
                    {/* Draggable Circle Handle */}
                    <circle
                      cx={Math.round(pt[0] * 1000)}
                      cy={Math.round(pt[1] * 1000)}
                      r="10"
                      fill="#FFFFFF"
                      stroke="#17A5CE"
                      strokeWidth="3.5"
                      vectorEffect="non-scaling-stroke"
                      className="cursor-move hover:scale-125 transition-transform"
                      onPointerDown={(e) => handleHandlePointerDown(idx, e)}
                      onPointerUp={handleHandlePointerUp}
                    />
                  </g>
                ))}
              </>
            )}
          </svg>

          {/* HTML Corner Badges (1, 2, 3, 4) with crisp fonts */}
          {zoneMode === "CUSTOM" &&
            points.map((pt, idx) => (
              <div
                key={idx}
                className="absolute pointer-events-none select-none -translate-x-1/2 -translate-y-[170%] bg-[#17A5CE] text-white text-[10px] font-bold font-mono px-1 rounded shadow"
                style={{
                  left: `${pt[0] * 100}%`,
                  top: `${pt[1] * 100}%`,
                }}
              >
                {idx + 1}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
