import type { Camera, CameraStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import * as mtx from "../lib/mediamtx";
import { streamPathFor } from "../lib/rtsp";
import { emitToAdmins } from "../realtime/io";

/**
 * Keeps MediaMTX in sync with the Camera table (DB = source of truth) and tracks each
 * camera's live status. Runs every few seconds; also triggered right after CRUD.
 *
 *   enabled + stream live        → ONLINE
 *   enabled + recently (re)added → CONNECTING (grace period)
 *   enabled + not live           → OFFLINE
 *   MediaMTX unreachable         → ERROR
 *   disabled                     → DISABLED (path removed)
 */

const TICK_MS = 5_000;
const CONNECT_GRACE_MS = 30_000;
const LAST_SEEN_WRITE_MS = 60_000;
const PATH_PREFIX = "cam-";

const connectingSince = new Map<string, number>();
let running = false;
let rerun = false;
let timer: NodeJS.Timeout | null = null;

export interface CameraStatusUpdate {
  id: string;
  status: CameraStatus;
  lastSeenAt: string | null;
  lastError: string | null;
  width: number | null;
  height: number | null;
}

/** Marks a camera as (re)connecting — call after creating/updating its source. */
export function markConnecting(id: string) {
  connectingSince.set(id, Date.now());
}

export function forgetCamera(id: string) {
  connectingSince.delete(id);
}

/** Run a sync as soon as possible (coalesced). */
export function requestSync() {
  setTimeout(() => void tick(), 50);
}

async function syncPaths(cameras: Camera[]) {
  const conf = await mtx.listConfigPaths();
  const confByName = new Map(conf.map((p) => [p.name, p]));
  const wanted = new Set<string>();

  for (const cam of cameras) {
    if (!cam.enabled) continue;
    const name = streamPathFor(cam.code);
    wanted.add(name);
    if (confByName.get(name)?.source !== cam.rtspUrl) {
      await mtx.upsertPath(name, cam.rtspUrl);
      markConnecting(cam.id);
    }
  }
  for (const p of conf) {
    if (p.name.startsWith(PATH_PREFIX) && !wanted.has(p.name)) await mtx.deletePath(p.name);
  }
}

async function tick() {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    const cameras = await prisma.camera.findMany();
    let live = new Map<string, mtx.MtxPath>();
    let serverError: string | null = null;

    try {
      await syncPaths(cameras);
      live = new Map((await mtx.listPaths()).map((p) => [p.name, p]));
    } catch (e) {
      serverError = e instanceof Error ? e.message : "Stream server error";
    }

    const now = Date.now();
    const changed: CameraStatusUpdate[] = [];

    for (const cam of cameras) {
      const path = live.get(streamPathFor(cam.code));
      const isLive = mtx.isPathLive(path);
      let status: CameraStatus;
      let lastError = cam.lastError;

      if (!cam.enabled) status = "DISABLED";
      else if (serverError) {
        status = "ERROR";
        lastError = serverError;
      } else if (isLive) {
        status = "ONLINE";
        lastError = null;
        connectingSince.delete(cam.id);
      } else if (now - (connectingSince.get(cam.id) ?? 0) < CONNECT_GRACE_MS) status = "CONNECTING";
      else status = "OFFLINE";

      const size = mtx.videoSize(path);
      const data: Prisma.CameraUpdateInput = {};
      if (status !== cam.status) data.status = status;
      if (lastError !== cam.lastError) data.lastError = lastError;
      if (size && (size.width !== cam.width || size.height !== cam.height)) Object.assign(data, size);
      if (status === "ONLINE" && (!cam.lastSeenAt || now - cam.lastSeenAt.getTime() > LAST_SEEN_WRITE_MS)) {
        data.lastSeenAt = new Date(now);
      }
      if (Object.keys(data).length === 0) continue;

      const updated = await prisma.camera.update({ where: { id: cam.id }, data });
      if (data.status !== undefined || data.lastError !== undefined || data.width !== undefined) {
        changed.push({
          id: updated.id,
          status: updated.status,
          lastSeenAt: updated.lastSeenAt?.toISOString() ?? null,
          lastError: updated.lastError,
          width: updated.width,
          height: updated.height,
        });
      }
    }

    if (changed.length) emitToAdmins("cameras:status", changed);
  } catch (e) {
    console.error("[camera-monitor] tick failed:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
    if (rerun) {
      rerun = false;
      requestSync();
    }
  }
}

export function startCameraMonitor() {
  if (timer) return;
  void tick();
  timer = setInterval(() => void tick(), TICK_MS);
}

export function stopCameraMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
}
