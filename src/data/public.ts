import { LATEST_FEED_LIMIT, visibleOnSite, type PublicItem, type SiteMeta, parsePublicItem, parseSiteMeta } from "../contract/index";
import itemsJson from "./published/items.json";
import siteJson from "./published/site.json";

let cache: PublicItem[] | null = null;

export function loadPublishedItems(): PublicItem[] {
  if (cache) return cache;
  if (!Array.isArray(itemsJson)) throw new Error("published items must be an array");
  const items: PublicItem[] = [];
  itemsJson.forEach((entry, index) => {
    const parsed = parsePublicItem(entry);
    if (!parsed.ok) throw new Error(`published[${index}]:${parsed.errors.join(",")}`);
    items.push(parsed.value);
  });
  cache = items;
  return cache;
}

export function getSiteMeta(): SiteMeta {
  const parsed = parseSiteMeta(siteJson);
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  if (parsed.value.latestLimit !== LATEST_FEED_LIMIT) {
    throw new Error("site latestLimit drifted from LATEST_FEED_LIMIT");
  }
  return parsed.value;
}

export function getPublishedItems(): PublicItem[] {
  return loadPublishedItems()
    .filter((item) => visibleOnSite(item))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.id.localeCompare(right.id));
}

export function getLatestItems(): PublicItem[] {
  return getPublishedItems().slice(0, LATEST_FEED_LIMIT);
}

export function getItemById(id: string): PublicItem | undefined {
  return getPublishedItems().find((item) => item.id === id);
}
