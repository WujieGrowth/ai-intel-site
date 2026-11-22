import { describe, expect, it } from "vitest";
import { FUTURE_TOLERANCE_MS, isUnambiguouslyFuture, splitFutureItems } from "../../src/collect/future";
import { buildRssXml } from "../../src/contract/rss";
import type { PublicItem, SourcePublishedAt } from "../../src/contract/types";

const NOW = Date.parse("2026-11-22T12:00:00Z");

describe("future source dates", () => {
  it("quarantines a complete timestamp more than a day ahead and keeps the raw string", () => {
    const future = entry("nist-it-future-workshop", complete("Wed, 24 Feb 2027 00:00:00 -0500", 2027, 2, 24, "05:00"));
    const soon = entry("nist-it-within-day", complete("Sun, 22 Nov 2026 18:00:00 GMT", 2026, 11, 22, "18:00"));
    const past = entry("nist-it-past-note", complete("Thu, 19 Nov 2026 12:00:00 GMT", 2026, 11, 19, "12:00"));
    const { keep, quarantined } = splitFutureItems([future, soon, past], NOW);
    expect(keep.map((item) => item.id)).toEqual(["nist-it-within-day", "nist-it-past-note"]);
    expect(quarantined).toEqual([
      {
        id: "nist-it-future-workshop",
        sourceUrl: future.sourceUrl,
        raw: "Wed, 24 Feb 2027 00:00:00 -0500",
        certainty: "complete",
      },
    ]);
    expect(keep.every((item) => item.updatedAt === "2026-11-22T10:00:00Z")).toBe(true);
    expect(JSON.stringify(keep)).not.toContain("2027-02-24");
  });

  it("does not treat unknown or date-only values as a clock, and does not rewrite them", () => {
    const unknown = entry("arxiv-cs-unknown", {
      raw: "11-22 08:00",
      year: null,
      month: null,
      day: null,
      time: null,
      timezone: null,
      certainty: "unknown",
    });
    const dateOnly = entry("blog-date-only", {
      raw: "2026-11-23",
      year: 2026,
      month: 11,
      day: 23,
      time: null,
      timezone: null,
      certainty: "date-only",
    });
    const farDate = entry("blog-far-date", {
      raw: "2027-02-24",
      year: 2027,
      month: 2,
      day: 24,
      time: null,
      timezone: null,
      certainty: "date-only",
    });
    const yearMissing = entry("nist-it-year-missing", {
      raw: "02-24 00:00",
      year: null,
      month: 2,
      day: 24,
      time: null,
      timezone: null,
      certainty: "year-missing",
    });
    const before = JSON.stringify([unknown.sourcePublishedAt, dateOnly.sourcePublishedAt, yearMissing.sourcePublishedAt]);
    expect(isUnambiguouslyFuture(unknown.sourcePublishedAt, NOW)).toBe(false);
    expect(isUnambiguouslyFuture(dateOnly.sourcePublishedAt, NOW)).toBe(false);
    expect(isUnambiguouslyFuture(farDate.sourcePublishedAt, NOW)).toBe(true);
    expect(isUnambiguouslyFuture(yearMissing.sourcePublishedAt, NOW)).toBe(false);
    const { keep } = splitFutureItems([unknown, dateOnly, yearMissing, farDate], NOW);
    expect(keep.map((item) => item.id)).toEqual(["arxiv-cs-unknown", "blog-date-only", "nist-it-year-missing"]);
    expect(JSON.stringify(keep.map((item) => item.sourcePublishedAt))).toBe(before);
    expect(FUTURE_TOLERANCE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("omits a future NIST row from RSS and does not use that date as the newest pubDate", () => {
    const future = entry("nist-it-qmms", complete("Wed, 24 Feb 2027 00:00:00 -0500", 2027, 2, 24, "05:00"));
    const current = entry("nist-it-current", complete("Thu, 19 Nov 2026 12:00:00 GMT", 2026, 11, 19, "12:00"));
    const { keep } = splitFutureItems([future, current], NOW);
    const xml = buildRssXml({
      title: "示界",
      description: "公开来源",
      siteOrigin: "https://wujiegrowth.github.io",
      basePath: "/ai-intel-site/",
      selfPath: "/ai-intel-site/rss.xml",
      items: keep,
    });
    expect(xml).not.toContain("nist-it-qmms");
    expect(xml).not.toContain("2027");
    expect(xml).toContain("<pubDate>Thu, 19 Nov 2026 12:00:00 GMT</pubDate>");
    expect(xml.match(/<pubDate>/g)).toHaveLength(1);
  });
});

function complete(raw: string, year: number, month: number, day: number, time: string): SourcePublishedAt {
  return { raw, year, month, day, time, timezone: "Z", certainty: "complete" };
}

function entry(id: string, sourcePublishedAt: SourcePublishedAt): PublicItem {
  return {
    id,
    title: `Title ${id}`,
    topics: ["标准"],
    priority: "P2",
    facts: ["标题：示例"],
    inferences: ["不能判断买方。"],
    analysis: "只保留已经到来的来源时间。",
    sourceName: "NIST",
    sourceUrl: `https://www.nist.gov/news/${id}`,
    sourcePublishedAt,
    updatedAt: "2026-11-22T10:00:00Z",
    coverage: { completeness: "partial", examinedCount: 1, completeCount: 1, warnings: ["只核过一条。"] },
    status: "published",
    demo: false,
    publication: { confirmed: true, note: "测试条目" },
  };
}
