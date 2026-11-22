import { createHash } from "node:crypto";
import { sanitizeText } from "../contract/sanitize";
import type { SourceRecord } from "../data/sources/registry";
import { canonicalEvidenceUrl } from "./canonical";
import type { RawSignal } from "./map";

/** Keep a modest recent window and drop marketing or off-host links. Descriptions are never copied. */
export function selectSignals(source: SourceRecord, signals: readonly RawSignal[]): RawSignal[] {
  const selected: RawSignal[] = [];
  for (const signal of signals) {
    const next = labelSignal(source, signal);
    if (next) selected.push(next);
    if (selected.length >= source.maxItems) break;
  }
  return selected;
}

export function labelSignal(source: SourceRecord, signal: RawSignal): RawSignal | null {
  const url = canonicalEvidenceUrl(signal.url);
  if (!url || !hostAllowed(url, source.allowedHosts)) return null;
  if (source.id === "openai-news" && !openaiNewsKeep(url)) return null;
  if (source.id === "huggingface-blog") {
    const post = huggingfacePost(url);
    if (!post) return null;
    if (post.kind === "community") {
      return withUrl(source, signal, url, {
        sourceLabel: "Hugging Face 社区",
        scopeNote: `这是 Hugging Face 博客上的社区帖，作者标识来自网址中的 ${post.org}，不是 Hugging Face 官方公告。只保留标题、时间和链接。`,
      });
    }
  }
  return withUrl(source, signal, url, {});
}

export function openaiNewsKeep(url: string): boolean {
  const path = new URL(url).pathname;
  if (path.includes("/customer-stories/")) return false;
  if (path.startsWith("/business/learn")) return false;
  if (path.startsWith("/ads/")) return false;
  return path.startsWith("/index/") || path.startsWith("/research/");
}

export function huggingfacePost(url: string): { kind: "official" } | { kind: "community"; org: string } | null {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  if (parts[0] !== "blog") return null;
  if (parts.length === 2) return { kind: "official" };
  const org = sanitizeText(decodeURIComponent(parts[1] ?? ""), 40);
  if (parts.length >= 3 && org.length >= 2) return { kind: "community", org };
  return null;
}

function withUrl(
  source: SourceRecord,
  signal: RawSignal,
  url: string,
  patch: { sourceLabel?: string; scopeNote?: string },
): RawSignal {
  const freshId = source.id === "arxiv-cs" || source.id === "nist-it" ? signal.externalId : hashId(url);
  return { ...signal, ...patch, url, externalId: freshId };
}

function hashId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

function hostAllowed(url: string, hosts: readonly string[]): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return hosts.some((allowed) => allowed.toLowerCase() === host);
}
