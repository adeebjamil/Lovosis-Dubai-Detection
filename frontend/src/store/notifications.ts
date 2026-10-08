import { create } from "zustand";

export type NotificationType =
  | "camera_offline"
  | "camera_online"
  | "detection_emirati"
  | "detection_visitor"
  | "detection_pet"
  | "system";

export type NotificationSeverity = "danger" | "warning" | "success" | "info";

export interface SystemNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string; // ISO
  read: boolean;
  severity: NotificationSeverity;
  cameraId?: string;
  cameraName?: string;
}

interface NotificationState {
  notifications: SystemNotification[];
  soundEnabled: boolean;
  addNotification: (
    item: Omit<SystemNotification, "id" | "timestamp" | "read">
  ) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  toggleSound: () => void;
}

const STORAGE_KEY = "lovosis_notifications_v1";
const SOUND_KEY = "lovosis_sound_enabled_v1";

function loadFromStorage(): SystemNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultSeed();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : getDefaultSeed();
  } catch {
    return getDefaultSeed();
  }
}

function loadSoundPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    return raw !== null ? JSON.parse(raw) : true;
  } catch {
    return true;
  }
}

function saveToStorage(list: SystemNotification[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 40)));
  } catch {
    // Ignore storage quota errors
  }
}

function getDefaultSeed(): SystemNotification[] {
  const now = new Date();
  return [
    {
      id: "seed-1",
      type: "system",
      title: "Falcon Vision AI Ready",
      message: "YOLOX-Medium and Face Neural Engine initialized.",
      timestamp: new Date(now.getTime() - 1000 * 60 * 5).toISOString(),
      read: true,
      severity: "success",
    },
    {
      id: "seed-2",
      type: "camera_online",
      title: "Monitoring Active",
      message: "RTSP relay and camera status watcher active.",
      timestamp: new Date(now.getTime() - 1000 * 60 * 12).toISOString(),
      read: true,
      severity: "info",
    },
  ];
}

/** Gentle web audio synthesized notification chime (no external MP3 needed) */
function playChime(severity: NotificationSeverity) {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    const now = ctx.currentTime;

    if (severity === "danger") {
      // Two-tone warning alert (low to high)
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(330, now + 0.1);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      // Pleasant high glass chime (two quick notes)
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.08); // A5
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch {
    // Audio autoplay might be suspended until first user interaction
  }
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  soundEnabled: true,

  addNotification: (item) => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newEntry: SystemNotification = {
      ...item,
      id,
      timestamp: new Date().toISOString(),
      read: false,
    };

    const updated = [newEntry, ...get().notifications].slice(0, 40);
    set({ notifications: updated });
    saveToStorage(updated);

    if (get().soundEnabled) {
      playChime(item.severity);
    }
  },

  markAsRead: (id) => {
    const updated = get().notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    set({ notifications: updated });
    saveToStorage(updated);
  },

  markAllAsRead: () => {
    const updated = get().notifications.map((n) => ({ ...n, read: true }));
    set({ notifications: updated });
    saveToStorage(updated);
  },

  removeNotification: (id) => {
    const updated = get().notifications.filter((n) => n.id !== id);
    set({ notifications: updated });
    saveToStorage(updated);
  },

  clearAll: () => {
    set({ notifications: [] });
    saveToStorage([]);
  },

  toggleSound: () => {
    const nextVal = !get().soundEnabled;
    set({ soundEnabled: nextVal });
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(SOUND_KEY, JSON.stringify(nextVal));
      } catch {
        // Ignore
      }
    }
  },
}));

// Client-side hydration of localStorage
if (typeof window !== "undefined") {
  setTimeout(() => {
    useNotificationStore.setState({
      notifications: loadFromStorage(),
      soundEnabled: loadSoundPref(),
    });
  }, 0);
}
