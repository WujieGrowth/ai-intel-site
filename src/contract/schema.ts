import { COVERAGE_KEYS, PUBLIC_ITEM_KEYS, PUBLICATION_KEYS, SITE_META_KEYS } from "./fields";
import { LATEST_FEED_LIMIT } from "./limits";
import { checkSourceDate, isUpdatedAt } from "./dates";
import {
  exactKeys,
  findForbiddenKeys,
  isHttpUrl,
  isPlainObject,
  scanText,
  stringIssues,
} from "./inspect";
import { fail, ok, type Result } from "./result";
import {
  PRIORITIES,
  PUBLIC_STATUSES,
  type Coverage,
  type Priority,
  type PublicItem,
  type PublicStatus,
  type SiteMeta,
  type SourcePublishedAt,
} from "./types";

const DEMO_ID = /^demo-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function checkCoverage(value: unknown, path: string): string[] {
  if (!isPlainObject(value)) return [`bad-type:${path}`];
  const errors = exactKeys(value, COVERAGE_KEYS, path);
  if (errors.length > 0) return errors;
  const completeness = value.completeness;
  const examinedCount = value.examinedCount;
  const completeCount = value.completeCount;
  const warnings = value.warnings;
  if (completeness !== "partial" && completeness !== "complete") {
    errors.push(`bad-type:${path}.completeness`);
  }
  if (typeof examinedCount !== "number" || !Number.isInteger(examinedCount)) {
    errors.push(`bad-type:${path}.examinedCount`);
  }
  if (typeof completeCount !== "number" || !Number.isInteger(completeCount)) {
    errors.push(`bad-type:${path}.completeCount`);
  }
  if (!Array.isArray(warnings) || warnings.some((warning) => typeof warning !== "string")) {
    errors.push(`bad-type:${path}.warnings`);
  }
  if (errors.length > 0) return errors;

  const coverage = value as unknown as Coverage;
  if (coverage.examinedCount < 1 || coverage.completeCount < 0) {
    errors.push(`coverage-inconsistent:${path}`);
  }
  if (coverage.completeCount > coverage.examinedCount) {
    errors.push(`coverage-inconsistent:${path}`);
  }
  if (coverage.completeness === "complete") {
    if (coverage.completeCount !== coverage.examinedCount || coverage.warnings.length !== 0) {
      errors.push(`coverage-inconsistent:${path}`);
    }
  } else if (coverage.warnings.length < 1) {
    errors.push(`coverage-inconsistent:${path}`);
  }
  for (const warning of coverage.warnings) {
    errors.push(...stringIssues(warning, `${path}.warnings`, 1, 200));
  }
  return errors;
}

export function parsePublicItem(value: unknown): Result<PublicItem> {
  const errors = [
    ...findForbiddenKeys(value),
    ...scanText(value),
  ];
  if (!isPlainObject(value)) return fail(...errors, "bad-type:$");
  errors.push(...exactKeys(value, PUBLIC_ITEM_KEYS, "$"));

  const id = readString(value, "id", "$", errors, 8, 80);
  const title = readString(value, "title", "$", errors, 4, 200);
  const topics = readStringArray(value.topics, "$.topics", errors, 1, 4, 1, 16);
  const priority = readEnum(value.priority, PRIORITIES, "$.priority", errors);
  const facts = readStringArray(value.facts, "$.facts", errors, 1, 6, 4, 500);
  const inferences = readStringArray(value.inferences, "$.inferences", errors, 0, 6, 4, 500);
  const analysis = readString(value, "analysis", "$", errors, 4, 500);
  const sourceName = readString(value, "sourceName", "$", errors, 2, 80);
  const sourceUrl = readString(value, "sourceUrl", "$", errors, 8, 200);
  const updatedAt = readString(value, "updatedAt", "$", errors, 20, 40);
  const status = readEnum(value.status, PUBLIC_STATUSES, "$.status", errors);
  errors.push(...checkSourceDate(value.sourcePublishedAt, "$.sourcePublishedAt"));
  errors.push(...checkCoverage(value.coverage, "$.coverage"));
  errors.push(...checkPublication(value.publication));

  if (typeof value.demo !== "boolean") errors.push("bad-type:$.demo");
  if (typeof id === "string" && value.demo === true && !DEMO_ID.test(id)) errors.push("bad-id:$");
  if (typeof id === "string" && value.demo === false && !/^[a-z][a-z0-9-]{2,78}$/.test(id)) {
    errors.push("bad-id:$");
  }
  if (typeof sourceUrl === "string" && !isHttpUrl(sourceUrl)) errors.push("bad-url:$.sourceUrl");
  if (typeof updatedAt === "string" && !isUpdatedAt(updatedAt)) errors.push("bad-updatedAt:$.updatedAt");
  if (topics) {
    const unique = new Set(topics);
    if (unique.size !== topics.length) errors.push("duplicate-topic:$.topics");
    for (const topic of topics) {
      if (topic.includes(",") || topic.includes("，")) errors.push("topic-comma:$.topics");
    }
  }

  if (
    errors.length > 0 ||
    id === null ||
    title === null ||
    topics === null ||
    priority === null ||
    facts === null ||
    inferences === null ||
    analysis === null ||
    sourceName === null ||
    sourceUrl === null ||
    updatedAt === null ||
    status === null
  ) {
    return fail(...(errors.length > 0 ? errors : ["bad-type:$"]));
  }

  const item: PublicItem = {
    id,
    title,
    topics,
    priority: priority as Priority,
    facts,
    inferences,
    analysis,
    sourceName,
    sourceUrl,
    sourcePublishedAt: value.sourcePublishedAt as SourcePublishedAt,
    updatedAt,
    coverage: value.coverage as Coverage,
    status: status as PublicStatus,
    demo: value.demo === true,
    publication: value.publication as PublicItem["publication"],
  };
  return ok(item);
}

