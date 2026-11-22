import { canonicalizeHttpUrl, deepTrim, isPlainObject } from "../contract/index";

/**
 * Trims public fixture input and canonicalizes http(s) source URLs.
 * Drops empty and repeated topics. Does not invent date parts or remove keys.
 */
export function normalizePublicRaw(value: unknown): unknown {
  const trimmed = deepTrim(value);
  if (!isPlainObject(trimmed)) return trimmed;

  if (typeof trimmed.sourceUrl === "string") {
    trimmed.sourceUrl = canonicalizeHttpUrl(trimmed.sourceUrl);
  }
  if (isStringArray(trimmed.topics)) {
    trimmed.topics = uniqueNonEmptyTopics(trimmed.topics);
  }
  return trimmed;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function uniqueNonEmptyTopics(topics: readonly string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const topic of topics) {
    if (topic.length === 0 || seen.has(topic)) continue;
    seen.add(topic);
    next.push(topic);
  }
  return next;
}
