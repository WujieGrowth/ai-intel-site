# 示界

示界是一个静态站点。定时公开采集目前只有两类已经核对过许可的来源：

- **arXiv**：描述性元数据（标题、作者、分类、标识和摘要页链接）。不保存摘要正文，也不保存 PDF。
- **NIST**：公开 RSS 的标题、链接和来源时间。不抓文章正文。

页面、RSS 和搜索都只渲染这些已发布的公开条目。优先级默认是 P2：没有买方或付款证据时，不把观察写成收入。

**生财AI情报不是上面的列表。** arXiv 和 NIST 不能代替它。生财桥是本地文件适配器，还没有接通，也没有排进定时任务。仓库里没有生财的接口、登录或令牌。

代码按 [MIT](LICENSE) 授权。

## 公开地址

GitHub 项目页的 base 是 `/ai-intel-site/`，站点源是 `https://wujiegrowth.github.io`。

页面是否已经能打开，以该地址的 HTTP 响应为准。本文件不把某一次构建写成已经上线。

## 本地检查

需要 Node.js 22。

```bash
npm ci
npm run check
npm test
npm run build
npm run scan
npm run smoke:base
```

生产构建：

```bash
PUBLIC_BASE_PATH=/ai-intel-site/ PUBLIC_SITE_URL=https://wujiegrowth.github.io npm run build
```

`npm run collect` 只抓取注册表里 `channel` 为 `native-public` 且 `scheduled` 为 true 的来源。失败时保留上一份已发布数据。

## 生财私人桥

私人连接器留在仓库外。它不能被 Actions 调用。连接器输出用 `import-raw` 只做本地去重，公开结果永远是 0 条。

已经单独核实的公开原文，写到 `main` 上的 `inbound/verified/<文件名>.json`。推送到这个路径会跑 `.github/workflows/accept-public.yml`：校验、写入 `src/data/published/`、构建并部署。文件名只能是小写字母、数字、点或连字符，最长 61 个字符，并且以 `.json` 结尾。

公开文件只允许这些字段：

```json
{
  "kind": "verified-public-origins",
  "schemaVersion": 1,
  "items": [
    {
      "evidenceUrl": "https://x.com/<account>/status/<id>",
      "title": "新写的公开标题",
      "facts": ["新写的公开事实"],
      "sourceLabel": "Anthropic",
      "discoveredVia": "scys-private-bridge",
      "verified": true,
      "endorsement": false,
      "sourcePublishedAt": {
        "raw": "2026-11-18",
        "year": 2026,
        "month": 11,
        "day": 18,
        "time": null,
        "timezone": null,
        "certainty": "date-only"
      }
    }
  ]
}
```

`evidenceUrl` 目前只接受 `x.com` 的状态帖，或 `blog.google` 上至少两级路径。`verified` 必须是 true，`endorsement` 必须是 false。出现 `candidateId`、`summary`、`detail`、`opportunity`、`signals`、`tag`、`publishedAt` 或其它未列出的字段时，整份文件被拒绝，不会入库。连接器的 `MM-DD HH:mm` 不能当作公开日期。完整时间或仅日期必须来自公开原文本身。字段和时间的完整约定在 [docs/verified-public-handoff.md](docs/verified-public-handoff.md)。

```bash
npm run cli -- import-raw --input ./private/feed.json --private-out ./private/dedup.json --write
npm run accept-verified -- --input inbound/verified/2026-11-22.json --at 2026-11-22T11:20:00Z
```

## 工作流

- `.github/workflows/ci.yml`：pull request 和 `main` 上做检查、测试、构建、扫描和子路径冒烟。权限只有 `contents: read`。
- `.github/workflows/publish.yml`：每天 00:00 UTC（上海 08:00）、手动，以及 `main` 上除了只改 `src/data/published/**` 之外的推送。同一次运行里采集、在数据有变化时提交、构建并部署 Pages。`GITHUB_TOKEN` 只申请 `contents: write`、`pages: write` 和 `id-token: write`。只改已发布数据的提交不会再次触发，避免循环。
- `.github/workflows/accept-public.yml`：`main` 上 `inbound/verified/**` 的推送，或手动指定该目录里的一个文件。只导入已核实的公开原文，不调用生财接口。
- `.github/workflows/pages.yml`：只能手动运行。默认 base 是 `/ai-intel-site/`，默认站点源是 `https://wujiegrowth.github.io`。

两个会部署的工作流共用并发组 `pages`，进行中的运行不会被取消。

## 边界

- 没有付费 API，没有账号注册，没有自定义域名。
- 搜索在已经生成的页面里完成，包括中文查询。空查询显示全部。
- RSS 只包含当前公开条目。来源时间不完整时不写 `pubDate`。
- 会员内容、撤下条目和合成夹具不会进入公开列表。`src/data/fixtures/` 里的例子只给测试用。