function checkPublication(value: unknown): string[] {
  if (!isPlainObject(value)) return ["bad-type:$.publication"];
  const errors = exactKeys(value, PUBLICATION_KEYS, "$.publication");
  if (typeof value.confirmed !== "boolean") errors.push("bad-type:$.publication.confirmed");
  if (typeof value.note !== "string") errors.push("bad-type:$.publication.note");
  else errors.push(...stringIssues(value.note, "$.publication.note", 4, 200));
  return errors;
}

export function parseSiteMeta(value: unknown): Result<SiteMeta> {
  const errors = [...findForbiddenKeys(value), ...scanText(value)];
  if (!isPlainObject(value)) return fail(...errors, "bad-type:$");
  errors.push(...exactKeys(value, SITE_META_KEYS, "$"));
  const name = readString(value, "name", "$", errors, 1, 20);
  const tagline = readString(value, "tagline", "$", errors, 4, 80);
  const description = readString(value, "description", "$", errors, 8, 200);
  const updatedAt = readString(value, "updatedAt", "$", errors, 20, 40);
  const limitNote = readString(value, "limitNote", "$", errors, 8, 200);
  if (typeof value.latestLimit !== "number" || value.latestLimit !== LATEST_FEED_LIMIT) {
    errors.push("bad-latest-limit:$");
  }
  if (value.paginationAvailable !== false) errors.push("pagination-not-available:$");
  if (typeof value.demo !== "boolean") errors.push("bad-type:$.demo");
  if (typeof updatedAt === "string" && !isUpdatedAt(updatedAt)) errors.push("bad-updatedAt:$.updatedAt");
  if (errors.length > 0 || name === null || tagline === null || description === null || updatedAt === null || limitNote === null) {
    return fail(...errors);
  }
  return ok({
    name,
    tagline,
    description,
    updatedAt,
    latestLimit: LATEST_FEED_LIMIT,
    paginationAvailable: false,
    demo: value.demo === true,
    limitNote,
  });
}

export function visibleOnSite(item: PublicItem): boolean {
  return item.demo === false && item.status === "published" && item.publication.confirmed === true;
}

export function readString(
  obj: Record<string, unknown>,
  key: string,
  parent: string,
  errors: string[],
  min: number,
  max: number,
): string | null {
  const value = obj[key];
  const path = `${parent}.${key}`;
  if (typeof value !== "string") {
    errors.push(`bad-type:${path}`);
    return null;
  }
  errors.push(...stringIssues(value, path, min, max));
  return value;
}

export function readNullableString(
  value: unknown,
  path: string,
  errors: string[],
  min: number,
  max: number,
): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") {
    errors.push(`bad-type:${path}`);
    return undefined;
  }
  errors.push(...stringIssues(value, path, min, max));
  return value;
}

export function readStringArray(
  value: unknown,
  path: string,
  errors: string[],
  minItems: number,
  maxItems: number,
  minLen: number,
  maxLen: number,
): string[] | null {
  if (!Array.isArray(value)) {
    errors.push(`bad-type:${path}`);
    return null;
  }
  if (value.length < minItems || value.length > maxItems) errors.push(`bad-length:${path}`);
  const items: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push(`bad-type:${path}[${index}]`);
      return;
    }
    errors.push(...stringIssues(item, `${path}[${index}]`, minLen, maxLen));
    items.push(item);
  });
  return items;
}

export function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  errors: string[],
): T | null {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    errors.push(`bad-type:${path}`);
    return null;
  }
  return value as T;
}
