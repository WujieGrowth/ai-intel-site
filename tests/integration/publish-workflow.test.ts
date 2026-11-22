import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const publish = readFileSync(join(root, ".github/workflows/publish.yml"), "utf8");
const checkoutSha = "3d3c42e5aac5ba805825da76410c181273ba90b1";

describe("publish workflow", () => {
  it("collects on a daily schedule and on manual dispatch", () => {
    expect(publish).toContain("0 0 * * *");
    expect(publish).toContain("workflow_dispatch");
    expect(publish).toContain("npm run collect");
  });

  it("does not run for pull requests", () => {
    expect(publish).not.toContain("pull_request_target");
    expect(publish).not.toContain("pull_request");
  });

  it("pins checkout and ignores published-data commits", () => {
    expect(publish).toContain(checkoutSha);
    expect(publish).toContain("paths-ignore");
    expect(publish).toContain("src/data/published/**");
  });

  it("does not schedule the private bridge", () => {
    expect(publish).not.toContain("import-bridge");
    expect(publish).not.toContain("scys");
    expect(publish).toContain("npm run collect");
  });

  it("does not embed model names or token prefixes", () => {
    expect(publish).not.toContain("OPENAI");
    expect(publish).not.toContain("sk-");
    expect(publish).not.toContain("ghp_");
    expect(publish).not.toContain("secrets.");
  });

  it("keeps the previous published files when collect fails", () => {
    expect(publish).not.toContain("git rm");
    expect(publish).not.toContain("git clean");
    expect(publish).not.toMatch(/\brm\b/);
    expect(publish).not.toContain("continue-on-error");
  });
});
