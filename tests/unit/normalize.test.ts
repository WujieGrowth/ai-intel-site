import { describe, expect, it } from "vitest";
import { parsePublicItem } from "../../src/contract/index";
import { getPublishedItems } from "../../src/data/public";
import { normalizePublicRaw } from "../../src/data/normalize";
import { prepareFixtureItems } from "../../src/data/prepare";
import items from "../../src/data/fixtures/public-items.json";

function cloneItem(id: string): Record<string, unknown> {
  const source = items.find((item) => item.id === id) ?? items[0];
  return structuredClone(source) as Record<string, unknown>;
}

describe("normalizePublicRaw", () => {
  it("trims a title so the fixture becomes valid", () => {
    const raw = cloneItem("demo-p0-batch-api");
    const title = raw.title;
    expect(typeof title).toBe("string");
    raw.title = `  ${title}  `;
    expect(parsePublicItem(raw).ok).toBe(false);

    const normalized = normalizePublicRaw(raw) as { title: string };
    expect(normalized.title).toBe(title);

    const prepared = prepareFixtureItems([raw]);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value[0]?.title).toBe(title);
  });

  it("drops empty and duplicate topics while keeping the first order", () => {
    const raw = cloneItem("demo-p0-batch-api");
    raw.topics = ["  推理接口  ", "", "推理接口", "采购信号", "  采购信号  "];
    const normalized = normalizePublicRaw(raw) as { topics: string[] };
    expect(normalized.topics).toEqual(["推理接口", "采购信号"]);
    expect(prepareFixtureItems([raw]).ok).toBe(true);
  });

  it("keeps a nested unknown key so the parser still rejects it", () => {
    const raw = cloneItem("demo-p0-batch-api");
    (raw.coverage as Record<string, unknown>).secretNote = "no";
    const normalized = normalizePublicRaw(raw) as { coverage: { secretNote?: string } };
    expect(normalized.coverage.secretNote).toBe("no");

    const prepared = prepareFixtureItems([raw]);
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.errors).toContain("fixture[0]:unknown-key:$.coverage.secretNote");
  });

  it("still rejects a javascript source URL", () => {
    const raw = cloneItem("demo-p0-batch-api");
    raw.sourceUrl = "javascript:alert(1)";
    const normalized = normalizePublicRaw(raw) as { sourceUrl: string };
    expect(normalized.sourceUrl).toBe("javascript:alert(1)");

    const prepared = prepareFixtureItems([raw]);
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.errors).toContain("fixture[0]:bad-url:$.sourceUrl");
  });

  it("leaves a null year null and does not invent time or timezone", () => {
    const raw = cloneItem("demo-p2-forum-note");
    const date = raw.sourcePublishedAt as {
      year: number | null;
      month: number | null;
      day: number | null;
      time: string | null;
      timezone: string | null;
    };
    expect(date.year).toBeNull();

    const normalized = normalizePublicRaw(raw) as { sourcePublishedAt: typeof date };
    expect(normalized.sourcePublishedAt).toEqual(date);
    expect(normalized.sourcePublishedAt.year).toBeNull();
    expect(normalized.sourcePublishedAt.month).toBe(3);
    expect(normalized.sourcePublishedAt.day).toBe(18);
    expect(normalized.sourcePublishedAt.time).toBeNull();
    expect(normalized.sourcePublishedAt.timezone).toBeNull();

    const prepared = prepareFixtureItems([raw]);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value[0]?.sourcePublishedAt.year).toBeNull();
    expect(prepared.value[0]?.sourcePublishedAt.time).toBeNull();
    expect(prepared.value[0]?.sourcePublishedAt.timezone).toBeNull();
  });

  it("does not add https:// when canonicalizing a non-url", () => {
    const phrase = normalizePublicRaw({ sourceUrl: "not a url" }) as { sourceUrl: string };
    expect(phrase.sourceUrl).toBe("not a url");
    expect(phrase.sourceUrl.startsWith("https://")).toBe(false);

    const host = normalizePublicRaw({ sourceUrl: "example.com/demo/a" }) as { sourceUrl: string };
    expect(host.sourceUrl).toBe("example.com/demo/a");
    expect(host.sourceUrl.startsWith("https://")).toBe(false);

    const raw = cloneItem("demo-p0-batch-api");
    raw.sourceUrl = "not a url";
    const prepared = prepareFixtureItems([raw]);
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.errors).toContain("fixture[0]:bad-url:$.sourceUrl");
  });

  it("rejects a non-array fixture list", () => {
    const prepared = prepareFixtureItems({ id: "demo-not-array" });
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.errors).toEqual(["fixtures-not-array"]);
  });

  it("keeps committed published fixtures in updatedAt order", () => {
    const items = getPublishedItems();
    expect(items.length).toBeGreaterThan(0);
    const ordered = [...items].sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.id.localeCompare(right.id),
    );
    expect(items.map((item) => item.id)).toEqual(ordered.map((item) => item.id));
    expect(items.every((item) => item.demo === false)).toBe(true);
  });
});
