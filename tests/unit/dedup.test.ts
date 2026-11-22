import { describe, expect, it } from "vitest";
import { dedupePublicItems } from "../../src/data/dedup";
import { prepareFixtureItems } from "../../src/data/prepare";
import items from "../../src/data/fixtures/public-items.json";

function withUrl(id: string, sourceUrl: string): Record<string, unknown> {
  const copy = structuredClone(items[0]) as Record<string, unknown>;
  copy.id = id;
  copy.sourceUrl = sourceUrl;
  return copy;
}

describe("dedupePublicItems", () => {
  it("returns the same items when ids and urls are unique", () => {
    const records = [
      { id: "demo-keep-a", sourceUrl: "https://example.com/demo/a" },
      { id: "demo-keep-b", sourceUrl: "https://example.com/demo/b" },
    ];
    const result = dedupePublicItems(records);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(records);
  });

  it("reports duplicate-id", () => {
    const result = dedupePublicItems([
      { id: "demo-same-id", sourceUrl: "https://example.com/demo/a" },
      { id: "demo-same-id", sourceUrl: "https://example.com/demo/b" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("duplicate-id:demo-same-id");
  });

  it("treats host case and a trailing slash as duplicate-url", () => {
    const direct = dedupePublicItems([
      { id: "demo-url-left", sourceUrl: "https://EXAMPLE.com/demo/a/" },
      { id: "demo-url-right", sourceUrl: "https://example.com/demo/a" },
    ]);
    expect(direct.ok).toBe(false);
    if (!direct.ok) {
      expect(direct.errors).toEqual(["duplicate-url:https://example.com/demo/a"]);
    }

    const prepared = prepareFixtureItems([
      withUrl("demo-url-left", "https://EXAMPLE.com/demo/a/"),
      withUrl("demo-url-right", "https://example.com/demo/a"),
    ]);
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.errors).toContain("duplicate-url:https://example.com/demo/a");
    expect(prepared.errors.some((error) => error.startsWith("fixture["))).toBe(false);
  });
});
