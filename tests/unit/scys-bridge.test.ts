import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../../cli/index";
import { readRawFeed } from "../../src/bridge/raw-feed";
import { acceptVerified, isReviewedArtifactPath, publicOriginId } from "../../src/bridge/verified";
import { buildRssXml } from "../../src/contract/rss";
import { signalToItem } from "../../src/collect/map";
import { SOURCE_REGISTRY } from "../../src/data/sources/registry";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const MEMBER_TITLE = "合成会员标题甲乙丙丁";
const MEMBER_SUMMARY = "合成会员摘要只留在私人侧";
const CANDIDATE_ID = 424242;
const X_URL = "https://x.com/Example/status/1000000000000000001";
const ACCEPTED_AT = "2026-11-22T11:20:00Z";
const roots: string[] = [];

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("raw connector adapter", () => {
  it("keeps the bridge off the scheduled collector", () => {
    const bridge = SOURCE_REGISTRY.find((source) => source.id === "scys-private");
    expect(bridge?.channel).toBe("private-bridge");
    expect(bridge?.scheduled).toBe(false);
    expect(bridge?.feedUrl).toBeNull();
    expect(bridge).toBeTruthy();
    expect(signalToItem(bridge!, blankSignal(), ACCEPTED_AT)).toBeNull();
  });

  it("drops editorial text and does not invent a year for MM-DD HH:mm", () => {
    const decision = readRawFeed(rawFeed());
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.publishable).toBe(0);
    expect(decision.value.scheduled).toBe(false);
    const record = decision.value.records[0];
    expect(record?.candidateId).toBe(CANDIDATE_ID);
    expect(record?.publishedAtRaw).toBe("11-20 16:57");
    expect(record?.year).toBeNull();
    expect(record?.month).toBeNull();
    expect(record?.day).toBeNull();
    expect(record?.time).toBeNull();
    expect(record?.evidenceUrl).toBe(X_URL);
    const packed = JSON.stringify(decision.value.records);
    expect(packed).not.toContain(MEMBER_TITLE);
    expect(packed).not.toContain(MEMBER_SUMMARY);
    expect(packed).not.toContain("2026");

    const dated = readRawFeed(rawFeed({ publishedAt: "2026-11-20T16:57:13Z" }));
    expect(dated.ok).toBe(true);
    if (!dated.ok) return;
    expect(dated.value.records[0]?.publishedAtRaw).toBeNull();
    expect(dated.value.records[0]?.reasons).toContain("feed-date-unusable");
    expect(JSON.stringify(dated.value.records)).not.toContain("2026");
  });

  it("refuses a non-allowlisted url and writes only the private dedup file", () => {
    const off = readRawFeed(rawFeed({ sourceUrl: "https://example.org/post/1" }));
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    expect(off.value.records[0]?.evidenceUrl).toBeNull();
    expect(off.value.refusalReasons).toContain("evidence-url-refused");

    const dir = mkdtempSync(path.join(tmpdir(), "shijie-raw-"));
    roots.push(dir);
    const input = path.join(dir, "raw.json");
    const privateOut = path.join(dir, "dedup.json");
    writeFileSync(input, rawFeed());
    const result = run(["import-raw", "--input", input, "--private-out", privateOut, "--write"]);
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain(MEMBER_TITLE);
    expect(result.stdout).not.toContain(MEMBER_SUMMARY);
    expect(result.stdout).not.toContain(String(CANDIDATE_ID));
    expect(result.stdout).toContain('"publishable": 0');
    const stored = readFileSync(privateOut, "utf8");
    expect(stored).toContain(String(CANDIDATE_ID));
    expect(stored).not.toContain(MEMBER_TITLE);
    expect(stored).not.toContain(MEMBER_SUMMARY);
  });
});

describe("verified public artifact", () => {
  it("accepts the reviewed file and omits pubDate when the source date is date-only", () => {
    expect(isReviewedArtifactPath("inbound/verified/2026-11-22.json")).toBe(true);
    expect(isReviewedArtifactPath("../src/data/published/items.json")).toBe(false);
    const text = readFileSync(path.join(root, "inbound/verified/2026-11-22.json"), "utf8");
    expect(text).not.toContain("candidateId");
    expect(text).not.toContain("reviewStatus");
    expect(text).not.toContain("dateSource");
    expect(text).not.toContain(MEMBER_SUMMARY);
    const decision = acceptVerified(text, ACCEPTED_AT);
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.refusals).toEqual([]);
    expect(decision.value.items).toHaveLength(2);
    const [post, blog] = decision.value.items;
    expect(post?.priority).toBe("P2");
    expect(post?.demo).toBe(false);
    expect(post?.sourceName).toBe("Anthropic");
    expect(post?.id).toBe(publicOriginId(post?.sourceUrl ?? ""));
    expect(post?.sourcePublishedAt.certainty).toBe("complete");
    expect(post?.analysis).toContain("不是官方授权转载");
    expect(post?.analysis).toContain("没有调用生财接口");
    expect(post?.inferences.join(" ")).toContain("没有观看视频");
    expect(JSON.stringify(post)).not.toContain("讲述公司经历");
    expect(blog?.sourcePublishedAt.certainty).toBe("date-only");
    expect(blog?.sourcePublishedAt.time).toBeNull();
    expect(blog?.sourcePublishedAt.timezone).toBeNull();
    expect(blog?.sourceName).toBe("Google");

    const xml = buildRssXml({
      title: "示界",
      description: "公开来源",
      siteOrigin: "https://wujiegrowth.github.io",
      basePath: "/ai-intel-site/",
      selfPath: "/ai-intel-site/rss.xml",
      items: decision.value.items,
    });
    expect(xml).toContain("<pubDate>Fri, 20 Nov 2026 16:57:00 GMT</pubDate>");
    const blogBlock = xml.split("<item>").find((part) => part.includes(blog?.id ?? "missing"));
    expect(blogBlock).toBeTruthy();
    expect(blogBlock).not.toContain("<pubDate>");
  });

  it("fails closed when a connector field is mixed into the public file", () => {
    const mixed = JSON.parse(readFileSync(path.join(root, "inbound/verified/2026-11-22.json"), "utf8")) as {
      items: Array<Record<string, unknown>>;
    };
    mixed.items[0] = { ...mixed.items[0], summary: MEMBER_SUMMARY, candidateId: CANDIDATE_ID };
    const decision = acceptVerified(JSON.stringify(mixed), ACCEPTED_AT);
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.errors.join("\n")).toContain("private-field");
    expect(decision.errors.join("\n")).not.toContain(MEMBER_SUMMARY);
    expect(decision.errors.join("\n")).not.toContain(String(CANDIDATE_ID));
  });
});

function blankSignal() {
  return {
    externalId: "should-not-publish",
    title: MEMBER_TITLE,
    url: X_URL,
    authors: [],
    categories: [],
    publishedAt: {
      raw: null,
      year: null,
      month: null,
      day: null,
      time: null,
      timezone: null,
      certainty: "unknown" as const,
    },
  };
}

function rawFeed(patch?: { sourceUrl?: string; publishedAt?: string }): string {
  const item = {
    candidateId: CANDIDATE_ID,
    title: MEMBER_TITLE,
    summary: MEMBER_SUMMARY,
    detail: "合成会员正文不会公开",
    opportunity: "合成机会描述",
    signals: ["合成信号"],
    sourceName: "合成来源名",
    sourceUrl: patch?.sourceUrl ?? X_URL,
    publishedAt: patch?.publishedAt ?? "11-20 16:57",
    tag: "合成标签",
  };
  return JSON.stringify({ count: 1, items: [item] });
}
