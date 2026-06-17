import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CanonClient } from "../src/canon-index.js";
import { makeMockFetcher, INDEX_URL, RAW_BASE } from "./fixtures.js";

function makeClient(indexYaml?: string) {
  const mock = makeMockFetcher(indexYaml);
  const client = new CanonClient({
    indexUrl: INDEX_URL,
    fetcher: mock.fetcher,
    cacheTtlMs: 60000,
  });
  return { client, calls: mock.calls };
}

describe("list_entries filtering", () => {
  it("filters by role", async () => {
    const { client } = makeClient();
    const entries = await client.listEntries({ role: "module" });
    expect(entries.map((e) => e.id)).toEqual(["module_iii"]);
  });

  it("filters by wff_module", async () => {
    const { client } = makeClient();
    const entries = await client.listEntries({ wff_module: "III" });
    expect(entries.map((e) => e.id)).toEqual(["module_iii"]);
  });

  it("filters by tag", async () => {
    const { client } = makeClient();
    const entries = await client.listEntries({ tag: "deprecated" });
    expect(entries.map((e) => e.id)).toEqual(["deprecated_terms"]);
  });
});

describe("get_entry", () => {
  it("returns metadata only when include_content is false (no content fetch)", async () => {
    const { client, calls } = makeClient();
    const result = await client.getEntry("terminology", false);
    expect(result.content).toBeUndefined();
    expect(result.source_url).toBe(`${RAW_BASE}/canon/terminology.md`);
    // Only the index was fetched, never the entry content URL.
    expect(calls).toEqual([INDEX_URL]);
  });

  it("fetches only the indexed path when include_content is true", async () => {
    const { client, calls } = makeClient();
    const result = await client.getEntry("terminology", true);
    expect(result.content).toContain("FAKE CONTENT for canon/terminology.md");
    expect(calls).toContain(`${RAW_BASE}/canon/terminology.md`);
  });

  it("rejects an unknown entry id", async () => {
    const { client } = makeClient();
    await expect(client.getEntry("not_a_real_id", true)).rejects.toThrow(/Unknown canon entry id/);
  });
});

describe("get_entries and get_bundle", () => {
  it("returns multiple entries", async () => {
    const { client } = makeClient();
    const results = await client.getEntries(["terminology", "deprecated_terms"], true);
    expect(results.map((r) => r.entry.id)).toEqual(["terminology", "deprecated_terms"]);
  });

  it("returns all entries of a bundle", async () => {
    const { client } = makeClient();
    const { bundle, entries } = await client.getBundle("terminology_and_deprecations", false);
    expect(bundle.id).toBe("terminology_and_deprecations");
    expect(entries.map((e) => e.entry.id)).toEqual(["terminology", "deprecated_terms"]);
  });

  it("rejects an unknown bundle id", async () => {
    const { client } = makeClient();
    await expect(client.getBundle("no_such_bundle", false)).rejects.toThrow(/Unknown canon bundle id/);
  });
});

describe("search_index", () => {
  it("matches on metadata", async () => {
    const { client } = makeClient();
    const entries = await client.searchIndex("deprecated", 10);
    expect(entries.map((e) => e.id)).toContain("deprecated_terms");
  });

  it("returns nothing for an empty query", async () => {
    const { client } = makeClient();
    expect(await client.searchIndex("   ", 10)).toHaveLength(0);
  });
});

describe("resources", () => {
  it("derives resource list from the index", async () => {
    const { client } = makeClient();
    const resources = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("wfi-canon://entry/terminology");
    expect(resources).toHaveLength(3);
  });

  it("reads a valid resource URI", async () => {
    const { client } = makeClient();
    const result = await client.readResource("wfi-canon://entry/terminology");
    expect(result.content).toContain("FAKE CONTENT for canon/terminology.md");
  });

  it("rejects an invalid resource URI", async () => {
    const { client } = makeClient();
    await expect(client.readResource("https://example.com/x")).rejects.toThrow(/invalid canon resource URI/);
  });

  it("rejects an unknown entry resource URI", async () => {
    const { client } = makeClient();
    await expect(client.readResource("wfi-canon://entry/nope")).rejects.toThrow(/Unknown canon entry id/);
  });
});

describe("only-indexed-paths invariant", () => {
  it("never fetches a URL outside the index URL or the trusted base", async () => {
    const { client, calls } = makeClient();
    await client.getIndex();
    await client.getEntry("terminology", true);
    await client.getBundle("terminology_and_deprecations", true);
    for (const url of calls) {
      const allowed = url === INDEX_URL || url.startsWith(`${RAW_BASE}/`);
      expect(allowed, `unexpected URL fetched: ${url}`).toBe(true);
    }
  });
});

describe("no filesystem or shell access in server source", () => {
  it("source files do not import child_process or fs", () => {
    const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    const forbidden = [/child_process/, /node:child_process/, /from\s+["']fs["']/, /from\s+["']node:fs["']/, /require\(\s*["']fs["']\s*\)/];
    for (const f of files) {
      const text = readFileSync(srcDir + f, "utf8");
      for (const re of forbidden) {
        expect(re.test(text), `${f} must not match ${re}`).toBe(false);
      }
    }
  });
});
