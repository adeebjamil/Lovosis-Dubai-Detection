import type { Request, Response } from "express";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { streamPathFor } from "../lib/rtsp";

/**
 * Authenticated WHEP proxy → MediaMTX (which only listens on 127.0.0.1).
 * The browser POSTs its SDP offer (ICE gathering complete); we return the SDP answer.
 * Media then flows directly browser ⇄ MediaMTX over UDP :8189.
 */

const SESSION_RE = /^[a-zA-Z0-9-]{8,64}$/;

async function cameraPath(req: Request, res: Response): Promise<string | null> {
  const cam = await prisma.camera
    .findUnique({ where: { id: String(req.params.id) }, select: { code: true, enabled: true } })
    .catch(() => null);
  if (!cam) {
    res.status(404).json({ success: false, message: "Camera not found" });
    return null;
  }
  if (!cam.enabled) {
    res.status(409).json({ success: false, message: "Camera is disabled" });
    return null;
  }
  return streamPathFor(cam.code);
}

export async function whepOffer(req: Request, res: Response) {
  const offer = typeof req.body === "string" ? req.body : "";
  if (!offer.startsWith("v=0")) return res.status(400).json({ success: false, message: "Expected an SDP offer" });
  const path = await cameraPath(req, res);
  if (!path) return;

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(`${env.MEDIAMTX_WEBRTC_URL}/${path}/whep`, {
      method: "POST",
      headers: { "content-type": "application/sdp" },
      body: offer,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return res.status(502).json({ success: false, message: "Stream server (MediaMTX) is not reachable" });
  }

  if (upstream.status === 404) return res.status(503).json({ success: false, message: "Camera stream is not available yet" });
  if (!upstream.ok) return res.status(502).json({ success: false, message: `Stream server error (${upstream.status})` });

  const answer = await upstream.text();
  const sessionId = upstream.headers.get("location")?.split("/").filter(Boolean).pop() ?? null;
  res.status(201).json({ success: true, data: { answer, sessionId } });
}

export async function whepClose(req: Request, res: Response) {
  const session = String(req.params.session);
  if (!SESSION_RE.test(session)) return res.status(400).json({ success: false, message: "Invalid session" });
  const path = await cameraPath(req, res);
  if (!path) return;
  await fetch(`${env.MEDIAMTX_WEBRTC_URL}/${path}/whep/${session}`, {
    method: "DELETE",
    signal: AbortSignal.timeout(4000),
  }).catch(() => undefined);
  res.status(204).end();
}
