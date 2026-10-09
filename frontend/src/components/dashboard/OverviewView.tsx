"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCamera,
  faCircleExclamation,
  faCheckCircle,
  faMars,
  faPaw,
  faPlus,
  faRotateRight,
  faSpinner,
  faTrashCan,
  faTriangleExclamation,
  faUsers,
  faVenus,
  faUserTie,
  faPassport,
  faVideo,
  faVideoSlash,
  faEye,
  faEyeSlash,
  faExpand,
  faTableCellsLarge,
  faChartLine,
  faTowerBroadcast,
  faBolt,
  faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import { api, apiErrorMessage } from "@/lib/api";
import { acquireSocket, releaseSocket } from "@/lib/socket";
import { HeroChartCard, StatCard, type ChartPoint } from "@/components/ui/Cards";
import EmptyState from "@/components/ui/EmptyState";
import CameraStatusBadge from "@/components/cameras/CameraStatusBadge";
import { useCameras } from "@/hooks/useCameras";
import { STATUS_META, camerasApi, detectStreamProfile, type Camera, type LiveFramePayload } from "@/lib/cameras";
import { toast } from "@/store/toast";
import WebRtcPlayer from "@/components/live/WebRtcPlayer";
import DetectionOverlay from "@/components/live/DetectionOverlay";
import CctvDetailsBar from "@/components/live/CctvDetailsBar";

interface Totals {
  people: number;
  male: number;
  female: number;
  unknownGender: number;
  emirati?: number;
  nonEmirati?: number;
  unknownNationality?: number;
  dogs: number;
  cats: number;
}
interface Summary {
  today: Totals;
  yesterday: Totals;
  peopleTrend: number | null;
  weekTotal: number;
  cameras: { total: number; online: number };
  hourly: ChartPoint[];
  daily: ChartPoint[];
  generatedAt: string;
}

const REFRESH_MS = 15_000;
const fmt = (n: number) => n.toLocaleString("en-US");
const pct = (part: number, total: number) => (total > 0 ? `${Math.round((part / total) * 100)}% of people today` : "No visitors yet today");

const OVERVIEW_MODE_KEY = "lovosis_overview_view_mode";
type ViewMode = "split" | "camera" | "chart";

