import { describe, expect, it } from "vitest";
import { LATEST_FEED_LIMIT, PAGINATION_AVAILABLE } from "../../src/contract/index";
import { getLatestItems, getPublishedItems } from "../../src/data/public";

describe("integration loader", () => {
  it("keeps the small latest limit and excludes retracted demo rows", () => {
    expect(PAGINATION_AVAILABLE).toBe(false);
    expect(LATEST_FEED_LIMIT).toBe(4);
    expect(getLatestItems().length).toBeLessThanOrEqual(4);
    expect(getPublishedItems().every((item) => item.status === "published" && item.demo === false)).toBe(true);
  });
});
