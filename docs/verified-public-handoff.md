# 已核实公开原文的数据交接

这个文件只描述数据。私人连接器留在仓库外的主机上，按工作日白天的节奏整理候选。GitHub Actions 不调用它，也不保存会员正文、会员摘要或 `candidateId`。

本仓库接受的是已经单独核实过的公开原文。校验通过后，只把一个 JSON 文件提交到 `main` 的 `inbound/verified/`。现有的 `accept-public` 工作流会导入并部署。

## 路径

- 仓库：`https://github.com/WujieGrowth/ai-intel-site`
- 分支：`main`
- 文件：`inbound/verified/<名字>.json`
- 文件名：`^[a-z0-9][a-z0-9.-]{0,60}\.json$`

## 允许的 JSON

顶层只能有 `kind`、`schemaVersion`、`items`。

每条只能有这些键：`evidenceUrl`、`title`、`facts`、`sourceLabel`、`discoveredVia`、`verified`、`endorsement`、`sourcePublishedAt`。

`sourcePublishedAt` 只能有：`raw`、`year`、`month`、`day`、`time`、`timezone`、`certainty`。

固定值：

- `kind` 是 `verified-public-origins`
- `schemaVersion` 是 `1`
- `discoveredVia` 是 `scys-private-bridge`
- `verified` 是 `true`
- `endorsement` 是 `false`
- `evidenceUrl` 目前只接受 `https://x.com/<账号>/status/<数字>` 或 `https://blog.google/` 下至少两级路径

出现 `candidateId`、`summary`、`detail`、`opportunity`、`signals`、`tag`、`publishedAt`、`memberSummary` 或其他未列出的键时，整份文件拒绝。

## 时间

`certainty` 只允许 `complete`、`date-only`、`year-missing`、`time-unknown`、`unknown`。

- `complete`：年月日、`HH:mm`、时区都有。时区是 `Z`、`UTC` 或 `+08:00` 这种形式。
- `date-only`：有年月日，`time` 和 `timezone` 都是 `null`。
- `year-missing`：`year` 是 `null`，同时 `raw`、月或日至少有一个。
- `time-unknown`：有年月日，`time` 是 `null`。
- `unknown`：年月日、时刻、时区都是 `null`。

连接器里的 `MM-DD HH:mm` 没有年份，不能写成公开日期。不要补年份，也不要把未知时刻写成 `00:00`。

`title` 4 到 180 字。`facts` 1 到 4 条，每条至少 4 字。`sourceLabel` 2 到 80 字。单文件最多 20 条，文件不超过 64 KB。

## 和已有记录比较

比较前把网址规范成：`https`、主机小写、去掉 `utm_*` 和常见跟踪参数、去掉路径末尾斜杠。片段里的小节编号保留，例如 `#note-one`。

`deepmind.google` 和 `blog.google` 是不同网址，不能因为都提到 Google 就合成一条。

如果规范后的 `evidenceUrl` 已经出现在 `src/data/published/items.json` 或任一 `inbound/verified/*.json` 的 `sourceUrl` / `evidenceUrl` 里，就不要再提交这一条。全部都已存在时，不要做空提交。

## 命令

只校验，不写站点：

```bash
npm run accept-verified -- --input inbound/verified/2026-11-22.json --at 2026-11-22T12:00:00Z
```

`--at` 是接收时间，格式 `YYYY-MM-DDTHH:mm:ssZ`。它不是来源时间。

未来的数据交接只新增 `inbound/verified/` 下的文件，然后 `git push origin main`。不要改采集代码，不要调用生财接口，也不要把会员原文写进仓库。
