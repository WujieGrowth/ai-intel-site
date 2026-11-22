export type SourceChannel = "native-public" | "private-bridge" | "disabled-feed";

export interface SourceRecord {
  id: string;
  name: string;
  enabled: boolean;
  disabledReason: string | null;
  channel: SourceChannel;
  /** True only for collectors the daily job may fetch. The private bridge is never scheduled. */
  scheduled: boolean;
  kind: "arxiv-api" | "rss" | "private-file";
  feedUrl: string | null;
  allowedHosts: string[];
  termsUrl: string | null;
  rightsBasis: string;
  attribution: string;
  rateLimitMs: number;
}

export interface FetchableSource extends SourceRecord {
  channel: "native-public";
  scheduled: true;
  enabled: true;
  kind: "arxiv-api" | "rss";
  feedUrl: string;
}

/**
 * Only native public rows with an allowlisted feed may be fetched.
 * The 生财 bridge has no endpoint here. Reviewed 2026-11-22.
 */
export const SOURCE_REGISTRY: readonly SourceRecord[] = [
  {
    id: "arxiv-cs",
    name: "arXiv",
    enabled: true,
    disabledReason: null,
    channel: "native-public",
    scheduled: true,
    kind: "arxiv-api",
    feedUrl:
      "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG&start=0&max_results=8&sortBy=submittedDate&sortOrder=descending",
    allowedHosts: ["export.arxiv.org"],
    termsUrl: "https://info.arxiv.org/help/api/tou.html",
    rightsBasis:
      "arXiv API 使用条款写明描述性元数据采用 CC0 1.0。这里只保存标题、作者、分类、标识和摘要页链接，不保存摘要正文，也不保存 PDF。",
    attribution: "元数据来自 arXiv，按 CC0 使用。论文全文版权仍归作者或出版方。",
    rateLimitMs: 3000,
  },
  {
    id: "nist-it",
    name: "NIST",
    enabled: true,
    disabledReason: null,
    channel: "native-public",
    scheduled: true,
    kind: "rss",
    feedUrl: "https://www.nist.gov/news-events/information%20technology/rss.xml",
    allowedHosts: ["www.nist.gov"],
    termsUrl: "https://www.nist.gov/coo/nist-rss-feeds",
    rightsBasis:
      "NIST 公开提供这份 RSS，并说明别人可以显示其中的供稿。这里只保存标题、链接和来源时间，不抓文章正文。",
    attribution: "条目标题链到 NIST。由美国联邦政府雇员完成的作品通常属于公有领域。",
    rateLimitMs: 3000,
  },
  {
    id: "scys-private",
    name: "生财AI情报",
    enabled: false,
    disabledReason:
      "定时任务和 Actions 不读取这条桥，也不调用它的接口。会员正文不会入库。只有另行核实的公开原文可以单独发布，不能代表会员列表。",
    channel: "private-bridge",
    scheduled: false,
    kind: "private-file",
    feedUrl: null,
    allowedHosts: [],
    termsUrl: null,
    rightsBasis: "未取得再分发许可。公开采用必须另有已核实的公开原文，以及独立事实稿或明确许可。",
    attribution: "不公开会员正文。",
    rateLimitMs: 0,
  },
  {
    id: "openai-blog",
    name: "OpenAI Blog",
    enabled: false,
    disabledReason: "未找到允许再分发文章或摘要的明确许可。存在博客本身不等于可以公开转载。",
    channel: "disabled-feed",
    scheduled: false,
    kind: "rss",
    feedUrl: null,
    allowedHosts: [],
    termsUrl: "https://openai.com/policies",
    rightsBasis: "许可未确认，因此保持关闭。",
    attribution: "未使用。",
    rateLimitMs: 0,
  },
  {
    id: "github-pytorch-atom",
    name: "PyTorch GitHub Atom",
    enabled: false,
    disabledReason: "公开 Atom 里混有提交说明。提交正文的再分发范围没有按仓库许可证逐条确认，所以不采集。",
    channel: "disabled-feed",
    scheduled: false,
    kind: "rss",
    feedUrl: null,
    allowedHosts: [],
    termsUrl: "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service",
    rightsBasis: "许可未确认，因此保持关闭。",
    attribution: "未使用。",
    rateLimitMs: 0,
  },
];

export function enabledSources(): FetchableSource[] {
  return SOURCE_REGISTRY.filter((source): source is FetchableSource =>
    source.channel === "native-public" &&
    source.scheduled === true &&
    source.enabled === true &&
    typeof source.feedUrl === "string" &&
    source.allowedHosts.length > 0 &&
    (source.kind === "arxiv-api" || source.kind === "rss"),
  );
}

export function sourceStatusLabel(source: SourceRecord): string {
  if (source.channel === "native-public" && source.scheduled === true) return "定时公开采集";
  if (source.channel === "private-bridge") {
    return "私人桥未在 Actions 中调用。会员内容不发布。";
  }
  return source.disabledReason ?? "未采集";
}
