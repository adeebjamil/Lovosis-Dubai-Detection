"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faChevronLeft,
  faChevronRight,
  faCircleExclamation,
  faExpand,
  faEye,
  faEyeSlash,
  faFloppyDisk,
  faPlus,
  faRotateLeft,
  faVideo,
  faVideoSlash,
} from "@fortawesome/free-solid-svg-icons";
import { useCameras } from "@/hooks/useCameras";
import { STATUS_META, type Camera } from "@/lib/cameras";
import { toast } from "@/store/toast";
import EmptyState from "@/components/ui/EmptyState";
import WebRtcPlayer from "./WebRtcPlayer";
import DetectionOverlay from "./DetectionOverlay";

const LAYOUTS = [1, 2, 3, 4] as const; // n×n
type Layout = (typeof LAYOUTS)[number] | "auto";

const STORAGE_KEY = "lovosis_live_layout_pref";

interface SavedLayoutPref {
  layout: Layout;
  showOverlay: boolean;
  savedAt?: string;
}

const GRID_CLASS: Record<number, string> = {
  1: "mx-auto w-full max-w-[calc((100vh-13rem)*16/9)] grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-1 md:grid-cols-2 xl:grid-cols-4",
};

const autoSize = (n: number) => (n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4);

function LiveTile({ camera, showOverlay }: { camera: Camera; showOverlay: boolean }) {
  const meta = STATUS_META[camera.status];
  const playable = camera.enabled && camera.status === "ONLINE";

  const fullscreen = (e: React.MouseEvent<HTMLElement>) => {
    const tile = (e.currentTarget as HTMLElement).closest(".live-tile");
    if (document.fullscreenElement) void document.exitFullscreen();
    else void tile?.requestFullscreen?.();
  };

  return (
    <div className="live-tile relative overflow-hidden" id={`live-tile-${camera.code}`} onDoubleClick={fullscreen}>
      {playable ? (
        <div className="relative h-full w-full">
          <WebRtcPlayer cameraId={camera.id} label={camera.name} />
          <DetectionOverlay camera={camera} showOverlay={showOverlay} />
        </div>
      ) : (
        <div className="live-tile-center">
          <FontAwesomeIcon icon={faVideoSlash} className="text-2xl text-gray-600" />
          <span>{camera.enabled ? `${meta.label}${camera.status === "CONNECTING" ? "…" : ""}` : "Camera disabled"}</span>
          {camera.lastError && camera.status !== "CONNECTING" && (
            <span className="max-w-xs text-xs text-gray-600">{camera.lastError}</span>
          )}
        </div>
      )}
      <div className="live-tile-bar z-20">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`status-dot ${meta.color}`} aria-label={meta.label} />
          <span className="truncate">{camera.code} · {camera.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {camera.width && camera.height && <span className="hidden sm:inline">{camera.width}×{camera.height}</span>}
          <button type="button" onClick={fullscreen} className="text-white/80 hover:text-white" aria-label={`Fullscreen ${camera.name}`}>
            <FontAwesomeIcon icon={faExpand} />
          </button>
        </span>
      </div>
    </div>
  );
}

