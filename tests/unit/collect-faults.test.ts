import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { merge, retainHistoryIds } from "../../src/collect/run";
import { signalToItem, stableId, type RawSignal } from "../../src/collect/map";
import { parseArxiv, parseRss } from "../../src/collect/parse";
import { PUBLIC_FEED_CAP } from "../../src/contract/limits";
import type { PublicItem } from "../../src/contract/types";
import { SOURCE_REGISTRY } from "../../src/data/sources/registry";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const nist = SOURCE_REGISTRY.find((source) => source.id === "nist-it");
const arxiv = SOURCE_REGISTRY.find((source) => source.id === "arxiv-cs");

function signal(externalId: string, url: string, title = `Public title ${externalId}`): RawSignal {
  return {
    externalId,
    title,
    url,
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
  };
}

function collected(sourceId: "arxiv-cs" | "nist-it", externalId: string, fetchedAt: string, url?: string): PublicItem {
  const source = sourceId === "arxiv-cs" ? arxiv : nist;
  if (!source) throw new Error(`missing ${sourceId}`);
  const item = signalToItem(
    source,
    signal(externalId, url ?? `https://arxiv.org/abs/${externalId}`),
    fetchedAt,
  );
  if (!item) throw new Error(`rejected ${externalId}`);
  return item;
}

