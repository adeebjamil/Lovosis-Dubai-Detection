// @ts-nocheck — reference only (no node_modules here). REMOVE this line when copying into the real app.
// Reference: backend/src/middleware/auth.ts
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { AdminRole, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ACCESS_COOKIE, publicAdminSelect, verifyAccessToken } from "../lib/tokens";

export type PublicAdmin = Prisma.AdminGetPayload<{ select: typeof publicAdminSelect }>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { admin?: PublicAdmin }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token: string | undefined =
    req.cookies?.[ACCESS_COOKIE] ?? (header?.startsWith("Bearer ") ? header.slice(7) : undefined);

  if (!token) {
    return res.status(401).json({ success: false, code: "NO_TOKEN", message: "Not authenticated" });
  }

  try {
    const payload = verifyAccessToken(token);
    const admin = await prisma.admin.findUnique({ where: { id: payload.sub }, select: publicAdminSelect });
    if (!admin || !admin.isActive) {
      return res.status(401).json({ success: false, code: "INVALID_TOKEN", message: "Not authenticated" });
    }
    req.admin = admin;
    next();
  } catch (err) {
    const code = err instanceof jwt.TokenExpiredError ? "TOKEN_EXPIRED" : "INVALID_TOKEN";
    return res.status(401).json({ success: false, code, message: "Not authenticated" });
  }
}

export function requireRole(...roles: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    next();
  };
}
