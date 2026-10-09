import { api } from "./api";

export type CameraStatus = "ONLINE" | "CONNECTING" | "OFFLINE" | "ERROR" | "DISABLED";

export interface Camera {
  id: string;
  code: string;
  name: string;
  location: string | null;
  /** Masked — password is always "****" */
  rtspUrl: string;
  username: string | null;
  hasPassword: boolean;
  host: string | null;
  enabled: boolean;
  analyticsFps: number;
  detectPersons: boolean;
  detectGender: boolean;
  detectPets: boolean;
  detectNationality?: boolean;
  zoneMode?: "FULL_FRAME" | "CUSTOM";
  customZonePoints?: [number, number][] | null;
  status: CameraStatus;
  lastSeenAt: string | null;
  lastError: string | null;
  width: number | null;
  height: number | null;
  streamPath: string;
  streamProfile?: "MAINSTREAM" | "SUBSTREAM";
  createdAt: string;
  updatedAt: string;
}

export interface CameraInput {
  name: string;
  location?: string | null;
  rtspUrl: string;
  username?: string | null;
  password?: string | null;
  enabled?: boolean;
  analyticsFps?: number;
  detectPersons?: boolean;
  detectGender?: boolean;
  detectPets?: boolean;
  detectNationality?: boolean;
  zoneMode?: "FULL_FRAME" | "CUSTOM";
  customZonePoints?: [number, number][] | null;
}

export interface DetectionBox {
  trackId: number;
  class: "PERSON" | "DOG" | "CAT";
  gender?: "MALE" | "FEMALE" | "UNKNOWN";
  nationality?: "EMIRATI" | "NON_EMIRATI" | "UNKNOWN";
  box: [number, number, number, number]; // [x1, y1, x2, y2] normalized 0..1
  inZone: boolean;
  confidence: number;
  dwellSeconds?: number;
  isCounted?: boolean;
}

export interface LiveFramePayload {
  cameraId: string;
  timestamp: number;
  counts: {
    live: {
      persons: number;
      male: number;
      female: number;
      unknownGender: number;
      emirati: number;
      nonEmirati: number;
      unknownNationality: number;
      pets: number;
      dogs: number;
      cats: number;
    };
    today: {
      persons: number;
      male: number;
      female: number;
      emirati: number;
      nonEmirati: number;
      pets: number;
      dogs: number;
      cats: number;
    };
  };
  boxes: DetectionBox[];
}

export type CameraStatusUpdate = Pick<Camera, "id" | "status" | "lastSeenAt" | "lastError" | "width" | "height">;

export type ProbeResult =
  | { ok: true; codec: string; width: number; height: number; fps: number | null; latencyMs: number }
  | { ok: false; error: string; latencyMs: number };

export const camerasApi = {
  list: () => api.get<{ data: { cameras: Camera[]; limit: number } }>("/cameras").then((r) => r.data.data),
  create: (body: CameraInput) => api.post<{ data: Camera }>("/cameras", body).then((r) => r.data.data),
  update: (id: string, body: Partial<CameraInput>) => api.patch<{ data: Camera }>(`/cameras/${id}`, body).then((r) => r.data.data),
  updateZone: (id: string, body: { zoneMode: "FULL_FRAME" | "CUSTOM"; customZonePoints?: [number, number][] | null }) =>
    api.put<{ data: Camera }>(`/cameras/${id}/zone`, body).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/cameras/${id}`),
  test: (body: Pick<CameraInput, "rtspUrl" | "username" | "password"> & { cameraId?: string }) =>
    api.post<{ data: ProbeResult }>("/cameras/test", body).then((r) => r.data.data),
  testSaved: (id: string) => api.post<{ data: ProbeResult }>(`/cameras/${id}/test`).then((r) => r.data.data),
  switchStream: (id: string, profile?: "MAINSTREAM" | "SUBSTREAM") =>
    api.post<{ success: boolean; data: Camera; message: string }>(`/cameras/${id}/switch-stream`, { profile }).then((r) => r.data),
  snapshotUrl: (id: string) => `/api/cameras/${id}/snapshot?t=${Date.now()}`,
};

export const STATUS_META: Record<CameraStatus, { label: string; badge: string; color: string }> = {
  ONLINE: { label: "Online", badge: "badge-success", color: "text-success" },
  CONNECTING: { label: "Connecting", badge: "badge-warning", color: "text-warning" },
  OFFLINE: { label: "Offline", badge: "badge-danger", color: "text-danger" },
  ERROR: { label: "Error", badge: "badge-danger", color: "text-danger" },
  DISABLED: { label: "Disabled", badge: "badge-gray", color: "text-gray-600" },
};

/** "rtsp://user:****@host/path" → "rtsp://host/path" (credentials are edited in separate fields). */
export function stripCredentials(url: string): string {
  return url.replace(/^(rtsps?:\/\/)[^@/]*@/i, "$1");
}

export const isRtspUrl = (v: string) => /^rtsps?:\/\/[^\s/?#]+/i.test(v.trim());

export function describeProbe(r: ProbeResult): string {
  if (!r.ok) return r.error;
  const fps = r.fps ? ` · ${r.fps} fps` : "";
  return `Connected · ${r.codec} · ${r.width}×${r.height}${fps} · ${(r.latencyMs / 1000).toFixed(1)}s`;
}

export type StreamProfile = "MAINSTREAM" | "SUBSTREAM";

export function detectStreamProfile(url: string, height?: number | null): StreamProfile {
  const lower = (url || "").toLowerCase();
  if (
    lower.includes("subtype=1") ||
    lower.includes("subtype=2") ||
    lower.includes("/channels/102") ||
    lower.includes("/channels/202") ||
    lower.includes("/s1/") ||
    lower.includes("/video2") ||
    lower.includes("/profile2") ||
    lower.includes("/sub/")
  ) {
    return "SUBSTREAM";
  }
  if (
    lower.includes("subtype=0") ||
    lower.includes("/channels/101") ||
    lower.includes("/channels/201") ||
    lower.includes("/s0/") ||
    lower.includes("/video1") ||
    lower.includes("/profile1") ||
    lower.includes("/main/")
  ) {
    return "MAINSTREAM";
  }
  if (height && height < 720) return "SUBSTREAM";
  return "MAINSTREAM";
}

export function convertStreamUrl(url: string, targetProfile: StreamProfile): string {
  let result = url;
  if (targetProfile === "MAINSTREAM") {
    result = result.replace(/([?&]subtype=)[1-9]\d*/i, "$10");
    result = result.replace(/(\/Channels\/\d+0)[2-9]/i, "$11");
    result = result.replace(/\/sub\//i, "/main/");
    result = result.replace(/\/s[1-9]\//i, "/s0/");
    result = result.replace(/(\/video)[2-9]/i, "$11");
    result = result.replace(/\/profile[2-9]\//i, "/profile1/");
    result = result.replace(/([?&]stream=)[1-9]\d*/i, "$10");
  } else {
    result = result.replace(/([?&]subtype=)0/i, "$11");
    result = result.replace(/(\/Channels\/\d+0)1/i, "$12");
    result = result.replace(/\/main\//i, "/sub/");
    result = result.replace(/\/s0\//i, "/s1/");
    result = result.replace(/(\/video)1/i, "$12");
    result = result.replace(/\/profile1\//i, "/profile2/");
    result = result.replace(/([?&]stream=)0/i, "$11");
  }
  return result;
}
