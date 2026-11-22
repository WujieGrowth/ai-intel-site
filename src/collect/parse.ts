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
    const title = sanitizeText(text(item, "title"), 180);
    const link = text(item, "link");
    const pubDate = text(item, "pubDate");
    const guid = text(item, "guid") || link;
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

function blocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => match[1] ?? "");
}

function text(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return sanitizeText(match?.[1] ?? "", 300);
}
