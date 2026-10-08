"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faCheckDouble,
  faCircle,
  faPaw,
  faTrashCan,
  faTriangleExclamation,
  faUser,
  faVideo,
  faVideoSlash,
  faVolumeHigh,
  faVolumeXmark,
  faXmark,
  faArrowRight,
  faVial,
} from "@fortawesome/free-solid-svg-icons";
import {
  useNotificationStore,
  type SystemNotification,
} from "@/store/notifications";

interface NotificationDropdownProps {
  onClose: () => void;
}

export default function NotificationDropdown({
  onClose,
}: NotificationDropdownProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "cameras" | "detections">("all");

  const notifications = useNotificationStore((s) => s.notifications);
  const soundEnabled = useNotificationStore((s) => s.soundEnabled);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const toggleSound = useNotificationStore((s) => s.toggleSound);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered = notifications.filter((item) => {
    if (filter === "cameras") {
      return item.type === "camera_offline" || item.type === "camera_online";
    }
    if (filter === "detections") {
      return (
        item.type === "detection_emirati" ||
        item.type === "detection_visitor" ||
        item.type === "detection_pet"
      );
    }
    return true;
  });

  const handleItemClick = (item: SystemNotification) => {
    markAsRead(item.id);
    if (item.cameraId) {
      onClose();
      router.push(`/admin/live?camera=${item.cameraId}`);
    }
  };

  const handleSimulateTest = () => {
    const samples: Array<Parameters<typeof addNotification>[0]> = [
      {
        type: "detection_emirati",
        title: "Emirati National Detected",
        message: "Emirati Male (Kandura & Ghutra) detected on Camera 1.",
        severity: "info",
      },
      {
        type: "camera_offline",
        title: "Camera Disconnected",
        message: "Main Entrance Camera lost RTSP feed.",
        severity: "danger",
      },
      {
        type: "detection_pet",
        title: "Pet Detected (Cat)",
        message: "Cat detected crossing designated corridor.",
        severity: "warning",
      },
    ];
    const pick = samples[Math.floor(Math.random() * samples.length)];
    addNotification(pick);
  };

  return (
    <div
      className="absolute right-0 top-full mt-2 w-[340px] sm:w-[410px] rounded-xl border border-gray-400 bg-white shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
      role="dialog"
      aria-label="System Notifications"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-300 bg-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white text-xs">
            <FontAwesomeIcon icon={faBell} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 leading-tight">
              Live Alerts
            </h3>
            <span className="text-[11px] text-gray-500 font-medium">
              {unreadCount > 0
                ? `${unreadCount} unread alert${unreadCount > 1 ? "s" : ""}`
                : "All systems nominal"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Mute/Sound toggle */}
          <button
            type="button"
            onClick={toggleSound}
            title={soundEnabled ? "Mute notification sounds" : "Unmute notification sounds"}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 text-xs transition"
          >
            <FontAwesomeIcon
              icon={soundEnabled ? faVolumeHigh : faVolumeXmark}
              className={soundEnabled ? "text-primary" : "text-gray-400"}
            />
          </button>

          {/* Mark all as read */}
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              title="Mark all as read"
              className="flex h-7 items-center gap-1 px-2 rounded-md border border-gray-300 bg-white text-[11px] font-semibold text-gray-700 hover:text-primary hover:bg-gray-50 transition"
            >
              <FontAwesomeIcon icon={faCheckDouble} className="text-xs" />
              <span>Read</span>
            </button>
          )}

          {/* Test Trigger */}
          <button
            type="button"
            onClick={handleSimulateTest}
            title="Simulate test alert"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-gray-300 bg-white text-gray-500 hover:text-primary hover:border-primary text-xs transition"
          >
            <FontAwesomeIcon icon={faVial} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-gray-200 bg-gray-50 px-3 py-1.5 gap-1 text-xs">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`px-2.5 py-1 rounded-md font-medium transition ${
            filter === "all"
              ? "bg-white text-primary shadow-sm font-semibold"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("cameras")}
          className={`px-2.5 py-1 rounded-md font-medium transition ${
            filter === "cameras"
              ? "bg-white text-primary shadow-sm font-semibold"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Cameras
        </button>
        <button
          type="button"
          onClick={() => setFilter("detections")}
          className={`px-2.5 py-1 rounded-md font-medium transition ${
            filter === "detections"
              ? "bg-white text-primary shadow-sm font-semibold"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          AI Detections
        </button>
      </div>

      {/* Notification Items List */}
      <div className="max-h-[340px] overflow-y-auto divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="py-10 text-center px-4">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <FontAwesomeIcon icon={faBell} />
            </div>
            <p className="text-xs font-semibold text-gray-800">
              No alerts in this category
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Live events will appear here automatically as they occur.
            </p>
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => handleItemClick(item)}
              className={`group flex items-start gap-3 p-3 transition cursor-pointer relative ${
                !item.read
                  ? "bg-blue-50/50 hover:bg-blue-50"
                  : "bg-white hover:bg-gray-50"
              }`}
            >
              {/* Type Icon */}
              <div
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs ${getIconStyle(
                  item.type,
                  item.severity
                )}`}
              >
                <FontAwesomeIcon icon={getIcon(item.type)} />
              </div>

              {/* Text content */}
              <div className="flex-1 min-w-0 pr-6">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs font-bold text-gray-900 truncate">
                    {item.title}
                  </h4>
                  {!item.read && (
                    <span
                      title="Unread"
                      className="h-1.5 w-1.5 rounded-full bg-blue-600"
                    />
                  )}
                </div>
                <p className="text-[11px] text-gray-600 line-clamp-2 mt-0.5 leading-snug">
                  {item.message}
                </p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
                  <span>{formatTimeAgo(item.timestamp)}</span>
                  {item.cameraName && (
                    <>
                      <span>•</span>
                      <span className="font-medium text-gray-500 truncate max-w-[120px]">
                        {item.cameraName}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Dismiss single button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeNotification(item.id);
                }}
                title="Dismiss"
                className="absolute right-2 top-2 p-1 text-gray-400 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition rounded"
              >
                <FontAwesomeIcon icon={faXmark} className="text-xs" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-xs">
        {notifications.length > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-danger transition"
          >
            <FontAwesomeIcon icon={faTrashCan} />
            <span>Clear History</span>
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={() => {
            onClose();
            router.push("/admin/live");
          }}
          className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline ml-auto"
        >
          <span>Open Live Matrix</span>
          <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
        </button>
      </div>
    </div>
  );
}

function getIcon(type: SystemNotification["type"]) {
  switch (type) {
    case "camera_offline":
      return faVideoSlash;
    case "camera_online":
      return faVideo;
    case "detection_emirati":
    case "detection_visitor":
      return faUser;
    case "detection_pet":
      return faPaw;
    case "system":
    default:
      return faTriangleExclamation;
  }
}

function getIconStyle(
  type: SystemNotification["type"],
  severity: SystemNotification["severity"]
) {
  if (severity === "danger" || type === "camera_offline") {
    return "bg-red-100 text-red-700";
  }
  if (severity === "success" || type === "camera_online") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (severity === "warning" || type === "detection_pet") {
    return "bg-amber-100 text-amber-700";
  }
  if (type === "detection_emirati") {
    return "bg-indigo-100 text-indigo-700";
  }
  return "bg-blue-100 text-blue-700";
}

function formatTimeAgo(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 30) return "Just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(isoString).toLocaleDateString();
  } catch {
    return "Recent";
  }
}
