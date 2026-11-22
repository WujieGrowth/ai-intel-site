import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const outDir = await mkdtemp(path.join(tmpdir(), "shijie-base-"));
const astroBin = path.join(process.cwd(), "node_modules", ".bin", "astro");
const build = spawnSync(astroBin, ["build", "--outDir", outDir], {
  cwd: process.cwd(),
  env: { ...process.env, PUBLIC_BASE_PATH: "/ai-intel-site/" },
  encoding: "utf8",
});

if (build.status !== 0) {
  console.error(build.stdout);
  console.error(build.stderr);
  await rm(outDir, { recursive: true, force: true });
  process.exit(build.status ?? 1);
}

const indexPath = path.join(outDir, "index.html");
const archivePath = path.join(outDir, "archive", "index.html");
const index = await readFile(indexPath, "utf8");
const archive = await readFile(archivePath, "utf8");
const errors = [];

function expectIncludes(text, snippet, label) {
  if (!text.includes(snippet)) errors.push(`${label} missing ${snippet}`);
}

function expectAbsent(text, snippet, label) {
  if (text.includes(snippet)) errors.push(`${label} unexpectedly contains ${snippet}`);
}

const published = JSON.parse(readFileSync("src/data/published/items.json", "utf8"));
const live = published.filter((item) => item.demo === false && item.status === "published");
if (live.length === 0) errors.push("published dataset is empty");
expectIncludes(index, "/ai-intel-site/", "index");
expectIncludes(index, "/ai-intel-site/archive/", "index archive link");
expectIncludes(index, "/ai-intel-site/favicon.svg", "favicon");
expectIncludes(index, "生财AI情报未接入", "bridge disclosure");
expectIncludes(index, "定时公开采集", "native collector status");
expectIncludes(index, "application/rss+xml", "rss autodiscovery");
expectIncludes(index, "/ai-intel-site/rss.xml", "rss href");
expectAbsent(index, "演示数据", "demo banner");
expectAbsent(index, "合成示例", "synthetic claim");
expectAbsent(index, "示例来源均指向 example.com", "fake source footer");
if (live[0]) expectIncludes(index, live[0].title.slice(0, 12), "latest title");
expectAbsent(index, "demo-retracted-revenue-claim", "index retracted id");
expectAbsent(index, "demo-p0-batch-api", "demo id");
expectAbsent(index, "已撤下的示例", "index retracted title");
expectAbsent(index, 'href="/archive/"', "unprefixed archive href");
expectAbsent(index, 'src="/_astro/', "unprefixed asset");
expectAbsent(index, 'href="/_astro/', "unprefixed stylesheet");
expectIncludes(archive, "没有同时符合当前主题与优先级的示例。", "filter zero copy");
expectAbsent(archive, "demo-retracted-revenue-claim", "archive retracted id");

const rssPath = path.join(outDir, "rss.xml");
const rss = await readFile(rssPath, "utf8").catch(() => "");
if (!rss) errors.push("missing rss.xml");
expectIncludes(rss, "<?xml", "rss xml");
expectIncludes(rss, "https://wujiegrowth.github.io/ai-intel-site/", "rss absolute link");
expectAbsent(rss, "demo-p0-batch-api", "rss demo id");
expectAbsent(rss, "demo-retracted-revenue-claim", "rss retracted id");
if (live[0]) expectIncludes(rss, `/ai-intel-site/items/${live[0].id}/`, "rss item link");

const detailDir = path.join(outDir, "items");
let details = [];
try {
  details = await readdir(detailDir);
} catch {
  errors.push("missing detail directory");
}
if (details.includes("demo-retracted-revenue-claim") || details.includes("demo-p0-batch-api")) {
  errors.push("demo detail was built");
}
if (live[0]) {
  const detail = await readFile(path.join(detailDir, live[0].id, "index.html"), "utf8");
  expectIncludes(detail, "已核事实", "facts");
  expectIncludes(detail, "推断", "inferences");
  expectIncludes(detail, "原分析", "analysis");
  expectIncludes(detail, live[0].sourceUrl, "source link");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  await rm(outDir, { recursive: true, force: true });
  process.exit(1);
}

await rm(outDir, { recursive: true, force: true });
console.log("smoke-base-path: ok");
