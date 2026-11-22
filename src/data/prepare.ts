import { fail, ok, parsePublicItem, type PublicItem, type Result } from "../contract/index";
import { dedupePublicItems } from "./dedup";
import { normalizePublicRaw } from "./normalize";

/**
 * Validates the public fixture array.
 * Normalizes each record, parses it, then rejects duplicate ids and urls.
 * Error prefixes: `fixtures-not-array`, `fixture[n]:`, `duplicate-id:`, `duplicate-url:`.
 */
export function prepareFixtureItems(raw: unknown): Result<PublicItem[]> {
  if (!Array.isArray(raw)) return fail("fixtures-not-array");
  const items: PublicItem[] = [];
  const errors: string[] = [];
  raw.forEach((entry, index) => {
    const parsed = parsePublicItem(normalizePublicRaw(entry));
    if (!parsed.ok) {
      parsed.errors.forEach((error) => errors.push(`fixture[${index}]:${error}`));
      return;
    }
    items.push(parsed.value);
  });
  const deduped = dedupePublicItems(items);
  if (!deduped.ok) errors.push(...deduped.errors);
  if (errors.length > 0) return fail(...errors);
  return ok(items);
}
