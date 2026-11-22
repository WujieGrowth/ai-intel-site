import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { escapeXml, siteBaseUrl } from "../../src/contract/rss";
import type { PublicItem, SourcePublishedAt } from "../../src/contract/types";
import { getPublishedItems } from "../../src/data/public";
import { PAGES_BASE_PATH, PAGES_SITE_ORIGIN, renderRssFeed, resolveFeedTarget } from "../../src/pages/rss.xml";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const hostile = 'Alpha "quoted" <script>alert(\'x\')</script>';

describe("rss feed", () => {
  it("escapes script tags and quotes", () => {
    expect(escapeXml(hostile)).toBe(
      "Alpha &quot;quoted&quot; &lt;script&gt;alert(&apos;x&apos;)&lt;/script&gt;",
    );
    expect(escapeXml(`say "hello" it's`)).toBe("say &quot;hello&quot; it&apos;s");

    const xml = renderRssFeed({
      title: hostile,
      description: `feed "notes"`,
      siteOrigin: PAGES_SITE_ORIGIN,
      basePath: PAGES_BASE_PATH,
      items: [sample({ title: hostile, analysis: `规则 "说明" <script>alert(1)</script>` })],
    });

    expect(xml).toContain("Alpha &quot;quoted&quot; &lt;script&gt;alert(&apos;x&apos;)&lt;/script&gt;");
    expect(xml).toContain("&quot;notes&quot;");
    expect(xml).toContain("规则 &quot;说明&quot; &lt;script&gt;");
    expect(xml).not.toContain("<script>");
    expect(xml).not.toContain('"quoted"');
    expect(xml).not.toContain(`"notes"`);
  });

  it("emits an absolute https guid under the Pages base", () => {
    const target = resolveFeedTarget("https://example.com", "/ai-intel-site/");
    expect(target).toEqual({ siteOrigin: PAGES_SITE_ORIGIN, basePath: PAGES_BASE_PATH });
    const channel = siteBaseUrl(target.siteOrigin, target.basePath);
    expect(channel).toBe("https://wujiegrowth.github.io/ai-intel-site/");

    const published = getPublishedItems();
    const xml = renderRssFeed({
      title: "示界",
      description: "公开来源",
      siteOrigin: target.siteOrigin,
      basePath: target.basePath,
      items: [
        ...published,
        sample({ id: "hidden-demo-row", demo: true }),
        sample({ id: "hidden-retracted-row", status: "retracted" }),
        sample({
          id: "hidden-unconfirmed-row",
          publication: { confirmed: false, note: "尚未允许" },
        }),
      ],
    });

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0">')).toBe(true);
    expect(xml.match(/<item>/g)?.length).toBe(published.length);
    for (const item of published) {
      const guid = `${channel}items/${item.id}/`;
      expect(guid.startsWith("https://")).toBe(true);
      expect(guid).toContain("/ai-intel-site/");
      expect(xml).toContain(`<guid isPermaLink="true">${guid}</guid>`);
      expect(xml).toContain(`<link>${guid}</link>`);
    }
    expect(xml).not.toContain("hidden-demo-row");
    expect(xml).not.toContain("hidden-retracted-row");
    expect(xml).not.toContain("hidden-unconfirmed-row");
  });

  it("omits pubDate when certainty is unknown", () => {
    const unknown = sample({
      id: "arxiv-cs-unknown-date",
      sourcePublishedAt: {
        raw: null,
        year: null,
        month: null,
        day: null,
        time: null,
        timezone: null,
        certainty: "unknown",
      },
    });
    const dated = sample({
      id: "arxiv-cs-complete-date",
      sourcePublishedAt: {
        raw: "2026-11-19T18:54:19Z",
        year: 2026,
        month: 11,
        day: 19,
        time: "18:54",
        timezone: "Z",
        certainty: "complete",
      },
    });
    const xml = renderRssFeed({
      title: "示界",
      description: "公开来源",
      siteOrigin: PAGES_SITE_ORIGIN,
      basePath: PAGES_BASE_PATH,
      items: [unknown, dated],
    });

    const unknownItem = itemBlock(xml, unknown.id);
    const datedItem = itemBlock(xml, dated.id);
    expect(unknownItem).toContain(`/ai-intel-site/items/${unknown.id}/`);
    expect(unknownItem).not.toContain("<pubDate>");
    expect(unknownItem).not.toContain(unknown.updatedAt);
    expect(datedItem).toContain("<pubDate>Thu, 19 Nov 2026 18:54:00 GMT</pubDate>");
  });

  it("keeps the subscribe link and does not force the demo banner", () => {
    const layout = readFileSync(join(root, "src/layouts/BaseLayout.astro"), "utf8");
    const banner = readFileSync(join(root, "src/components/chrome/DemoBanner.astro"), "utf8");
    const endpoint = readFileSync(join(root, "src/pages/rss.xml.ts"), "utf8");
    expect(layout).toContain('withBase("rss.xml")');
    expect(layout).toContain("订阅 RSS");
    expect(layout).toContain('rel="alternate"');
    expect(layout).toContain('type="application/rss+xml"');
    expect(layout).toContain("site.demo");
    expect(layout).toContain("生财AI情报未接入");
    expect(layout).not.toContain("演示数据 · 非实时情报 · 不预测收入");
    expect(layout).not.toContain("set:html");
    expect(banner).toContain("演示数据 · 非实时情报 · 不预测收入");
    expect(endpoint).toContain("buildRssXml");
    expect(endpoint).toContain("escapeXml");
    expect(endpoint).toContain("siteBaseUrl");
    expect(endpoint).toContain("visibleOnSite");
    expect(endpoint).not.toContain("set:html");
    expect(endpoint).not.toContain("pubDate");
  });
});

function itemBlock(xml: string, id: string): string {
  const block = xml.split("<item>").find((part) => part.includes(`/items/${id}/`));
  if (!block) throw new Error(`missing item ${id}`);
  return block;
}

function sample(patch: Partial<PublicItem> = {}): PublicItem {
  const sourcePublishedAt: SourcePublishedAt = patch.sourcePublishedAt ?? {
    raw: null,
    year: null,
    month: null,
    day: null,
    time: null,
    timezone: null,
    certainty: "unknown",
  };
  return {
    id: "arxiv-cs-sample",
    title: "公开预印本",
    topics: ["预印本"],
    priority: "P2",
    facts: ["标题：安全"],
    inferences: ["不能判断买方。"],
    analysis: "规则说明",
    sourceName: "arXiv",
    sourceUrl: "https://arxiv.org/abs/1",
    sourcePublishedAt,
    updatedAt: "2026-11-22T00:00:00Z",
    coverage: {
      completeness: "partial",
      examinedCount: 1,
      completeCount: 1,
      warnings: ["只核过一条。"],
    },
    status: "published",
    demo: false,
    publication: { confirmed: true, note: "允许名单" },
    ...patch,
  };
}
