import { isAllowedFetchUrl } from "../contract/ssrf";

const MAX_BYTES = 800_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12_000;

export async function fetchAllowlisted(url: string, allowedHosts: readonly string[], attempt = 0): Promise<string> {
  if (!isAllowedFetchUrl(url, allowedHosts)) throw new Error(`blocked-url:${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": "shijie-collector/0.1 (public metadata; +https://github.com/WujieGrowth/ai-intel-site)" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || attempt >= MAX_REDIRECTS) throw new Error("redirect-rejected");
      const next = new URL(location, url).toString();
      if (!isAllowedFetchUrl(next, allowedHosts)) throw new Error(`blocked-redirect:${next}`);
      return fetchAllowlisted(next, allowedHosts, attempt + 1);
    }
    if (!response.ok) throw new Error(`http-${response.status}`);
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > MAX_BYTES) throw new Error("response-too-large");
    const text = await response.text();
    if (text.length > MAX_BYTES) throw new Error("response-too-large");
    return text;
  } finally {
    clearTimeout(timer);
  }
}
