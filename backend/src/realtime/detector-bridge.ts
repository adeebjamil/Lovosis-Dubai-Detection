import type { Namespace, Server as SocketServer } from "socket.io";
import { Prisma } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { streamPathFor } from "../lib/rtsp";
import { emitToAdmins } from "./io";

export interface DetectionBox {
  trackId: number;
  class: "PERSON" | "DOG" | "CAT";
  gender?: "MALE" | "FEMALE" | "UNKNOWN";
  nationality?: "EMIRATI" | "NON_EMIRATI" | "UNKNOWN";
  box: [number, number, number, number]; // [x1, y1, x2, y2] normalized 0..1
  inZone: boolean;
  confidence: number;
}

export interface LiveFramePayload {
  cameraId: string;
  timestamp: number;
  counts: {
    live: {
      persons: number;
      male: number;
      female: number;
      unknownGender: number;
      emirati: number;
      nonEmirati: number;
      unknownNationality: number;
      pets: number;
      dogs: number;
      cats: number;
    };
    today: {
      persons: number;
      male: number;
      female: number;
      emirati: number;
      nonEmirati: number;
      pets: number;
      dogs: number;
      cats: number;
    };
  };
  boxes: DetectionBox[];
}

export interface FinishedTrackPayload {
  cameraId: string;
  trackKey: string;
  class: "PERSON" | "DOG" | "CAT";
  gender: "MALE" | "FEMALE" | "UNKNOWN";
  genderConfidence?: number;
  nationality: "EMIRATI" | "NON_EMIRATI" | "UNKNOWN";
  nationalityConfidence?: number;
  confidence: number;
  firstSeenAt: string;
  lastSeenAt: string;
  dwellSeconds: number;
}

let detectorNs: Namespace | null = null;
const latestPerCamera = new Map<string, LiveFramePayload>();

export async function getDetectorCameraConfigs() {
  const cameras = await prisma.camera.findMany({
    where: { enabled: true },
    select: {
      id: true,
      code: true,
      name: true,
      rtspUrl: true,
      analyticsFps: true,
      detectPersons: true,
      detectGender: true,
      detectPets: true,
      detectNationality: true,
      zoneMode: true,
      customZonePoints: true,
      width: true,
      height: true,
    },
  });

  return cameras.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    streamPath: streamPathFor(c.code),
    // Local MediaMTX RTSP stream for detector inference
    localRtspUrl: `${env.MEDIAMTX_RTSP_URL}/${streamPathFor(c.code)}`,
    analyticsFps: c.analyticsFps,
    detectPersons: c.detectPersons,
    detectGender: c.detectGender,
    detectPets: c.detectPets,
    detectNationality: c.detectNationality,
    zoneMode: c.zoneMode,
    customZonePoints: (c.customZonePoints ?? []) as [number, number][],
  }));
}

export async function pushDetectorConfig() {
  if (!detectorNs) return;
  try {
    const configs = await getDetectorCameraConfigs();
    detectorNs.emit("config:cameras", configs);
  } catch (err) {
    console.error("[detector-bridge] failed to push camera configs:", err);
  }
}

