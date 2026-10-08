import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

/** Same-origin "/api" → proxied to Express by next.config rewrites (first-party cookies). */
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "/api",
  withCredentials: true,
});

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
}

const NO_REFRESH = ["/auth/login", "/auth/refresh", "/auth/logout"];
let refreshing: Promise<void> | null = null;
let onAuthFailure: (() => void) | null = null;

export const setOnAuthFailure = (fn: () => void) => {
  onAuthFailure = fn;
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const skip = !original || original._retry || NO_REFRESH.some((p) => original.url?.includes(p));
    if (error.response?.status !== 401 || skip) return Promise.reject(error);

    original._retry = true;
    try {
      // single-flight: many parallel 401s → one refresh call
      refreshing ??= api
        .post("/auth/refresh")
        .then(() => undefined)
        .catch((e: AxiosError) => {
          if (e.response?.status !== 409) throw e; // 409 = another tab rotated, just retry
        })
        .finally(() => {
          refreshing = null;
        });
      await refreshing;
      return api(original);
    } catch (e) {
      onAuthFailure?.();
      return Promise.reject(e);
    }
  },
);

/** Extracts a user-facing message from an API error. */
export function apiErrorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  const msg = (e as AxiosError<ApiResponse<unknown>>)?.response?.data?.message;
  return msg ?? fallback;
}
