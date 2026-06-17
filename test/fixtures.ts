import type { Fetcher } from "../src/fetch-canon.js";

export const INDEX_URL =
  "https://raw.githubusercontent.com/welfare-footprint-institute/wfi-scientific-canon-public/main/canon_index.yaml";

export const RAW_BASE =
  "https://raw.githubusercontent.com/welfare-footprint-institute/wfi-scientific-canon-public/main";

/** A minimal but structurally valid canon index used across tests. */
export const VALID_INDEX_YAML = `
schema_version: "0.1"
index_id: test-index
title: Test Canon Index
description: Test fixture index.
source_repository:
  organization: welfare-footprint-institute
  repository: wfi-scientific-canon-public
  branch: main
  raw_base_url: ${RAW_BASE}
access_policy:
  default: read_only
entries:
  - id: terminology
    path: canon/terminology.md
    title: Core Terminology
    role: terminology
    status: draft_for_scientific_review
    exposure_level: public_default
    ai_accessible: true
    mime_type: text/markdown
    wff_modules: []
    tags: [terminology, definitions]
    recommended_use: Align on canonical WFF terminology.
  - id: deprecated_terms
    path: glossary/deprecated_terms.yaml
    title: Deprecated Terms
    role: glossary
    status: scaffold_for_scientific_review
    exposure_level: public_default
    ai_accessible: true
    mime_type: text/yaml
    wff_modules: []
    tags: [glossary, deprecated]
    recommended_use: Detect superseded terms.
  - id: module_iii
    path: modules/iii_affective_quantification.md
    title: "Module III: Affective Quantification"
    role: module
    status: scaffold_for_scientific_review
    exposure_level: public_default
    ai_accessible: true
    mime_type: text/markdown
    wff_modules: ["III"]
    tags: [module, affective_experiences]
    recommended_use: Module III specification.
bundles:
  - id: terminology_and_deprecations
    title: Terminology and deprecated terms
    description: Terminology plus deprecated-term guidance.
    entry_ids:
      - terminology
      - deprecated_terms
`;

/** A plain object equivalent, convenient for mutation in validation tests. */
export function baseIndexObject(): any {
  return {
    schema_version: "0.1",
    index_id: "test-index",
    title: "Test Canon Index",
    source_repository: {
      organization: "welfare-footprint-institute",
      repository: "wfi-scientific-canon-public",
      branch: "main",
      raw_base_url: RAW_BASE,
    },
    entries: [
      {
        id: "terminology",
        path: "canon/terminology.md",
        title: "Core Terminology",
        role: "terminology",
        status: "draft_for_scientific_review",
        exposure_level: "public_default",
        ai_accessible: true,
        mime_type: "text/markdown",
        wff_modules: [],
        tags: ["terminology"],
        recommended_use: "x",
      },
    ],
    bundles: [
      {
        id: "b1",
        title: "Bundle",
        description: "d",
        entry_ids: ["terminology"],
      },
    ],
  };
}

export interface MockFetcher {
  fetcher: Fetcher;
  calls: string[];
}

/**
 * Build a fetcher that serves the fixture index for INDEX_URL and canned content
 * for the indexed entry URLs. Any other URL throws, which lets tests assert that
 * the client only ever fetches indexed paths.
 */
export function makeMockFetcher(indexYaml: string = VALID_INDEX_YAML): MockFetcher {
  const calls: string[] = [];
  const fetcher: Fetcher = async (url: string) => {
    calls.push(url);
    if (url === INDEX_URL) return indexYaml;
    if (url.startsWith(RAW_BASE + "/")) {
      const path = url.slice(RAW_BASE.length + 1);
      return `FAKE CONTENT for ${path}`;
    }
    throw new Error(`Unexpected fetch URL (not indexed): ${url}`);
  };
  return { fetcher, calls };
}
