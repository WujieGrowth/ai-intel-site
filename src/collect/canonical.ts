import { isPublicHttpsUrl } from "../contract/ssrf";

const TRACKING = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

/** Official permalink. Tracking queries are removed. A section id in the hash is kept. */
export function canonicalEvidenceUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!isPublicHttpsUrl(url.toString())) return null;
  url.hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (TRACKING.has(lower) || lower.startsWith("utm_")) url.searchParams.delete(key);
  }
  url.hash = /^#[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(url.hash) ? url.hash : "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  if (url.port === "443") url.port = "";
  return url.toString();
}
