"use client";

import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage } from "@/lib/api";
import { camerasApi, type Camera, type CameraStatusUpdate } from "@/lib/cameras";
import { acquireSocket, releaseSocket } from "@/lib/socket";

const FALLBACK_POLL_MS = 30_000;
const CACHE_KEY = "lovosis_cached_cameras";

function getCachedCameras(): Camera[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCachedCameras(cams: Camera[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cams));
  } catch {
    // ignore
  }
}

/** Camera list + realtime status pushes ("cameras:status") with a slow polling fallback. */
export function useCameras() {
  const [cameras, setCameras] = useState<Camera[] | null>(() => getCachedCameras());
  const [limit, setLimit] = useState(32);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const d = await camerasApi.list();
      setCameras(d.cameras);
      setCachedCameras(d.cameras);
      setLimit(d.limit);
      setError(null);
    } catch (e) {
      setError(apiErrorMessage(e, "Could not load cameras."));
    }
  }, []);

  useEffect(() => {
    let active = true;
    const load = () =>
      camerasApi
        .list()
        .then((d) => {
          if (!active) return;
          setCameras(d.cameras);
          setCachedCameras(d.cameras);
          setLimit(d.limit);
          setError(null);
        })
        .catch((e) => active && setError(apiErrorMessage(e, "Could not load cameras.")));
    load();
    const timer = setInterval(load, FALLBACK_POLL_MS);

    const socket = acquireSocket();
    const onStatus = (updates: CameraStatusUpdate[]) => {
      const byId = new Map(updates.map((u) => [u.id, u]));
      setCameras((prev) => prev?.map((c) => (byId.has(c.id) ? { ...c, ...byId.get(c.id) } : c)) ?? prev);
    };
    socket.on("cameras:status", onStatus);
    socket.on("cameras:changed", load);

    return () => {
      active = false;
      clearInterval(timer);
      socket.off("cameras:status", onStatus);
      socket.off("cameras:changed", load);
      releaseSocket();
    };
  }, []);

  /** Local optimistic upsert/remove after a mutation. */
  const upsert = useCallback((cam: Camera) => {
    setCameras((prev) => {
      if (!prev) return [cam];
      const i = prev.findIndex((c) => c.id === cam.id);
      if (i === -1) return [...prev, cam].sort((a, b) => a.code.localeCompare(b.code));
      const next = prev.slice();
      next[i] = cam;
      return next;
    });
  }, []);

  const removeLocal = useCallback((id: string) => setCameras((prev) => prev?.filter((c) => c.id !== id) ?? prev), []);

  return { cameras, limit, error, reload, upsert, removeLocal };
}
