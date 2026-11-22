import { describe, expect, it } from "vitest";
import { canonicalEvidenceUrl } from "../../src/collect/canonical";
import { looksLikeFeed, truncateToLastEntry } from "../../src/collect/fetch";
import { signalToItem } from "../../src/collect/map";
import { parseRss } from "../../src/collect/parse";
import { capPublished, dedupAgainst } from "../../src/collect/run";
import { huggingfacePost, openaiNewsKeep, selectSignals } from "../../src/collect/select";
import type { PublicItem } from "../../src/contract/types";
import { SOURCE_REGISTRY } from "../../src/data/sources/registry";

const openai = source("openai-news");
const deepmind = source("deepmind-blog");
const hugging = source("huggingface-blog");
const claude = source("claude-platform-notes");
const mistral = source("mistral-news");

describe("official feed adapters", () => {
  it("reads CDATA titles and skips OpenAI customer marketing", () => {
    const signals = parseRss(`<rss><channel>
      <item><title><![CDATA[A research note]]></title><link>https://openai.com/index/a-research-note</link><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate><guid>https://openai.com/index/a-research-note</guid><description>DO NOT COPY THIS OPENAI BLURB</description></item>
      <item><title>Customer story</title><link>https://openai.com/business/customer-stories/example</link><pubDate>Fri, 20 Nov 2026 00:00:00 GMT</pubDate></item>
      <item><title>Learn demo</title><link>https://openai.com/business/learn/demo</link><pubDate>Fri, 20 Nov 2026 00:00:00 GMT</pubDate></item>
      <item><title>Ad landing</title><link>https://openai.com/ads/customers/example</link><pubDate>Fri, 20 Nov 2026 00:00:00 GMT</pubDate></item>
    </channel></rss>`);
    const selected = selectSignals(openai, signals);
    expect(selected.map((item) => item.title)).toEqual(["A research note"]);
    const published = signalToItem(openai, selected[0]!, "2026-11-22T12:00:00Z");
    expect(JSON.stringify(published)).not.toContain("DO NOT COPY THIS OPENAI BLURB");
    expect(published?.priority).toBe("P2");
    expect(published?.sourcePublishedAt.certainty).toBe("complete");
    expect(openaiNewsKeep("https://openai.com/index/a-research-note")).toBe(true);
    expect(openaiNewsKeep("https://openai.com/business/customer-stories/example")).toBe(false);
  });

  it("does not invent a summary when the description is empty or present", () => {
    const signals = parseRss(`<rss><channel>
      <item><title>Empty description title</title><link>https://deepmind.google/blog/empty-description-title/</link><description/><pubDate>Wed, 18 Nov 2026 21:35:43 +0000</pubDate><guid>https://deepmind.google/blog/empty-description-title/</guid></item>
      <item><title>Has description title</title><link>https://deepmind.google/blog/has-description/</link><description>THIS DEEPMIND SENTENCE MUST NOT BE COPIED</description><pubDate>Wed, 18 Nov 2026 18:13:42 +0000</pubDate></item>
    </channel></rss>`);
    const selected = selectSignals(deepmind, signals);
    expect(selected).toHaveLength(2);
    expect(selected[0]?.publishedAt.time).toBe("21:35");
    expect(selected[0]?.publishedAt.timezone).toBe("Z");
    const packed = JSON.stringify(selected.map((item) => signalToItem(deepmind, item, "2026-11-22T12:00:00Z")));
    expect(packed).not.toContain("THIS DEEPMIND SENTENCE MUST NOT BE COPIED");
    expect(packed).toContain("Empty description title");
    expect(packed).toContain("不补写");
  });

  it("labels Hugging Face community posts from the URL and caps the window", () => {
    expect(huggingfacePost("https://huggingface.co/blog/official-slug")).toEqual({ kind: "official" });
    expect(huggingfacePost("https://huggingface.co/blog/SomeOrg/a-community-post")).toEqual({
      kind: "community",
      org: "SomeOrg",
    });
    const items = [
      `<item><title>Official post title</title><link>https://huggingface.co/blog/official-slug</link><pubDate>Fri, 20 Nov 2026 00:00:00 GMT</pubDate></item>`,
      `<item><title>Community post title</title><link>https://huggingface.co/blog/SomeOrg/a-community-post</link><description>COMMUNITY BODY STAYS OUT</description><pubDate>Fri, 20 Nov 2026 00:00:00 GMT</pubDate></item>`,
      ...Array.from({ length: 12 }, (_, index) => `<item><title>Extra official title ${index} xx</title><link>https://huggingface.co/blog/extra-official-${index}</link><pubDate>Thu, 19 Nov 2026 00:00:00 GMT</pubDate></item>`),
    ];
    const selected = selectSignals(hugging, parseRss(`<rss><channel>${items.join("")}</channel></rss>`));
    expect(selected).toHaveLength(10);
    expect(selected[1]?.sourceLabel).toBe("Hugging Face 社区");
    expect(selected[1]?.scopeNote).toContain("SomeOrg");
    const community = signalToItem(hugging, selected[1]!, "2026-11-22T12:00:00Z");
    expect(community?.sourceName).toBe("Hugging Face 社区");
    expect(JSON.stringify(community)).not.toContain("COMMUNITY BODY STAYS OUT");
  });

  it("keeps Claude release-note fragments and does not treat them as one URL", () => {
    const signals = parseRss(`<rss><channel>
      <item><title>Release note one</title><link>https://platform.claude.com/docs/en/release-notes/overview#note-one</link><description>NOTE BODY ONE STAYS PRIVATE</description><pubDate>Tue, 17 Nov 2026 00:00:00 GMT</pubDate></item>
      <item><title>Release note two</title><link>https://platform.claude.com/docs/en/release-notes/overview#note-two</link><pubDate>Mon, 16 Nov 2026 00:00:00 GMT</pubDate></item>
    </channel></rss>`);
    const selected = selectSignals(claude, signals);
    expect(selected.map((item) => item.url)).toEqual([
      "https://platform.claude.com/docs/en/release-notes/overview#note-one",
      "https://platform.claude.com/docs/en/release-notes/overview#note-two",
    ]);
    const item = signalToItem(claude, selected[0]!, "2026-11-22T12:00:00Z");
    expect(item?.analysis).toContain("不是 Anthropic 的全部新闻");
    expect(JSON.stringify(item)).not.toContain("NOTE BODY ONE STAYS PRIVATE");
  });

  it("truncates a large feed on the last complete item", () => {
    const partial = `<rss><channel><item><title>Kept title</title></item><item><title>Cut off`;
    expect(truncateToLastEntry(partial)).toBe("<rss><channel><item><title>Kept title</title></item>");
    expect(truncateToLastEntry("<html>no item")).toBeNull();
  });

  it("accepts Mistral XML even when the MIME type is text/plain", () => {
    const body = `<?xml version="1.0" encoding="UTF-8"?><rss><channel><item><title>Mistral title example</title><link>https://mistral.ai/news/example-model/</link><description>MISTRAL BODY STAYS OUT</description><pubDate>Thu, 05 Nov 2026 12:00:14 GMT</pubDate></item></channel></rss>`;
    expect(looksLikeFeed(body)).toBe(true);
    expect(looksLikeFeed("<html><body>not a feed</body></html>")).toBe(false);
    const [signal] = selectSignals(mistral, parseRss(body));
    const item = signal ? signalToItem(mistral, signal, "2026-11-22T12:00:00Z") : null;
    expect(item?.sourceUrl).toBe("https://mistral.ai/news/example-model");
    expect(JSON.stringify(item)).not.toContain("MISTRAL BODY STAYS OUT");
    expect(item?.title).not.toContain("<script>");
  });

  it("collapses tracking duplicates but keeps separate Google hosts", () => {
    const deep = item("deepmind-blog-one", "https://deepmind.google/blog/same-story/");
    const tracked = item("deepmind-blog-two", "https://deepmind.google/blog/same-story/?utm_source=newsletter");
    const otherOrg = item("origin-blog-google-same-story", "https://blog.google/innovation-and-ai/same-story/");
    const fresh = dedupAgainst([otherOrg], [deep, tracked]);
    expect(fresh.map((entry) => entry.id)).toEqual(["deepmind-blog-one"]);
    expect(canonicalEvidenceUrl(tracked.sourceUrl)).toBe(canonicalEvidenceUrl(deep.sourceUrl));
    expect(canonicalEvidenceUrl(otherOrg.sourceUrl)).not.toBe(canonicalEvidenceUrl(deep.sourceUrl));
  });

  it("keeps reviewed originals when the collector window is full", () => {
    const pinned = item("origin-kept-public", "https://blog.google/innovation-and-ai/pinned/", "2026-11-22T00:00:00Z");
    const newer = Array.from({ length: 3 }, (_, index) =>
      item(`arxiv-cs-new-${index}`, `https://arxiv.org/abs/9${index}`, `2026-11-22T12:0${index}:00Z`),
    );
    const capped = capPublished([pinned, ...newer], 3);
    expect(capped.map((entry) => entry.id)).toContain("origin-kept-public");
    expect(capped).toHaveLength(3);
  });
});

function source(id: string) {
  const found = SOURCE_REGISTRY.find((entry) => entry.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function item(id: string, sourceUrl: string, updatedAt = "2026-11-22T12:00:00Z"): PublicItem {
  return {
    id,
    title: `Title for ${id}`,
    topics: ["新闻"],
    priority: "P2",
    facts: ["标题：示例"],
    inferences: ["不能判断买方。"],
    analysis: "只保留标题和链接。",
    sourceName: "Example",
    sourceUrl,
    sourcePublishedAt: {
      raw: null,
      year: null,
      month: null,
      day: null,
      time: null,
      timezone: null,
      certainty: "unknown",
    },
    updatedAt,
    coverage: { completeness: "partial", examinedCount: 1, completeCount: 1, warnings: ["只核过一条。"] },
    status: "published",
    demo: false,
    publication: { confirmed: true, note: "测试条目" },
  };
}
