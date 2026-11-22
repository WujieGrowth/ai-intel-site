import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../../../cli/index";

const roots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "shijie-cli-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function hash(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function candidate(status: string, patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "demo-p0-batch-api",
    title: "示例工坊询价：批量推理接口需要可测的交付说明",
    topics: ["推理接口", "采购信号"],
    priority: "P0",
    facts: [
      "虚构的示例工坊在公开示例页留下询价：按月调用批量推理接口，并指定验收样本集 example-set-a。",
    ],
    inferences: ["若这条询价属实，供应方需要同时给出延迟上限和回滚步骤。"],
    analysis: "这是一条合成的 P0 演示。它不预测收入。",
    sourceName: "示例工坊公开说明（虚构）",
    sourceUrl: "https://example.com/demo/workshop-batch-api",
    sourcePublishedAt: {
      raw: "2026-03-02 09:15 Asia/Shanghai",
      year: 2026,
      month: 3,
      day: 2,
      time: "09:15",
      timezone: "Asia/Shanghai",
      certainty: "complete",
    },
    updatedAt: "2026-11-20T09:00:00+08:00",
    coverage: { completeness: "complete", examinedCount: 1, completeCount: 1, warnings: [] },
    status,
    demo: true,
    eligibility: {
      redistributionAllowed: false,
      rightsBasis: "sample-synthetic",
      humanApproved: true,
      sourceValidated: true,
    },
    priorityCase: {
      observation: "示例工坊留下了可核对的询价页面。",
      buyerOrPayer: "虚构的示例工坊采购组",
      paymentSignal: "示例页写明预算已立项",
      need: "按月调用批量推理接口",
      delivery: "给出延迟上限和回滚步骤",
      testPlan: "用 example-set-a 连续调用并记录超时",
      risks: "没有真实合同，不能当成已成交",
      evidenceGaps: [],
    },
    ...patch,
  };
}

function writeInput(dir: string, value: unknown, name = "in.json"): string {
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify(value));
  return file;
}

