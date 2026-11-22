import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import items from "../../../src/data/fixtures/public-items.json";
import { run } from "../../../cli/index";

const AT = "2026-11-22T18:00:00+08:00";
const ID = "demo-p0-batch-api";
const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

function sampleCandidate(patch: Record<string, unknown> = {}): Record<string, unknown> {
  const source = structuredClone(items[0]) as Record<string, unknown>;
  delete source.publication;
  return {
    ...source,
    status: "approved",
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

async function withDir(check: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "import-cli-"));
  try {
    await check(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeJson(dir: string, name: string, value: unknown): Promise<string> {
  const file = path.join(dir, name);
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

async function expectMissing(file: string): Promise<void> {
  await expect(access(file)).rejects.toThrow();
}

function sha(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      found.add(key);
      keysOf(child, found);
    }
  }
  return found;
}

describe("import", () => {
  it("does not modify the source file", async () => {
    await withDir(async (dir) => {
      const input = await writeJson(dir, "candidates.json", [
        sampleCandidate({ sourceUrl: "https://EXAMPLE.com/demo/workshop-batch-api/" }),
      ]);
      const out = path.join(dir, "imported.json");
      const before = await readFile(input);
      const preview = run(["import", "--input", input, "--out", out]);
      expect(preview.code).toBe(0);
      expect(preview.stderr).toBe("");
      const summary = JSON.parse(preview.stdout) as { ok: boolean; command: string; count: number; ids: string[] };
      expect(summary).toEqual({ ok: true, command: "import", count: 1, ids: [ID] });
      expect(sha(await readFile(input))).toBe(sha(before));
      await expectMissing(out);

      const written = run(["import", "--input", input, "--out", out, "--write"]);
      expect(written.code).toBe(0);
      expect(sha(await readFile(input))).toBe(sha(before));
      const normalized = JSON.parse(await readFile(out, "utf8")) as Array<Record<string, unknown>>;
      expect(normalized).toHaveLength(1);
      expect(normalized[0]?.status).toBe("approved");
      expect(normalized[0]?.sourceUrl).toBe("https://example.com/demo/workshop-batch-api");
      const keys = keysOf(normalized);
      expect(keys.has("seen")).toBe(false);
      expect(keys.has("readAt")).toBe(false);
      expect(keys.has("sentAt")).toBe(false);
    });
  });

  it("rejects truncated json and writes nothing", async () => {
    await withDir(async (dir) => {
      const input = path.join(dir, "truncated.json");
      await writeFile(input, '[{"id": ');
      const out = path.join(dir, "imported.json");
      const before = await readFile(input);
      const result = run(["import", "--input", input, "--out", out, "--write"]);
      expect(result.code).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("malformed-or-truncated-json");
      expect(sha(await readFile(input))).toBe(sha(before));
      await expectMissing(out);
    });
  });

  it("rejects an unknown nested key", async () => {
    await withDir(async (dir) => {
      const raw = sampleCandidate();
      (raw.coverage as Record<string, unknown>).secretNote = "no";
      const input = await writeJson(dir, "candidates.json", [raw]);
      const out = path.join(dir, "imported.json");
      const result = run(["import", "--input", input, "--out", out, "--write"]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("unknown-key:$.coverage.secretNote");
      await expectMissing(out);
    });
  });

  it("rejects a credential pattern", async () => {
    await withDir(async (dir) => {
      const input = await writeJson(dir, "candidates.json", [
        sampleCandidate({ facts: ["api_key=abcd1234 should never ship"] }),
      ]);
      const out = path.join(dir, "imported.json");
      const result = run(["import", "--input", input, "--out", out, "--write"]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("secret-pattern");
      await expectMissing(out);
    });
  });

  it("rejects a javascript url", async () => {
    await withDir(async (dir) => {
      const input = await writeJson(dir, "candidates.json", [
        sampleCandidate({ sourceUrl: "javascript:alert(1)" }),
      ]);
      const out = path.join(dir, "imported.json");
      const result = run(["import", "--input", input, "--out", out, "--write"]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("bad-url:$.sourceUrl");
      expect(result.stderr).toContain("javascript");
      await expectMissing(out);
    });
  });

  it("rejects a duplicate id and writes nothing", async () => {
    await withDir(async (dir) => {
      const input = await writeJson(dir, "candidates.json", [
        sampleCandidate(),
        sampleCandidate({ sourceUrl: "https://example.com/demo/workshop-batch-api-copy" }),
      ]);
      const out = path.join(dir, "imported.json");
      const result = run(["import", "--input", input, "--out", out, "--write"]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(`duplicate-id:${ID}`);
      await expectMissing(out);
    });
  });
});

describe("export-public", () => {
  it("rejects unapproved and draft sample exports", async () => {
    await withDir(async (dir) => {
      for (const status of ["draft", "review"]) {
        const input = await writeJson(dir, `${status}.json`, [sampleCandidate({ status })]);
        const out = path.join(dir, `${status}-release.json`);
        const result = run(["export-public", "--input", input, "--sample-only", "--out", out, "--write"]);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("not-approved");
        await expectMissing(out);
      }
    });
  });

  it("exports a sample with publicationConfirmed false and no status field", async () => {
    await withDir(async (dir) => {
      const input = await writeJson(dir, "approved.json", [sampleCandidate()]);
      const out = path.join(dir, "release.json");
      const result = run(["export-public", "--input", input, "--sample-only", "--out", out, "--write"]);
      expect(result.code).toBe(0);
      const release = JSON.parse(result.stdout) as {
        publicationConfirmed: boolean;
        sampleOnly: boolean;
        items: Array<Record<string, unknown>>;
      };
      expect(release.publicationConfirmed).toBe(false);
      expect(release.sampleOnly).toBe(true);
      expect(Object.hasOwn(release.items[0] ?? {}, "status")).toBe(false);
      expect(Object.hasOwn(release.items[0] ?? {}, "eligibility")).toBe(false);
      expect(JSON.stringify(release)).not.toContain("priorityCase");
      const stored = JSON.parse(await readFile(out, "utf8")) as typeof release;
      expect(stored.publicationConfirmed).toBe(false);
      expect(Object.hasOwn(stored.items[0] ?? {}, "status")).toBe(false);
    });
  });

  it("rejects a real export of a sample-synthetic record", async () => {
    await withDir(async (dir) => {
      const input = await writeJson(dir, "approved.json", [sampleCandidate()]);
      const out = path.join(dir, "release.json");
      const result = run(["export-public", "--input", input, "--out", out, "--write"]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("real-requires-owner-authorization");
      await expectMissing(out);
    });
  });
});

describe("review", () => {
  it("rejects draft to published", async () => {
    await withDir(async (dir) => {
      const input = await writeJson(dir, "draft.json", [sampleCandidate({ status: "draft" })]);
      const out = path.join(dir, "reviewed.json");
      const before = await readFile(input);
      const result = run([
        "review",
        "--input",
        input,
        "--id",
        ID,
        "--to",
        "published",
        "--out",
        out,
        "--write",
      ]);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("bad-transition:draft->published");
      expect(result.stderr).toContain("review-cannot-publish");
      expect(sha(await readFile(input))).toBe(sha(before));
      await expectMissing(out);
    });
  });

  it("moves draft to review without --write and does not create a file", async () => {
    await withDir(async (dir) => {
      const input = await writeJson(dir, "draft.json", [sampleCandidate({ status: "draft" })]);
      const out = path.join(dir, "reviewed.json");
      const before = await readFile(input);
      const result = run(["review", "--input", input, "--id", ID, "--to", "review", "--out", out]);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      const body = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
      expect(body[0]?.status).toBe("review");
      expect(body[0]?.id).toBe(ID);
      await expectMissing(out);
      expect(sha(await readFile(input))).toBe(sha(before));
      const stored = JSON.parse(before.toString()) as Array<Record<string, unknown>>;
      expect(stored[0]?.status).toBe("draft");
    });
  });
});

describe("confirm-publication", () => {
  it("does not change the release file and keeps ledger deployed false", async () => {
    await withDir(async (dir) => {
      const input = await writeJson(dir, "approved.json", [sampleCandidate()]);
      const release = path.join(dir, "release.json");
      const exported = run([
        "export-public",
        "--input",
        input,
        "--sample-only",
        "--out",
        release,
        "--write",
      ]);
      expect(exported.code).toBe(0);
      const before = await readFile(release);
      const preview = run(["confirm-publication", "--input", release, "--at", AT]);
      expect(preview.code).toBe(0);
      expect(sha(await readFile(release))).toBe(sha(before));
      const previewLedger = JSON.parse(preview.stdout) as {
        kind: string;
        records: Array<{ deployed: boolean; state: string; deploymentUrl: string | null; id: string }>;
      };
      expect(previewLedger.kind).toBe("publication-ledger");
      expect(previewLedger.records[0]?.deployed).toBe(false);
      expect(previewLedger.records[0]?.state).toBe("awaiting-deployment");
      expect(previewLedger.records[0]?.deploymentUrl).toBeNull();
      expect(previewLedger.records[0]?.id).toBe(ID);

      const ledger = path.join(dir, "ledger.json");
      const written = run([
        "confirm-publication",
        "--input",
        release,
        "--ledger-out",
        ledger,
        "--at",
        AT,
        "--write",
      ]);
      expect(written.code).toBe(0);
      expect(sha(await readFile(release))).toBe(sha(before));
      const stored = JSON.parse(await readFile(ledger, "utf8")) as typeof previewLedger;
      expect(stored.records.every((record) => record.deployed === false)).toBe(true);
      expect(JSON.stringify(stored)).not.toContain('"status"');
    });
  });
});

describe("mark-published", () => {
  it("does not create --out without the confirmation flag", async () => {
    await withDir(async (dir) => {
      const input = await writeJson(dir, "approved.json", [sampleCandidate()]);
      const out = path.join(dir, "public-item.json");
      const result = run([
        "mark-published",
        "--input",
        input,
        "--id",
        ID,
        "--deployment-url",
        "https://example.com/demo-deploy",
        "--out",
        out,
        "--at",
        AT,
        "--write",
      ]);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("confirmation-flag-required");
      await expectMissing(out);
    });
  });

  it("refuses an out path under src/", async () => {
    await withDir(async (dir) => {
      const input = await writeJson(dir, "approved.json", [sampleCandidate()]);
      const out = path.join(repoRoot, "src", "data", "cli-mark-published-refused.json");
      try {
        const result = run([
          "mark-published",
          "--input",
          input,
          "--id",
          ID,
          "--deployment-url",
          "https://example.com/demo-deploy",
          "--out",
          out,
          "--at",
          AT,
          "--i-confirm-live-deployment",
          "--write",
        ]);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain("refusing-src-write");
        await expectMissing(out);
      } finally {
        await rm(out, { force: true });
      }
    });
  });

  it("writes one local public copy only to an allowed path", async () => {
    await withDir(async (dir) => {
      const input = await writeJson(dir, "approved.json", [sampleCandidate()]);
      const before = await readFile(input);
      const out = path.join(dir, "public-item.json");
      const result = run([
        "mark-published",
        "--input",
        input,
        "--id",
        ID,
        "--deployment-url",
        "https://example.com/demo-deploy",
        "--out",
        out,
        "--at",
        AT,
        "--i-confirm-live-deployment",
        "--write",
      ]);
      expect(result.code).toBe(0);
      expect(sha(await readFile(input))).toBe(sha(before));
      const item = JSON.parse(await readFile(out, "utf8")) as Record<string, unknown>;
      expect(item.status).toBe("published");
      expect(item.id).toBe(ID);
      expect(Object.hasOwn(item, "deployed")).toBe(false);
      const publication = item.publication as { note?: string };
      expect(publication.note).toContain("命令未访问网络");
    });
  });
});

describe("retract", () => {
  it("retracts only a published candidate", async () => {
    await withDir(async (dir) => {
      const approved = await writeJson(dir, "approved.json", [sampleCandidate()]);
      const refused = path.join(dir, "refused.json");
      const blocked = run(["retract", "--input", approved, "--id", ID, "--out", refused, "--write"]);
      expect(blocked.code).toBe(1);
      expect(blocked.stderr).toContain("bad-transition:approved->retracted");
      await expectMissing(refused);

      const published = await writeJson(dir, "published.json", [sampleCandidate({ status: "published" })]);
      const out = path.join(dir, "retracted.json");
      const result = run(["retract", "--input", published, "--id", ID, "--out", out, "--write"]);
      expect(result.code).toBe(0);
      const body = JSON.parse(await readFile(out, "utf8")) as Array<Record<string, unknown>>;
      expect(body[0]?.status).toBe("retracted");
      expect(body).toHaveLength(1);
    });
  });
});

describe("ledger", () => {
  it("reads without adding seen to the candidate", async () => {
    await withDir(async (dir) => {
      const candidate = await writeJson(dir, "candidates.json", [sampleCandidate()]);
      const before = await readFile(candidate);
      const ledger = path.join(dir, "read-ledger.json");
      const result = run([
        "ledger",
        "--kind",
        "read",
        "--id",
        ID,
        "--at",
        AT,
        "--ledger",
        ledger,
        "--write",
      ]);
      expect(result.code).toBe(0);
      expect(sha(await readFile(candidate))).toBe(sha(before));
      const storedCandidate = JSON.parse(before.toString()) as unknown;
      expect(keysOf(storedCandidate).has("seen")).toBe(false);
      const storedLedger = JSON.parse(await readFile(ledger, "utf8")) as {
        kind: string;
        records: Array<Record<string, unknown>>;
      };
      expect(storedLedger).toEqual({ kind: "read-ledger", records: [{ id: ID, readAt: AT }] });
      expect(Object.hasOwn(storedLedger.records[0] ?? {}, "seen")).toBe(false);
    });
  });

  it("rejects a publication ledger kind", async () => {
    await withDir(async (dir) => {
      const ledger = path.join(dir, "publication.json");
      const result = run([
        "ledger",
        "--kind",
        "publication",
        "--id",
        ID,
        "--at",
        AT,
        "--ledger",
        ledger,
        "--write",
      ]);
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("use-confirm-publication");
      await expectMissing(ledger);
    });
  });

  it("requires a channel before recording sent", async () => {
    await withDir(async () => {
      const missing = run(["ledger", "--kind", "sent", "--id", ID, "--at", AT]);
      expect(missing.code).toBe(2);
      expect(missing.stderr).toContain("missing-flag:--channel");
      const result = run(["ledger", "--kind", "sent", "--id", ID, "--at", AT, "--channel", "demo-list"]);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        kind: "sent-ledger",
        records: [{ id: ID, sentAt: AT, channel: "demo-list" }],
      });
    });
  });
});

describe("usage", () => {
  it("rejects unknown flags and --write without an output path", async () => {
    await withDir(async (dir) => {
      const input = await writeJson(dir, "candidates.json", [sampleCandidate()]);
      const unknown = run(["import", "--input", input, "--force"]);
      expect(unknown.code).toBe(2);
      expect(unknown.stderr).toContain("unknown-flag:--force");
      const missingOut = run(["import", "--input", input, "--write"]);
      expect(missingOut.code).toBe(2);
      expect(missingOut.stderr).toContain("write-requires-output");
    });
  });
});
