import type { APIRoute } from "astro";
import { buildRssXml, escapeXml, siteBaseUrl } from "../contract/rss";
import { visibleOnSite } from "../contract/schema";
import type { PublicItem } from "../contract/types";
import { getPublishedItems, getSiteMeta } from "../data/public";

/** GitHub project Pages for this site. example.com is only the unset-site placeholder. */
export const PAGES_SITE_ORIGIN = "https://wujiegrowth.github.io";
export const PAGES_BASE_PATH = "/ai-intel-site/";

const PLACEHOLDER_ORIGIN = "https://example.com";

export function resolveFeedTarget(
  site: string | undefined,
  base: string | undefined,
): { siteOrigin: string; basePath: string } {
  const basePath = normalizeBase(base);
  const configured = cleanOrigin(site);
  if (basePath === PAGES_BASE_PATH) {
    const siteOrigin =
      configured === PAGES_SITE_ORIGIN || configured === "" || configured === PLACEHOLDER_ORIGIN
        ? PAGES_SITE_ORIGIN
        : configured;
    return { siteOrigin, basePath: PAGES_BASE_PATH };
  }
  return {
    siteOrigin: configured || PLACEHOLDER_ORIGIN,
    basePath,
  };
}

/** RSS 2.0 for visibleOnSite items. Source times come only from buildRssXml. */
export function renderRssFeed(input: {
  title: string;
  description: string;
  siteOrigin: string;
  basePath: string;
  items: readonly PublicItem[];
}): string {
  const siteOrigin = cleanOrigin(input.siteOrigin);
  const channel = siteBaseUrl(siteOrigin, input.basePath);
  const selfPath = `${channel.slice(siteOrigin.length)}rss.xml`;
  const xml = buildRssXml({
    title: input.title,
    description: input.description,
    siteOrigin,
    basePath: input.basePath,
    selfPath,
    items: input.items.filter((item) => visibleOnSite(item)),
  });
  const selfUrl = `${siteOrigin}${selfPath}`;
  if (!xml.includes(`href="${escapeXml(selfUrl)}"`)) {
    throw new Error("RSS self link is missing the escaped absolute URL");
  }
  return xml;
}

export const prerender = true;

export const GET: APIRoute = () => {
  const site = getSiteMeta();
  const target = resolveFeedTarget(import.meta.env.SITE, import.meta.env.BASE_URL);
  const xml = renderRssFeed({
    title: site.name,
    description: site.description,
    siteOrigin: target.siteOrigin,
    basePath: target.basePath,
    items: getPublishedItems(),
  });
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
};

function cleanOrigin(site: string | undefined): string {
  return (site ?? "").trim().replace(/\/+$/, "");
}

function normalizeBase(base: string | undefined): string {
  const trimmed = (base ?? "/").trim();
  if (trimmed === "" || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;
}
