import { z } from "zod";

/**
 * RTSP URL helpers.
 * Camera URLs often embed credentials (rtsp://user:pass@ip:554/stream) — they are stored
 * as-is (local DB) but MUST be masked before leaving the API and scrubbed from logs.
 */

export function parseRtsp(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "rtsp:" && u.protocol !== "rtsps:") return null;
    if (!u.hostname) return null;
    return u;
  } catch {
    return null;
  }
}

export const rtspUrlSchema = z
  .string()
  .trim()
  .min(1, "RTSP URL is required")
  .max(1024)
  .refine((v) => parseRtsp(v) !== null, "Enter a valid RTSP URL, e.g. rtsp://192.168.1.64:554/Streaming/Channels/101");

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Replaces (or adds) credentials. `password === undefined` keeps the existing one. */
export function withCredentials(raw: string, username?: string | null, password?: string | null): string {
  const u = parseRtsp(raw);
  if (!u) return raw;
  if (username !== undefined) {
    u.username = username ?? "";
    if (!username) u.password = "";
  }
  if (password !== undefined && u.username) u.password = password ?? "";
  return u.toString();
}

export function rtspInfo(raw: string) {
  const u = parseRtsp(raw);
  if (!u) return { masked: "invalid", username: null as string | null, hasPassword: false, host: null as string | null };
  const user = u.username ? safeDecode(u.username) : null;
  const auth = u.username ? `${u.username}${u.password ? ":****" : ""}@` : "";
  return {
    masked: `${u.protocol}//${auth}${u.host}${u.pathname}${u.search}`,
    username: user,
    hasPassword: Boolean(u.password),
    host: u.hostname,
  };
}

/** URL without credentials — used to detect the same stream added twice. */
export function rtspIdentity(raw: string): string {
  const u = parseRtsp(raw);
  if (!u) return raw;
  return `${u.protocol}//${u.hostname.toLowerCase()}:${u.port || "554"}${u.pathname}${u.search}`;
}

/** Removes any credentials / raw URLs from a free-text message (ffprobe stderr etc.). */
export function scrubSecrets(text: string, raw?: string): string {
  let out = text.replace(/(rtsps?:\/\/)[^@\s/]+@/gi, "$1****@");
  if (raw) {
    const u = parseRtsp(raw);
    if (u?.password) out = out.split(u.password).join("****").split(safeDecode(u.password)).join("****");
  }
  return out;
}

/** MediaMTX path name for a camera code: CAM-001 → cam-001 */
export const streamPathFor = (code: string) => code.toLowerCase();

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
    // Dahua / CP Plus: subtype=1 -> subtype=0
    result = result.replace(/([?&]subtype=)[1-9]\d*/i, "$10");
    // Hikvision: /Channels/102 -> /Channels/101, /Channels/202 -> /Channels/201
    result = result.replace(/(\/Channels\/\d+0)[2-9]/i, "$11");
    // Hikvision alternative: /sub/ -> /main/
    result = result.replace(/\/sub\//i, "/main/");
    // Uniview: /s1/ -> /s0/
    result = result.replace(/\/s[1-9]\//i, "/s0/");
    // Milesight / Tiandy / Generic: /video2 -> /video1
    result = result.replace(/(\/video)[2-9]/i, "$11");
    // Hanwha: /profile2/ -> /profile1/
    result = result.replace(/\/profile[2-9]\//i, "/profile1/");
    // Generic stream param: stream=1 -> stream=0
    result = result.replace(/([?&]stream=)[1-9]\d*/i, "$10");
  } else {
    // Dahua / CP Plus: subtype=0 -> subtype=1
    result = result.replace(/([?&]subtype=)0/i, "$11");
    // Hikvision: /Channels/101 -> /Channels/102
    result = result.replace(/(\/Channels\/\d+0)1/i, "$12");
    // Hikvision alternative: /main/ -> /sub/
    result = result.replace(/\/main\//i, "/sub/");
    // Uniview: /s0/ -> /s1/
    result = result.replace(/\/s0\//i, "/s1/");
    // Milesight / Generic: /video1 -> /video2
    result = result.replace(/(\/video)1/i, "$12");
    // Hanwha: /profile1/ -> /profile2/
    result = result.replace(/\/profile1\//i, "/profile2/");
    // Generic stream param: stream=0 -> stream=1
    result = result.replace(/([?&]stream=)0/i, "$11");
  }
  return result;
}
