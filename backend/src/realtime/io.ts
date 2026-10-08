import type http from "http";
import { Server as SocketServer } from "socket.io";
import { prisma } from "../lib/prisma";
import { ACCESS_COOKIE, verifyAccessToken } from "../lib/tokens";
import { initDetectorBridge } from "./detector-bridge";

/**
 * Socket.IO server for realtime pushes to the admin UI.
 * Auth: the same httpOnly access-token cookie as the REST API (same-origin via Next rewrites).
 * Every authenticated socket joins the "admins" room.
 */

let io: SocketServer | null = null;

export const ADMIN_ROOM = "admins";

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function initRealtime(server: http.Server, origins: string[]): SocketServer {
  io = new SocketServer(server, {
    path: "/socket.io",
    addTrailingSlash: false, // "/socket.io?EIO=4…" — survives Next rewrites (no 308 on trailing slash)
    cors: { origin: origins, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, ACCESS_COOKIE);
      if (!token) return next(new Error("unauthorized"));
      const payload = verifyAccessToken(token);
      const admin = await prisma.admin.findUnique({ where: { id: payload.sub }, select: { id: true, isActive: true } });
      if (!admin?.isActive) return next(new Error("unauthorized"));
      socket.data.adminId = admin.id;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    void socket.join(ADMIN_ROOM);
  });

  initDetectorBridge(io);

  return io;
}

/** Broadcast to all logged-in admins (no-op before init). */
export function emitToAdmins(event: string, payload: unknown) {
  io?.to(ADMIN_ROOM).emit(event, payload);
}
