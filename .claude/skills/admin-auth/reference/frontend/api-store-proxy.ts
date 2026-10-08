// @ts-nocheck — reference only (no node_modules here). REMOVE this line when copying into the real app.
// ============================================================================
// Reference: frontend/src/lib/api.ts
// ============================================================================
import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

// Default "/api" → proxied to the backend by next.config rewrites (first-party cookies).
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "/api",
  withCredentials: true,
});

const NO_REFRESH = ["/auth/login", "/auth/refresh", "/auth/logout"];
let refreshing: Promise<void> | null = null;
let onAuthFailure: (() => void) | null = null;
export const setOnAuthFailure = (fn: () => void) => { onAuthFailure = fn; };

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const skip = !original || original._retry || NO_REFRESH.some((p) => original.url?.includes(p));
    if (error.response?.status !== 401 || skip) return Promise.reject(error);

    original!._retry = true;
    try {
      // single-flight: many parallel 401s → one refresh call
      refreshing ??= api
        .post("/auth/refresh")
        .then(() => undefined)
        .catch((e: AxiosError) => { if (e.response?.status !== 409) throw e; }) // 409 = other tab rotated
        .finally(() => { refreshing = null; });
      await refreshing;
      return api(original!);
    } catch (e) {
      onAuthFailure?.();
      return Promise.reject(e);
    }
  },
);

// ============================================================================
// Reference: frontend/src/store/auth.ts
// ============================================================================
/*
import { create } from "zustand";
import { api, setOnAuthFailure } from "@/lib/api";

export interface Admin {
  id: string; name: string; email: string;
  role: "SUPER_ADMIN" | "ADMIN"; avatarUrl?: string | null; lastLoginAt?: string | null;
}
type Status = "idle" | "loading" | "authenticated" | "guest";

interface AuthState {
  admin: Admin | null;
  status: Status;
  login: (v: { email: string; password: string; remember?: boolean }) => Promise<void>;
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
    if (get().status === "loading" || get().status === "authenticated") return;
    set({ status: "loading" });
    try {
      const { data } = await api.get("/auth/me");
      set({ admin: data.data.admin, status: "authenticated" });
    } catch {
      set({ admin: null, status: "guest" });
    }
  },
  logout: async () => {
    try { await api.post("/auth/logout"); } finally { set({ admin: null, status: "guest" }); }
  },
}));

setOnAuthFailure(() => useAuthStore.setState({ admin: null, status: "guest" }));
*/

// ============================================================================
// Reference: frontend/src/proxy.ts   (Next.js 16 — replaces middleware.ts)
// ============================================================================
/*
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();   // no auto-redirect → no loops

  if (!req.cookies.has("admin_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
*/

// ============================================================================
// Reference: frontend/next.config.ts
// ============================================================================
/*
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_ORIGIN ?? "http://localhost:5000"}/api/:path*` }];
  },
  async redirects() {
    return [{ source: "/", destination: "/admin", permanent: false }];
  },
};
export default nextConfig;
*/
