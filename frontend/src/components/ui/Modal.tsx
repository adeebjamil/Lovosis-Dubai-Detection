"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "md" | "sm";
  /** Prevent closing via backdrop/Escape (e.g. while saving). */
  locked?: boolean;
  id?: string;
}

/** Volt modal: white, radius .875rem, shadow-volt-lg, backdrop rgba(38,43,64,.5). */
export default function Modal({ open, title, onClose, children, footer, size = "md", locked, id }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, locked, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !locked && onClose()}>
      <div id={id} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`modal ${size === "sm" ? "modal-sm" : ""}`}>
        <div className="modal-header">
          <h5 id={titleId} className="card-title">{title}</h5>
          <button type="button" className="btn-close" onClick={onClose} disabled={locked} aria-label="Close">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
