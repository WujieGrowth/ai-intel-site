import { sanitizeText } from "../contract/sanitize";
import { dateFromIso, dateFromRfc822, emptyDate, type RawSignal } from "./map";

export function parseArxiv(xml: string): RawSignal[] {
  return blocks(xml, "entry").map((entry) => {
    const id = text(entry, "id");
    const title = sanitizeText(text(entry, "title"), 180);
    const published = text(entry, "published");
    const authors = blocks(entry, "author").map((author) => sanitizeText(text(author, "name"), 80)).filter(Boolean);
    const categories = [...entry.matchAll(/<category\b[^>]*term="([^"]+)"/g)].map((match) => match[1] ?? "");
    return {
      externalId: id.split("/abs/").pop() ?? id,
      title,
      url: id.startsWith("http") ? id.replace("http://", "https://") : "",
      authors,
      categories,
      publishedAt: published ? dateFromIso(published) : emptyDate(),
    };
  }).filter((item) => item.title && item.url.startsWith("https://"));
}

export function parseRss(xml: string): RawSignal[] {
  return blocks(xml, "item").map((item) => {
    const title = cleanFeedText(textRaw(item, "title"), 180);
    const link = linkOf(item);
    const pubDate = textRaw(item, "pubDate");
    const guid = cleanFeedText(textRaw(item, "guid"), 300) || link;
    return {
      externalId: guid,
      title,
      url: link.startsWith("https://") ? link : "",
      authors: [],
      categories: [],
      publishedAt: pubDate ? dateFromRfc822(pubDate) : emptyDate(),
    };
  }).filter((item) => item.title && item.url.startsWith("https://"));
}

/** Feed text may be wrapped in CDATA. Markup is removed; the wrapped words stay. */
export function cleanFeedText(value: string, max = 300): string {
  const cdata = value.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return sanitizeText(cdata ? cdata[1] : value, max);
}

function blocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => match[1] ?? "");
}

function text(xml: string, tag: string): string {
  return cleanFeedText(textRaw(xml, tag));
}

function textRaw(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1] ?? "";
}

function linkOf(item: string): string {
  const plain = cleanFeedText(textRaw(item, "link"), 300);
  if (plain.startsWith("https://")) return plain;
  const href = item.match(/<link\b[^>]*href="(https:[^"]+)"/i);
  return href?.[1] ?? plain;
}
