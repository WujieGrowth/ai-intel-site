import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acceptVerified, isReviewedArtifactPath, mergeAccepted } from "../src/bridge/verified";
import { retainHistoryIds } from "../src/collect/run";
import { PUBLIC_FEED_CAP } from "../src/contract/limits";
import { parsePublicItem } from "../src/contract/schema";
import { isUpdatedAt } from "../src/contract/dates";
import type { PublicItem } from "../src/contract/types";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = readArgs(process.argv.slice(2));
if (!args.ok) {
  process.stderr.write(`${args.error}\n`);
  process.exit(2);
}
if (!isUpdatedAt(args.at)) {
  process.stderr.write("bad-updatedAt\n");
  process.exit(1);
}

const rels = args.allInbound ? listInbound() : [repoRelative(args.input)];
if (rels.some((rel) => !rel || !isReviewedArtifactPath(rel))) {
  process.stderr.write("refused-path\n");
  process.exit(1);
}

const accepted: PublicItem[] = [];
for (const rel of rels) {
  if (!rel) continue;
  let text = "";
  try {
    text = readFileSync(path.join(root, rel), "utf8");
  } catch {
    process.stderr.write("missing-file\n");
    process.exit(1);
  }
  if (text.length > 64_000) {
    process.stderr.write("file-too-large\n");
    process.exit(1);
  }
  const decided = acceptVerified(text, args.at);
  if (!decided.ok) {
    process.stderr.write(`${decided.errors.join("\n")}\n`);
    process.exit(1);
  }
  if (decided.value.refusals.length > 0) {
    const reasons = [...new Set(decided.value.refusals.flatMap((row) => row.reasons))];
    process.stderr.write(`${reasons.join("\n")}\n`);
    process.exit(1);
  }
  accepted.push(...decided.value.items);
}

if (!args.writePublished) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    scheduled: false,
    count: accepted.length,
    ids: accepted.map((item) => item.id),
  })}\n`);
  process.exit(0);
}

if (accepted.length === 0) {
  process.stdout.write(`${JSON.stringify({ ok: true, scheduled: false, unchanged: true, count: 0 })}\n`);
  process.exit(0);
}

const itemsPath = path.join(root, "src/data/published/items.json");
const historyPath = path.join(root, "src/data/published/history.json");
const sitePath = path.join(root, "src/data/published/site.json");
const previous = JSON.parse(readFileSync(itemsPath, "utf8")) as unknown;
if (!Array.isArray(previous)) {
  process.stderr.write("published-items-invalid\n");
  process.exit(1);
}
const parsedPrevious: PublicItem[] = [];
for (const entry of previous) {
  const result = parsePublicItem(entry);
  if (!result.ok) {
    process.stderr.write("published-items-invalid\n");
    process.exit(1);
  }
  parsedPrevious.push(result.value);
}
const merged = mergeAccepted(parsedPrevious, accepted);
if (merged.length > PUBLIC_FEED_CAP) {
  process.stderr.write("over-cap\n");
  process.exit(1);
}

const history = JSON.parse(readFileSync(historyPath, "utf8")) as { ids?: unknown };
const ids = retainHistoryIds(
  Array.isArray(history.ids) ? history.ids.filter((id): id is string => typeof id === "string") : [],
  merged.map((item) => item.id),
);
const site = JSON.parse(readFileSync(sitePath, "utf8")) as { updatedAt: string };
site.updatedAt = args.at;
writeFileSync(itemsPath, `${JSON.stringify(merged, null, 2)}\n`);
writeFileSync(historyPath, `${JSON.stringify({ ids }, null, 2)}\n`);
writeFileSync(sitePath, `${JSON.stringify(site, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  ok: true,
  scheduled: false,
  count: accepted.length,
  ids: accepted.map((item) => item.id),
})}\n`);

function listInbound(): string[] {
  const dir = path.join(root, "inbound/verified");
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    process.stderr.write("missing-file\n");
    process.exit(1);
  }
  return names.filter((name) => name.endsWith(".json")).map((name) => `inbound/verified/${name}`).sort();
}

function repoRelative(input: string): string | null {
  const abs = path.resolve(root, input);
  const relative = path.relative(root, abs);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

function readArgs(
  argv: readonly string[],
): { ok: true; input: string; allInbound: boolean; at: string; writePublished: boolean } | { ok: false; error: string } {
  let input = "";
  let at = "";
  let writePublished = false;
  let allInbound = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token === "--write-published") {
      writePublished = true;
      continue;
    }
    if (token === "--all-inbound") {
      allInbound = true;
      continue;
    }
    if (token === "--input" || token === "--at") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) return { ok: false, error: `missing-value:${token}` };
      if (token === "--input") input = value;
      else at = value;
      index += 1;
      continue;
    }
    return { ok: false, error: `unknown-arg:${token}` };
  }
  if (!allInbound && !input) return { ok: false, error: "missing-flag:--input" };
  if (!at) return { ok: false, error: "missing-flag:--at" };
  return { ok: true, input, allInbound, at, writePublished };
}
