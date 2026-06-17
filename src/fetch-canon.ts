/**
 * Network retrieval for the WFI Canon MCP server.
 *
 * Responsibilities:
 *  - fetch text over https with a hard timeout
 *  - enforce a maximum content size (both via Content-Length and while reading)
 *  - provide a small TTL cache wrapper
 *
 * This module does not decide *what* to fetch. Callers pass fully validated URLs
 * constructed from the trusted index base (see validation.ts). There is no
 * filesystem access and no shell execution here.
 */

export type Fetcher = (url: string) => Promise<string>;

export interface HttpFetchOptions {
  timeoutMs: number;
  maxBytes: number;
}

export async function httpFetchText(
  url: string,
  opts: HttpFetchOptions,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "text/plain, text/yaml, text/markdown, */*" },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}`);
    }

    const declared = res.headers.get("content-length");
    if (declared) {
      const n = Number(declared);
      if (Number.isFinite(n) && n > opts.maxBytes) {
        throw new Error(
          `Content too large for ${url}: ${n} bytes exceeds limit of ${opts.maxBytes}`,
        );
      }
    }

    const body = res.body;
    if (!body) {
      const text = await res.text();
      if (Buffer.byteLength(text, "utf8") > opts.maxBytes) {
        throw new Error(`Content exceeded max size of ${opts.maxBytes} bytes: ${url}`);
      }
      return text;
    }

    const reader = body.getReader();
    const chunks: Buffer[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > opts.maxBytes) {
          await reader.cancel();
          throw new Error(
            `Content exceeded max size of ${opts.maxBytes} bytes while reading: ${url}`,
          );
        }
        chunks.push(Buffer.from(value));
      }
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    clearTimeout(timer);
  }
}

export function createHttpFetcher(opts: HttpFetchOptions): Fetcher {
  return (url: string) => httpFetchText(url, opts);
}

interface CacheEntry {
  value: string;
  expires: number;
}

/**
 * Wrap a fetcher with a simple in-memory TTL cache keyed by URL.
 * `now` is injectable for deterministic tests.
 */
export function createCachedFetcher(
  base: Fetcher,
  ttlMs: number,
  now: () => number = Date.now,
): Fetcher {
  const cache = new Map<string, CacheEntry>();
  return async (url: string): Promise<string> => {
    const t = now();
    const hit = cache.get(url);
    if (hit && hit.expires > t) {
      return hit.value;
    }
    const value = await base(url);
    cache.set(url, { value, expires: t + ttlMs });
    return value;
  };
}
