import { describe, it, expect } from "vitest";
import {
  parseIndex,
  validateIndex,
  entryUri,
  parseEntryUri,
  ENTRY_URI_PREFIX,
} from "../src/canon-index.js";
import { VALID_INDEX_YAML, baseIndexObject } from "./fixtures.js";

describe("index schema validation", () => {
  it("parses a valid index", () => {
    const index = parseIndex(VALID_INDEX_YAML);
    expect(index.entries).toHaveLength(3);
    expect(index.bundles).toHaveLength(1);
    expect(index.entries.every((e) => e.ai_accessible === true)).toBe(true);
  });

  it("rejects an index missing required fields", () => {
    const bad = baseIndexObject();
    delete bad.entries[0].role;
    expect(() => validateIndex(bad)).toThrow();
  });

  it("rejects an index with no entries", () => {
    const bad = baseIndexObject();
    bad.entries = [];
    expect(() => validateIndex(bad)).toThrow();
  });
});

describe("unique entry ids", () => {
  it("rejects duplicate ids", () => {
    const bad = baseIndexObject();
    bad.entries.push({ ...bad.entries[0] });
    expect(() => validateIndex(bad)).toThrow(/[Dd]uplicate entry id/);
  });
});

describe("bundle reference integrity", () => {
  it("rejects bundles referencing unknown entry ids", () => {
    const bad = baseIndexObject();
    bad.bundles[0].entry_ids = ["does_not_exist"];
    expect(() => validateIndex(bad)).toThrow(/unknown entry id/);
  });
});

describe("path safety", () => {
  const badPaths = [
    "../secret.md",
    "/absolute/path.md",
    "https://example.com/file.md",
    "folder\\file.md",
    "",
  ];
  for (const p of badPaths) {
    it(`rejects unsafe path: ${JSON.stringify(p)}`, () => {
      const bad = baseIndexObject();
      bad.entries[0].path = p;
      expect(() => validateIndex(bad)).toThrow();
    });
  }
});

describe("raw_base_url trust", () => {
  it("rejects a non-allowlisted host", () => {
    const bad = baseIndexObject();
    bad.source_repository.raw_base_url = "https://evil.example.com/x";
    expect(() => validateIndex(bad)).toThrow(/host not allowed/);
  });

  it("rejects a non-https base url", () => {
    const bad = baseIndexObject();
    bad.source_repository.raw_base_url = "http://raw.githubusercontent.com/x";
    expect(() => validateIndex(bad)).toThrow(/https/);
  });
});

describe("resource URI mapping", () => {
  it("builds a valid entry URI", () => {
    expect(entryUri("terminology")).toBe(`${ENTRY_URI_PREFIX}terminology`);
  });

  it("parses a valid entry URI back to an id", () => {
    expect(parseEntryUri("wfi-canon://entry/terminology")).toBe("terminology");
  });

  it("rejects an unknown scheme", () => {
    expect(parseEntryUri("https://example.com/file.md")).toBeNull();
  });

  it("rejects an empty id", () => {
    expect(parseEntryUri("wfi-canon://entry/")).toBeNull();
  });

  it("rejects an id containing a slash", () => {
    expect(parseEntryUri("wfi-canon://entry/a/b")).toBeNull();
  });
});
