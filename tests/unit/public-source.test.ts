import { describe, expect, it } from "vitest";
import {
  buildRssXml,
  isAllowedFetchUrl,
  matchesQuery,
  sanitizeText,
} from "../../src/contract/index";
import { enabledSources, SOURCE_REGISTRY } from "../../src/data/sources/registry";
import { signalToItem } from "../../src/collect/map";
import type { PublicItem } from "../../src/contract/types";

const source = SOURCE_REGISTRY.find((item) => item.id === "arxiv-cs");

describe("public source gate", () => {
  it("keeps membership and uncertain feeds disabled", () => {
    expect(enabledSources().map((item) => item.id)).toEqual([
      "arxiv-cs",
      "nist-it",
      "openai-news",
      "deepmind-blog",
      "huggingface-blog",
      "claude-platform-notes",
      "mistral-news",
    ]);
    expect(enabledSources().every((item) => item.channel === "native-public" && item.scheduled === true)).toBe(true);
    const bridge = SOURCE_REGISTRY.find((item) => item.id === "scys-private");
    expect(bridge?.enabled).toBe(false);
    expect(bridge?.channel).toBe("private-bridge");
    expect(bridge?.scheduled).toBe(false);
    expect(bridge?.feedUrl).toBeNull();
    expect(bridge?.kind).toBe("private-file");
    expect(SOURCE_REGISTRY.find((item) => item.id === "openai-news")?.enabled).toBe(true);
    expect(SOURCE_REGISTRY.find((item) => item.id === "openai-news")?.maxItems).toBe(10);
    expect(SOURCE_REGISTRY.find((item) => item.id === "github-pytorch-atom")?.disabledReason).toContain("许可");
  });

  it("blocks private hosts, insecure schemes, and off-list redirects", () => {
    expect(isAllowedFetchUrl("https://export.arxiv.org/api/query", ["export.arxiv.org"])).toBe(true);
    expect(isAllowedFetchUrl("http://export.arxiv.org/api/query", ["export.arxiv.org"])).toBe(false);
    expect(isAllowedFetchUrl("https://user:pass@export.arxiv.org/api", ["export.arxiv.org"])).toBe(false);
    expect(isAllowedFetchUrl("https://127.0.0.1/api", ["127.0.0.1"])).toBe(false);
    expect(isAllowedFetchUrl("https://169.254.169.254/latest", ["169.254.169.254"])).toBe(false);
    expect(isAllowedFetchUrl("https://evil.example/api", ["export.arxiv.org"])).toBe(false);
  });

  it("strips markup and does not treat a title as buyer evidence", () => {
    expect(sanitizeText("<script>alert(1)</script> 标题")).toBe("alert(1) 标题");
    expect(source).toBeTruthy();
    const item = signalToItem(source!, {
      externalId: "2611.26624v1",
      title: "PlayCraft: a public preprint",
      url: "https://arxiv.org/abs/2611.26624v1",
      authors: ["Ada"],
      categories: ["cs.AI"],
      publishedAt: {
        raw: "2026-11-19T18:59:34Z",
        year: 2026,
        month: 11,
        day: 19,
        time: "18:59",
        timezone: "Z",
        certainty: "complete",
      },
    }, "2026-11-22T00:00:00Z");
    expect(item?.priority).toBe("P2");
    expect(item?.demo).toBe(false);
    expect(item?.analysis).toContain("没有做交叉核验");
    expect(item?.facts.join(" ")).not.toContain("<script>");
  });

  it("searches Chinese substrings and escapes RSS", () => {
    const item = {
      title: "公开预印本",
      topics: ["人工智能"],
      sourceName: "arXiv",
      facts: ["标题：模型"],
      analysis: "规则说明",
    };
    expect(matchesQuery(item, "预印")).toBe(true);
    expect(matchesQuery(item, "预印 不存在")).toBe(false);
    const xml = buildRssXml({
      title: "示界",
      description: "feed",
      siteOrigin: "https://wujiegrowth.github.io",
      basePath: "/ai-intel-site/",
      selfPath: "/ai-intel-site/rss.xml",
      items: [fullItem("<script>")],
    });
    expect(xml).toContain("https://wujiegrowth.github.io/ai-intel-site/items/arxiv-cs-1/");
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("&lt;script&gt;");
  });
});

function fullItem(title: string): PublicItem {
  return {
    id: "arxiv-cs-1",
    title,
    topics: ["预印本"],
    priority: "P2",
    facts: ["标题：安全"],
    inferences: ["不能判断买方。"],
    analysis: "规则说明",
    sourceName: "arXiv",
    sourceUrl: "https://arxiv.org/abs/1",
    sourcePublishedAt: {
      raw: null,
      year: null,
      month: null,
      day: null,
      time: null,
      timezone: null,
      certainty: "unknown",
    },
    updatedAt: "2026-11-22T00:00:00Z",
    coverage: { completeness: "partial", examinedCount: 1, completeCount: 1, warnings: ["只核过一条。"] },
    status: "published",
    demo: false,
    publication: { confirmed: true, note: "允许名单" },
  };
}
