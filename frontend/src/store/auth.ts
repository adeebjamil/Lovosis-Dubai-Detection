import { create } from "zustand";
import { api, setOnAuthFailure } from "@/lib/api";

export interface Admin {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN";
  avatarUrl?: string | null;
  lastLoginAt?: string | null;
}

type Status = "idle" | "loading" | "authenticated" | "guest";

interface AuthState {
  admin: Admin | null;
  status: Status;
  login: (values: { email: string; password: string; remember?: boolean }) => Promise<void>;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  admin: null,
  status: "idle",

  login: async (values) => {
    const { data } = await api.post("/auth/login", values);
    set({ admin: data.data.admin, status: "authenticated" });
  },

  fetchMe: async () => {
    const { status } = get();
    if (status === "loading" || status === "authenticated") return;
    set({ status: "loading" });
    try {
      const { data } = await api.get("/auth/me");
      set({ admin: data.data.admin, status: "authenticated" });
    } catch {
      set({ admin: null, status: "guest" });
    }
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      set({ admin: null, status: "guest" });
    }
  },
}));

setOnAuthFailure(() => useAuthStore.setState({ admin: null, status: "guest" }));
