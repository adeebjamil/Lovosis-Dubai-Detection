import { create } from "zustand";

export type ToastTone = "success" | "danger" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (tone: ToastTone, message: string) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (tone, message) => {
    const id = ++seq;
    set({ toasts: [...get().toasts.slice(-3), { id, tone, message }] });
    setTimeout(() => get().dismiss(id), tone === "danger" ? 7000 : 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (m: string) => useToasts.getState().push("success", m),
  error: (m: string) => useToasts.getState().push("danger", m),
  info: (m: string) => useToasts.getState().push("info", m),
};
