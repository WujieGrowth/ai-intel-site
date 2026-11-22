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
  /** How many recent items a successful fetch may publish. */
  maxItems: number;
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
    allowedHosts: ["export.arxiv.org", "arxiv.org"],
    termsUrl: "https://info.arxiv.org/help/api/tou.html",
    rightsBasis:
      "arXiv API 使用条款写明描述性元数据采用 CC0 1.0。这里只保存标题、作者、分类、标识和摘要页链接，不保存摘要正文，也不保存 PDF。",
    attribution: "元数据来自 arXiv，按 CC0 使用。论文全文版权仍归作者或出版方。",
    rateLimitMs: 3000,
    maxItems: 8,
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
    maxItems: 12,
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
    maxItems: 0,
  },
  {
    id: "openai-news",
    name: "OpenAI",
    enabled: true,
    disabledReason: null,
    channel: "native-public",
    scheduled: true,
    kind: "rss",
    feedUrl: "https://openai.com/news/rss.xml",
    allowedHosts: ["openai.com"],
    termsUrl: "https://openai.com/policies",
    rightsBasis:
      "没有核对到可以转载全文的许可。只保存标题、时间和官方链接。客户案例、广告和学习演示不进入列表。",
    attribution: "没有核对到可以转载全文的许可。只保存标题、时间和官方链接。",
    rateLimitMs: 3000,
    maxItems: 10,
  },
  {
    id: "deepmind-blog",
    name: "Google DeepMind",
    enabled: true,
    disabledReason: null,
    channel: "native-public",
    scheduled: true,
    kind: "rss",
    feedUrl: "https://deepmind.google/blog/rss.xml",
    allowedHosts: ["deepmind.google"],
    termsUrl: "https://deepmind.google/blog/",
    rightsBasis: "没有核对到可以转载正文的许可。供稿摘要经常为空。空摘要不补写，有摘要也不转载。",
    attribution: "没有核对到可以转载正文的许可。供稿没有摘要时不补写内容。",
    rateLimitMs: 3000,
    maxItems: 10,
  },
  {
    id: "huggingface-blog",
    name: "Hugging Face",
    enabled: true,
    disabledReason: null,
    channel: "native-public",
    scheduled: true,
    kind: "rss",
    feedUrl: "https://huggingface.co/blog/feed.xml",
    allowedHosts: ["huggingface.co"],
    termsUrl: "https://huggingface.co/blog",
    rightsBasis: "博客混有官方帖和社区帖。社区帖用网址中的作者标识标明，不写成官方公告，也不转载正文。",
    attribution: "没有核对到可以转载正文的许可。只保存标题、时间和官方链接。",
    rateLimitMs: 3000,
    maxItems: 10,
  },
  {
    id: "claude-platform-notes",
    name: "Claude 平台",
    enabled: true,
    disabledReason: null,
    channel: "native-public",
    scheduled: true,
    kind: "rss",
    feedUrl: "https://platform.claude.com/docs/en/release-notes/feed.xml",
    allowedHosts: ["platform.claude.com"],
    termsUrl: "https://platform.claude.com/docs/en/release-notes/overview",
    rightsBasis: "这是 Claude 平台的产品与 API 发布说明，不是 Anthropic 的全部新闻。不转载说明正文。",
    attribution: "这是产品与 API 发布说明，不是 Anthropic 的全部新闻。不转载说明正文。",
    rateLimitMs: 3000,
    maxItems: 10,
  },
  {
    id: "mistral-news",
    name: "Mistral",
    enabled: true,
    disabledReason: null,
    channel: "native-public",
    scheduled: true,
    kind: "rss",
    feedUrl: "https://mistral.ai/news/rss",
    allowedHosts: ["mistral.ai"],
    termsUrl: "https://mistral.ai/news",
    rightsBasis: "没有核对到可以转载正文的许可。供稿的 HTTP 类型可能是 text/plain，只根据正文是否为 XML 接收。",
    attribution: "没有核对到可以转载正文的许可。只保存标题、时间和官方链接。",
    rateLimitMs: 3000,
    maxItems: 10,
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
    maxItems: 0,
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