describe("collector faults", () => {
  it("keeps membership feeds disabled", () => {
    for (const id of ["scys-private", "github-pytorch-atom"]) {
      expect(SOURCE_REGISTRY.find((source) => source.id === id)?.enabled).toBe(false);
    }
  });

  it("yields no items from malformed XML", () => {
    expect(parseRss("this is not xml")).toEqual([]);
    expect(parseRss("<rss><channel><item><title>Unclosed title")).toEqual([]);
    expect(parseRss("<item><title><script>alert(1)</script></title>")).toEqual([]);
    expect(parseArxiv("<<<not-xml>>>")).toEqual([]);
    expect(parseArxiv("<feed><entry><title>Missing close")).toEqual([]);
    expect(parseArxiv("")).toEqual([]);
  });

  it("collapses duplicate external ids to one stable id", () => {
    if (!nist) throw new Error("missing nist");
    const xml = `<rss><channel>
      <item><title>First public title</title><link>https://www.nist.gov/news/first</link><guid>duplicate-external-id</guid></item>
      <item><title>Second public title</title><link>https://www.nist.gov/news/second</link><guid>duplicate-external-id</guid></item>
    </channel></rss>`;
    const signals = parseRss(xml);
    expect(signals.map((entry) => entry.externalId)).toEqual(["duplicate-external-id", "duplicate-external-id"]);
    const fetchedAt = "2026-11-22T00:00:00Z";
    const items = signals.map((entry) => signalToItem(nist, entry, fetchedAt));
    expect(items.every((item) => item?.id === stableId("nist-it", "duplicate-external-id"))).toBe(true);
    const first = items[0];
    const second = items[1];
    if (!first || !second) throw new Error("expected mapped items");
    const merged = merge([first], [second]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe(stableId("nist-it", "duplicate-external-id"));
    expect(stableId("nist-it", "duplicate-external-id")).toBe(first.id);
    expect(merged[0]?.title).toBe("Second public title");
    expect(merged[0]?.priority).toBe("P2");
  });

  it("keeps previous items when a source fails", () => {
    const failed = collected("nist-it", "kept-node", "2026-11-20T00:00:00Z", "https://www.nist.gov/news/kept-node");
    const previousOther = collected("arxiv-cs", "2611.10001v1", "2026-11-21T00:00:00Z");
    const freshOther = collected("arxiv-cs", "2611.10002v1", "2026-11-22T00:00:00Z");
    const merged = merge([failed, previousOther], [freshOther]);
    expect(merged).toContain(failed);
    expect(merged.map((item) => item.id)).toContain(previousOther.id);
    expect(merged.map((item) => item.id)).toContain(freshOther.id);
    expect(merge([failed], [])).toEqual([failed]);
  });

  it("drops javascript and http URLs", () => {
    if (!nist) throw new Error("missing nist");
    const xml = `<rss><channel>
      <item><title>Javascript scheme title</title><link>javascript:alert(1)</link><guid>js-1</guid></item>
      <item><title>Insecure http title</title><link>http://www.nist.gov/news/plain</link><guid>http-1</guid></item>
      <item><title>Secure https title</title><link>https://www.nist.gov/news/secure</link><guid>https-1</guid></item>
    </channel></rss>`;
    const signals = parseRss(xml);
    expect(signals.map((entry) => entry.url)).toEqual(["https://www.nist.gov/news/secure"]);
    expect(signals.some((entry) => entry.url.startsWith("javascript:") || entry.url.startsWith("http://"))).toBe(false);
    const fetchedAt = "2026-11-22T00:00:00Z";
    expect(signalToItem(nist, signal("js-2", "javascript:alert(1)", "Javascript scheme title"), fetchedAt)).toBeNull();
    expect(signalToItem(nist, signal("http-2", "http://www.nist.gov/news/plain", "Insecure http title"), fetchedAt)).toBeNull();
    expect(signalToItem(nist, signal("https-2", "https://www.nist.gov/news/secure", "Secure https title"), fetchedAt)?.sourceUrl).toBe(
      "https://www.nist.gov/news/secure",
    );
  });

  it("sanitizes a title that contains a script tag", () => {
    if (!nist) throw new Error("missing nist");
    const xml = `<rss><channel><item>
      <title><script>alert(1)</script> Public NIST title</title>
      <link>https://www.nist.gov/news/safe</link>
      <guid>safe-title</guid>
    </item></channel></rss>`;
    const [parsed] = parseRss(xml);
    expect(parsed?.title).toBe("alert(1) Public NIST title");
    expect(parsed?.title).not.toContain("<script>");
    const item = signalToItem(nist, parsed ?? signal("safe-title", "https://www.nist.gov/news/safe"), "2026-11-22T00:00:00Z");
    expect(item?.title).toBe("alert(1) Public NIST title");
    expect(JSON.stringify(item)).not.toContain("<script>");
    expect(item?.priority).toBe("P2");
  });

  it("does not copy an abstract into the published item", () => {
    if (!arxiv) throw new Error("missing arxiv");
    const xml = `<feed><entry>
      <id>https://arxiv.org/abs/2611.19999v1</id>
      <title>A public preprint title</title>
      <published>2026-11-19T18:59:34Z</published>
      <summary>This abstract must stay out of the public item.</summary>
      <author><name>Ada</name></author>
      <category term="cs.CL"/>
    </entry></feed>`;
    const [parsed] = parseArxiv(xml);
    expect(parsed?.title).toBe("A public preprint title");
    const item = parsed ? signalToItem(arxiv, parsed, "2026-11-22T00:00:00Z") : null;
    expect(JSON.stringify(item)).not.toContain("This abstract must stay out of the public item");
    expect(item?.priority).toBe("P2");
    expect(item?.facts).toEqual([
      "标题：A public preprint title",
      "作者：Ada",
      "来源页：https://arxiv.org/abs/2611.19999v1",
    ]);
  });

  it("retains ids that fall outside the live cap", () => {
    const items = Array.from({ length: PUBLIC_FEED_CAP + 1 }, (_, index) => {
      const fetchedAt = new Date(Date.UTC(2026, 10, 22, 0, 0, index)).toISOString().replace(/\.000Z$/, "Z");
      return collected("arxiv-cs", `cap${index}`, fetchedAt);
    });
    const full = merge(items, []);
    const capped = full.slice(0, PUBLIC_FEED_CAP);
    const dropped = full.map((item) => item.id).filter((id) => !capped.some((item) => item.id === id));
    expect(capped).toHaveLength(PUBLIC_FEED_CAP);
    expect(dropped).toEqual([collected("arxiv-cs", "cap0", "2026-11-22T00:00:00Z").id]);
    const history = retainHistoryIds(["legacy-overflow-id"], full.map((item) => item.id));
    expect(history[0]).toBe("legacy-overflow-id");
    for (const id of dropped) expect(history).toContain(id);
    for (const item of capped) expect(history).toContain(item.id);
    expect(new Set(history).size).toBe(history.length);
  });

  it("stores every live id in the history ledger", () => {
    const items = JSON.parse(readFileSync(join(root, "src/data/published/items.json"), "utf8")) as { id: string }[];
    const history = JSON.parse(readFileSync(join(root, "src/data/published/history.json"), "utf8")) as { ids: unknown };
    expect(Array.isArray(history.ids)).toBe(true);
    if (!Array.isArray(history.ids)) return;
    expect(new Set(history.ids).size).toBe(history.ids.length);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(history.ids).toContain(item.id);
  });
});
