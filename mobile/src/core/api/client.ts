import { Platform } from 'react-native';

import { getCsrfToken } from '@/src/core/api/csrf';
import * as tokenStorage from '@/src/core/auth/tokenStorage';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
const isWeb = Platform.OS === 'web';

if (!configuredApiUrl) {
  // eslint-disable-next-line no-console
  console.warn(
    'EXPO_PUBLIC_API_URL is not set — API requests will fail. Copy mobile/.env.example to mobile/.env and point it at your backend.'
  );
}

/**
 * On web, the API host actually has to match whatever host the page itself
 * was loaded from (`localhost`, `127.0.0.1`, or the dev machine's LAN IP —
 * `expo start --web` defaults to `localhost`, but `EXPO_PUBLIC_API_URL` is
 * fixed to the LAN IP so phones can reach it). If they don't match, the
 * browser considers the API cross-site, and silently drops the
 * `SameSite=Lax` auth cookies from `Set-Cookie` entirely — they show up in
 * the response but the browser refuses to store them, so they never come
 * back on the next request. Docker publishes the backend port on every
 * interface, so swapping in the page's own hostname (whichever one you
 * happened to open it from) and keeping the configured port always
 * resolves to a reachable, same-site backend. Native has no `window`
 * (and no browser cookie jar/SameSite policy to satisfy), so it always
 * uses `configuredApiUrl` as-is.
 */
function resolveBaseUrl(): string | undefined {
  if (!configuredApiUrl || !isWeb || typeof window === 'undefined') {
    return configuredApiUrl;
  }
  try {
    const url = new URL(configuredApiUrl);
    url.hostname = window.location.hostname;
    return url.toString().replace(/\/$/, '');
  } catch {
    return configuredApiUrl;
  }
}

const BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const MUTATING_METHODS = new Set<Method>(['POST', 'PUT', 'PATCH', 'DELETE']);

export type ApiRequestOptions = {
  method?: Method;
  body?: unknown;
  /**
   * Attach the stored access token and allow the automatic
   * refresh-and-retry-once flow on a 401. Defaults to true — set to
   * false for the auth endpoints themselves (register/login/refresh),
   * which don't take a bearer token and must never trigger the refresh
   * cycle (that would recurse into itself on a bad/expired refresh token).
   */
  auth?: boolean;
};

type RawResult = { response: Response; data: unknown };

async function rawFetch(path: string, options: ApiRequestOptions, accessToken?: string | null): Promise<RawResult> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  // Web has no Authorization header at all (the access token lives in an
  // httpOnly cookie, sent automatically via `credentials: 'include'`
  // below) — but that means the browser auto-attaches it to every request,
  // which needs the double-submit CSRF header on anything mutating (see
  // `main.py`'s `csrf_protection` middleware). Native's Bearer-header auth
  // never carries this cookie, so it's naturally exempt server-side.
  if (isWeb && MUTATING_METHODS.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const response = await fetch(`${BASE_URL ?? ''}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { response, data };
}

// Notifies listeners when a refresh attempt fails (refresh token missing,
// expired, or rejected) — the session is dead, not just this one request.
// `client.ts` can't import `authStore` directly (authStore already imports
// `api` from here), so this is a small pub/sub instead: `authStore`
// subscribes once and flips `isAuthenticated` back to `false` so the root
// layout's guard redirects to `/login`. Without this, a failed refresh only
// clears storage — the store's `isAuthenticated` stays stale `true`, so the
// app keeps showing protected screens that just keep re-failing.
type SessionExpiredListener = () => void;
let sessionExpiredListeners: SessionExpiredListener[] = [];

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.push(listener);
  return () => {
    sessionExpiredListeners = sessionExpiredListeners.filter((l) => l !== listener);
  };
}

function notifySessionExpired(): void {
  sessionExpiredListeners.forEach((listener) => listener());
}

// Concurrent 401s should trigger a single refresh call, not one per
// in-flight request — later phases (wardrobe, avatar, ...) will fire
// several authenticated requests at once.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      // Web: the refresh token lives in an httpOnly cookie, sent
      // automatically — no body needed, and nothing for JS to read anyway.
      // Native: it's in expo-secure-store, sent explicitly in the body.
      const storedRefreshToken = isWeb ? null : await tokenStorage.getRefreshToken();
      if (!isWeb && !storedRefreshToken) {
        return null;
      }

      const { response, data } = await rawFetch('/api/v1/auth/refresh', {
        method: 'POST',
        body: storedRefreshToken ? { refresh_token: storedRefreshToken } : undefined,
        auth: false,
      });

      if (!response.ok) {
        return null;
      }

      const { access_token, refresh_token } = data as { access_token: string; refresh_token: string };
      await tokenStorage.setTokens(access_token, refresh_token);
      return access_token;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

function errorMessageFrom(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === 'string') {
      return detail;
    }
  }
  return fallback;
}

/**
 * Generic authenticated fetch wrapper, reused by every feature area (auth,
 * and later wardrobe/avatar/etc). Attaches the stored access token; on a
 * 401 from a protected endpoint it transparently refreshes the access
 * token once and retries the original request. If the refresh also fails,
 * stored tokens are cleared so the caller (e.g. authStore) can treat the
 * user as logged out and redirect to /login.
 */
export async function apiRequest<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const useAuth = options.auth ?? true;
  const accessToken = useAuth ? await tokenStorage.getAccessToken() : null;

  let { response, data } = await rawFetch(path, options, accessToken);

  if (response.status === 401 && useAuth) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      // Web never attaches an Authorization header (see rawFetch) — the
      // retry just relies on the cookie the refresh response already set.
      ({ response, data } = await rawFetch(path, options, isWeb ? null : newAccessToken));
    } else {
      await tokenStorage.clearTokens();
      notifySessionExpired();
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, errorMessageFrom(data, response.statusText || 'Request failed'), data);
  }

  return data as T;
}

export const api = {
  get: <T = unknown>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T = unknown>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T = unknown>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  put: <T = unknown>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  delete: <T = unknown>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
