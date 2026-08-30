# 蒲公英达人工作台（小红书版）

给广告代理用的小红书「蒲公英」博主筛选/匹配工作台基础骨架。对标原抖音星图版 `q3-xingtu-workbench` 的流程，做了模块化、可解释打分和图文/视频双报价口径。

## 怎么打开（无需服务器）

直接双击打开 **`index.html`** 即可（用 Chrome / Edge / Safari 都行）。

> 数据已经做成了 `<script>` 引入（`data/data-full.js`、`data/insights.js`），所以即使从本地文件打开也能加载，不需要 `npm`/`python` 起服务。

## 已实现的基础

- 纯静态、零依赖：经典脚本分层 `config / data / match / ui / main`，按顺序加载。
- 可配置打分：每个维度归一化到 0~1 再加权，权重集中在 `js/config.js`，可解释、可校准。
- 图文 / 视频双报价口径 + CPE + 互动率 + 近 30 天笔记数。
- 完整交互：智能匹配、精细化筛选、行业垂类、排序、详情弹窗、CSV / 报告导出。
- 示例数据生成器（同时是接入真实数据的字段模板）。

## 目录结构

```
index.html            页面骨架（直接打开即可）
styles.css            样式
js/config.js          行业/标签/人设/权重/品类预设（所有口径都在这）
js/data.js            数据解码 + 访问器
js/match.js           打分引擎（纯函数）
js/ui.js              筛选器 / 结果 / 弹窗 / 洞察 / 导出
js/main.js            启动编排
scripts/generate-sample-data.mjs  示例数据生成器
data/data-full.js     博主主库（script 注入，file:// 可读）
data/insights.js      行业洞察（script 注入）
data/data-full.json   同内容的 JSON（供 ETL 参考 / HTTP 拉取）
data/insights.json    同内容的 JSON
docs/data-schema.md   字段口径 + 蒲公英资源库搭建方案
```

## 重新生成示例数据

```bash
node scripts/generate-sample-data.mjs   # 默认 2000 条，可 DEMO_TOTAL=10000 放大
```

> 若本机没有 `node`，这一步可跳过——仓库里已经带好了一份生成好的数据。

## 接入真实蒲公英数据

1. 按 `docs/data-schema.md` 的字段口径，从蒲公英后台导出博主刊例并补齐画像。
2. 生成同结构的 `data/data-full.js` / `data/insights.js`（以及可选 JSON），覆盖 `data/` 下同名文件。
3. 在 `js/config.js` 里校准：行业列表、一级标签→行业映射、八大人群、打分权重。
4. 修改 `js/main.js` 里的 `CACHE_VER`，避免浏览器缓存旧数据。

## 下一步要实现的「更准 / 更快 / 更好用」

- 更准：接真实历史商单（CPE 校准）、报备/非报备价区分、博主人群包与品牌 TA 向量化匹配。
- 更快：全量数据接入后改回 Web Worker 打分、虚拟滚动、结果缓存。
- 更好用：客户管理、收藏对比、团队协作、一键 PDF 报告。
- 合规：医疗/金融白名单、广告合规文案提示、数据更新时间标注。