export function initDetectorBridge(io: SocketServer) {
  detectorNs = io.of("/detector");

  detectorNs.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token !== env.DETECTOR_SECRET) {
      console.warn("[detector-bridge] rejected unauthorized detector connection");
      return next(new Error("unauthorized detector"));
    }
    next();
  });

  detectorNs.on("connection", async (socket) => {
    console.log("[detector-bridge] python detector client connected");

    // Send active camera & zone configs
    const configs = await getDetectorCameraConfigs();
    socket.emit("config:cameras", configs);

    socket.on("detections:frame", (frame: LiveFramePayload) => {
      latestPerCamera.set(frame.cameraId, frame);
      // Relay live detections to logged in admin UI
      emitToAdmins("detections:live", frame);
    });

    socket.on("detections:track_finished", async (track: FinishedTrackPayload) => {
      try {
        await prisma.track.upsert({
          where: {
            cameraId_trackKey: {
              cameraId: track.cameraId,
              trackKey: track.trackKey,
            },
          },
          create: {
            cameraId: track.cameraId,
            trackKey: track.trackKey,
            class: track.class,
            gender: track.gender,
            genderConfidence: track.genderConfidence,
            nationality: track.nationality,
            nationalityConfidence: track.nationalityConfidence,
            confidence: track.confidence,
            firstSeenAt: new Date(track.firstSeenAt),
            lastSeenAt: new Date(track.lastSeenAt),
            dwellSeconds: Math.round(track.dwellSeconds),
          },
          update: {
            lastSeenAt: new Date(track.lastSeenAt),
            dwellSeconds: Math.round(track.dwellSeconds),
            gender: track.gender,
            nationality: track.nationality,
          },
        });

        // Minute aggregate update
        const date = new Date(track.lastSeenAt);
        date.setSeconds(0, 0);
        const bucket = date;

        await prisma.minuteAggregate.upsert({
          where: {
            cameraId_bucket_class_gender_nationality: {
              cameraId: track.cameraId,
              bucket,
              class: track.class,
              gender: track.gender,
              nationality: track.nationality,
            },
          },
          create: {
            cameraId: track.cameraId,
            bucket,
            class: track.class,
            gender: track.gender,
            nationality: track.nationality,
            uniqueCount: 1,
          },
          update: {
            uniqueCount: { increment: 1 },
          },
        });
      } catch (err) {
        console.error("[detector-bridge] error recording finished track:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log("[detector-bridge] python detector disconnected");
    });
  });
}

/** Aggregated live stats across all cameras for Overview and dashboard APIs */
export function getLiveStatsSummary() {
  let livePersons = 0;
  let liveMale = 0;
  let liveFemale = 0;
  let liveEmirati = 0;
  let liveNonEmirati = 0;
  let livePets = 0;
  let liveDogs = 0;
  let liveCats = 0;

  let todayPersons = 0;
  let todayMale = 0;
  let todayFemale = 0;
  let todayEmirati = 0;
  let todayNonEmirati = 0;
  let todayPets = 0;
  let todayDogs = 0;
  let todayCats = 0;

  for (const frame of latestPerCamera.values()) {
    livePersons += frame.counts.live.persons;
    liveMale += frame.counts.live.male;
    liveFemale += frame.counts.live.female;
    liveEmirati += frame.counts.live.emirati;
    liveNonEmirati += frame.counts.live.nonEmirati;
    livePets += frame.counts.live.pets;
    liveDogs += frame.counts.live.dogs;
    liveCats += frame.counts.live.cats;

    todayPersons += frame.counts.today.persons;
    todayMale += frame.counts.today.male;
    todayFemale += frame.counts.today.female;
    todayEmirati += frame.counts.today.emirati;
    todayNonEmirati += frame.counts.today.nonEmirati;
    todayPets += frame.counts.today.pets;
    todayDogs += frame.counts.today.dogs;
    todayCats += frame.counts.today.cats;
  }

  return {
    live: {
      persons: livePersons,
      male: liveMale,
      female: liveFemale,
      emirati: liveEmirati,
      nonEmirati: liveNonEmirati,
      pets: livePets,
      dogs: liveDogs,
      cats: liveCats,
    },
    today: {
      persons: todayPersons,
      male: todayMale,
      female: todayFemale,
      emirati: todayEmirati,
      nonEmirati: todayNonEmirati,
      pets: todayPets,
      dogs: todayDogs,
      cats: todayCats,
    },
  };
}

export function getLatestCameraDetection(cameraId: string): LiveFramePayload | undefined {
  return latestPerCamera.get(cameraId);
}

export function broadcastDetectorReset() {
  latestPerCamera.clear();
  if (detectorNs) {
    detectorNs.emit("reset:analytics");
  }
}

