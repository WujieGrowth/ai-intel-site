import { createHash } from "node:crypto";
import {
  canonicalizeHttpUrl,
  checkSourceDate,
  exactKeys,
  findForbiddenKeys,
  isPlainObject,
  isUpdatedAt,
  parseJsonText,
  parsePublicItem,
  sanitizeText,
  scanText,
  unsafeTextIssues,
  type PublicItem,
  type Result,
  type SourcePublishedAt,
  fail,
  ok,
} from "../contract/index";
import { evidenceHost } from "./evidence";

export const VERIFIED_SCHEMA_VERSION = 1;
export const VERIFIED_KIND = "verified-public-origins";
export const DISCOVERY_MARKER = "scys-private-bridge";
const MAX_ITEMS = 20;
const FILE_KEYS = ["kind", "schemaVersion", "items"] as const;
const ITEM_KEYS = [
  "evidenceUrl",
  "title",
  "facts",
  "sourceLabel",
  "discoveredVia",
  "verified",
  "endorsement",
  "sourcePublishedAt",
] as const;

const PRIVATE_KEYS = new Set([
  "candidateid",
  "summary",
  "detail",
  "opportunity",
  "signals",
  "tag",
  "membersummary",
  "membertext",
  "datesource",
  "reviewstatus",
  "originaldateutc",
  "publishedat",
]);

export interface VerifiedRefusal {
  index: number;
  reasons: string[];
}

export interface VerifiedDecision {
  scheduled: false;
  endToEnd: false;
  items: PublicItem[];
  refusals: VerifiedRefusal[];
}

export function publicOriginId(url: string): string {
  const digest = createHash("sha256").update(canonicalizeHttpUrl(url)).digest("hex").slice(0, 16);
  return `origin-${digest}`;
}

export function isReviewedArtifactPath(rel: string): boolean {
  return /^inbound\/verified\/[a-z0-9][a-z0-9.-]{0,60}\.json$/.test(rel);
}

/** Map a reviewed public artifact into site records. Raw connector fields are rejected. */
export function acceptVerified(text: string, updatedAt: string): Result<VerifiedDecision> {
  if (!isUpdatedAt(updatedAt)) return fail("bad-updatedAt");
  const parsed = parseJsonText(text);
  if (!parsed.ok) return parsed;
  const hidden = privateKeyPaths(parsed.value);
  if (hidden.length > 0) return fail(...hidden);
  const forbidden = findForbiddenKeys(parsed.value);
  if (forbidden.length > 0) return fail(...forbidden);
  const unsafe = unsafeTextIssues(parsed.value);
  if (unsafe.length > 0) return fail(...unsafe);
  if (!isPlainObject(parsed.value)) return fail("bad-type:$");
  const shape = exactKeys(parsed.value, FILE_KEYS, "$");
  if (shape.length > 0) return fail(...shape);
  if (parsed.value.kind !== VERIFIED_KIND) return fail("unexpected-kind");
  if (parsed.value.schemaVersion !== VERIFIED_SCHEMA_VERSION) return fail("schema-not-accepted");
  if (!Array.isArray(parsed.value.items)) return fail("bad-type:$.items");
  if (parsed.value.items.length > MAX_ITEMS) return fail("too-many-items");

  const items: PublicItem[] = [];
  const refusals: VerifiedRefusal[] = [];
  const seen = new Set<string>();
  parsed.value.items.forEach((entry, index) => {
    const built = buildItem(entry, index, updatedAt, seen);
    if (built.item) {
      items.push(built.item);
      seen.add(canonicalizeHttpUrl(built.item.sourceUrl));
    }
    if (built.refusal) refusals.push(built.refusal);
  });
  return ok({ scheduled: false, endToEnd: false, items, refusals });
}

export function mergeAccepted(previous: readonly PublicItem[], accepted: readonly PublicItem[]): PublicItem[] {
  const byId = new Map(previous.map((item) => [item.id, item]));
  for (const item of accepted) byId.set(item.id, item);
  return [...byId.values()].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.id.localeCompare(right.id),
  );
}

