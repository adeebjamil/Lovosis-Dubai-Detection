import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  REFRESH_COOKIE, clearAuthCookies, hashToken, issueRefreshToken, publicAdminSelect,
  refreshTtlMs, setAuthCookies, signAccessToken,
} from "../lib/tokens";

const BCRYPT_COST = 12;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const REUSE_GRACE_MS = 10_000; // parallel-tab refresh race window
const INVALID = "Invalid email or password";
// Used when the email doesn't exist so response time is the same (no user enumeration).
const DUMMY_HASH = bcrypt.hashSync("timing-safe-dummy-password", BCRYPT_COST);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  remember: z.boolean().optional().default(false),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128)
    .regex(/[A-Za-z]/, "Must contain a letter")
    .regex(/\d/, "Must contain a number"),
});

async function startSession(req: Request, res: Response, adminId: string, ttlMs: number) {
  const admin = await prisma.admin.findUniqueOrThrow({ where: { id: adminId }, select: publicAdminSelect });
  const access = signAccessToken({ sub: admin.id, role: admin.role, email: admin.email });
  const { raw, record } = await issueRefreshToken(admin.id, req, ttlMs);
  setAuthCookies(res, access, raw, record.expiresAt);
  return { admin, refreshId: record.id };
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: INVALID, errors: parsed.error.issues });
  }
  const { email, password, remember } = parsed.data;
  const admin = await prisma.admin.findUnique({ where: { email } });

  if (!admin) {
    await bcrypt.compare(password, DUMMY_HASH);
    return res.status(401).json({ success: false, message: INVALID });
  }
  if (!admin.isActive) {
    return res.status(403).json({ success: false, message: "Account disabled. Contact a super admin." });
  }
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    const mins = Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 60_000);
    return res.status(423).json({ success: false, message: `Too many attempts. Try again in ${mins} minute(s).` });
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    const attempts = admin.failedLoginAttempts + 1;
    const lock = attempts >= MAX_ATTEMPTS;
    await prisma.admin.update({
      where: { id: admin.id },
      data: {
        failedLoginAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    return res.status(401).json({ success: false, message: INVALID });
  }

  await prisma.admin.update({
    where: { id: admin.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: req.ip },
  });
  const { admin: publicAdmin } = await startSession(req, res, admin.id, refreshTtlMs(remember));
  return res.json({ success: true, data: { admin: publicAdmin } });
}

export async function refresh(req: Request, res: Response) {
  const raw: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (!raw) {
    clearAuthCookies(res);
    return res.status(401).json({ success: false, message: "Session expired" });
  }

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { admin: { select: { id: true, isActive: true } } },
  });

  if (!existing) {
    clearAuthCookies(res);
    return res.status(401).json({ success: false, message: "Session expired" });
  }

  if (existing.revokedAt) {
    // Another tab just rotated this token → benign race, let client retry with new cookies.
    if (existing.replacedBy && Date.now() - existing.revokedAt.getTime() < REUSE_GRACE_MS) {
      return res.status(409).json({ success: false, code: "REFRESH_RACE", message: "Retry" });
    }
    // Real reuse of a rotated token → possible theft → kill every session of this admin.
    await prisma.refreshToken.updateMany({
      where: { adminId: existing.adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    clearAuthCookies(res);
    return res.status(401).json({ success: false, message: "Session revoked. Please sign in again." });
  }

  if (existing.expiresAt < new Date() || !existing.admin.isActive) {
    clearAuthCookies(res);
    return res.status(401).json({ success: false, message: "Session expired" });
  }

  // Rotate, keeping the original session length (7d or 30d "remember me").
  const ttlMs = existing.expiresAt.getTime() - existing.createdAt.getTime();
  const { admin, refreshId } = await startSession(req, res, existing.adminId, ttlMs);
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedBy: refreshId },
  });
  return res.json({ success: true, data: { admin } });
}

export async function logout(req: Request, res: Response) {
  const raw: string | undefined = req.cookies?.[REFRESH_COOKIE];
  if (raw) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  clearAuthCookies(res);
  return res.json({ success: true, message: "Logged out" });
}

export async function logoutAll(req: Request, res: Response) {
  await prisma.refreshToken.updateMany({
    where: { adminId: req.admin!.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  clearAuthCookies(res);
  return res.json({ success: true, message: "Logged out from all devices" });
}

export async function me(req: Request, res: Response) {
  return res.json({ success: true, data: { admin: req.admin } });
}

export async function changePassword(req: Request, res: Response) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Validation failed", errors: parsed.error.issues });
  }
  const admin = await prisma.admin.findUniqueOrThrow({ where: { id: req.admin!.id } });
  const ok = await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash);
  if (!ok) return res.status(400).json({ success: false, message: "Current password is incorrect" });

  await prisma.$transaction([
    prisma.admin.update({
      where: { id: admin.id },
      data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, BCRYPT_COST) },
    }),
    prisma.refreshToken.updateMany({
      where: { adminId: admin.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  // Keep current device signed in with a fresh session.
  await startSession(req, res, admin.id, refreshTtlMs(false));
  return res.json({ success: true, message: "Password updated" });
}
