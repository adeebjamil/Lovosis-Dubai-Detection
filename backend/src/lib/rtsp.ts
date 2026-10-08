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