function buildItem(
  entry: unknown,
  index: number,
  updatedAt: string,
  seen: ReadonlySet<string>,
): { item: PublicItem | null; refusal: VerifiedRefusal | null } {
  if (!isPlainObject(entry)) return refuse(index, ["bad-item"]);
  if (exactKeys(entry, ITEM_KEYS, `$.items[${index}]`).length > 0) return refuse(index, ["bad-item"]);
  if (entry.verified !== true) return refuse(index, ["not-verified"]);
  if (entry.endorsement !== false) return refuse(index, ["endorsement-not-claimed"]);
  if (entry.discoveredVia !== DISCOVERY_MARKER) return refuse(index, ["unexpected-discovery"]);
  if (typeof entry.evidenceUrl !== "string" || !evidenceHost(entry.evidenceUrl)) {
    return refuse(index, ["evidence-url-refused"]);
  }
  const sourceUrl = canonicalizeHttpUrl(entry.evidenceUrl);
  if (seen.has(sourceUrl)) return refuse(index, ["duplicate-public-origin"]);
  const title = typeof entry.title === "string" ? sanitizeText(entry.title, 180) : "";
  const sourceLabel = typeof entry.sourceLabel === "string" ? sanitizeText(entry.sourceLabel, 80) : "";
  if (title.length < 4 || sourceLabel.length < 2) return refuse(index, ["public-text-missing"]);
  if (!Array.isArray(entry.facts) || entry.facts.length < 1 || entry.facts.length > 4) {
    return refuse(index, ["bad-facts"]);
  }
  const facts = entry.facts.map((fact) => (typeof fact === "string" ? sanitizeText(fact, 500) : ""));
  if (facts.some((fact) => fact.length < 4)) return refuse(index, ["bad-facts"]);
  const dateErrors = checkSourceDate(entry.sourcePublishedAt, `$.items[${index}].sourcePublishedAt`);
  if (dateErrors.length > 0 || !isPlainObject(entry.sourcePublishedAt)) return refuse(index, ["bad-source-date"]);

  const host = evidenceHost(sourceUrl);
  const topics = host === "x.com" ? ["公开帖"] : ["官方博客"];
  const inferences = [
    "仅凭公开原文，不能判断买方、付款或交付。",
    ...(host === "x.com" ? ["没有观看视频，也不根据帖子推断视频里的具体内容。"] : []),
  ];
  const draft = {
    id: publicOriginId(sourceUrl),
    title,
    topics,
    priority: "P2" as const,
    facts,
    inferences,
    analysis:
      "这条记录由生财AI情报私人桥发现，公开文字只来自已核实的原文，不是会员摘要，也不是官方授权转载。定时采集和 GitHub Actions 都没有调用生财接口。没有买方或付款证据，优先级保持 P2。",
    sourceName: sourceLabel,
    sourceUrl,
    sourcePublishedAt: entry.sourcePublishedAt as unknown as SourcePublishedAt,
    updatedAt,
    coverage: {
      completeness: "partial" as const,
      examinedCount: 1,
      completeCount: 1,
      warnings: ["只核过公开原文，没有把会员摘要当作事实。"],
    },
    status: "published" as const,
    demo: false,
    publication: {
      confirmed: true,
      note: "公开原文已核实。由生财私人桥发现，不是官方转载，Actions 未调用该接口。",
    },
  };
  const issues = scanText(draft);
  if (issues.length > 0) return refuse(index, ["public-text-refused"]);
  const parsed = parsePublicItem(draft);
  if (!parsed.ok) return refuse(index, ["public-record-refused"]);
  return { item: parsed.value, refusal: null };
}

function refuse(index: number, reasons: string[]): { item: null; refusal: VerifiedRefusal } {
  return { item: null, refusal: { index, reasons } };
}

function privateKeyPaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => privateKeyPaths(item, `${path}[${index}]`));
  if (!isPlainObject(value)) return [];
  const errors: string[] = [];
  for (const key of Object.keys(value)) {
    const normalized = key.toLowerCase().replace(/[_-]/g, "");
    if (PRIVATE_KEYS.has(normalized)) errors.push(`private-field:${path}.${key}`);
    errors.push(...privateKeyPaths(value[key], `${path}.${key}`));
  }
  return errors;
}
