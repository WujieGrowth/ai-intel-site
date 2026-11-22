import { isPublicHttpsUrl } from "../contract/ssrf";

/** Public originals the reviewed bridge may cite. This is not a fetch allowlist for Actions. */
export const PUBLIC_EVIDENCE_HOSTS = ["x.com", "blog.google"] as const;

export function evidenceHost(raw: string): string | null {
  if (!isPublicHttpsUrl(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (!PUBLIC_EVIDENCE_HOSTS.some((allowed) => allowed === host)) return null;
  if (host === "x.com" && !/\/status\/\d{5,}/.test(url.pathname)) return null;
  if (host === "blog.google" && url.pathname.split("/").filter(Boolean).length < 2) return null;
  return host;
}
