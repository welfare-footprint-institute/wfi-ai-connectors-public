/**
 * Canon index model and client for the WFI Canon MCP server.
 *
 * The canon repository is self-describing: it publishes a machine-readable
 * `canon_index.yaml` that declares which entries are AI-accessible, their stable
 * IDs, roles, statuses, exposure levels, paths, and recommended bundles.
 *
 * This module does NOT hard-code the canon structure. It parses and validates
 * whatever index the configured URL serves, and exposes only what that index
 * declares. The only allowed hard-coded default (the index URL) lives in
 * index.ts, not here.
 */

import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  assertSafeRelativePath,
  assertTrustedRawBaseUrl,
  buildRawUrl,
} from "./validation.js";
import type { Fetcher } from "./fetch-canon.js";

export const EntrySchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  title: z.string().min(1),
  role: z.string().min(1),
  status: z.string().min(1),
  exposure_level: z.string().min(1),
  ai_accessible: z.boolean(),
  mime_type: z.string().min(1),
  wff_modules: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  recommended_use: z.string().default(""),
});
export type CanonEntry = z.infer<typeof EntrySchema>;

export const BundleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  entry_ids: z.array(z.string().min(1)).min(1),
});
export type CanonBundle = z.infer<typeof BundleSchema>;

export const SourceRepositorySchema = z.object({
  organization: z.string(),
  repository: z.string(),
  branch: z.string(),
  raw_base_url: z.string(),
});

export const IndexSchema = z.object({
  schema_version: z.string(),
  index_id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  source_repository: SourceRepositorySchema,
  access_policy: z.unknown().optional(),
  entries: z.array(EntrySchema).min(1),
  bundles: z.array(BundleSchema).default([]),
});
export type CanonIndex = z.infer<typeof IndexSchema>;

/**
 * Validate a parsed index object against the schema plus structural rules:
 * unique entry IDs, safe relative paths, a trusted raw_base_url, and bundles
 * referencing only known entry IDs.
 */
export function validateIndex(raw: unknown): CanonIndex {
  const index = IndexSchema.parse(raw);

  const ids = new Set<string>();
  for (const e of index.entries) {
    if (ids.has(e.id)) {
      throw new Error(`Duplicate entry id in canon index: ${e.id}`);
    }
    ids.add(e.id);
    // Reject unsafe paths up front so they can never be fetched.
    assertSafeRelativePath(e.path);
  }

  assertTrustedRawBaseUrl(index.source_repository.raw_base_url);

  for (const b of index.bundles) {
    for (const refId of b.entry_ids) {
      if (!ids.has(refId)) {
        throw new Error(`Bundle "${b.id}" references unknown entry id: ${refId}`);
      }
    }
  }

  return index;
}

export function parseIndex(text: string): CanonIndex {
  const raw = parseYaml(text);
  return validateIndex(raw);
}

/**
 * Build the connector-visible view of a validated index.
 * Entries marked ai_accessible: false are hidden from every tool and resource.
 */
export function filterAiAccessibleIndex(index: CanonIndex): CanonIndex {
  const entries = index.entries.filter((entry) => entry.ai_accessible === true);
  const accessibleIds = new Set(entries.map((entry) => entry.id));

  const bundles = index.bundles
    .map((bundle) => ({
      ...bundle,
      entry_ids: bundle.entry_ids.filter((id) => accessibleIds.has(id)),
    }))
    .filter((bundle) => bundle.entry_ids.length > 0);

  return { ...index, entries, bundles };
}

export interface EntryFilter {
  role?: string;
  exposure_level?: string;
  tag?: string;
  wff_module?: string;
}

export interface EntryResult {
  entry: CanonEntry;
  source_url: string;
  content?: string;
}

export const ENTRY_URI_PREFIX = "wfi-canon://entry/";

export function entryUri(id: string): string {
  return `${ENTRY_URI_PREFIX}${id}`;
}

/** Parse a resource URI back to an entry id, or null if it is not a valid one. */
export function parseEntryUri(uri: string): string | null {
  if (!uri.startsWith(ENTRY_URI_PREFIX)) return null;
  const id = uri.slice(ENTRY_URI_PREFIX.length);
  if (!id || id.includes("/")) return null;
  return id;
}

