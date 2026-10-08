import { env } from "../config/env";

/** Minimal client for the MediaMTX v3 Control API (localhost only). */

export class MediaMtxError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(env.MEDIAMTX_API_URL + path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    throw new MediaMtxError(0, "Stream server (MediaMTX) is not reachable");
  }
  if (!res.ok) throw new MediaMtxError(res.status, (await res.text().catch(() => "")) || res.statusText);
  const type = res.headers.get("content-type") ?? "";
  return type.includes("json") ? ((await res.json()) as T) : null;
}

export interface MtxConfPath {
  name: string;
  source?: string;
}

export interface MtxTrack {
  codec?: string;
  codecProps?: { width?: number; height?: number };
}

export interface MtxPath {
  name: string;
  ready?: boolean;
  available?: boolean;
  tracks2?: MtxTrack[];
  readers?: unknown[];
  inboundBytes?: number;
  bytesReceived?: number;
}

interface List<T> {
  items: T[];
}

export const isPathLive = (p?: MtxPath) => Boolean(p && (p.available ?? p.ready));

export async function listConfigPaths(): Promise<MtxConfPath[]> {
  return (await call<List<MtxConfPath>>("GET", "/v3/config/paths/list?itemsPerPage=1000"))?.items ?? [];
}

export async function listPaths(): Promise<MtxPath[]> {
  return (await call<List<MtxPath>>("GET", "/v3/paths/list?itemsPerPage=1000"))?.items ?? [];
}

/** Adds or replaces a pull path for a camera. */
export async function upsertPath(name: string, source: string): Promise<void> {
  const conf = { source, sourceOnDemand: false, rtspTransport: "tcp" };
  try {
    await call("POST", `/v3/config/paths/add/${encodeURIComponent(name)}`, conf);
  } catch (e) {
    if (e instanceof MediaMtxError && e.status === 400) {
      await call("POST", `/v3/config/paths/replace/${encodeURIComponent(name)}`, conf);
    } else throw e;
  }
}

export async function deletePath(name: string): Promise<void> {
  try {
    await call("DELETE", `/v3/config/paths/delete/${encodeURIComponent(name)}`);
  } catch (e) {
    if (!(e instanceof MediaMtxError && e.status === 404)) throw e;
  }
}

/** Resolution of the first video track, when MediaMTX exposes it. */
export function videoSize(p?: MtxPath): { width: number; height: number } | null {
  const t = p?.tracks2?.find((x) => x.codecProps?.width && x.codecProps?.height);
  return t?.codecProps?.width && t.codecProps.height ? { width: t.codecProps.width, height: t.codecProps.height } : null;
}