export default function OverviewView() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const { cameras } = useCameras();

  // Unified Live CCTV + Analytics state
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [switchingStream, setSwitchingStream] = useState<boolean>(false);

  // Restore saved view mode preference
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem(OVERVIEW_MODE_KEY) as ViewMode | null;
      if (savedMode === "split" || savedMode === "camera" || savedMode === "chart") {
        setViewMode(savedMode);
      }
    } catch {
      // ignore localStorage error
    }
  }, []);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(OVERVIEW_MODE_KEY, mode);
    } catch {
      // ignore
    }
  };

  const fetchSummary = useCallback(
    () => api.get<{ data: Summary }>("/dashboard/summary").then((res) => res.data.data),
    [],
  );

  // Manual refresh (event handler)
  const load = useCallback(async () => {
    try {
      setData(await fetchSummary());
      setError(null);
    } catch (e) {
      setError(apiErrorMessage(e, "Could not load dashboard data."));
    }
  }, [fetchSummary]);

  // Polling subscription
  useEffect(() => {
    document.title = "Overview · Lovosis Detection";
    let active = true;
    const tick = () =>
      fetchSummary()
        .then((d) => {
          if (!active) return;
          setData(d);
          setError(null);
        })
        .catch((e) => active && setError(apiErrorMessage(e, "Could not load dashboard data.")));
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [fetchSummary]);

  // Realtime reset & instant analytics count synchronization via Socket.IO
  useEffect(() => {
    const s = acquireSocket();
    s.on("analytics:reset", load);

    const handleLiveDetections = (frame: LiveFramePayload) => {
      if (!frame?.counts?.today) return;
      const liveToday = frame.counts.today;
      setData((prev) => {
        if (!prev) return prev;
        const newPeople = Math.max(prev.today.people, liveToday.persons);
        const newMale = Math.max(prev.today.male, liveToday.male);
        const newFemale = Math.max(prev.today.female, liveToday.female);
        const newEmirati = Math.max(prev.today.emirati ?? 0, liveToday.emirati);
        const newNonEmirati = Math.max(prev.today.nonEmirati ?? 0, liveToday.nonEmirati);
        const newDogs = Math.max(prev.today.dogs, liveToday.dogs);
        const newCats = Math.max(prev.today.cats, liveToday.cats);

        if (
          newPeople === prev.today.people &&
          newMale === prev.today.male &&
          newFemale === prev.today.female &&
          newEmirati === (prev.today.emirati ?? 0) &&
          newNonEmirati === (prev.today.nonEmirati ?? 0) &&
          newDogs === prev.today.dogs &&
          newCats === prev.today.cats
        ) {
          return prev;
        }

        return {
          ...prev,
          today: {
            ...prev.today,
            people: newPeople,
            male: newMale,
            female: newFemale,
            emirati: newEmirati,
            nonEmirati: newNonEmirati,
            dogs: newDogs,
            cats: newCats,
          },
        };
      });
    };

    s.on("detections:live", handleLiveDetections);
    return () => {
      s.off("analytics:reset", load);
      s.off("detections:live", handleLiveDetections);
      releaseSocket();
    };
  }, [load]);

  const handleResetData = async () => {
    setResetting(true);
    setError(null);
    try {
      await api.post("/dashboard/reset");
      setShowResetModal(false);
      setResetSuccess("All test data, analytics counts, and detection history have been reset to 0!");
      await load();
      setTimeout(() => setResetSuccess(null), 5000);
    } catch (e) {
      setError(apiErrorMessage(e, "Failed to reset test data."));
    } finally {
      setResetting(false);
    }
  };

  const loading = !data && !error;
  const camerasLoading = cameras === null;
  const onlineCameras = cameras?.filter((c) => c.status === "ONLINE").length ?? 0;
  const totalCameras = cameras?.length ?? 0;
  const t = data?.today;

  const isDevResetEnabled =
    process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_TEST_RESET === "true";

  // Select the active camera for the live CCTV feed
  const enabledCameras = cameras?.filter((c) => c.enabled) ?? [];
  const activeCamera =
    enabledCameras.find((c) => c.id === selectedCameraId) ??
    enabledCameras.find((c) => c.status === "ONLINE") ??
    enabledCameras[0] ??
    null;

  const handleFullscreenCamera = () => {
    if (!activeCamera) return;
    const tile = document.getElementById(`overview-live-tile-${activeCamera.code}`);
    if (document.fullscreenElement) void document.exitFullscreen();
    else void tile?.requestFullscreen?.();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link id="btn-add-camera" href="/admin/cameras?new=1" className="btn btn-primary btn-sm">
            <FontAwesomeIcon icon={faPlus} /> Add Camera
          </Link>
          {isDevResetEnabled && (
            <button
              id="btn-reset-data"
              type="button"
              className="btn btn-outline-danger btn-sm flex items-center gap-1.5"
              onClick={() => setShowResetModal(true)}
              title="Development only: Reset all test counts and detection history to 0"
            >
              <FontAwesomeIcon icon={faTrashCan} /> Reset Test Data
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Switcher: Command Center Split, Camera Focus, Chart Focus */}
          <div className="btn-group" role="group" aria-label="Overview Layout Mode">
            <button
              type="button"
              id="btn-view-split"
              onClick={() => handleViewModeChange("split")}
              className={`btn btn-sm flex items-center gap-1.5 ${
                viewMode === "split" ? "btn-primary shadow-sm" : "btn-outline-gray"
              }`}
              title="Command Center: Live Camera and Live Analytics side-by-side"
            >
              <FontAwesomeIcon icon={faTowerBroadcast} />
              <span className="hidden sm:inline">Split</span> View
            </button>
            <button
              type="button"
              id="btn-view-camera"
              onClick={() => handleViewModeChange("camera")}
              className={`btn btn-sm flex items-center gap-1.5 ${
                viewMode === "camera" ? "btn-primary shadow-sm" : "btn-outline-gray"
              }`}
              title="Camera Focus: Expanded Live CCTV Feed"
            >
              <FontAwesomeIcon icon={faVideo} />
              <span className="hidden sm:inline">Camera</span> Focus
            </button>
            <button
              type="button"
              id="btn-view-chart"
              onClick={() => handleViewModeChange("chart")}
              className={`btn btn-sm flex items-center gap-1.5 ${
                viewMode === "chart" ? "btn-primary shadow-sm" : "btn-outline-gray"
              }`}
              title="Analytics Focus: Expanded Traffic Analytics Chart"
            >
              <FontAwesomeIcon icon={faChartLine} />
              <span className="hidden sm:inline">Analytics</span> Focus
            </button>
          </div>

          <div className="btn-group">
            <button id="btn-refresh" className="btn btn-outline-gray btn-sm" onClick={load}>
              <FontAwesomeIcon icon={faRotateRight} /> Refresh
            </button>
            <Link id="btn-reports" href="/admin/reports" className="btn btn-outline-gray btn-sm">
              Reports
            </Link>
          </div>
        </div>
      </div>

      {resetSuccess && (
        <div role="status" className="alert alert-success flex items-center justify-between gap-2 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faCheckCircle} /> {resetSuccess}
          </div>
          <button
            type="button"
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 px-2 py-0.5 rounded hover:bg-emerald-200/50"
            onClick={() => setResetSuccess(null)}
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="alert alert-danger flex items-center gap-2">
          <FontAwesomeIcon icon={faCircleExclamation} /> {error}
        </div>
      )}

      {/* ────────────────── Unified Command Center (Live Camera + Live Analytics) ────────────────── */}
      <div
        className={`grid gap-6 items-stretch ${
          viewMode === "split"
            ? "grid-cols-1 xl:grid-cols-12"
            : "grid-cols-1"
        }`}
      >
        {/* Live CCTV Video Monitor */}
        <div
          className={`${
            viewMode === "split"
              ? "xl:col-span-7"
              : viewMode === "camera"
              ? "order-1"
              : "order-2"
          } flex flex-col`}
        >
          <div className="card h-full flex flex-col overflow-hidden shadow-sm border border-gray-200">
            {/* Camera Header Bar */}
            <div className="card-header flex flex-wrap items-center justify-between gap-2.5 bg-gray-50/80 border-b border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <h2 className="card-title text-base font-bold flex items-center gap-2 text-gray-900 m-0">
                  <FontAwesomeIcon icon={faVideo} className="text-primary text-sm" />
                  Live Camera Feed
                </h2>
                {activeCamera?.status === "ONLINE" && (
                  <span className="badge badge-success text-[10px] tracking-wider uppercase font-bold px-2 py-0.5">
                    LIVE AI
                  </span>
                )}
              </div>

              {/* Camera Selector Pills (if multiple enabled cameras) */}
              {enabledCameras.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto max-w-[280px] py-0.5">
                  {enabledCameras.map((c) => {
                    const isSelected = activeCamera?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCameraId(c.id)}
                        className={`px-2.5 py-1 text-xs rounded font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-primary text-white shadow-sm ring-1 ring-primary"
                            : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                        }`}
                        title={`${c.name} (${c.code})`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            c.status === "ONLINE" ? "bg-emerald-400" : "bg-gray-400"
                          }`}
                        />
                        {c.code}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Live Camera Controls */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* 1-Click Stream Profile Switcher */}
                {activeCamera && (
                  <button
                    type="button"
                    id="btn-switch-overview-stream"
                    onClick={async () => {
                      if (switchingStream) return;
                      setSwitchingStream(true);
                      try {
                        const currentProfile = detectStreamProfile(activeCamera.rtspUrl, activeCamera.height);
                        const target = currentProfile === "MAINSTREAM" ? "SUBSTREAM" : "MAINSTREAM";
                        const res = await camerasApi.switchStream(activeCamera.id, target);
                        toast.success(res.message);
                      } catch {
                        toast.error("Could not switch stream profile");
                      } finally {
                        setSwitchingStream(false);
                      }
                    }}
                    disabled={switchingStream}
                    className={`btn btn-sm text-xs flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                      detectStreamProfile(activeCamera.rtspUrl, activeCamera.height) === "MAINSTREAM"
                        ? "btn-outline-primary"
                        : "bg-amber-500 text-gray-950 hover:bg-amber-400 border-none shadow-xs animate-pulse"
                    }`}
                    title={
                      detectStreamProfile(activeCamera.rtspUrl, activeCamera.height) === "MAINSTREAM"
                        ? "Currently on HD Mainstream. Click to switch to SD Substream (Low Bandwidth)."
                        : "💡 Pro Tip: Substream (SD) is active! Click to switch to HD Mainstream for 3x farther pedestrian detection on roads."
                    }
                  >
                    <FontAwesomeIcon icon={faBolt} className="text-xs" />
                    <span>
                      {switchingStream
                        ? "Switching…"
                        : detectStreamProfile(activeCamera.rtspUrl, activeCamera.height) === "MAINSTREAM"
                        ? "HD Main"
                        : "Switch to HD (3x Range)"}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  id="btn-toggle-overview-overlay"
                  onClick={() => setShowOverlay(!showOverlay)}
                  className={`btn btn-sm text-xs flex items-center gap-1.5 ${
                    showOverlay
                      ? "btn-secondary text-primary font-semibold"
                      : "btn-outline-gray"
                  }`}
                  title={showOverlay ? "Hide AI Detection Bounding Boxes" : "Show AI Detection Bounding Boxes"}
                >
                  <FontAwesomeIcon icon={showOverlay ? faEye : faEyeSlash} />
                  <span className="hidden sm:inline">AI Boxes:</span> {showOverlay ? "ON" : "OFF"}
                </button>

                {activeCamera && (
                  <button
                    type="button"
                    id="btn-fullscreen-overview-camera"
                    onClick={handleFullscreenCamera}
                    className="btn btn-outline-gray btn-sm px-2 text-xs"
                    title="Fullscreen Live Stream"
                  >
                    <FontAwesomeIcon icon={faExpand} />
                  </button>
                )}

                <Link
                  id="btn-link-video-wall"
                  href="/admin/live"
                  className="btn btn-outline-primary btn-sm text-xs flex items-center gap-1 font-medium"
                  title="Open Multi-Screen Video Wall Grid"
                >
                  <FontAwesomeIcon icon={faTableCellsLarge} />
                  <span className="hidden md:inline">Wall</span> ↗
                </Link>
              </div>
            </div>

            {/* Live Player Container */}
            <div className="card-body p-0 bg-gray-950 relative flex-1 flex flex-col justify-start">
              {activeCamera ? (
                <div
                  id={`overview-live-tile-${activeCamera.code}`}
                  className="relative w-full flex flex-col bg-gray-950 overflow-hidden"
                >
                  {activeCamera.enabled && activeCamera.status === "ONLINE" ? (
                    <>
                      {/* Clean 16:9 CCTV Video Stream Canvas */}
                      <div
                        className="relative w-full aspect-video bg-black overflow-hidden flex-shrink-0"
                        onDoubleClick={handleFullscreenCamera}
                      >
                        <WebRtcPlayer cameraId={activeCamera.id} label={activeCamera.name} />
                        <DetectionOverlay camera={activeCamera} showOverlay={showOverlay} />
                        <div className="live-tile-bar z-20">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="status-dot text-emerald-400" />
                            <span className="truncate font-semibold">{activeCamera.code} · {activeCamera.name}</span>
                            {activeCamera.location && (
                              <span className="text-[11px] text-gray-300 font-normal hidden sm:inline">
                                ({activeCamera.location})
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-xs">
                            <span
                              className={`badge text-[9px] py-0.5 font-bold ${
                                detectStreamProfile(activeCamera.rtspUrl, activeCamera.height) === "MAINSTREAM"
                                  ? "badge-primary"
                                  : "badge-warning"
                              }`}
                            >
                              {detectStreamProfile(activeCamera.rtspUrl, activeCamera.height) === "MAINSTREAM"
                                ? "HD MAINSTREAM"
                                : "SD SUBSTREAM"}
                            </span>
                            {activeCamera.width && activeCamera.height && (
                              <span className="hidden sm:inline text-gray-300">
                                {activeCamera.width}×{activeCamera.height}
                              </span>
                            )}
                            <span className="badge badge-success text-[10px] py-0.5">ONLINE</span>
                          </span>
                        </div>
                      </div>

                      {/* Attached Rectangular Details Box Below the CCTV Video */}
                      <CctvDetailsBar camera={activeCamera} />
                    </>
                  ) : (
                    <div className="p-8 text-center text-gray-400 space-y-2">
                      <FontAwesomeIcon icon={faVideoSlash} className="text-3xl text-gray-600 mb-2" />
                      <div className="text-sm font-semibold text-white">
                        {activeCamera.name} ({activeCamera.code})
                      </div>
                      <div className="text-xs text-gray-400">
                        {STATUS_META[activeCamera.status]?.label ?? activeCamera.status}
                        {activeCamera.lastError ? ` · ${activeCamera.lastError}` : ""}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-400 space-y-3">
                  <FontAwesomeIcon icon={faCamera} className="text-3xl text-gray-600 mb-1" />
                  <div className="text-sm font-semibold text-white">No cameras connected</div>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto">
                    Add your RTSP camera to stream live CCTV and run real-time AI analytics.
                  </p>
                  <Link href="/admin/cameras?new=1" className="btn btn-primary btn-sm inline-flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faPlus} /> Connect Camera
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Analytics Traffic Curve */}
        <div
          className={`${
            viewMode === "split"
              ? "xl:col-span-5 xl:mt-2.5"
              : viewMode === "camera"
              ? "order-2 mt-2"
              : "order-1"
          } flex flex-col`}
        >
          <HeroChartCard
            className="shadow-sm border border-cyan-200/50"
            title="People Count"
            value={t ? fmt(t.people) : "—"}
            subtitle={
              data
                ? data.peopleTrend === null
                  ? "Today · Realtime Flow"
                  : `${data.peopleTrend >= 0 ? "+" : ""}${data.peopleTrend}% vs yesterday`
                : "—"
            }
            ranges={{
              today: { label: "Today", data: data?.hourly ?? [] },
              week: { label: "Last 7 Days", data: data?.daily ?? [] },
            }}
            defaultRange="today"
            loading={loading}
          />
        </div>
      </div>

      {/* ────────────────── Real-Time Metrics & Demographic Stats ────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          id="stat-people-today"
          title="People Today"
          value={t ? fmt(t.people) : "—"}
          icon={faUsers}
          iconTone="primary"
          subtitle={data?.weekTotal !== undefined ? `${fmt(data.weekTotal)} in the last 7 days` : undefined}
          trend={data?.peopleTrend ?? undefined}
          trendSuffix="vs yesterday"
        />
        <StatCard
          id="stat-male"
          title="Male"
          value={t ? fmt(t.male) : "—"}
          icon={faMars}
          iconTone="info"
          subtitle={t ? pct(t.male, t.people) : undefined}
        />
        <StatCard
          id="stat-female"
          title="Female"
          value={t ? fmt(t.female) : "—"}
          icon={faVenus}
          iconTone="danger"
          subtitle={t ? pct(t.female, t.people) : undefined}
        />
        <StatCard
          id="stat-emirati"
          title="Emirati (Traditional)"
          value={t ? fmt(t.emirati ?? 0) : "—"}
          icon={faPassport}
          iconTone="info"
          subtitle={t ? pct(t.emirati ?? 0, t.people) : undefined}
        />
        <StatCard
          id="stat-non-emirati"
          title="Non-Emirati (Regular)"
          value={t ? fmt(t.nonEmirati ?? 0) : "—"}
          icon={faUserTie}
          iconTone="default"
          subtitle={t ? pct(t.nonEmirati ?? 0, t.people) : undefined}
        />
        <StatCard
          id="stat-pets"
          title="Pets"
          value={t ? fmt((t.dogs ?? 0) + (t.cats ?? 0)) : "—"}
          icon={faPaw}
          iconTone="success"
          subtitle={t ? `${fmt(t.dogs ?? 0)} dogs · ${fmt(t.cats ?? 0)} cats` : undefined}
        />
      </div>

      {/* ────────────────── Connected Cameras List ────────────────── */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="card-title">Connected Cameras</h2>
          <span className="text-muted text-xs font-semibold">
            {cameras ? `${onlineCameras}/${totalCameras} online` : "—"}
          </span>
        </div>
        {loading || camerasLoading ? (
          <div className="p-8 text-center text-muted">Loading cameras…</div>
        ) : cameras.length === 0 ? (
          <EmptyState
            icon={faCamera}
            title="No cameras connected yet"
            description="Add a camera with its RTSP URL to start realtime people, gender and pet counting."
            action={
              <Link id="empty-add-camera" href="/admin/cameras?new=1" className="btn btn-primary btn-sm">
                <FontAwesomeIcon icon={faPlus} /> Add Camera
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-volt" id="overview-cameras">
              <thead>
                <tr>
                  <th>Camera</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Resolution</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {cameras.slice(0, 8).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="font-semibold text-primary">{c.code}</span> · {c.name}
                    </td>
                    <td className="text-gray-700">{c.location ?? "—"}</td>
                    <td>
                      <CameraStatusBadge status={c.status} title={c.lastError} />
                    </td>
                    <td className="text-gray-700">
                      {c.width && c.height ? `${c.width}×${c.height}` : "—"}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCameraId(c.id);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="btn btn-outline-gray btn-sm text-xs"
                        title="View this camera in Live Feed above"
                      >
                        <FontAwesomeIcon icon={faVideo} /> View Live
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm animate-fade-in"
        >
          <div className="card w-full max-w-md shadow-2xl border border-gray-200">
            <div className="card-body p-6 space-y-4">
              <div className="flex items-center gap-3 text-red-600">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="text-xl" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Reset All Test Data?</h3>
                  <p className="text-xs text-gray-500">Instant wipe of analytics counts & detection logs</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 space-y-2 border border-gray-100">
                <p className="font-semibold text-gray-800">
                  What will be reset to 0:
                </p>
                <ul className="list-disc list-inside text-xs space-y-1 text-gray-500">
                  <li>Today visitors count, male, female & pet counts</li>
                  <li>Emirati and Non-Emirati distribution tallies</li>
                  <li>All detection history tracks and log entries</li>
                  <li>In-memory detector active tracks and deduplication</li>
                </ul>
                <p className="text-xs text-emerald-700 font-semibold pt-1">
                  ✔ Cameras, stream configs, and admin logins will remain intact.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-outline-gray btn-sm"
                  onClick={() => setShowResetModal(false)}
                  disabled={resetting}
                >
                  Cancel
                </button>
                <button
                  id="confirm-reset-btn"
                  type="button"
                  className="btn btn-danger btn-sm flex items-center gap-1.5"
                  onClick={handleResetData}
                  disabled={resetting}
                >
                  <FontAwesomeIcon
                    icon={resetting ? faSpinner : faTrashCan}
                    className={resetting ? "animate-spin" : ""}
                  />
                  {resetting ? "Resetting..." : "Yes, Reset Everything"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
