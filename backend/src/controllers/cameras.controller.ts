import type { Request, Response } from "express";
import { z } from "zod";
import { Prisma, type Camera } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { probeRtsp, snapshotJpeg } from "../lib/ffmpeg";
import * as mtx from "../lib/mediamtx";
import {
  convertStreamUrl,
  detectStreamProfile,
  parseRtsp,
  rtspIdentity,
  rtspInfo,
  rtspUrlSchema,
  streamPathFor,
  withCredentials,
  type StreamProfile,
} from "../lib/rtsp";
import { forgetCamera, markConnecting, requestSync } from "../services/camera-monitor";
import { emitToAdmins } from "../realtime/io";
import { pushDetectorConfig } from "../realtime/detector-bridge";

// ───────────────────────────── DTO ─────────────────────────────

/** Public shape — the raw RTSP URL (with password) never leaves the API. */
export function toCameraDto(c: Camera) {
  const info = rtspInfo(c.rtspUrl);
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    location: c.location,
    rtspUrl: info.masked,
    username: info.username,
    hasPassword: info.hasPassword,
    host: info.host,
    streamProfile: detectStreamProfile(c.rtspUrl, c.height),
    enabled: c.enabled,
    analyticsFps: c.analyticsFps,
    detectPersons: c.detectPersons,
    detectGender: c.detectGender,
    detectPets: c.detectPets,
    detectNationality: c.detectNationality,
    zoneMode: c.zoneMode,
    customZonePoints: c.customZonePoints,
    status: c.status,
    lastSeenAt: c.lastSeenAt,
    lastError: c.lastError,
    width: c.width,
    height: c.height,
    streamPath: streamPathFor(c.code),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// ────────────────────────── Validation ─────────────────────────

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const settingsShape = {
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  location: optionalText(120),
  enabled: z.boolean().optional(),
  analyticsFps: z.number().int().min(1).max(25).optional(),
  detectPersons: z.boolean().optional(),
  detectGender: z.boolean().optional(),
  detectPets: z.boolean().optional(),
  detectNationality: z.boolean().optional(),
  zoneMode: z.enum(["FULL_FRAME", "CUSTOM"]).optional(),
  customZonePoints: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).optional().nullable(),
};

const credentialsShape = {
  username: z.string().trim().max(128).optional().nullable(),
  password: z.string().max(256).optional().nullable(),
};

const createSchema = z.object({ ...settingsShape, rtspUrl: rtspUrlSchema, ...credentialsShape });
const updateSchema = z.object({ ...settingsShape, rtspUrl: rtspUrlSchema, ...credentialsShape }).partial();
const testSchema = z.object({ rtspUrl: rtspUrlSchema, ...credentialsShape, cameraId: z.string().uuid().optional() });
export const zoneSchema = z.object({
  zoneMode: z.enum(["FULL_FRAME", "CUSTOM"]),
  customZonePoints: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).optional().nullable(),
});

function badRequest(res: Response, error: z.ZodError) {
  return res.status(400).json({ success: false, message: error.issues[0]?.message ?? "Validation failed", errors: error.issues });
}

/** Applies separate username/password fields on top of the URL (empty password = keep URL's). */
function buildUrl(rtspUrl: string, username?: string | null, password?: string | null) {
  const pwd = password === "" || password === null ? undefined : password;
  return username !== undefined && username !== null && username !== "" ? withCredentials(rtspUrl, username, pwd) : rtspUrl;
}

async function findDuplicate(url: string, exceptId?: string) {
  const identity = rtspIdentity(url);
  const all = await prisma.camera.findMany({ select: { id: true, code: true, name: true, rtspUrl: true } });
  return all.find((c) => c.id !== exceptId && rtspIdentity(c.rtspUrl) === identity);
}

async function nextCode(): Promise<string> {
  const last = await prisma.camera.findFirst({ orderBy: { code: "desc" }, select: { code: true } });
  const n = last ? Number(last.code.replace(/\D/g, "")) + 1 : 1;
  return `CAM-${String(n).padStart(3, "0")}`;
}

async function getCamera(req: Request, res: Response): Promise<Camera | null> {
  const id = String(req.params.id);
  const cam = await prisma.camera.findUnique({ where: { id } }).catch(() => null);
  if (!cam) res.status(404).json({ success: false, message: "Camera not found" });
  return cam;
}

