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

export function validateIndex(raw: unknown): CanonIndex {
  const index = IndexSchema.parse(raw);
  const ids = new Set<string>();

  for (const entry of index.entries) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate entry id in canon index: ${entry.id}`);
    }
    ids.add(entry.id);
    assertSafeRelativePath(entry.path);
  }

  assertTrustedRawBaseUrl(index.source_repository.raw_base_url);

  for (const bundle of index.bundles) {
    for (const refId of bundle.entry_ids) {
      if (!ids.has(refId)) {
        throw new Error(`Bundle "${bundle.id}" references unknown entry id: ${refId}`);
      }
    }
  }

  return index;
}

export function parseIndex(text: string): CanonIndex {
  return validateIndex(parseYaml(text));
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

export function parseEntryUri(uri: string): string | null {
  if (!uri.startsWith(ENTRY_URI_PREFIX)) return null;
  const id = uri.slice(ENTRY_URI_PREFIX.length);
  if (!id || id.includes("/")) return null;
  return id;
}

function scoreEntry(entry: CanonEntry, query: string): number {
  let score = 0;
  const hit = (value: string, weight: number): void => {
    if (value.toLowerCase().includes(query)) score += weight;
  };

  hit(entry.id, 5);
  hit(entry.title, 4);
  hit(entry.role, 3);
  hit(entry.recommended_use, 2);
  hit(entry.path, 2);
  for (const tag of entry.tags) hit(tag, 3);
  for (const module of entry.wff_modules) hit(module, 3);
  return score;
}

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
    const now = this.now();
    if (!force && this.indexCache && this.indexCache.expires > now) {
      return this.indexCache.index;
    }

    const text = await this.opts.fetcher(this.opts.indexUrl);
    const index = filterAiAccessibleIndex(parseIndex(text));
    this.indexCache = { index, expires: now + this.opts.cacheTtlMs };
    return index;
  }

  sourceUrlFor(index: CanonIndex, entry: CanonEntry): string {
    return buildRawUrl(index.source_repository.raw_base_url, entry.path);
  }

  async listEntries(filter: EntryFilter = {}): Promise<CanonEntry[]> {
    const index = await this.getIndex();
    return index.entries.filter((entry) => {
      if (filter.role && entry.role !== filter.role) return false;
      if (filter.exposure_level && entry.exposure_level !== filter.exposure_level) return false;
      if (filter.tag && !entry.tags.includes(filter.tag)) return false;
      if (filter.wff_module && !entry.wff_modules.includes(filter.wff_module)) return false;
      return true;
    });
  }

  async getEntry(id: string, includeContent: boolean): Promise<EntryResult> {
    const index = await this.getIndex();
    const entry = index.entries.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`Unknown canon entry id: ${id}`);

    const source_url = this.sourceUrlFor(index, entry);
    if (!includeContent) return { entry, source_url };

    const content = await this.opts.fetcher(source_url);
    return { entry, source_url, content };
  }

  async getEntries(ids: string[], includeContent: boolean): Promise<EntryResult[]> {
    const results: EntryResult[] = [];
    for (const id of ids) results.push(await this.getEntry(id, includeContent));
    return results;
  }

  async getBundle(
    bundleId: string,
    includeContent: boolean,
  ): Promise<{ bundle: CanonBundle; entries: EntryResult[] }> {
    const index = await this.getIndex();
    const bundle = index.bundles.find((candidate) => candidate.id === bundleId);
    if (!bundle) throw new Error(`Unknown canon bundle id: ${bundleId}`);

    const entries = await this.getEntries(bundle.entry_ids, includeContent);
    return { bundle, entries };
  }

  async searchIndex(query: string, limit = 10): Promise<CanonEntry[]> {
    const index = await this.getIndex();
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    return index.entries
      .map((entry) => ({ entry, score: scoreEntry(entry, normalized) }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, limit))
      .map((result) => result.entry);
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
    return index.entries.map((entry) => ({
      uri: entryUri(entry.id),
      name: entry.id,
      title: entry.title,
      description: entry.recommended_use || `${entry.role} — ${entry.status}`,
      mimeType: entry.mime_type,
      entry,
    }));
  }

  async readResource(uri: string): Promise<EntryResult> {
    const id = parseEntryUri(uri);
    if (!id) throw new Error(`Unknown or invalid canon resource URI: ${uri}`);
    return this.getEntry(id, true);
  }
}
