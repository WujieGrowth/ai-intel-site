import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const FORBIDDEN_DIRS = ["src", "public", "tests", "dist", ".github"] as const;

export type RunResult = { code: number; stdout: string; stderr: string };

export function invalid(errors: readonly string[]): RunResult {
  return { code: 1, stdout: "", stderr: `${errors.join("\n")}\n` };
}

export function usage(errors: readonly string[]): RunResult {
  return { code: 2, stdout: "", stderr: `${errors.join("\n")}\n` };
}

export function okOut(value: unknown): RunResult {
  return { code: 0, stdout: serialize(value), stderr: "" };
}

export function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function systemCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "unknown";
}

export function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  if (relative === "") return true;
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function resolveFinal(target: string): string {
  const absolute = path.resolve(target);
  const pending: string[] = [];
  let cursor = absolute;
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    pending.push(path.basename(cursor));
    cursor = parent;
  }
  let resolved = existsSync(cursor) ? realpathSync(cursor) : cursor;
  for (const part of pending.reverse()) resolved = path.join(resolved, part);
  return resolved;
}

function existingReal(dir: string): string {
  return existsSync(dir) ? realpathSync(dir) : dir;
}

/**
 * Writes are limited to this repo's private/ directory or the process temp
 * directory. Paths that land in src, public, tests, dist, or .github are refused.
 */
export function checkWritable(target: string): { ok: true; path: string } | { ok: false; errors: string[] } {
  const resolved = resolveFinal(target);
  if (existsSync(resolved)) {
    try {
      if (statSync(resolved).isDirectory()) return { ok: false, errors: ["refused-path:directory"] };
    } catch (error) {
      return { ok: false, errors: [`read-failed:${systemCode(error)}`] };
    }
  }
  const root = existingReal(REPO_ROOT);
  for (const name of FORBIDDEN_DIRS) {
    if (isInside(resolved, path.join(root, name))) {
      return { ok: false, errors: [name === "src" ? "refusing-src-write" : `refused-path:${name}`] };
    }
  }
  const privateDir = path.join(root, "private");
  if (isInside(resolved, privateDir) || isInside(resolved, existingReal(os.tmpdir()))) {
    return { ok: true, path: resolved };
  }
  return { ok: false, errors: ["refused-path"] };
}

export function readHashed(
  file: string,
): { ok: true; text: string; hash: string } | { ok: false; result: RunResult } {
  if (!existsSync(file)) return { ok: false, result: usage(["missing-file"]) };
  try {
    const bytes = readFileSync(file);
    return { ok: true, text: bytes.toString("utf8"), hash: sha256(bytes) };
  } catch (error) {
    return { ok: false, result: invalid([`read-failed:${systemCode(error)}`]) };
  }
}

export function assertUnchanged(file: string, hash: string): RunResult | null {
  const again = readHashed(file);
  if (!again.ok) return again.result;
  if (again.hash !== hash) return invalid(["input-changed"]);
  return null;
}

export function writeJson(target: string, value: unknown): RunResult | null {
  const allowed = checkWritable(target);
  if (!allowed.ok) return invalid(allowed.errors);
  try {
    writeFileSync(allowed.path, serialize(value), { encoding: "utf8", flag: "w" });
    return null;
  } catch (error) {
    return invalid([`write-failed:${systemCode(error)}`]);
  }
}
