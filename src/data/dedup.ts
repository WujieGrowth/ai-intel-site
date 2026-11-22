import { duplicateErrors, fail, ok, type Result } from "../contract/index";

/**
 * Rejects repeated ids and canonical source URLs.
 * On success the same array is returned.
 */
export function dedupePublicItems<T extends { id: string; sourceUrl: string }>(
  items: readonly T[],
): Result<readonly T[]> {
  const errors = duplicateErrors(items);
  if (errors.length > 0) return fail(...errors);
  return ok(items);
}
