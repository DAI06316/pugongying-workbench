// 通过 GitHub Contents API 把仓库内已跟踪文件上传到 GitHub Pages 仓库。
// 用法：GH_TOKEN=xxx GH_REPO=DAI06316/pugongying-workbench node scripts/deploy_github.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const token = process.env.GH_TOKEN;
const repo = process.env.GH_REPO || "DAI06316/pugongying-workbench";
const branch = process.env.GH_BRANCH || "main";
if (!token) { console.error("缺少 GH_TOKEN"); process.exit(1); }

const GIT = process.env.GIT || "/Users/xiaomadaidaidemacbookpro/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/git";
const files = execFileSync(GIT, ["ls-files"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const api = (path, opts = {}) => fetch(`https://api.github.com${path}`, {
  ...opts,
  headers: {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "pugongying-workbench-deploy",
    ...(opts.headers || {}),
  },
});

const base64 = (buf) => Buffer.from(buf).toString("base64");
let ok = 0, fail = 0;
for (const file of files) {
  const content = readFileSync(file);
  const b64 = base64(content);
  const enc = encodeURIComponent(file);
  // 获取远端现有 sha（若存在）
  let sha = null;
  const head = await api(`/repos/${repo}/contents/${enc}?ref=${branch}`);
  if (head.status === 200) { sha = (await head.json()).sha; }
  else if (head.status === 404) { /* 新文件 */ }
  else { console.error(`  ✗ 读取 ${file} 失败 ${head.status} ${await head.text()}`); fail++; continue; }

  const payload = { message: `deploy: update ${file}`, content: b64, branch };
  if (sha) payload.sha = sha;
  const put = await api(`/repos/${repo}/contents/${enc}`, { method: "PUT", body: JSON.stringify(payload) });
  if (put.status === 200 || put.status === 201) { ok++; console.log(`  ✔ ${file}`); }
  else { fail++; console.error(`  ✗ ${file} ${put.status} ${(await put.text()).slice(0, 300)}`); }
}
console.log(`\n完成：成功 ${ok}，失败 ${fail}（共 ${files.length} 个文件）`);
process.exit(fail ? 1 : 0);
