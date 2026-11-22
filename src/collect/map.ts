import { sanitizeText } from "../contract/sanitize";
import type { PublicItem, SourcePublishedAt } from "../contract/types";
import type { SourceRecord } from "../data/sources/registry";

export interface RawSignal {
  externalId: string;
  title: string;
  url: string;
  authors: string[];
  categories: string[];
  publishedAt: SourcePublishedAt;
}

const CATEGORY_TOPIC: Record<string, string> = {
  "cs.AI": "人工智能",
  "cs.CL": "语言",
  "cs.LG": "机器学习",
};

export function signalToItem(source: SourceRecord, signal: RawSignal, fetchedAt: string): PublicItem | null {
  if (source.channel !== "native-public" || source.scheduled !== true || source.enabled !== true) return null;
  const title = sanitizeText(signal.title, 180);
  const url = signal.url.trim();
  if (title.length < 4 || !url.startsWith("https://")) return null;
  const id = stableId(source.id, signal.externalId);
  if (!/^[a-z][a-z0-9-]{2,78}$/.test(id)) return null;
  const topics = topicsFor(source, signal.categories);
  const authors = signal.authors.map((name) => sanitizeText(name, 80)).filter(Boolean).slice(0, 8);
  const facts = [
    `标题：${title}`,
    authors.length > 0 ? `作者：${authors.join("、")}` : "作者：来源未提供",
    `来源页：${url}`,
  ];
  return {
    id,
    title,
    topics,
    priority: "P2",
    facts,
    inferences: ["仅凭这条元数据，不能判断买方、付款、交付或可复现性。"],
    analysis: `规则说明：这是${source.name}的公开元数据，不是会员内容，也没有做交叉核验。没有买方或付款证据，所以优先级保持 P2。${source.attribution}`,
    sourceName: source.name,
    sourceUrl: url,
    sourcePublishedAt: signal.publishedAt,
    updatedAt: fetchedAt,
    coverage: {
      completeness: "partial",
      examinedCount: 1,
      completeCount: 1,
      warnings: ["只核过这一条来源记录，没有对照其他来源。"],
    },
    status: "published",
    demo: false,
    publication: {
      confirmed: true,
      note: "已通过公开来源允许名单。页面是否上线取决于这次静态构建有没有完成部署。",
    },
  };
}

export function stableId(sourceId: string, externalId: string): string {
  const slug = `${sourceId}-${externalId}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 78);
  return slug;
}

function topicsFor(source: SourceRecord, categories: string[]): string[] {
  const topics = new Set<string>();
  if (source.id === "nist-it") topics.add("标准");
  if (source.id === "arxiv-cs") topics.add("预印本");
  for (const category of categories) {
    const mapped = CATEGORY_TOPIC[category];
    if (mapped) topics.add(mapped);
  }
  const list = [...topics];
  return list.length > 0 ? list.slice(0, 4) : ["公开来源"];
}

export function emptyDate(): SourcePublishedAt {
  return { raw: null, year: null, month: null, day: null, time: null, timezone: null, certainty: "unknown" };
}

export function dateFromIso(raw: string): SourcePublishedAt {
  const match = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) return { ...emptyDate(), raw: sanitizeText(raw, 80) || null };
  return {
    raw: raw.trim(),
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    time: `${match[4]}:${match[5]}`,
    timezone: match[6] === "Z" ? "Z" : match[6] ?? null,
    certainty: "complete",
  };
}

export function dateFromRfc822(raw: string): SourcePublishedAt {
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return { ...emptyDate(), raw: sanitizeText(raw, 80) || null };
  const iso = new Date(parsed).toISOString().replace(/\.\d{3}Z$/, "Z");
  const dated = dateFromIso(iso);
  return { ...dated, raw: raw.trim() };
}
