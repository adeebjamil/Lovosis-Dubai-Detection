import { env } from "./config/env";
import http from "http";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { prisma } from "./lib/prisma";
import { authRouter } from "./routes/auth.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { camerasRouter, streamsRouter } from "./routes/cameras.routes";
import { historyRouter } from "./routes/history.routes";
import { reportsRouter } from "./routes/reports.routes";
import { modelsRouter } from "./routes/models.routes";
import { settingsRouter } from "./routes/settings.routes";
import { adminsRouter } from "./routes/admins.routes";
import { requireAuth } from "./middleware/auth";
import { initRealtime } from "./realtime/io";
import { startCameraMonitor, stopCameraMonitor } from "./services/camera-monitor";

const origins = env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);

const app = express();
app.set("trust proxy", 1); // correct req.ip behind Next rewrites / nginx
app.use(helmet());
app.use(cors({ origin: origins, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  let db = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "down";
  }
  res.json({ success: true, data: { api: "ok", db, time: new Date().toISOString() } });
});

app.use("/api/auth", authRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/cameras", requireAuth, camerasRouter);
app.use("/api/streams", requireAuth, streamsRouter);
app.use("/api/history", requireAuth, historyRouter);
app.use("/api/reports", requireAuth, reportsRouter);
app.use("/api/models", requireAuth, modelsRouter);
app.use("/api/settings", requireAuth, settingsRouter);
app.use("/api/admins", requireAuth, adminsRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ success: false, message: "Not found" });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[api] unhandled error:", err);
  res.status(500).json({ success: false, message: "Internal server error" });
});

const server = http.createServer(app);

// Realtime channel to the admin UI (camera status now, live counts in P2).
initRealtime(server, origins);

server.listen(env.PORT, () => {
  console.log(`✔ Lovosis Detection API listening on http://localhost:${env.PORT}`);
  startCameraMonitor();
});

const shutdown = async () => {
  stopCameraMonitor();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
