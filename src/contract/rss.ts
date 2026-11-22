import type { PublicItem } from "./types";
import { visibleOnSite } from "./schema";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hasNumericZone(item: PublicItem): boolean {
  const zone = item.sourcePublishedAt.timezone;
  return item.sourcePublishedAt.certainty === "complete" && zone !== null && /^(?:Z|UTC|[+-]\d{2}:\d{2})$/.test(zone);
}

function sourceIso(item: PublicItem): string {
  const date = item.sourcePublishedAt;
  const month = String(date.month ?? 0).padStart(2, "0");
  const day = String(date.day ?? 0).padStart(2, "0");
  const zone = date.timezone === "Z" || date.timezone === "UTC" ? "Z" : date.timezone ?? "Z";
  return `${date.year}-${month}-${day}T${date.time}:00${zone}`;
}

function rfc2822(iso: string): string | null {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toUTCString();
}

export function siteBaseUrl(siteOrigin: string, basePath: string): string {
  const origin = siteOrigin.replace(/\/+$/, "");
  const base = basePath === "/" ? "/" : `/${basePath.replace(/^\/+|\/+$/g, "")}/`;
  return `${origin}${base}`;
}

export function absoluteItemUrl(siteOrigin: string, basePath: string, id: string): string {
  return `${siteBaseUrl(siteOrigin, basePath)}items/${id}/`;
}

/** RSS 2.0 for visible, non-demo items. Unknown source times omit pubDate instead of inventing one. */
export function buildRssXml(input: {
  title: string;
  description: string;
  siteOrigin: string;
  basePath: string;
  selfPath: string;
  items: readonly PublicItem[];
}): string {
  const channelLink = siteBaseUrl(input.siteOrigin, input.basePath);
  const self = `${input.siteOrigin.replace(/\/+$/, "")}${input.selfPath.startsWith("/") ? input.selfPath : `/${input.selfPath}`}`;
  const rows = input.items.filter((item) => visibleOnSite(item)).map((item) => {
    const link = absoluteItemUrl(input.siteOrigin, input.basePath, item.id);
    const pub = hasNumericZone(item) ? rfc2822(sourceIso(item)) : null;
    const description = escapeXml(`${item.sourceName}。${item.analysis}`);
    return [
      "<item>",
      `<title>${escapeXml(item.title)}</title>`,
      `<link>${escapeXml(link)}</link>`,
      `<guid isPermaLink="true">${escapeXml(link)}</guid>`,
      `<description>${description}</description>`,
      pub ? `<pubDate>${escapeXml(pub)}</pubDate>` : "",
      "</item>",
    ].filter(Boolean).join("");
  });
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<rss version=\"2.0\">",
    "<channel>",
    `<title>${escapeXml(input.title)}</title>`,
    `<link>${escapeXml(channelLink)}</link>`,
    `<description>${escapeXml(input.description)}</description>`,
    `<atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${escapeXml(self)}" rel="self" type="application/rss+xml"/>`,
    ...rows,
    "</channel>",
    "</rss>",
  ].join("");
}
