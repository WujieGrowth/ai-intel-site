import { isAllowedFetchUrl } from "../contract/ssrf";

const MAX_BYTES = 800_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12_000;

export interface FeedFetch {
  status: number;
  body: string;
  etag: string | null;
  lastModified: string | null;
}

export interface FeedRequest {
  etag?: string | null;
  lastModified?: string | null;
}

/** XML is recognized from the body. A text/plain MIME type is not a reason to reject it. */
export function looksLikeFeed(body: string): boolean {
  const start = body.trimStart().slice(0, 300).toLowerCase();
  return start.startsWith("<?xml") || start.startsWith("<rss") || start.startsWith("<feed") || start.startsWith("<rdf");
}

export async function fetchAllowlisted(
  url: string,
  allowedHosts: readonly string[],
  request: FeedRequest = {},
  attempt = 0,
): Promise<FeedFetch> {
  if (!isAllowedFetchUrl(url, allowedHosts)) throw new Error(`blocked-url:${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = {
    "user-agent": "shijie-collector/0.1 (public metadata; +https://github.com/WujieGrowth/ai-intel-site)",
  };
  if (request.etag) headers["if-none-match"] = request.etag;
  if (request.lastModified) headers["if-modified-since"] = request.lastModified;
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers,
    });
    if (response.status >= 300 && response.status < 400) {
      if ((request.etag || request.lastModified) && attempt === 0) {
        return fetchAllowlisted(url, allowedHosts, {}, attempt + 1);
      }
      const location = response.headers.get("location");
      if (!location || attempt >= MAX_REDIRECTS) throw new Error("redirect-rejected");
      const next = new URL(location, url).toString();
      if (!isAllowedFetchUrl(next, allowedHosts)) throw new Error(`blocked-redirect:${next}`);
      return fetchAllowlisted(next, allowedHosts, request, attempt + 1);
    }
    if (response.status === 304) {
      return {
        status: 304,
        body: "",
        etag: response.headers.get("etag") ?? request.etag ?? null,
        lastModified: response.headers.get("last-modified") ?? request.lastModified ?? null,
      };
    }
    if (!response.ok) throw new Error(`http-${response.status}`);
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > MAX_BYTES * 4) throw new Error("response-too-large");
    const body = await readCapped(response, MAX_BYTES);
    if (!looksLikeFeed(body)) throw new Error("not-a-feed");
    return {
      status: response.status,
      body,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Keep the newest complete items when a feed is larger than the read cap. */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let received = 0;
  let overflow = false;
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    received += step.value.byteLength;
    chunks.push(step.value);
    if (received > maxBytes) {
      overflow = true;
      await reader.cancel();
      break;
    }
  }
  const body = new TextDecoder().decode(concat(chunks));
  if (!overflow) return body;
  const truncated = truncateToLastEntry(body);
  if (!truncated) throw new Error("response-too-large");
  return truncated;
}

export function truncateToLastEntry(body: string): string | null {
  const itemEnd = body.lastIndexOf("</item>");
  const entryEnd = body.lastIndexOf("</entry>");
  const cut = Math.max(itemEnd, entryEnd);
  if (cut < 0) return null;
  const closer = itemEnd >= entryEnd ? "</item>" : "</entry>";
  return body.slice(0, cut + closer.length);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
