"use client";

import { useEffect, useRef } from "react";
import { acquireSocket, releaseSocket } from "@/lib/socket";
import { useNotificationStore } from "@/store/notifications";
import axios from "axios";

interface CameraBrief {
  id: string;
  name: string;
  status: string;
}

interface StatusChangePayload {
  id: string;
  status: "ONLINE" | "OFFLINE" | "ERROR";
  fps?: number;
  pingMs?: number;
}

interface DetectionBox {
  trackId: number;
  class: "PERSON" | "DOG" | "CAT";
  gender?: "MALE" | "FEMALE" | "UNKNOWN";
  nationality?: "EMIRATI" | "NON_EMIRATI" | "UNKNOWN";
  inZone?: boolean;
}

interface LiveFramePayload {
  cameraId: string;
  timestamp: number;
  boxes?: DetectionBox[];
}

export function useRealtimeNotifications() {
  const addNotification = useNotificationStore((s) => s.addNotification);
  const cameraNamesRef = useRef<Map<string, string>>(new Map());
  const cameraStatusRef = useRef<Map<string, string>>(new Map());
  const seenTracksRef = useRef<Map<string, number>>(new Map());

  // Load initial cameras to know their names and starting statuses
  useEffect(() => {
    let mounted = true;
    axios
      .get<CameraBrief[]>("/api/cameras")
      .then((res) => {
        if (!mounted || !Array.isArray(res.data)) return;
        res.data.forEach((c) => {
          cameraNamesRef.current.set(c.id, c.name);
          cameraStatusRef.current.set(c.id, c.status);
        });
      })
      .catch(() => {
        // Silently ignore during SSR/initial boot
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const socket = acquireSocket();

    // 1. Camera offline / online state alerts
    const handleCameraStatus = (changed: StatusChangePayload[]) => {
      if (!Array.isArray(changed)) return;

      changed.forEach((item) => {
        const camName = cameraNamesRef.current.get(item.id) || "Camera";
        const prevStatus = cameraStatusRef.current.get(item.id);

        if (prevStatus && prevStatus !== item.status) {
          if (item.status === "OFFLINE" || item.status === "ERROR") {
            addNotification({
              type: "camera_offline",
              title: "Camera Offline",
              message: `Camera "${camName}" lost connection / went offline.`,
              severity: "danger",
              cameraId: item.id,
              cameraName: camName,
            });
          } else if (item.status === "ONLINE" && prevStatus !== "ONLINE") {
            addNotification({
              type: "camera_online",
              title: "Camera Reconnected",
              message: `Camera "${camName}" is back online and streaming.`,
              severity: "success",
              cameraId: item.id,
              cameraName: camName,
            });
          }
        }
        cameraStatusRef.current.set(item.id, item.status);
      });
    };

    // 2. Live detection alerts (Emirati, Visitor, Pet) with cooldown deduplication
    const handleLiveDetections = (frame: LiveFramePayload) => {
      if (!frame || !Array.isArray(frame.boxes) || frame.boxes.length === 0) return;

      const camName = cameraNamesRef.current.get(frame.cameraId) || "Camera";
      const now = Date.now();

      // Clean up old tracks from cooldown cache (> 60s)
      for (const [key, ts] of seenTracksRef.current.entries()) {
        if (now - ts > 60000) {
          seenTracksRef.current.delete(key);
        }
      }

      frame.boxes.forEach((box) => {
        // Cooldown per unique track on this camera
        const trackKey = `${frame.cameraId}:${box.trackId}`;
        const lastAlerted = seenTracksRef.current.get(trackKey);

        // Alert only once per 45 seconds per track
        if (lastAlerted && now - lastAlerted < 45000) {
          return;
        }

        seenTracksRef.current.set(trackKey, now);

        if (box.class === "PERSON") {
          if (box.nationality === "EMIRATI") {
            addNotification({
              type: "detection_emirati",
              title: "Emirati National Detected",
              message: `${box.gender === "FEMALE" ? "Emirati Female (Abaya)" : "Emirati Male (Kandura)"} detected on ${camName}.`,
              severity: "info",
              cameraId: frame.cameraId,
              cameraName: camName,
            });
          } else if (box.nationality === "NON_EMIRATI") {
            addNotification({
              type: "detection_visitor",
              title: "Visitor Detected",
              message: `Non-Emirati ${box.gender === "FEMALE" ? "Female" : box.gender === "MALE" ? "Male" : "Visitor"} (Casual Wear) detected on ${camName}.`,
              severity: "info",
              cameraId: frame.cameraId,
              cameraName: camName,
            });
          }
        } else if (box.class === "CAT" || box.class === "DOG") {
          addNotification({
            type: "detection_pet",
            title: `Pet Detected (${box.class === "DOG" ? "Dog" : "Cat"})`,
            message: `${box.class === "DOG" ? "Dog" : "Cat"} detected entering zone on ${camName}.`,
            severity: "warning",
            cameraId: frame.cameraId,
            cameraName: camName,
          });
        }
      });
    };

    // 3. System events (e.g. data reset)
    const handleAnalyticsReset = () => {
      addNotification({
        type: "system",
        title: "Analytics Reset",
        message: "Detection statistics and tracking history were reset by administrator.",
        severity: "warning",
      });
    };

    socket.on("cameras:status", handleCameraStatus);
    socket.on("detections:live", handleLiveDetections);
    socket.on("analytics:reset", handleAnalyticsReset);

    return () => {
      socket.off("cameras:status", handleCameraStatus);
      socket.off("detections:live", handleLiveDetections);
      socket.off("analytics:reset", handleAnalyticsReset);
      releaseSocket();
    };
  }, [addNotification]);
}