export default function LiveView() {
  const { cameras, error } = useCameras();
  const [layout, setLayout] = useState<Layout>("auto");
  const [page, setPage] = useState(0);
  const [showOverlay, setShowOverlay] = useState(true);
  const [savedPref, setSavedPref] = useState<SavedLayoutPref | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Restore saved layout on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: SavedLayoutPref = JSON.parse(raw);
        if (parsed && (parsed.layout === "auto" || LAYOUTS.includes(parsed.layout as any))) {
          setLayout(parsed.layout);
          setShowOverlay(typeof parsed.showOverlay === "boolean" ? parsed.showOverlay : true);
          setSavedPref(parsed);
        }
      }
    } catch (err) {
      console.warn("Failed to load saved live layout", err);
    }
  }, []);

  const handleSaveLayout = () => {
    const pref: SavedLayoutPref = {
      layout,
      showOverlay,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
      setSavedPref(pref);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2200);
      const layoutLabel = layout === "auto" ? "Auto" : `${layout}×${layout}`;
      toast.success(`Layout preference (${layoutLabel}, AI: ${showOverlay ? "ON" : "OFF"}) saved!`);
    } catch {
      toast.error("Could not save layout to local storage.");
    }
  };

  const handleResetLayout = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setSavedPref(null);
      setLayout("auto");
      setShowOverlay(true);
      setPage(0);
      toast.info("Layout preference reset to default (Auto, AI: ON).");
    } catch {
      toast.error("Could not reset layout preference.");
    }
  };

  const isCurrentSaved =
    savedPref !== null &&
    savedPref.layout === layout &&
    savedPref.showOverlay === showOverlay;

  const list = cameras?.filter((c) => c.enabled) ?? [];
  const size = layout === "auto" ? autoSize(list.length) : layout;
  const perPage = size * size;
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const current = Math.min(page, pages - 1);
  const visible = list.slice(current * perPage, current * perPage + perPage);
  const online = list.filter((c) => c.status === "ONLINE").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Live View</h1>
          <p className="text-muted">
            {cameras
              ? `${online} of ${list.length} enabled cameras online · double-click a tile for fullscreen`
              : "Loading cameras…"}
            {savedPref && (
              <span className="ml-2 inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                ★ Saved default: {savedPref.layout === "auto" ? "Auto" : `${savedPref.layout}×${savedPref.layout}`}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Overlay Toggle Button */}
          <button
            type="button"
            onClick={() => setShowOverlay(!showOverlay)}
            className={`btn btn-sm flex items-center gap-1.5 ${
              showOverlay ? "btn-secondary text-white" : "btn-outline-gray text-gray-700"
            }`}
            title="Toggle AI Detection Bounding Boxes"
          >
            <FontAwesomeIcon icon={showOverlay ? faEye : faEyeSlash} />
            AI Overlay: {showOverlay ? "ON" : "OFF"}
          </button>

          {/* Grid Layout Selector */}
          <div className="btn-group" role="group" aria-label="Grid layout">
            <button
              id="layout-auto"
              className={`btn btn-sm ${layout === "auto" ? "btn-primary" : "btn-outline-gray"}`}
              onClick={() => {
                setLayout("auto");
                setPage(0);
              }}
              title={savedPref?.layout === "auto" ? "Auto Grid (Saved Default)" : "Auto Grid"}
            >
              Auto
              {savedPref?.layout === "auto" && <span className="ml-1 text-[10px] opacity-75">★</span>}
            </button>
            {LAYOUTS.map((n) => (
              <button
                key={n}
                id={`layout-${n}x${n}`}
                className={`btn btn-sm ${layout === n ? "btn-primary" : "btn-outline-gray"}`}
                onClick={() => {
                  setLayout(n);
                  setPage(0);
                }}
                title={savedPref?.layout === n ? `${n}×${n} Grid (Saved Default)` : `${n}×${n} Grid`}
              >
                {n}×{n}
                {savedPref?.layout === n && <span className="ml-1 text-[10px] opacity-75">★</span>}
              </button>
            ))}
          </div>

          {/* Save Layout Button & Reset */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              id="live-save-layout"
              onClick={handleSaveLayout}
              className={`btn btn-sm flex items-center gap-1.5 transition-all duration-200 ${
                justSaved
                  ? "btn-success text-white"
                  : isCurrentSaved
                  ? "btn-outline-gray text-emerald-600 border-emerald-300 bg-emerald-50/60"
                  : "btn-primary shadow-sm"
              }`}
              title={
                isCurrentSaved
                  ? "Current layout is saved as your default"
                  : "Save this grid layout & overlay preference as your default"
              }
            >
              <FontAwesomeIcon icon={justSaved || isCurrentSaved ? faCheck : faFloppyDisk} />
              <span>{justSaved ? "Saved!" : isCurrentSaved ? "Layout Saved" : "Save Layout"}</span>
            </button>

            {savedPref && (
              <button
                type="button"
                id="live-reset-layout"
                onClick={handleResetLayout}
                className="btn btn-outline-gray btn-sm text-gray-500 hover:text-gray-800"
                title="Reset saved layout preference back to default (Auto)"
              >
                <FontAwesomeIcon icon={faRotateLeft} />
              </button>
            )}
          </div>

          {pages > 1 && (
            <div className="btn-group" role="group" aria-label="Pages">
              <button
                id="live-prev"
                className="btn btn-outline-gray btn-sm"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                aria-label="Previous page"
              >
                <FontAwesomeIcon icon={faChevronLeft} />
              </button>
              <span className="btn btn-outline-gray btn-sm pointer-events-none">
                {current + 1} / {pages}
              </span>
              <button
                id="live-next"
                className="btn btn-outline-gray btn-sm"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
                aria-label="Next page"
              >
                <FontAwesomeIcon icon={faChevronRight} />
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="alert alert-danger flex items-center gap-2">
          <FontAwesomeIcon icon={faCircleExclamation} /> {error}
        </div>
      )}

      {!cameras ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton aspect-video" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={faVideo}
            title="No enabled cameras"
            description="Add a camera (or enable one) to watch it live here."
            action={
              <Link id="live-add-camera" href="/admin/cameras?new=1" className="btn btn-primary btn-sm">
                <FontAwesomeIcon icon={faPlus} /> Add Camera
              </Link>
            }
          />
        </div>
      ) : (
        <div className={`grid gap-4 ${GRID_CLASS[size]}`} id="live-grid">
          {visible.map((c) => (
            <LiveTile key={c.id} camera={c} showOverlay={showOverlay} />
          ))}
        </div>
      )}
    </div>
  );
}
