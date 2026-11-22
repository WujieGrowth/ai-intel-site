import type { PublicItem, SourcePublishedAt } from "../contract/types";

/** Skip only when the source time is still ahead after this grace period. */
export const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export interface QuarantineRecord {
  id: string;
  sourceUrl: string;
  raw: string | null;
  certainty: SourcePublishedAt["certainty"];
}

/**
 * A complete timestamp uses its own instant.
 * A date with no clock is future only when that calendar day has not started in any zone.
 * Unknown and year-missing dates are kept as unknown.
 */
export function isUnambiguouslyFuture(
  date: SourcePublishedAt,
  nowMs: number,
  toleranceMs = FUTURE_TOLERANCE_MS,
): boolean {
  const instant = placedInstant(date);
  if (instant === null) return false;
  return instant > nowMs + toleranceMs;
}

export function splitFutureItems(
  items: readonly PublicItem[],
  nowMs: number,
): { keep: PublicItem[]; quarantined: QuarantineRecord[] } {
  const keep: PublicItem[] = [];
  const quarantined: QuarantineRecord[] = [];
  for (const item of items) {
    if (!isUnambiguouslyFuture(item.sourcePublishedAt, nowMs)) {
      keep.push(item);
      continue;
    }
    quarantined.push({
      id: item.id,
      sourceUrl: item.sourceUrl,
      raw: item.sourcePublishedAt.raw,
      certainty: item.sourcePublishedAt.certainty,
    });
  }
  return { keep, quarantined };
}

function placedInstant(date: SourcePublishedAt): number | null {
  if (date.year === null || date.month === null || date.day === null) return null;
  if (date.certainty === "unknown" || date.certainty === "year-missing") return null;
  if (date.certainty === "complete") {
    if (date.time === null || date.timezone === null) return null;
    const zone = date.timezone === "UTC" ? "Z" : date.timezone;
    const parsed = Date.parse(`${date.year}-${pad(date.month)}-${pad(date.day)}T${date.time}:00${zone}`);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (date.certainty === "date-only" || date.certainty === "time-unknown") {
    return Date.UTC(date.year, date.month - 1, date.day) - 14 * 60 * 60 * 1000;
  }
  return null;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