describe("manual CLI", () => {
  it("does not modify the import source and rejects truncated, unknown, secret, and bad urls", () => {
    const dir = tempDir();
    const input = writeInput(dir, [candidate("approved")]);
    const before = hash(input);
    const out = path.join(dir, "out.json");
    const imported = run(["import", "--input", input, "--out", out, "--write"]);
    expect(imported.code).toBe(0);
    expect(hash(input)).toBe(before);
    expect(existsSync(out)).toBe(true);

    const broken = path.join(dir, "broken.json");
    writeFileSync(broken, "{");
    const brokenOut = path.join(dir, "broken-out.json");
    const truncated = run(["import", "--input", broken, "--out", brokenOut, "--write"]);
    expect(truncated.code).toBe(1);
    expect(truncated.stderr).toContain("malformed-or-truncated-json");
    expect(existsSync(brokenOut)).toBe(false);

    const extra = writeInput(dir, [candidate("approved", { seen: true })], "seen.json");
    expect(run(["import", "--input", extra]).code).toBe(1);

    const secret = writeInput(dir, [candidate("approved", { analysis: "api_key=abcd1234 hidden" })], "secret.json");
    expect(run(["import", "--input", secret]).stderr).toContain("secret-pattern");

    const javascript = writeInput(dir, [candidate("approved", { sourceUrl: "javascript:alert(1)" })], "js.json");
    expect(run(["import", "--input", javascript]).stderr).toContain("bad-url");

    const duplicate = writeInput(dir, [candidate("approved"), candidate("approved")], "dup.json");
    expect(run(["import", "--input", duplicate]).stderr).toContain("duplicate-id:");
  });

  it("exports samples without publishing and rejects unapproved or real-mode samples", () => {
    const dir = tempDir();
    const input = writeInput(dir, [candidate("approved")]);
    const out = path.join(dir, "release.json");
    const exported = run(["export-public", "--input", input, "--sample-only", "--out", out, "--write"]);
    expect(exported.code).toBe(0);
    const release = JSON.parse(readFileSync(out, "utf8")) as {
      publicationConfirmed: boolean;
      items: Array<Record<string, unknown>>;
    };
    expect(release.publicationConfirmed).toBe(false);
    expect(release.items[0]?.status).toBeUndefined();
    expect(JSON.stringify(release)).not.toContain("priorityCase");

    const draft = writeInput(dir, [candidate("draft")], "draft.json");
    expect(run(["export-public", "--input", draft, "--sample-only"]).code).toBe(1);
    expect(run(["export-public", "--input", input, "--out", path.join(dir, "real.json"), "--write"]).code).toBe(1);
    expect(existsSync(path.join(dir, "real.json"))).toBe(false);
  });

  it("keeps review, confirmation, and ledgers from mutating sources or pretending to deploy", () => {
    const dir = tempDir();
    const draft = writeInput(dir, [candidate("draft")]);
    const reviewOut = path.join(dir, "review.json");
    const illegal = run(["review", "--input", draft, "--id", "demo-p0-batch-api", "--to", "published", "--out", reviewOut, "--write"]);
    expect(illegal.code).toBe(1);
    expect(illegal.stderr).toContain("review-cannot-publish");
    expect(existsSync(reviewOut)).toBe(false);

    const preview = run(["review", "--input", draft, "--id", "demo-p0-batch-api", "--to", "review", "--out", reviewOut]);
    expect(preview.code).toBe(0);
    expect(existsSync(reviewOut)).toBe(false);
    expect(preview.stdout).toContain('"status": "review"');

    const approved = writeInput(dir, [candidate("approved")], "approved.json");
    const release = path.join(dir, "release.json");
    expect(run(["export-public", "--input", approved, "--sample-only", "--out", release, "--write"]).code).toBe(0);
    const releaseHash = hash(release);
    const ledger = path.join(dir, "publication.json");
    const confirmed = run([
      "confirm-publication",
      "--input",
      release,
      "--at",
      "2026-11-22T18:00:00+08:00",
      "--ledger-out",
      ledger,
      "--write",
    ]);
    expect(confirmed.code).toBe(0);
    expect(hash(release)).toBe(releaseHash);
    const ledgerJson = JSON.parse(readFileSync(ledger, "utf8")) as { records: Array<{ deployed: boolean }> };
    expect(ledgerJson.records[0]?.deployed).toBe(false);
    expect(JSON.parse(readFileSync(release, "utf8")).publicationConfirmed).toBe(false);

    const publishedOut = path.join(dir, "published.json");
    const refused = run([
      "mark-published",
      "--input",
      approved,
      "--id",
      "demo-p0-batch-api",
      "--deployment-url",
      "https://example.com/demo-deploy",
      "--at",
      "2026-11-22T18:00:00+08:00",
      "--out",
      publishedOut,
      "--write",
    ]);
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain("confirmation-flag-required");
    expect(existsSync(publishedOut)).toBe(false);

    const inside = path.join(process.cwd(), "src/data/fixtures/not-a-real-export.json");
    const blocked = run([
      "mark-published",
      "--input",
      approved,
      "--id",
      "demo-p0-batch-api",
      "--deployment-url",
      "https://example.com/demo-deploy",
      "--at",
      "2026-11-22T18:00:00+08:00",
      "--out",
      inside,
      "--i-confirm-live-deployment",
      "--write",
    ]);
    expect(blocked.code).toBe(1);
    expect(blocked.stderr).toContain("refusing-src-write");
    expect(existsSync(inside)).toBe(false);

    const candidateHash = hash(approved);
    const readLedger = path.join(dir, "read.json");
    const ledgerRun = run([
      "ledger",
      "--kind",
      "read",
      "--id",
      "demo-p0-batch-api",
      "--at",
      "2026-11-22T18:00:00+08:00",
      "--ledger",
      readLedger,
      "--write",
    ]);
    expect(ledgerRun.code).toBe(0);
    expect(hash(approved)).toBe(candidateHash);
    expect(readFileSync(readLedger, "utf8")).not.toContain("seen");
  });
});
