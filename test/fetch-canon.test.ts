import { describe, it, expect, vi, afterEach } from "vitest";
import {
  httpFetchText,
  createCachedFetcher,
  type Fetcher,
} from "../src/fetch-canon.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createCachedFetcher", () => {
  it("caches within the TTL and refetches after expiry", async () => {
    let calls = 0;
    const base: Fetcher = async (url: string) => {
      calls += 1;
      return `value-${calls}-${url}`;
    };
    let clock = 1000;
    const cached = createCachedFetcher(base, 500, () => clock);

    const a = await cached("u");
    const b = await cached("u");
    expect(a).toBe(b);
    expect(calls).toBe(1);

    clock += 600; // past TTL
    const c = await cached("u");
    expect(c).not.toBe(a);
    expect(calls).toBe(2);
  });

  it("keys the cache by URL", async () => {
    let calls = 0;
    const base: Fetcher = async () => {
      calls += 1;
      return String(calls);
    };
    const cached = createCachedFetcher(base, 10000, () => 0);
    await cached("a");
    await cached("b");
    expect(calls).toBe(2);
  });
});

describe("httpFetchText size and error handling", () => {
  it("rejects content larger than maxBytes via content-length", async () => {
    const big = "x".repeat(1000);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(big)));
    await expect(
      httpFetchText("https://raw.githubusercontent.com/a", {
        timeoutMs: 1000,
        maxBytes: 10,
      }),
    ).rejects.toThrow(/too large/i);
  });

  it("returns small content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("hello canon")));
    const text = await httpFetchText("https://raw.githubusercontent.com/a", {
      timeoutMs: 1000,
      maxBytes: 1000,
    });
    expect(text).toBe("hello canon");
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404, statusText: "Not Found" })),
    );
    await expect(
      httpFetchText("https://raw.githubusercontent.com/missing", {
        timeoutMs: 1000,
        maxBytes: 1000,
      }),
    ).rejects.toThrow(/404/);
  });
});
