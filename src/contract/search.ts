import type { PublicItem } from "./types";

export function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}

export function itemSearchText(item: Pick<PublicItem, "title" | "topics" | "sourceName" | "facts" | "analysis">): string {
  return normalizeSearchText([item.title, item.sourceName, ...item.topics, ...item.facts, item.analysis].join("\n"));
}

/** Every whitespace-separated query piece must occur. Empty query matches everything. */
export function matchesQuery(item: Pick<PublicItem, "title" | "topics" | "sourceName" | "facts" | "analysis">, query: string): boolean {
  const normalized = normalizeSearchText(query);
  if (!normalized) return true;
  const haystack = itemSearchText(item);
  return normalized.split(" ").every((part) => part.length > 0 && haystack.includes(part));
}
