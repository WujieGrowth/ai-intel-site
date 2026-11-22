import { pathToFileURL } from "node:url";
import { execute } from "./commands";

const HELP = `示界 CLI（默认不改写来源、不发布、不部署）
用法:
  tsx cli/index.ts --help
  tsx cli/index.ts import --input <file> [--out <file>] [--write]
  tsx cli/index.ts review --input <file> --id <id> --to <review|approved> [--out <file>] [--write]
  tsx cli/index.ts export-public --input <file> [--sample-only] [--out <file>] [--write]
  tsx cli/index.ts confirm-publication --input <file> --at <iso> [--ledger-out <file>] [--write]
  tsx cli/index.ts mark-published --input <file> --id <id> --deployment-url <https-url> --out <file> --at <iso> --i-confirm-live-deployment [--write]
  tsx cli/index.ts retract --input <file> --id <id> [--out <file>] [--write]
  tsx cli/index.ts ledger --kind <read|sent> --id <id> --at <iso> [--channel <text>] [--ledger <file>] [--write]
  tsx cli/index.ts import-raw --input <file> [--private-out <file>] [--write]
  tsx cli/index.ts accept-verified --input <file> --at <iso> [--public-out <file>] [--private-out <file>] [--write]

没有 --write 时只打印结果，不创建、不修改文件。
confirm-publication 只追加台账，deployed 恒为 false，不把条目改成 published。
import-raw 只读本地连接器输出，不访问网络，也不读取凭据。
它不生成公开条目。会员标题、摘要、正文和私人标识不会进入公开结果。
连接器里的月日时钟不会被补成年份。
accept-verified 只接受已经核对过的公开原文文件，不接受连接器原文。
这两个命令都没有接入定时任务。Actions 不会调用生财接口。
已读、已发送、已发布是三本独立台账，不能用一个 seen 标记代替。
`;

const KNOWN = new Set([
  "import",
  "review",
  "export-public",
  "confirm-publication",
  "mark-published",
  "retract",
  "ledger",
  "import-raw",
  "accept-verified",
]);

export function run(argv: readonly string[]): { code: number; stdout: string; stderr: string } {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { code: 0, stdout: HELP, stderr: "" };
  }
  const [command] = argv;
  if (!command || !KNOWN.has(command)) {
    return { code: 2, stdout: "", stderr: "未知命令\n" };
  }
  return execute(command, argv.slice(1));
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const result = run(process.argv.slice(2));
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.code);
}
