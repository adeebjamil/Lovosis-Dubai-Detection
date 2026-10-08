import { io, type Socket } from "socket.io-client";
import { api } from "./api";

/**
 * One shared Socket.IO connection per tab (same-origin, proxied by next.config rewrites).
 * Auth = the httpOnly access cookie. If the server rejects the handshake because the
 * 15-min access token expired, refresh once and reconnect.
 */

let socket: Socket | null = null;
let users = 0;
let authRetries = 0;

export function acquireSocket(): Socket {
  if (!socket) {
    const s = io({ path: "/socket.io", addTrailingSlash: false, withCredentials: true });
    s.on("connect", () => {
      authRetries = 0;
    });
    s.on("connect_error", async (err) => {
      if (err.message !== "unauthorized" || authRetries >= 3) return;
      authRetries++;
      try {
        await api.post("/auth/refresh");
      } catch {
        /* refresh failure → api layer logs the user out on next request */
      }
      setTimeout(() => s.connect(), 1000 * authRetries);
    });
    socket = s;
  }
  users++;
  return socket;
}

export function releaseSocket() {
  users = Math.max(0, users - 1);
  if (users === 0 && socket) {
    socket.disconnect();
    socket = null;
  }
}
