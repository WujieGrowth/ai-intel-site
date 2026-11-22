import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPublishedLocalCopy,
  buildReleaseCandidate,
  canonicalizeHttpUrl,
  checkEligibility,
  createPublicationLedgerRecord,
  formatSourceDate,
  matchesFilters,
  parseJsonText,
  parsePrivateCandidate,
  parsePublicItem,
  parseSiteMeta,
  transition,
  visibleOnSite,
} from "../../src/contract/index";
import { prepareFixtureItems } from "../../src/data/prepare";
import { getItemById, getLatestItems, getPublishedItems, getSiteMeta } from "../../src/data/public";
import items from "../../src/data/fixtures/public-items.json";
import site from "../../src/data/fixtures/site.json";
import { run } from "../../cli/index";

function publicBase(): Record<string, unknown> {
  return structuredClone(items[0]) as Record<string, unknown>;
}

function sampleCandidate(patch: Record<string, unknown> = {}): Record<string, unknown> {
  const source = publicBase();
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

describe("public fixtures", () => {
  it("accepts every committed fixture and hides retracted items", () => {
    const prepared = prepareFixtureItems(items);
    expect(prepared.ok).toBe(true);
    expect(parseSiteMeta(site).ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.every((item) => visibleOnSite(item) === false)).toBe(true);
    const published = getPublishedItems();
    expect(published.every((item) => item.demo === false && item.status === "published")).toBe(true);
    expect(published.map((item) => item.id).join(" ")).not.toContain("demo-");
    expect(getItemById("demo-retracted-revenue-claim")).toBeUndefined();
    expect(getSiteMeta().paginationAvailable).toBe(false);
    expect(getSiteMeta().latestLimit).toBe(4);
    expect(getLatestItems().length).toBeLessThanOrEqual(4);
  });

  it("rejects unknown nested keys, secrets, xss, and bad urls", () => {
    const extra = publicBase();
    (extra.coverage as Record<string, unknown>).secretNote = "no";
    const extraResult = parsePublicItem(extra);
    expect(extraResult.ok).toBe(false);
    if (!extraResult.ok) {
      expect(extraResult.errors.join(" ")).toContain("unknown-key:$.coverage.secretNote");
    }

    const seen = publicBase();
    seen.seen = true;
    const seenResult = parsePublicItem(seen);
    expect(seenResult.ok).toBe(false);
    if (!seenResult.ok) expect(seenResult.errors.some((error) => error.startsWith("forbidden-key:"))).toBe(true);

    const script = publicBase();
    script.title = "<script>alert(1)</script>";
    const scriptResult = parsePublicItem(script);
    expect(scriptResult.ok).toBe(false);
    if (!scriptResult.ok) {
      expect(scriptResult.errors.some((error) => error.includes("xss-script"))).toBe(true);
    }

    const key = publicBase();
    key.analysis = "AKIAIOSFODNN7EXAMPLE leaked";
    expect(parsePublicItem(key).ok).toBe(false);

    const assigned = publicBase();
    assigned.facts = ["api_key=abcd1234 should never ship"];
    expect(parsePublicItem(assigned).ok).toBe(false);

    const javascriptUrl = publicBase();
    javascriptUrl.sourceUrl = "javascript:alert(1)";
    const urlResult = parsePublicItem(javascriptUrl);
    expect(urlResult.ok).toBe(false);
    if (!urlResult.ok) expect(urlResult.errors).toContain("bad-url:$.sourceUrl");

    const dataUrl = publicBase();
    dataUrl.sourceUrl = "data:text/html,hi";
    expect(parsePublicItem(dataUrl).ok).toBe(false);
  });

  it("does not invent a missing year and rejects inconsistent dates", () => {
    const undated = parsePublicItem(items.find((item) => item.id === "demo-p2-undated-release"));
    const missingYear = parsePublicItem(items.find((item) => item.id === "demo-p2-forum-note"));
    expect(undated.ok).toBe(true);
    expect(missingYear.ok).toBe(true);
    if (!undated.ok || !missingYear.ok) return;
    const undatedText = formatSourceDate(undated.value.sourcePublishedAt);
    const missingText = formatSourceDate(missingYear.value.sourcePublishedAt);
    expect(undatedText).toBe("来源未提供时间（未知，未推测）");
    expect(missingText).toContain("缺少年份，未补全");
    expect(undatedText).not.toMatch(/\d{4}/);
    expect(missingText).not.toMatch(/\d{4}/);

    const invented = structuredClone(undated.value) as unknown as Record<string, unknown>;
    const date = invented.sourcePublishedAt as Record<string, unknown>;
    date.year = 2026;
    expect(parsePublicItem(invented).ok).toBe(false);
  });

  it("rejects a complete claim when only 29 of 50 records are complete", () => {
    const partial = publicBase();
    partial.coverage = {
      completeness: "complete",
      examinedCount: 50,
      completeCount: 29,
      warnings: [],
    };
    const wrong = parsePublicItem(partial);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.errors.some((error) => error.startsWith("coverage-inconsistent"))).toBe(true);

    const honest = publicBase();
    honest.coverage = {
      completeness: "partial",
      examinedCount: 50,
      completeCount: 29,
      warnings: ["只有 29 条有完整来源，不能写成全量 50。"],
    };
    expect(parsePublicItem(honest).ok).toBe(true);
  });

  it("rejects duplicate ids and urls", () => {
    const copy = structuredClone(items[0]) as Record<string, unknown>;
    copy.id = "demo-copy-item";
    const result = prepareFixtureItems([...items, copy]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.startsWith("duplicate-url:"))).toBe(true);
  });
});

