import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import * as cameras from "../controllers/cameras.controller";
import * as streams from "../controllers/streams.controller";

// ffprobe/ffmpeg spawn a process per call — keep them bounded.
const probeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many connection tests. Please wait a minute." },
});

export const camerasRouter = Router();

camerasRouter.get("/", cameras.list);
camerasRouter.post("/", cameras.create);
camerasRouter.post("/test", probeLimiter, cameras.testUrl);
camerasRouter.get("/:id", cameras.getOne);
camerasRouter.patch("/:id", cameras.update);
camerasRouter.delete("/:id", cameras.remove);
camerasRouter.post("/:id/test", probeLimiter, cameras.testSaved);
camerasRouter.get("/:id/snapshot", probeLimiter, cameras.snapshot);
camerasRouter.put("/:id/zone", cameras.updateZone);

export const streamsRouter = Router();

streamsRouter.post("/:id/whep", express.text({ type: "application/sdp", limit: "256kb" }), streams.whepOffer);
streamsRouter.delete("/:id/whep/:session", streams.whepClose);
