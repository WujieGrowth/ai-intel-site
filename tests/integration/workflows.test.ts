import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COVERAGE_KEYS,
  PUBLICATION_KEYS,
  PUBLIC_ITEM_KEYS,
  SOURCE_DATE_KEYS,
} from "../../src/contract/index";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const checkoutSha = "3d3c42e5aac5ba805825da76410c181273ba90b1";

const allowedKeys = new Set<string>([
  ...PUBLIC_ITEM_KEYS,
  ...SOURCE_DATE_KEYS,
  ...COVERAGE_KEYS,
  ...PUBLICATION_KEYS,
]);

const forbiddenKeys = new Set<string>(["memberText", "seen", "oauth", "apiKey"]);

function readWorkflow(name: string): string {
  return readFileSync(join(root, ".github/workflows", name), "utf8");
}

function permissionsBlock(yaml: string): string {
  const match = yaml.match(/^permissions:\n((?:[ \t].*\n?)*)/m);
  return match?.[1] ?? "";
}

function collectObjectKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, found);
    return found;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, nested] of Object.entries(value)) {
      found.push(key);
      collectObjectKeys(nested, found);
    }
  }
  return found;
}

describe("workflow files", () => {
  const ci = readWorkflow("ci.yml");
  const pages = readWorkflow("pages.yml");

  it("runs the public verification commands on pull requests and main", () => {
    expect(ci).toContain(checkoutSha);
    expect(ci).toContain("npm ci");
    expect(ci).toContain("npm run check");
    expect(ci).toContain("npm test");
    expect(ci).toContain("npm run build");
    expect(ci).toContain("SCAN_REQUIRE_DIST");
    expect(ci).toContain("smoke:base");
    expect(ci).toContain("pull_request");
    expect(ci).toContain("branches: [main]");
  });

  it("keeps CI permissions read-only", () => {
    const permissions = permissionsBlock(ci);
    expect(permissions).toContain("contents: read");
    expect(permissions).not.toMatch(/\bwrite\b/);
    expect(permissions).not.toContain("id-token");
  });

  it("publishes pages only from a manual dispatch", () => {
    expect(pages).toContain("workflow_dispatch");
    expect(pages).toContain(checkoutSha);
    expect(pages).not.toContain("pull_request");
    expect(pages).not.toContain("push:");
  });

  it("does not call model APIs or embed token prefixes", () => {
    for (const workflow of [ci, pages]) {
      expect(workflow).not.toContain("OPENAI");
      expect(workflow).not.toContain("ANTHROPIC");
      expect(workflow).not.toContain("sk-");
      expect(workflow).not.toContain("ghp_");
      expect(workflow).not.toContain("api.openai.com");
    }
  });
});

describe("public fixture keys", () => {
  it("uses only the public item fields and nested source, coverage, and publication keys", () => {
    const items = JSON.parse(
      readFileSync(join(root, "src/data/fixtures/public-items.json"), "utf8"),
    ) as unknown;
    const keys = collectObjectKeys(items);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(allowedKeys.has(key), key).toBe(true);
      expect(forbiddenKeys.has(key), key).toBe(false);
    }
  });
});
