function ipv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return null;
  return nums;
}

function isPrivateAddress(nums: number[]): boolean {
  const [a, b] = nums;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
  return false;
}

/** HTTPS citation that is not local, link-local, or credentialed. Not an allowlist and not a fetch. */
export function isPublicHttpsUrl(raw: string): boolean {
  return publicHttpsHost(raw) !== null;
}

/** HTTPS only, no credentials, no local or link-local targets, host must be allowlisted. */
export function isAllowedFetchUrl(raw: string, allowedHosts: readonly string[]): boolean {
  const host = publicHttpsHost(raw);
  if (host === null) return false;
  return allowedHosts.some((allowed) => allowed.toLowerCase() === host);
}

function publicHttpsHost(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return null;
  if (host.includes(":") || host === "") return null;
  const address = ipv4(host);
  if (address && isPrivateAddress(address)) return null;
  return host;
}
