# WFI Canon MCP Server

A thin, read-only, index-driven [Model Context Protocol](https://modelcontextprotocol.io)
server that exposes the public **WFI Scientific Canon** to MCP-compatible clients
such as Claude Code.

It is **not** an alternative source of scientific truth. It retrieves a
machine-readable canon index from the canon repository and returns the source
files that index declares as AI-accessible. It does not summarize, rewrite, or
invent canon content.

## Purpose

- Make the public canon readily accessible to MCP clients.
- Stay a thin adapter: the canon repository remains self-describing via
  `canon_index.yaml`, and this server reflects that index without code changes.
- Be safe by construction: read-only, index-allowlisted retrieval only.

## What it exposes

**Tools**

- `get_index` — return validated canon index metadata (entries and/or bundles).
- `list_entries` — list indexed entries, optionally filtered by `role`,
  `exposure_level`, `tag`, or `wff_module`.
- `get_entry` — retrieve one entry by stable ID (metadata, plus content if asked).
- `get_entries` — retrieve multiple entries by stable IDs.
- `get_bundle` — retrieve all entries in an indexed bundle.
- `search_index` — search **only the index metadata** (not the web, not full
  repository contents).

**Resources**

- One resource per indexed entry, with URIs like
  `wfi-canon://entry/terminology`. The resource list is derived from the live
  index.

**Prompts**

- `orient_to_wfi_canon`, `check_wff_terminology`, `load_wff_modules` — lightweight
  orientation helpers.

## Requirements

- Node.js 20 or newer.

## Installation

```bash
cd wfi-ai-connectors-public
npm install
```

## Build

```bash
npm run build
```

This compiles `src/` to `dist/` and type-checks the project.

## Test

```bash
npm test
```

Tests cover index schema validation, path-safety rejection, ID/bundle integrity,
fetch size/cache behavior, tool behavior, and resource URI mapping. Tests use
fixtures and do not require network access.

## Run

After building:

```bash
npm start          # node dist/index.js
```

Or run directly from TypeScript during development:

```bash
npm run dev        # tsx src/index.ts
```

The server speaks MCP over **stdio**. It is normally launched by an MCP client
rather than run by hand; when run manually it will wait for an MCP client on
stdin/stdout and log status to stderr.

## Claude Code setup

See `example-claude-code-config.json` for a ready-to-edit configuration. The
example uses placeholders rather than a hard-coded absolute path; replace the
path with the location of this repository on your machine.

Typical steps:

1. `npm install` and `npm run build` in this repository.
2. Add the server to your Claude Code MCP configuration (see the example file),
   pointing the command at `dist/index.js` in your local clone.
3. Restart Claude Code so it picks up the new MCP server.

This repository intentionally does **not** ship a root `.mcp.json` and does not
auto-register the server. Registration is left to the user.

## Overriding the index URL (for testing a branch)

By default the server reads the production index:

```
https://raw.githubusercontent.com/welfare-footprint-institute/wfi-scientific-canon-public/main/canon_index.yaml
```

To test against the canon index on a feature branch **before it is merged**, set
`WFI_CANON_INDEX_URL`. For the branch used to introduce the index:

```bash
# bash
export WFI_CANON_INDEX_URL="https://raw.githubusercontent.com/welfare-footprint-institute/wfi-scientific-canon-public/docs/add-canon-index/canon_index.yaml"
npm start
```

```powershell
# PowerShell
$env:WFI_CANON_INDEX_URL = "https://raw.githubusercontent.com/welfare-footprint-institute/wfi-scientific-canon-public/docs/add-canon-index/canon_index.yaml"
npm start
```

Note: the index's own `raw_base_url` still controls where entry files are
fetched from, and it must point at `raw.githubusercontent.com`.

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `WFI_CANON_INDEX_URL` | production `main` index URL | Canon index location |
| `WFI_CANON_MAX_FILE_BYTES` | `500000` | Max bytes per retrieved file |
| `WFI_CANON_FETCH_TIMEOUT_MS` | `10000` | Per-request network timeout |
| `WFI_CANON_CACHE_TTL_MS` | `300000` | In-memory cache TTL |

## How to verify the server

1. `npm test` passes.
2. `npm run build` succeeds.
3. With the server configured in your MCP client, list resources and confirm one
   `wfi-canon://entry/...` resource per indexed entry.
4. Call `list_entries` and confirm entries are returned.
5. Call `get_entry` for `ai_use`, `terminology`, `deprecated_terms`, `module_i`,
   `module_iii`, and `resolved_methodological_decisions` and confirm content is
   retrieved with a source metadata block.

## Security

See `security.md`. In short: read-only, no arbitrary URL or path fetching,
index allowlist only, no credentials, no GitHub writes, no private repos, and a
prompt-injection caution for retrieved text.
