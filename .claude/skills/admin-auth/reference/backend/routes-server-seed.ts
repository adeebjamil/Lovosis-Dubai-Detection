// @ts-nocheck — reference only (no node_modules here). REMOVE this line when copying into the real app.
// ============================================================================
// Reference: backend/src/routes/auth.routes.ts
// ============================================================================
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth";
import * as auth from "../controllers/auth.controller";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Please try again later." },
});
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false });

export const authRouter = Router();
authRouter.post("/login", loginLimiter, auth.login);
authRouter.post("/refresh", refreshLimiter, auth.refresh);
authRouter.post("/logout", auth.logout);
authRouter.post("/logout-all", requireAuth, auth.logoutAll);
authRouter.get("/me", requireAuth, auth.me);
authRouter.post("/change-password", requireAuth, auth.changePassword);

// ============================================================================
// Reference: backend/src/server.ts (relevant parts)
// ============================================================================
/*
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.routes";

const app = express();
app.set("trust proxy", 1);                       // correct req.ip behind nginx / Next rewrites
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGINS ?? "").split(",").filter(Boolean), credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
// app.use("/api/<module>", requireAuth, <moduleRouter>);   ← every business router is protected

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ success: false, message: "Internal server error" });
});

app.listen(Number(process.env.PORT ?? 5000), () => console.log(`API on :${process.env.PORT ?? 5000}`));
*/

// ============================================================================
// Reference: backend/src/lib/prisma.ts
// ============================================================================
/*
import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
*/

// ============================================================================
// Reference: backend/prisma/seed.ts
// ============================================================================
/*
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const name = process.env.ADMIN_SEED_NAME ?? "Super Admin";
  const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!email || !password || password.length < 8) {
    throw new Error("ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD (min 8 chars) are required");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.admin.upsert({
    where: { email },
    update: {},                                   // never overwrite an existing admin's password
    create: { name, email, passwordHash, role: "SUPER_ADMIN" },
  });
  console.log(`✔ Super admin ready: ${email}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
*/
