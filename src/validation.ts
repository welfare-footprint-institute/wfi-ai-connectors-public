/**
 * Path and URL safety validation for the WFI Canon MCP server.
 *
 * The server is read-only and index-driven. It must never accept a user-supplied
 * URL or raw file path. Every file it retrieves is named by a relative `path`
 * inside the validated canon index, and every URL is constructed only from the
 * index's trusted `raw_base_url` plus a validated relative path.
 */

const URL_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\//;

/** Host the canon index is allowed to point at for raw file retrieval. */
export const ALLOWED_RAW_HOST = "raw.githubusercontent.com";

/**
 * A path is safe only if it is a non-empty relative POSIX-style path with:
 *  - no parent traversal ("..")
 *  - no leading "/"
 *  - no backslashes
 *  - no URL scheme (e.g. "https://")
 */
export function isSafeRelativePath(p: unknown): p is string {
  if (typeof p !== "string") return false;
  if (p.length === 0) return false;
  if (p.includes("..")) return false;
  if (p.startsWith("/")) return false;
  if (p.includes("\\")) return false;
  if (URL_SCHEME_RE.test(p)) return false;
  return true;
}

export function assertSafeRelativePath(p: unknown): string {
  if (!isSafeRelativePath(p)) {
    throw new Error(`Unsafe or invalid canon entry path: ${JSON.stringify(p)}`);
  }
  return p;
}

/**
 * The index's raw_base_url must be an https URL on the allowlisted raw host.
 * This prevents a tampered or unexpected index from redirecting file fetches to
 * an arbitrary location.
 */
export function assertTrustedRawBaseUrl(rawBase: unknown): string {
  if (typeof rawBase !== "string" || rawBase.length === 0) {
    throw new Error(`Invalid raw_base_url: ${JSON.stringify(rawBase)}`);
  }
  let u: URL;
  try {
    u = new URL(rawBase);
  } catch {
    throw new Error(`Invalid raw_base_url (not a URL): ${rawBase}`);
  }
  if (u.protocol !== "https:") {
    throw new Error(`raw_base_url must use https: ${rawBase}`);
  }
  if (u.hostname !== ALLOWED_RAW_HOST) {
    throw new Error(
      `raw_base_url host not allowed: ${u.hostname} (expected ${ALLOWED_RAW_HOST})`,
    );
  }
  return rawBase;
}

/**
 * Build a raw file URL from the trusted base and a validated relative path.
 * Both inputs are validated here so this is the single safe construction point.
 */
export function buildRawUrl(rawBase: string, relativePath: string): string {
  assertTrustedRawBaseUrl(rawBase);
  const safe = assertSafeRelativePath(relativePath);
  const base = rawBase.replace(/\/+$/, "");
  return `${base}/${safe}`;
}
