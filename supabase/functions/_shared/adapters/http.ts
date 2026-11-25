import { IntegrationError } from "./types.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with JSON, retries on 429/5xx with exponential backoff, and readable errors. */
export async function requestJson<T = unknown>(
  url: string,
  init: RequestInit & { json?: unknown } = {},
  opts: { retries?: number; label?: string } = {},
): Promise<T> {
  const { retries = 3, label = url } = opts;
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.json);
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers, body });
      const text = await res.text();
      if (res.ok) return (text ? JSON.parse(text) : {}) as T;
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
        continue;
      }
      throw new IntegrationError(`${label} failed with HTTP ${res.status}`, res.status, text.slice(0, 2000));
    } catch (e) {
      lastErr = e;
      if (e instanceof IntegrationError) throw e;
      if (attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Download bytes and return base64 (used for platforms that want inline image bytes). */
export async function fetchBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new IntegrationError(`download ${url} failed`, res.status, "");
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
