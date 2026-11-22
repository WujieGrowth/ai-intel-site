import {
  exactKeys,
  findForbiddenKeys,
  isPlainObject,
  parseJsonText,
  unsafeTextIssues,
  type Result,
  fail,
  ok,
} from "../contract/index";
import { evidenceHost } from "./evidence";

/** Observed connector output. limit is an input, not part of this body. */
export const RAW_ITEM_KEYS = [
  "candidateId",
  "title",
  "summary",
  "detail",
  "opportunity",
  "signals",
  "sourceName",
  "sourceUrl",
  "publishedAt",
  "tag",
] as const;

const FILE_KEYS = ["count", "items"] as const;
const MAX_ITEMS = 50;
const FEED_DATE = /^\d{2}-\d{2} \d{2}:\d{2}$/;

export interface PrivateDedupRecord {
  candidateId: number;
  evidenceUrl: string | null;
  publishedAtRaw: string | null;
  year: null;
  month: null;
  day: null;
  time: null;
  timezone: null;
  publishable: false;
  reasons: string[];
}

export interface RawFeedDecision {
  scheduled: false;
  endToEnd: false;
  publishable: 0;
  records: PrivateDedupRecord[];
  refusalReasons: string[];
}

/**
 * Separate the connector body from anything that can be published.
 * Editorial fields are checked, then dropped. The month-day clock is not given a year.
 */
export function readRawFeed(text: string): Result<RawFeedDecision> {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return parsed;
  const forbidden = findForbiddenKeys(parsed.value);
  if (forbidden.length > 0) return fail(...forbidden);
  const unsafe = unsafeTextIssues(parsed.value);
  if (unsafe.length > 0) return fail(...unsafe);
  if (!isPlainObject(parsed.value)) return fail("bad-type:$");
  const shape = exactKeys(parsed.value, FILE_KEYS, "$");
  if (shape.length > 0) return fail(...shape);
  if (!Number.isInteger(parsed.value.count)) return fail("bad-count");
  if (!Array.isArray(parsed.value.items)) return fail("bad-type:$.items");
  if (parsed.value.items.length !== parsed.value.count) return fail("count-mismatch");
  if (parsed.value.items.length > MAX_ITEMS) return fail("too-many-items");

  const records: PrivateDedupRecord[] = [];
  const refusalReasons: string[] = [];
  parsed.value.items.forEach((entry, index) => {
    const row = readRow(entry, index);
    if (row.record) records.push(row.record);
    refusalReasons.push(...row.reasons);
  });
  return ok({
    scheduled: false,
    endToEnd: false,
    publishable: 0,
    records,
    refusalReasons: [...new Set(refusalReasons)],
  });
}

function readRow(
  entry: unknown,
  index: number,
): { record: PrivateDedupRecord | null; reasons: string[] } {
  if (!isPlainObject(entry)) return { record: null, reasons: [`bad-item:${index}`] };
  const shape = exactKeys(entry, RAW_ITEM_KEYS, `$.items[${index}]`);
  if (shape.length > 0) return { record: null, reasons: [`bad-item:${index}`] };
  if (!Number.isInteger(entry.candidateId) || Number(entry.candidateId) <= 0) {
    return { record: null, reasons: [`bad-item:${index}`] };
  }
  if (!textField(entry.title) || !textField(entry.summary) || !textField(entry.detail)) {
    return { record: null, reasons: [`bad-item:${index}`] };
  }
  if (!textField(entry.opportunity) || !textField(entry.sourceName) || !textField(entry.tag)) {
    return { record: null, reasons: [`bad-item:${index}`] };
  }
  if (!Array.isArray(entry.signals) || entry.signals.some((signal) => typeof signal !== "string")) {
    return { record: null, reasons: [`bad-item:${index}`] };
  }
  if (typeof entry.sourceUrl !== "string" || typeof entry.publishedAt !== "string") {
    return { record: null, reasons: [`bad-item:${index}`] };
  }

  const reasons = ["raw-editorial-not-public"];
  let evidenceUrl: string | null = null;
  if (evidenceHost(entry.sourceUrl)) evidenceUrl = entry.sourceUrl;
  else reasons.push("evidence-url-refused");

  let publishedAtRaw: string | null = null;
  if (FEED_DATE.test(entry.publishedAt)) {
    publishedAtRaw = entry.publishedAt;
    reasons.push("feed-date-has-no-year");
  } else {
    reasons.push("feed-date-unusable");
  }

  return {
    record: {
      candidateId: entry.candidateId as number,
      evidenceUrl,
      publishedAtRaw,
      year: null,
      month: null,
      day: null,
      time: null,
      timezone: null,
      publishable: false,
      reasons,
    },
    reasons,
  };
}

function textField(value: unknown): boolean {
  return typeof value === "string";
}
