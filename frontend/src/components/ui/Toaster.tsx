"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleExclamation, faCircleInfo, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useToasts } from "@/store/toast";

const ICONS = {
  success: { icon: faCircleCheck, cls: "text-success" },
  danger: { icon: faCircleExclamation, cls: "text-danger" },
  info: { icon: faCircleInfo, cls: "text-info" },
} as const;

/** Top-right toast stack (white card + 4px status bar). */
export default function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} role={t.tone === "danger" ? "alert" : "status"} className={`toast toast-${t.tone}`}>
          <FontAwesomeIcon icon={ICONS[t.tone].icon} className={`mt-0.5 ${ICONS[t.tone].cls}`} />
          <span className="flex-1">{t.message}</span>
          <button type="button" className="text-gray-600 hover:text-primary" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      ))}
    </div>
  );
}