function scoreEntry(e: CanonEntry, q: string): number {
  let score = 0;
  const hit = (hay: string, weight: number): void => {
    if (hay.toLowerCase().includes(q)) score += weight;
  };
  hit(e.id, 5);
  hit(e.title, 4);
  hit(e.role, 3);
  hit(e.recommended_use, 2);
  hit(e.path, 2);
  for (const t of e.tags) hit(t, 3);
  for (const m of e.wff_modules) hit(m, 3);
  return score;
}

/**
 * Read-only client over a validated canon index.
 *
 * The client never accepts a URL or raw path from a caller. Callers reference
 * entries by stable index ID (or by bundle ID, or by resource URI which maps to
 * an ID). All file URLs are constructed internally from the index base.
 */
export class CanonClient {
  private indexCache?: { index: CanonIndex; expires: number };

  constructor(
    private readonly opts: {
      indexUrl: string;
      fetcher: Fetcher;
      cacheTtlMs: number;
      now?: () => number;
    },
  ) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  async getIndex(force = false): Promise<CanonIndex> {
    const t = this.now();
    if (!force && this.indexCache && this.indexCache.expires > t) {
      return this.indexCache.index;
    }
    const text = await this.opts.fetcher(this.opts.indexUrl);
    const index = filterAiAccessibleIndex(parseIndex(text));
    this.indexCache = { index, expires: t + this.opts.cacheTtlMs };
    return index;
  }

  sourceUrlFor(index: CanonIndex, entry: CanonEntry): string {
    return buildRawUrl(index.source_repository.raw_base_url, entry.path);
  }

  async listEntries(filter: EntryFilter = {}): Promise<CanonEntry[]> {
    const index = await this.getIndex();
    return index.entries.filter((e) => {
      if (filter.role && e.role !== filter.role) return false;
      if (filter.exposure_level && e.exposure_level !== filter.exposure_level) return false;
      if (filter.tag && !e.tags.includes(filter.tag)) return false;
      if (filter.wff_module && !e.wff_modules.includes(filter.wff_module)) return false;
      return true;
    });
  }

  async getEntry(id: string, includeContent: boolean): Promise<EntryResult> {
    const index = await this.getIndex();
    const entry = index.entries.find((e) => e.id === id);
    if (!entry) {
      throw new Error(`Unknown canon entry id: ${id}`);
    }
    const source_url = this.sourceUrlFor(index, entry);
    if (!includeContent) {
      return { entry, source_url };
    }
    const content = await this.opts.fetcher(source_url);
    return { entry, source_url, content };
  }

  async getEntries(ids: string[], includeContent: boolean): Promise<EntryResult[]> {
    const out: EntryResult[] = [];
    for (const id of ids) {
      out.push(await this.getEntry(id, includeContent));
    }
    return out;
  }

  async getBundle(
    bundleId: string,
    includeContent: boolean,
  ): Promise<{ bundle: CanonBundle; entries: EntryResult[] }> {
    const index = await this.getIndex();
    const bundle = index.bundles.find((b) => b.id === bundleId);
    if (!bundle) {
      throw new Error(`Unknown canon bundle id: ${bundleId}`);
    }
    const entries = await this.getEntries(bundle.entry_ids, includeContent);
    return { bundle, entries };
  }

  async searchIndex(query: string, limit = 10): Promise<CanonEntry[]> {
    const index = await this.getIndex();
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index.entries
      .map((e) => ({ e, score: scoreEntry(e, q) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, limit))
      .map((s) => s.e);
  }

  async listResources(): Promise<
    Array<{
      uri: string;
      name: string;
      title: string;
      description: string;
      mimeType: string;
      entry: CanonEntry;
    }>
  > {
    const index = await this.getIndex();
    return index.entries.map((e) => ({
      uri: entryUri(e.id),
      name: e.id,
      title: e.title,
      description: e.recommended_use || `${e.role} — ${e.status}`,
      mimeType: e.mime_type,
      entry: e,
    }));
  }

  async readResource(uri: string): Promise<EntryResult> {
    const id = parseEntryUri(uri);
    if (!id) {
      throw new Error(`Unknown or invalid canon resource URI: ${uri}`);
    }
    return this.getEntry(id, true);
  }
}
