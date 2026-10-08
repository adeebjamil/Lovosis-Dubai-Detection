import { spawn } from "child_process";
import { env } from "../config/env";
import { scrubSecrets } from "./rtsp";

/**
 * ffprobe / ffmpeg wrappers. Always spawned WITHOUT a shell; callers must validate the URL
 * with `parseRtsp` first (only rtsp:// and rtsps:// — never file:// or other protocols).
 */

interface RunResult {
  code: number | null;
  stdout: Buffer;
  stderr: string;
  timedOut: boolean;
}

function run(bin: string, args: string[], timeoutMs: number, maxBytes = 8 * 1024 * 1024): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let size = 0;
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      size += d.length;
      if (size <= maxBytes) out.push(d);
      else child.kill("SIGKILL");
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < 16_000) stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: Buffer.alloc(0), stderr: `spawn error: ${err.message}`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(out), stderr, timedOut });
    });
  });
}

export interface ProbeOk {
  ok: true;
  codec: string;
  width: number;
  height: number;
  fps: number | null;
  latencyMs: number;
}
export interface ProbeFail {
  ok: false;
  error: string;
  latencyMs: number;
}

function friendlyError(stderr: string, timedOut: boolean, url: string): string {
  const s = stderr.toLowerCase();
  if (s.includes("spawn error")) return "ffprobe is not installed or FFPROBE_PATH is wrong on the server";
  if (timedOut || s.includes("timed out") || s.includes("timeout")) return "Camera did not respond in time — check the IP address, port and network";
  if (s.includes("401") || s.includes("unauthorized")) return "Authentication failed — check the camera username and password";
  if (s.includes("403") || s.includes("forbidden")) return "Access denied by the camera (403)";
  if (s.includes("404") || s.includes("not found")) return "Stream path not found — check the path after the IP (e.g. /Streaming/Channels/101)";
  if (s.includes("refused")) return "Connection refused — check the RTSP port (usually 554)";
  if (s.includes("no route") || s.includes("unreachable")) return "Camera is unreachable from this server — check the network/VLAN";
  if (s.includes("invalid data")) return "The URL did not return a valid video stream";
  const last = stderr.trim().split(/\r?\n/).filter(Boolean).pop();
  return last ? scrubSecrets(last, url).slice(0, 200) : "Could not open the stream";
}

const parseFps = (r?: string): number | null => {
  if (!r) return null;
  const [a, b] = r.split("/").map(Number);
  if (!a || !b) return null;
  return Math.round((a / b) * 10) / 10;
};

/** Opens the RTSP stream once and reads the first video stream's properties. */
export async function probeRtsp(url: string, timeoutMs = 12_000): Promise<ProbeOk | ProbeFail> {
  const started = Date.now();
  const r = await run(
    env.FFPROBE_PATH,
    [
      "-v", "error",
      "-rtsp_transport", "tcp",
      "-timeout", String((timeoutMs - 2000) * 1000), // µs — socket I/O timeout
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,width,height,avg_frame_rate,r_frame_rate",
      "-of", "json",
      url,
    ],
    timeoutMs,
  );
  const latencyMs = Date.now() - started;
  if (r.code === 0) {
    try {
      const s = (JSON.parse(r.stdout.toString()) as {
        streams?: { codec_name?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string }[];
      }).streams?.[0];
      if (s?.width && s.height) {
        return {
          ok: true,
          codec: (s.codec_name ?? "unknown").toUpperCase(),
          width: s.width,
          height: s.height,
          fps: parseFps(s.avg_frame_rate) ?? parseFps(s.r_frame_rate),
          latencyMs,
        };
      }
      return { ok: false, error: "Connected, but no video stream was found", latencyMs };
    } catch {
      return { ok: false, error: "Unexpected ffprobe output", latencyMs };
    }
  }
  return { ok: false, error: friendlyError(r.stderr, r.timedOut, url), latencyMs };
}

/** Grabs one JPEG frame (max 1280px wide). */
export async function snapshotJpeg(url: string, timeoutMs = 10_000): Promise<Buffer | null> {
  const r = await run(
    env.FFMPEG_PATH,
    [
      "-hide_banner", "-loglevel", "error",
      "-rtsp_transport", "tcp",
      "-timeout", String((timeoutMs - 2000) * 1000),
      "-i", url,
      "-frames:v", "1",
      "-vf", "scale='min(1280,iw)':-2",
      "-q:v", "4",
      "-f", "image2", "-c:v", "mjpeg",
      "pipe:1",
    ],
    timeoutMs,
  );
  return r.code === 0 && r.stdout.length > 0 ? r.stdout : null;
}
