"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClockRotateLeft,
  faDownload,
  faFilter,
  faMars,
  faPaw,
  faRotateRight,
  faUser,
  faVenus,
  faPassport,
  faUserTie,
  faQuestion,
  faCircleExclamation,
  faTrashCan,
  faTriangleExclamation,
  faCheckCircle,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import { api, apiErrorMessage } from "@/lib/api";
import { useCameras } from "@/hooks/useCameras";
import EmptyState from "@/components/ui/EmptyState";

interface DetectionTrack {
  id: string;
  cameraId: string;
  camera: {
    id: string;
    code: string;
    name: string;
    location: string | null;
  };
  trackKey: string;
  class: "PERSON" | "DOG" | "CAT";
  gender: "MALE" | "FEMALE" | "UNKNOWN";
  genderConfidence: number | null;
  nationality: "EMIRATI" | "NON_EMIRATI" | "UNKNOWN";
  nationalityConfidence: number | null;
  confidence: number;
  firstSeenAt: string;
  lastSeenAt: string;
  dwellSeconds: number;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function HistoryView() {
  const { cameras } = useCameras();
  const [tracks, setTracks] = useState<DetectionTrack[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedCamera, setSelectedCamera] = useState("ALL");
  const [selectedClass, setSelectedClass] = useState("ALL");
  const [selectedGender, setSelectedGender] = useState("ALL");
  const [selectedNationality, setSelectedNationality] = useState("ALL");
  const [page, setPage] = useState(1);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState<string | null>(null);

  const isDevResetEnabled =
    process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_TEST_RESET === "true";

  useEffect(() => {
    document.title = "Detection History · Lovosis Detection";
    let active = true;
    const load = async () => {
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "25");
        if (selectedCamera !== "ALL") params.set("cameraId", selectedCamera);
        if (selectedClass !== "ALL") params.set("class", selectedClass);
        if (selectedGender !== "ALL") params.set("gender", selectedGender);
        if (selectedNationality !== "ALL") params.set("nationality", selectedNationality);

        const res = await api.get<{
          data: { tracks: DetectionTrack[]; pagination: Pagination };
        }>(`/history?${params.toString()}`);

        if (!active) return;
        setTracks(res.data.data.tracks);
        setPagination(res.data.data.pagination);
      } catch (e) {
        if (active) setError(apiErrorMessage(e, "Failed to load detection history"));
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [page, selectedCamera, selectedClass, selectedGender, selectedNationality]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "25");
      if (selectedCamera !== "ALL") params.set("cameraId", selectedCamera);
      if (selectedClass !== "ALL") params.set("class", selectedClass);
      if (selectedGender !== "ALL") params.set("gender", selectedGender);
      if (selectedNationality !== "ALL") params.set("nationality", selectedNationality);

      const res = await api.get<{
        data: { tracks: DetectionTrack[]; pagination: Pagination };
      }>(`/history?${params.toString()}`);

      setTracks(res.data.data.tracks);
      setPagination(res.data.data.pagination);
    } catch (e) {
      setError(apiErrorMessage(e, "Failed to load detection history"));
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (selectedCamera !== "ALL") params.set("cameraId", selectedCamera);
    if (selectedClass !== "ALL") params.set("class", selectedClass);
    if (selectedGender !== "ALL") params.set("gender", selectedGender);
    if (selectedNationality !== "ALL") params.set("nationality", selectedNationality);

    window.open(`${process.env.NEXT_PUBLIC_API_URL ?? "/api"}/history/export?${params.toString()}`, "_blank");
  };

  const handleClearHistory = async () => {
    setClearing(true);
    setError(null);
    try {
      await api.post("/dashboard/reset");
      setShowClearModal(false);
      setClearSuccess("All detection history, tracks, and test counts have been reset to 0.");
      setPage(1);
      await handleRefresh();
      setTimeout(() => setClearSuccess(null), 5000);
    } catch (e) {
      setError(apiErrorMessage(e, "Failed to clear detection history."));
    } finally {
      setClearing(false);
    }
  };

  const formatLocalTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(d);
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Export */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Detection History</h1>
          <p className="text-muted text-sm">
            Search, filter and audit all tracked people, gender classifications, traditional attire and pet events.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button id="btn-refresh-history" className="btn btn-outline-gray btn-sm" onClick={handleRefresh}>
            <FontAwesomeIcon icon={faRotateRight} /> Refresh
          </button>
          <button id="btn-export-csv" className="btn btn-primary btn-sm" onClick={handleExportCsv}>
            <FontAwesomeIcon icon={faDownload} /> Export CSV
          </button>
          {isDevResetEnabled && (
            <button
              id="btn-clear-history"
              type="button"
              className="btn btn-outline-danger btn-sm flex items-center gap-1.5"
              onClick={() => setShowClearModal(true)}
              title="Development only: Clear all detection tracks and reset counts to 0"
            >
              <FontAwesomeIcon icon={faTrashCan} /> Clear All History
            </button>
          )}
        </div>
      </div>

      {clearSuccess && (
        <div role="status" className="alert alert-success flex items-center justify-between gap-2 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faCheckCircle} /> {clearSuccess}
          </div>
          <button
            type="button"
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 px-2 py-0.5 rounded hover:bg-emerald-200/50"
            onClick={() => setClearSuccess(null)}
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

      {/* Filter Bar */}
      <div className="card">
        <div className="card-body">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
            <div>
              <label className="text-xs font-semibold text-gray-700">Camera</label>
              <select
                id="filter-camera"
                className="form-select mt-1 w-full"
                value={selectedCamera}
                onChange={(e) => {
                  setSelectedCamera(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">All Cameras</option>
                {cameras?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700">Object Class</label>
              <select
                id="filter-class"
                className="form-select mt-1 w-full"
                value={selectedClass}
                onChange={(e) => {
                  setSelectedClass(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">All Objects</option>
                <option value="PERSON">Person</option>
                <option value="DOG">Dog</option>
                <option value="CAT">Cat</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700">Gender</label>
              <select
                id="filter-gender"
                className="form-select mt-1 w-full"
                value={selectedGender}
                onChange={(e) => {
                  setSelectedGender(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">All Genders</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="UNKNOWN">Unknown / N/A</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700">Attire / Nationality</label>
              <select
                id="filter-nationality"
                className="form-select mt-1 w-full"
                value={selectedNationality}
                onChange={(e) => {
                  setSelectedNationality(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">All Attire Styles</option>
                <option value="EMIRATI">🇦🇪 Emirati (Traditional Attire)</option>
                <option value="NON_EMIRATI">Non-Emirati (Regular / Casual)</option>
                <option value="UNKNOWN">Unknown / N/A</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                id="btn-reset-filters"
                className="btn btn-outline-gray w-full text-xs"
                onClick={() => {
                  setSelectedCamera("ALL");
                  setSelectedClass("ALL");
                  setSelectedGender("ALL");
                  setSelectedNationality("ALL");
                  setPage(1);
                }}
              >
                <FontAwesomeIcon icon={faFilter} /> Reset Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="card overflow-hidden">
        <div className="card-header flex items-center justify-between">
          <h5 className="card-title">Recorded Detections ({pagination.total})</h5>
          <span className="badge badge-gray">Page {pagination.page} of {pagination.totalPages}</span>
        </div>

        {loading ? (
          <div className="card-body space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : tracks.length === 0 ? (
          <EmptyState
            icon={faClockRotateLeft}
            title="No detections found"
            description="No detection tracks match the selected filters or time period."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-volt" id="history-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Camera</th>
                  <th>Class</th>
                  <th>Gender</th>
                  <th>Attire / Nationality</th>
                  <th>Dwell Time</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((t) => (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap font-medium text-gray-900">
                      {formatLocalTime(t.firstSeenAt)}
                    </td>
                    <td>
                      <span className="font-semibold text-primary">{t.camera.code}</span>
                      <div className="text-xs text-gray-600">{t.camera.name}</div>
                    </td>
                    <td>
                      {t.class === "PERSON" && (
                        <span className="badge badge-secondary inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faUser} /> Person
                        </span>
                      )}
                      {t.class === "DOG" && (
                        <span className="badge badge-warning inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faPaw} /> Dog
                        </span>
                      )}
                      {t.class === "CAT" && (
                        <span className="badge badge-warning inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faPaw} /> Cat
                        </span>
                      )}
                    </td>
                    <td>
                      {t.gender === "MALE" && (
                        <span className="badge badge-secondary inline-flex items-center gap-1">
                          <FontAwesomeIcon icon={faMars} /> Male
                        </span>
                      )}
                      {t.gender === "FEMALE" && (
                        <span className="badge badge-danger inline-flex items-center gap-1">
                          <FontAwesomeIcon icon={faVenus} /> Female
                        </span>
                      )}
                      {t.gender === "UNKNOWN" && (
                        <span className="badge badge-gray inline-flex items-center gap-1">
                          <FontAwesomeIcon icon={faQuestion} /> Unknown
                        </span>
                      )}
                      {t.genderConfidence && (
                        <span className="ml-1.5 text-xs text-gray-600">
                          {Math.round(t.genderConfidence * 100)}%
                        </span>
                      )}
                    </td>
                    <td>
                      {t.nationality === "EMIRATI" && (
                        <span className="badge badge-success inline-flex items-center gap-1">
                          <FontAwesomeIcon icon={faPassport} /> 🇦🇪 Emirati (Traditional)
                        </span>
                      )}
                      {t.nationality === "NON_EMIRATI" && (
                        <span className="badge badge-gray inline-flex items-center gap-1">
                          <FontAwesomeIcon icon={faUserTie} /> Non-Emirati (Regular)
                        </span>
                      )}
                      {t.nationality === "UNKNOWN" && (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                      {t.nationalityConfidence && (
                        <span className="ml-1.5 text-xs text-gray-600">
                          {Math.round(t.nationalityConfidence * 100)}%
                        </span>
                      )}
                    </td>
                    <td className="text-gray-700">
                      {t.dwellSeconds}s
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-800">
                          {Math.round(t.confidence * 100)}%
                        </span>
                        <div className="h-1.5 w-16 overflow-hidden rounded bg-gray-300">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${Math.round(t.confidence * 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {pagination.totalPages > 1 && (
          <div className="card-footer flex items-center justify-between">
            <span className="text-xs text-gray-700">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
            </span>
            <div className="btn-group">
              <button
                id="btn-prev-page"
                className="btn btn-outline-gray btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                id="btn-next-page"
                className="btn btn-outline-gray btn-sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Clear History Confirmation Modal */}
      {showClearModal && (
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
                  <h3 className="text-lg font-bold text-gray-900">Clear All Detection History?</h3>
                  <p className="text-xs text-gray-500">Deletes all detection tracks & resets counts</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 space-y-2 border border-gray-100">
                <p className="font-semibold text-gray-800">
                  What will be reset:
                </p>
                <ul className="list-disc list-inside text-xs space-y-1 text-gray-500">
                  <li>All historical detection records, tracks & time stamps</li>
                  <li>Today visitor tallies (People, Male, Female, Emirati, Pets)</li>
                  <li>In-memory tracker active cache and deduplication memory</li>
                </ul>
                <p className="text-xs text-emerald-700 font-semibold pt-1">
                  ✔ Your cameras, settings, and admin logins are preserved.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-outline-gray btn-sm"
                  onClick={() => setShowClearModal(false)}
                  disabled={clearing}
                >
                  Cancel
                </button>
                <button
                  id="confirm-clear-history-btn"
                  type="button"
                  className="btn btn-danger btn-sm flex items-center gap-1.5"
                  onClick={handleClearHistory}
                  disabled={clearing}
                >
                  <FontAwesomeIcon icon={clearing ? faSpinner : faTrashCan} className={clearing ? "animate-spin" : ""} />
                  {clearing ? "Clearing..." : "Yes, Clear History"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

