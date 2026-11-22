import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const secretPatterns = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9]{10,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /Bearer\s+[A-Za-z0-9\-._~+/]{8,}/,
  /\b(api[_-]?key|secret|password|access[_-]?token)\b\s*[:=]\s*\S+/i,
];
const publicKeys = new Set([
  "id",
  "title",
  "topics",
  "priority",
  "facts",
  "inferences",
  "analysis",
  "sourceName",
  "sourceUrl",
  "sourcePublishedAt",
  "updatedAt",
  "coverage",
  "status",
  "demo",
  "publication",
  "raw",
  "year",
  "month",
  "day",
  "time",
  "timezone",
  "certainty",
  "completeness",
  "examinedCount",
  "completeCount",
  "warnings",
  "confirmed",
  "note",
]);
const forbiddenKey = /^(memberText|memberId|inbox|rawEvidence|oauth|accessToken|apiKey|api_key|password|mcpPayload|credentials|seen)$/i;

const errors = [];

function scanText(label, text) {
  if (text.includes("set:html")) errors.push(`${label}: set:html`);
  if (/deployed\s*:\s*true/.test(text)) errors.push(`${label}: deployed true`);
  for (const pattern of secretPatterns) {
    if (pattern.test(text)) errors.push(`${label}: secret pattern ${pattern}`);
  }
}

async function walk(dir, visitor) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, visitor);
    else if (entry.isFile()) await visitor(full);
  }
}

const sourceRoots = ["src", "cli", "scripts"].map((dir) => path.join(root, dir));
for (const dir of sourceRoots) {
  await walk(dir, async (file) => {
    if (!/\.(astro|ts|mjs|css|json|svg)$/.test(file)) return;
    if (file.endsWith(`${path.sep}scan-static.mjs`)) return;
    scanText(path.relative(root, file), await readFile(file, "utf8"));
  });
}

const cliDir = path.join(root, "cli");
await walk(cliDir, async (file) => {
  const text = await readFile(file, "utf8");
  if (/\bfetch\s*\(/.test(text) || /node:https|http\.request/.test(text)) {
    errors.push(`${path.relative(root, file)}: network call`);
  }
});

const fixturePath = path.join(root, "src/data/fixtures/public-items.json");
const fixtures = JSON.parse(await readFile(fixturePath, "utf8"));
const hiddenIds = [];
if (!Array.isArray(fixtures)) errors.push("fixtures: not an array");
for (const item of Array.isArray(fixtures) ? fixtures : []) {
  walkKeys(item, "fixture", (key) => {
    if (!publicKeys.has(key) || forbiddenKey.test(key)) errors.push(`fixture unknown or forbidden key ${key}`);
  });
  const visible = item.status === "published" && item.demo === false && item.publication?.confirmed === true;
  if (!visible) hiddenIds.push(item.id);
}
scanText("fixtures", await readFile(fixturePath, "utf8"));

const distDir = path.join(root, "dist");
const distStat = await stat(distDir).catch(() => null);
if (!distStat) {
  if (process.env.SCAN_REQUIRE_DIST === "1") errors.push("dist missing");
  else console.log("scan: dist not present, skipped output scan");
} else {
  let html = "";
  await walk(distDir, async (file) => {
    if (!/\.(html|css|js|svg|txt|xml|json)$/.test(file)) return;
    const text = await readFile(file, "utf8");
    html += `\n${text}`;
    scanText(path.relative(root, file), text);
    if (text.includes("javascript:")) errors.push(`${path.relative(root, file)}: javascript url`);
  });
  for (const id of hiddenIds) {
    if (html.includes(id)) errors.push(`dist contains hidden id ${id}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("scan: ok");

function walkKeys(value, label, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walkKeys(item, label, visit);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    visit(key);
    walkKeys(child, label, visit);
  }
}
