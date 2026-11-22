import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(join(root, ".github/workflows/accept-public.yml"), "utf8");
const publish = readFileSync(join(root, ".github/workflows/publish.yml"), "utf8");
const checkoutSha = "3d3c42e5aac5ba805825da76410c181273ba90b1";

describe("accept-public workflow", () => {
  it("imports a reviewed file from main or a manual dispatch", () => {
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("inbound/verified/**");
    expect(workflow).toContain("accept-verified");
    expect(workflow).toContain(checkoutSha);
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("pull_request");
    expect(workflow).not.toContain("listAiFeedItems");
    expect(workflow).not.toContain("candidateId");
  });

  it("does not add the connector to the daily collector", () => {
    expect(publish).not.toContain("accept-verified");
    expect(publish).not.toContain("import-raw");
    expect(publish).not.toContain("listAiFeedItems");
    expect(publish).toContain("npm run collect");
  });
});