/** Push the path to MediaMTX right away (best effort — the monitor retries). */
async function applyStream(cam: Camera) {
  try {
    if (cam.enabled) {
      await mtx.upsertPath(streamPathFor(cam.code), cam.rtspUrl);
      markConnecting(cam.id);
    } else {
      await mtx.deletePath(streamPathFor(cam.code));
    }
  } catch {
    /* monitor will reconcile + report ERROR */
  }
  requestSync();
}

// ─────────────────────────── Handlers ──────────────────────────

export async function list(_req: Request, res: Response) {
  const cameras = await prisma.camera.findMany({ orderBy: { code: "asc" } });
  res.json({ success: true, data: { cameras: cameras.map(toCameraDto), limit: env.MAX_CAMERAS } });
}

export async function getOne(req: Request, res: Response) {
  const cam = await getCamera(req, res);
  if (cam) res.json({ success: true, data: toCameraDto(cam) });
}

export async function create(req: Request, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const { username, password, rtspUrl, ...settings } = parsed.data;

  if ((await prisma.camera.count()) >= env.MAX_CAMERAS) {
    return res.status(409).json({ success: false, message: `Camera limit reached (${env.MAX_CAMERAS}). Remove a camera or raise MAX_CAMERAS.` });
  }
  const url = buildUrl(rtspUrl, username, password);
  const dup = await findDuplicate(url);
  if (dup) return res.status(409).json({ success: false, message: `This stream is already added as ${dup.code} · ${dup.name}` });

  let cam: Camera | null = null;
  for (let attempt = 0; attempt < 3 && !cam; attempt++) {
    try {
      cam = await prisma.camera.create({
        data: {
          ...settings,
          customZonePoints: settings.customZonePoints ?? Prisma.JsonNull,
          rtspUrl: url,
          code: await nextCode(),
          status: settings.enabled === false ? "DISABLED" : "CONNECTING",
        } as Prisma.CameraCreateInput,
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  if (!cam) return res.status(409).json({ success: false, message: "Could not allocate a camera code, please retry" });

  await applyStream(cam);
  emitToAdmins("cameras:changed", { id: cam.id, action: "created" });
  void pushDetectorConfig();
  res.status(201).json({ success: true, data: toCameraDto(cam) });
}

export async function update(req: Request, res: Response) {
  const cam = await getCamera(req, res);
  if (!cam) return;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const { username, password, rtspUrl, ...settings } = parsed.data;

  let url = cam.rtspUrl;
  if (rtspUrl !== undefined) {
    // New URL: keep the stored password when the user leaves the password field empty
    // and the username is unchanged (the UI only ever sees the masked URL).
    const prev = parseRtsp(cam.rtspUrl);
    const next = parseRtsp(buildUrl(rtspUrl, username, password));
    if (next && prev?.password && !next.password && next.username && next.username === prev.username) {
      next.password = prev.password;
    }
    url = next?.toString() ?? rtspUrl;
  } else if (username !== undefined || (password !== undefined && password !== "")) {
    url = withCredentials(cam.rtspUrl, username === undefined ? undefined : username || null, password || undefined);
  }

  if (url !== cam.rtspUrl) {
    const dup = await findDuplicate(url, cam.id);
    if (dup) return res.status(409).json({ success: false, message: `This stream is already added as ${dup.code} · ${dup.name}` });
  }

  const sourceChanged = url !== cam.rtspUrl || (settings.enabled !== undefined && settings.enabled !== cam.enabled);
  const updated = await prisma.camera.update({
    where: { id: cam.id },
    data: {
      ...settings,
      customZonePoints: settings.customZonePoints !== undefined ? (settings.customZonePoints ?? Prisma.JsonNull) : undefined,
      rtspUrl: url,
      ...(sourceChanged ? { status: (settings.enabled ?? cam.enabled) ? "CONNECTING" : "DISABLED", lastError: null } : {}),
    } as Prisma.CameraUpdateInput,
  });
  if (sourceChanged) await applyStream(updated);
  emitToAdmins("cameras:changed", { id: updated.id, action: "updated" });
  void pushDetectorConfig();
  res.json({ success: true, data: toCameraDto(updated) });
}

export async function remove(req: Request, res: Response) {
  const cam = await getCamera(req, res);
  if (!cam) return;
  await prisma.camera.delete({ where: { id: cam.id } });
  forgetCamera(cam.id);
  await mtx.deletePath(streamPathFor(cam.code)).catch(() => undefined);
  requestSync();
  emitToAdmins("cameras:changed", { id: cam.id, action: "deleted" });
  void pushDetectorConfig();
  res.json({ success: true, message: `${cam.code} deleted` });
}

/** Test an RTSP URL before saving (Add/Edit form). With `cameraId` + empty password, the saved password is reused. */
export async function testUrl(req: Request, res: Response) {
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const { rtspUrl, username, password, cameraId } = parsed.data;
  let url = buildUrl(rtspUrl, username, password);
  if (cameraId && !password) {
    const saved = await prisma.camera.findUnique({ where: { id: cameraId }, select: { rtspUrl: true } });
    const prev = saved ? parseRtsp(saved.rtspUrl) : null;
    const next = parseRtsp(url);
    if (prev?.password && next && !next.password && next.username && next.username === prev.username) {
      next.password = prev.password;
      url = next.toString();
    }
  }
  const result = await probeRtsp(url);
  res.json({ success: true, data: result });
}

/** Test a saved camera (uses stored credentials) and remember resolution / error. */
export async function testSaved(req: Request, res: Response) {
  const cam = await getCamera(req, res);
  if (!cam) return;
  const result = await probeRtsp(cam.rtspUrl);
  await prisma.camera.update({
    where: { id: cam.id },
    data: result.ok ? { width: result.width, height: result.height, lastError: null } : { lastError: result.error },
  });
  res.json({ success: true, data: result });
}

/** Single JPEG frame from the relayed stream (zone editor / thumbnails). */
export async function snapshot(req: Request, res: Response) {
  const cam = await getCamera(req, res);
  if (!cam) return;
  if (!cam.enabled) return res.status(409).json({ success: false, message: "Camera is disabled" });
  const jpeg = await snapshotJpeg(`${env.MEDIAMTX_RTSP_URL}/${streamPathFor(cam.code)}`);
  if (!jpeg) return res.status(503).json({ success: false, message: "Stream is not available right now" });
  res.set({ "content-type": "image/jpeg", "cache-control": "no-store" }).send(jpeg);
}

/** Update zone mode (FULL_FRAME vs CUSTOM) and custom polygon points */
export async function updateZone(req: Request, res: Response) {
  const cam = await getCamera(req, res);
  if (!cam) return;
  const parsed = zoneSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);

  const updated = await prisma.camera.update({
    where: { id: cam.id },
    data: {
      zoneMode: parsed.data.zoneMode,
      customZonePoints: (parsed.data.customZonePoints ?? Prisma.DbNull) as Prisma.InputJsonValue,
    },
  });
  emitToAdmins("cameras:changed", { id: updated.id, action: "updated" });
  void pushDetectorConfig();
  res.json({ success: true, data: toCameraDto(updated) });
}

/** Toggle or switch camera stream between MAINSTREAM (HD/2K) and SUBSTREAM (SD/Smooth) */
export async function switchStream(req: Request, res: Response) {
  const cam = await getCamera(req, res);
  if (!cam) return;

  const target = req.body?.profile as StreamProfile | undefined;
  const currentProfile = detectStreamProfile(cam.rtspUrl, cam.height);
  const nextProfile: StreamProfile = target ?? (currentProfile === "MAINSTREAM" ? "SUBSTREAM" : "MAINSTREAM");
  const newUrl = convertStreamUrl(cam.rtspUrl, nextProfile);

  if (newUrl === cam.rtspUrl) {
    return res.status(400).json({
      success: false,
      message: `Could not automatically determine the alternative ${nextProfile.toLowerCase()} URL for this camera format. Please edit the RTSP URL manually in camera settings.`,
    });
  }

  // Quick async probe to get updated resolution if available
  let probeW: number | null = null;
  let probeH: number | null = null;
  try {
    const probe = await probeRtsp(newUrl);
    if (probe.ok) {
      probeW = probe.width;
      probeH = probe.height;
    }
  } catch {
    // non-fatal
  }

  const updated = await prisma.camera.update({
    where: { id: cam.id },
    data: {
      rtspUrl: newUrl,
      ...(probeW && probeH ? { width: probeW, height: probeH } : {}),
      lastError: null,
    },
  });

  await applyStream(updated);
  emitToAdmins("cameras:changed", { id: updated.id, action: "updated" });
  void pushDetectorConfig();
  requestSync();

  return res.json({
    success: true,
    data: toCameraDto(updated),
    message: `Switched to ${nextProfile === "MAINSTREAM" ? "Mainstream (High Resolution / 3x Detection Range)" : "Substream (Low Bandwidth / Smooth)"}`,
  });
}

