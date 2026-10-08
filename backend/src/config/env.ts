import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  REFRESH_TTL_DAYS: z.coerce.number().default(7),
  REFRESH_REMEMBER_TTL_DAYS: z.coerce.number().default(30),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  COOKIE_DOMAIN: z.string().optional(),
  // Streaming / cameras
  MEDIAMTX_API_URL: z.string().url().default("http://127.0.0.1:9997"),
  MEDIAMTX_WEBRTC_URL: z.string().url().default("http://127.0.0.1:8889"),
  MEDIAMTX_RTSP_URL: z.string().default("rtsp://127.0.0.1:8554"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  MAX_CAMERAS: z.coerce.number().int().min(1).max(128).default(32),
  DETECTOR_SECRET: z.string().default("lovosis-detector-local-secret-32ch"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment:", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