describe("dates and filters", () => {
  it("canonicalizes host case and trailing slashes without adding a scheme", () => {
    expect(canonicalizeHttpUrl("https://EXAMPLE.com/demo/a/")).toBe("https://example.com/demo/a");
    expect(canonicalizeHttpUrl("not a url")).toBe("not a url");
  });

  it("combines topic and priority with AND", () => {
    const card = { priority: "P1", topics: ["评测方法", "开发者工具"] };
    expect(matchesFilters(card, { topic: "评测方法", priority: "P1" })).toBe(true);
    expect(matchesFilters(card, { topic: "评测方法", priority: "P0" })).toBe(false);
    expect(matchesFilters(card, { topic: "模型发布", priority: "all" })).toBe(false);
    expect(matchesFilters(card, { topic: "all", priority: "all" })).toBe(true);
  });
});

describe("private gate", () => {
  it("blocks illegal status transitions", () => {
    expect(transition("draft", "review").ok).toBe(true);
    expect(transition("review", "approved").ok).toBe(true);
    expect(transition("approved", "published").ok).toBe(true);
    expect(transition("published", "retracted").ok).toBe(true);
    for (const [from, to] of [
      ["draft", "published"],
      ["draft", "approved"],
      ["review", "published"],
      ["approved", "review"],
      ["retracted", "published"],
      ["published", "approved"],
    ] as const) {
      const result = transition(from, to);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors).toContain(`bad-transition:${from}->${to}`);
    }
  });

  it("does not treat a summary as redistribution permission", () => {
    const raw = sampleCandidate({
      analysis: "请广泛转载这篇原始摘要。",
      eligibility: {
        redistributionAllowed: false,
        rightsBasis: "unverified",
        humanApproved: false,
        sourceValidated: false,
      },
    });
    const parsed = parsePrivateCandidate(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const real = checkEligibility(parsed.value, "real");
    const sample = checkEligibility(parsed.value, "sample");
    expect(real.ok).toBe(false);
    expect(sample.ok).toBe(false);
  });

  it("exports samples without marking them published", () => {
    const parsed = parsePrivateCandidate(sampleCandidate());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const exported = buildReleaseCandidate([parsed.value], "sample");
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.value.publicationConfirmed).toBe(false);
    expect(exported.value.sampleOnly).toBe(true);
    expect(Object.hasOwn(exported.value.items[0], "status")).toBe(false);
    expect(Object.hasOwn(exported.value.items[0], "eligibility")).toBe(false);
    expect(JSON.stringify(exported.value)).not.toContain("memberText");
    expect(JSON.stringify(exported.value)).not.toContain("priorityCase");
    const real = buildReleaseCandidate([parsed.value], "real");
    expect(real.ok).toBe(false);

    const draft = parsePrivateCandidate(sampleCandidate({ status: "draft" }));
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(buildReleaseCandidate([draft.value], "sample").ok).toBe(false);
  });

  it("keeps publication ledger deployed false and refuses non-https confirmation", () => {
    const parsed = parsePrivateCandidate(sampleCandidate());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const ledger = createPublicationLedgerRecord({
      id: parsed.value.id,
      recordedAt: "2026-11-22T18:00:00+08:00",
      deploymentUrl: null,
      state: "awaiting-deployment",
    });
    expect(ledger.ok).toBe(true);
    if (!ledger.ok) return;
    expect(ledger.value.deployed).toBe(false);

    expect(buildPublishedLocalCopy(parsed.value, "http://example.com/demo").ok).toBe(false);
    const copy = buildPublishedLocalCopy(parsed.value, "https://example.com/demo-deploy");
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;
    expect(copy.value.status).toBe("published");
    expect(copy.value.publication.note).toContain("命令未访问网络");
  });

  it("rejects weak P0 evidence and commercial P2 labels", () => {
    const missingBuyer = sampleCandidate({
      priorityCase: {
        observation: "示例工坊留下了可核对的询价页面。",
        buyerOrPayer: null,
        paymentSignal: "示例页写明预算已立项",
        need: "按月调用批量推理接口",
        delivery: "给出延迟上限和回滚步骤",
        testPlan: "用 example-set-a 连续调用并记录超时",
        risks: "没有真实合同，不能当成已成交",
        evidenceGaps: [],
      },
    });
    expect(parsePrivateCandidate(missingBuyer).ok).toBe(false);

    const p2 = sampleCandidate({
      priority: "P2",
      priorityCase: {
        observation: "论坛里只有一句感觉变快了。",
        buyerOrPayer: "虚构的示例工坊采购组",
        paymentSignal: null,
        need: null,
        delivery: null,
        testPlan: null,
        risks: null,
        evidenceGaps: ["没有命令、样本或批次。"],
      },
    });
    const parsed = parsePrivateCandidate(p2);
    expect(parsed.ok).toBe(false);
  });
});

describe("malformed input and cli defaults", () => {
  it("rejects truncated json", () => {
    expect(parseJsonText("").ok).toBe(false);
    expect(parseJsonText("{").ok).toBe(false);
    expect(parseJsonText('{"id": ').ok).toBe(false);
  });

  it("prints help and does not treat unknown commands as success", () => {
    const help = run(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("示界 CLI");
    expect(help.stdout).toContain("没有 --write");
    expect(help.stdout).toContain("deployed 恒为 false");
    expect(run([]).code).toBe(0);
    const unknown = run(["publish-now"]);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("未知命令");
  });

  it("does not contain a live deployment flag in the contract source", () => {
    const source = readFileSync(new URL("../../src/contract/flow.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/deployed\s*:\s*true/);
  });
});
