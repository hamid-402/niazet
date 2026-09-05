const API_URL = process.env.NEXT_PUBLIC_API_BASE_PATH ?? "/api/backend";
import type { ApiErrorEnvelope } from "../../../../packages/contracts/src";
let accessToken: string | null = null;

export function getAccessToken() {
  return accessToken;
}
export function setAccessToken(token: string) {
  accessToken = token;
}
export function clearTokens() {
  accessToken = null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
    public readonly correlationId?: string,
  ) {
    super(message);
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  isFormData?: boolean;
  signal?: AbortSignal;
  idempotencyKey?: string;
  retry?: number;
  cacheMs?: number;
  dedupe?: boolean;
}

const cache = new Map<string, { expiresAt: number; value: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();
let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(signal?: AbortSignal): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-Id": crypto.randomUUID(),
      },
      credentials: "include",
      signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          clearTokens();
          return null;
        }
        const data = (await response.json()) as { accessToken: string };
        setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function requestKey(path: string, method: string, body: unknown) {
  if (body instanceof FormData)
    return `${method}:${path}:form:${crypto.randomUUID()}`;
  return `${method}:${path}:${body === undefined ? "" : JSON.stringify(body)}`;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export function invalidateApiCache(pathPrefix = "") {
  for (const key of cache.keys()) {
    if (key.includes(`:${pathPrefix}`)) cache.delete(key);
  }
}

async function execute<T>(path: string, options: RequestOptions): Promise<T> {
  const {
    method = "GET",
    body,
    auth = true,
    isFormData = false,
    signal,
    retry = method === "GET" ? 2 : 1,
  } = options;
  const headers: Record<string, string> = {
    "X-Correlation-Id": crypto.randomUUID(),
  };
  if (!isFormData) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    headers["Idempotency-Key"] = options.idempotencyKey ?? crypto.randomUUID();
  }
  if (auth && getAccessToken())
    headers.Authorization = `Bearer ${getAccessToken()}`;

  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      signal,
      body:
        body === undefined
          ? undefined
          : isFormData
            ? (body as FormData)
            : JSON.stringify(body),
    });

  let response: Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retry; attempt += 1) {
    try {
      response = await doFetch();
      if (response.status === 401 && auth) {
        const newToken = await tryRefreshToken(signal);
        if (newToken) {
          headers.Authorization = `Bearer ${newToken}`;
          response = await doFetch();
        }
      }
      if (response.status < 500 || attempt === retry) break;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      if (attempt === retry) throw error;
    }
    await sleep(Math.min(2_000, 250 * 2 ** attempt), signal);
  }
  if (!response) throw lastError ?? new Error("پاسخی از سرور دریافت نشد.");

  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");
  const data = isJson ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    const payload = data as Partial<ApiErrorEnvelope> | null;
    const raw = payload?.error?.message ?? payload?.message ?? "خطایی رخ داد.";
    throw new ApiError(
      response.status,
      Array.isArray(raw) ? raw.join("، ") : raw,
      data,
      payload?.correlationId ??
        response.headers.get("x-correlation-id") ??
        undefined,
    );
  }
  if (method !== "GET") invalidateApiCache();
  return data as T;
}

export function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const key = requestKey(path, method, options.body);
  const cached = cache.get(key);
  if (method === "GET" && cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.value as T);
  }
  if (options.dedupe !== false) {
    const pending = inFlight.get(key);
    if (pending) return pending as Promise<T>;
  }
  const promise = execute<T>(path, options)
    .then((value) => {
      if (method === "GET" && options.cacheMs) {
        cache.set(key, { value, expiresAt: Date.now() + options.cacheMs });
      }
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export async function downloadAuthenticated(path: string, filename: string) {
  const headers: Record<string, string> = {
    "X-Correlation-Id": crypto.randomUUID(),
  };
  if (getAccessToken()) headers.Authorization = `Bearer ${getAccessToken()}`;
  let response = await fetch(`${API_URL}${path}`, {
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (response.status === 401) {
    const token = await tryRefreshToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      response = await fetch(`${API_URL}${path}`, {
        headers,
        credentials: "include",
        cache: "no-store",
      });
    }
  }
  if (!response.ok) {
    const data = (await response
      .json()
      .catch(() => null)) as Partial<ApiErrorEnvelope> | null;
    const message =
      data?.error?.message ?? data?.message ?? "دریافت فایل ممکن نشد.";
    throw new ApiError(
      response.status,
      Array.isArray(message) ? message.join("، ") : message,
      data,
    );
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
