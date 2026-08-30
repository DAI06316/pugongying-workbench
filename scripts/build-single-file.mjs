/* 把整个站点打包成一个自包含的 dist/index.html（CSS + 数据 + JS 全内联）。
 * 用途：GitHub Pages / 任意单文件托管，只需上传这一个文件即可访问。 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

const css = read("styles.css");
const dataFull = read("data/data-full.js").trim();
const insights = read("data/insights.js").trim();
const scripts = ["js/config.js", "js/data.js", "js/match.js", "js/ui.js", "js/main.js"].map(read).join("\n;\n");

let html = read("index.html");
html = html.replace('<link rel="stylesheet" href="styles.css" />', `<style>\n${css}\n</style>`);

const inject = `<script>\n${dataFull}\n${insights}\n${scripts}\n</script>`;
html = html.replace(
  /<script src="data\/data-full\.js"><\/script>\s*<script src="data\/insights\.js"><\/script>\s*(?:<script src="js\/[^"]+\.js"><\/script>\s*)*/,
  () => inject
);

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist", "index.html"), html);
console.log("✔ 已生成单文件 dist/index.html（" + (html.length / 1024).toFixed(0) + " KB）");
