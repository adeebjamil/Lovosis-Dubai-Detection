// @ts-nocheck — reference only (no node_modules here). REMOVE this line when copying into the real app.
// Reference: backend/src/lib/tokens.ts
import crypto from "crypto";
import jwt, { type SignOptions, type JwtPayload } from "jsonwebtoken";
import type { CookieOptions, Request, Response } from "express";
import type { AdminRole } from "@prisma/client";
import { prisma } from "./prisma";

export const ACCESS_COOKIE = "admin_at";   // httpOnly JWT, 15 min
export const REFRESH_COOKIE = "admin_rt";  // httpOnly opaque token, path /api/auth
export const SESSION_COOKIE = "admin_session"; // httpOnly flag "1", path / — lets Next proxy know a session exists

const isProd = process.env.NODE_ENV === "production";
const ACCESS_TTL_MS = 15 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export interface AccessPayload { sub: string; role: AdminRole; email: string }

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: (process.env.JWT_ACCESS_TTL ?? "15m") as SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessPayload & JwtPayload {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as AccessPayload & JwtPayload;
}

export const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");

export function refreshTtlMs(remember: boolean): number {
  const days = remember
    ? Number(process.env.REFRESH_REMEMBER_TTL_DAYS ?? 30)
    : Number(process.env.REFRESH_TTL_DAYS ?? 7);
  return days * DAY;
}

/** Creates + persists a refresh token (hashed). Returns the raw token for the cookie. */
export async function issueRefreshToken(adminId: string, req: Request, ttlMs: number) {
  const raw = crypto.randomBytes(64).toString("hex");
  const record = await prisma.refreshToken.create({
    data: {
      adminId,
      tokenHash: hashToken(raw),
      userAgent: req.get("user-agent")?.slice(0, 255),
      ip: req.ip,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return { raw, record };
}

const base: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax",
  domain: process.env.COOKIE_DOMAIN || undefined,
};

export function setAuthCookies(res: Response, accessToken: string, refreshRaw: string, refreshExpires: Date) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, path: "/", maxAge: ACCESS_TTL_MS });
  res.cookie(REFRESH_COOKIE, refreshRaw, { ...base, path: "/api/auth", expires: refreshExpires });
  res.cookie(SESSION_COOKIE, "1", { ...base, path: "/", expires: refreshExpires });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...base, path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: "/api/auth" });
  res.clearCookie(SESSION_COOKIE, { ...base, path: "/" });
}

/** Fields safe to send to the client. */
export const publicAdminSelect = {
  id: true, name: true, email: true, role: true, avatarUrl: true,
  isActive: true, lastLoginAt: true, createdAt: true,
} as const;
