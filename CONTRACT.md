# Shared contract

This file is frozen during the five worktree streams. Do not edit it in a feature branch.

`src/contract/` is the only rule set. Public pages, the loader, and the CLI must call these functions instead of reimplementing them.

## Visibility

A published item is visible only when `visibleOnSite` is true: `demo === false`, `status === "published"`, and `publication.confirmed === true`. Synthetic fixtures stay in `src/data/fixtures/` and are not the live feed. Retracted ids must not appear in `dist/`.

`LATEST_FEED_LIMIT` is 4. `paginationAvailable` is false. Search and RSS read the same visible items. RSS `pubDate` uses a complete source time, or is omitted.

Scheduled collectors are arXiv and NIST only. The 生财 private bridge is a local file adapter, not a fetch, and it is not scheduled. arXiv and NIST rows do not stand in for that bridge.

## Dates

Never fill a missing year, time, or timezone. `formatSourceDate` is the only display formatter for source time.

## Publication

`buildReleaseCandidate` sets `publicationConfirmed` to false and does not add `status`. `createPublicationLedgerRecord` sets `deployed` to false. There is no code path that sets `deployed: true`. `buildPublishedLocalCopy` only builds an object; it does not contact the network and must not write into `src/`.

## File ownership

Frozen:

- `package.json`, `package-lock.json`, `tsconfig.json`, `astro.config.mjs`, `vitest.config.ts`, `.gitignore`, `.nvmrc`, `LICENSE`, `README.md`, `CONTRACT.md`
- `src/contract/**`, `src/env.d.ts`, `src/data/public.ts`, `src/data/fixtures/**`, `src/lib/paths.ts`
- `tests/unit/baseline.test.ts`, `tests/integration/loader.test.ts`
- `scripts/scan-static.mjs`, `scripts/smoke-base-path.mjs`

`cursor/site-shell-0f95`:

- `src/styles/tokens.css`, `src/styles/global.css`, `src/layouts/BaseLayout.astro`, `public/favicon.svg`
- new files under `src/components/chrome/**`
- `evidence/site-shell.json`

`cursor/data-schema-0f95`:

- `src/data/prepare.ts`, `src/data/normalize.ts`, `src/data/dedup.ts`
- `tests/unit/normalize.test.ts`, `tests/unit/dedup.test.ts`
- `evidence/data-schema.json`

`cursor/import-cli-0f95`:

- `cli/**`
- `tests/unit/cli/**`, `tests/fixtures/cli/**`
- `evidence/import-cli.json`

`cursor/pages-ui-0f95`:

- `src/pages/**`, `src/components/feed/**`, `src/styles/pages.css`, `src/scripts/filter-ui.ts`
- `tests/unit/filter-ui.test.ts`
- `evidence/pages-ui.json`

`cursor/ci-docs-0f95`:

- `.github/workflows/ci.yml`, `.github/workflows/pages.yml`
- `tests/integration/workflows.test.ts`
- `evidence/ci-docs.json`

Do not run `npm install`. `npm ci` is allowed and must not change the lockfile. Do not push. Do not merge. Do not edit another worktree.

## Stable copy

Production pages (`site.demo === false`) must not call the live feed synthetic demo data. The demo sentence stays inside `DemoBanner.astro` and is rendered only when `site.demo` is true.

- `演示数据 · 非实时情报 · 不预测收入` (demo banner component only)
- `跳到主要内容`
- `没有同时符合当前主题与优先级的示例。`
- `已核事实`, `推断`, `原分析`
- `来源未提供时间（未知，未推测）`
- `生财AI情报未接入`

## CLI

Keep `run(argv)` and the help phrases `示界 CLI`, `没有 --write`, and `deployed 恒为 false`. Unknown commands exit 2 with `未知命令`. Without `--write`, do not create or modify files. Never write under `src/`. Do not add `fetch`.

## DOM hooks

`[data-filter-root]`, `[data-topic]`, `[data-priority]`, `[data-card]`, `[data-topics]`, `[data-empty]`, `[data-count]`. Topic and priority filters use `matchesFilters`. Do not import fixture JSON from a client script. Do not use `set:html`.
