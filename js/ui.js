/* ============================================================
 * UI 层：筛选器、结果渲染、洞察/策略、详情弹窗、导出。
 * 不持有数据，只读取 state；打分由 main.js 注入的回调执行。
 * ============================================================ */

const GENDER_OPTIONS = [
  { value: "all", label: "不限" },
  { value: "female", label: "女粉为主" },
  { value: "male", label: "男粉为主" },
];

function createState() {
  return {
    filters: {
      industry: "", onlyVertical: false,
      identities: new Set(), tiers: new Set(), personas: new Set(), dims: new Set(),
      crowds: new Set(), ages: new Set(), cities: [], gender: "all", contentType: "any",
      priceMin: null, priceMax: null, search: "", client: "", category: "",
    },
    results: [], pageIndex: 0, pageSize: 24, sortBy: "score",
    meta: null, decoded: null, insights: null, worker: null,
  };
}

// ---------- 通用工具 ----------
function escapeHTML(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
}
const fmtPct = (v) => (v == null || isNaN(v)) ? "-" : (v * 100).toFixed(0) + "%";
const fmtMoney = (v) => (v == null || !v) ? "-" : (v >= 10000 ? (v / 10000).toFixed(1) + " 万" : Number(v).toLocaleString());
const fmtNum = (v) => (v == null || !v) ? "-" : (v >= 10000 ? (v / 10000).toFixed(1) + " 万" : Number(v).toLocaleString());

function el(id) { return document.getElementById(id); }

// ---------- 筛选器 UI ----------
function buildChips(id, items, isOn, onToggle) {
  const root = el(id);
  root.innerHTML = items.map((it) =>
    `<div class="chip ${isOn(it.value) ? "on" : ""}" data-v="${escapeHTML(it.value)}">${escapeHTML(it.label)}</div>`
  ).join("");
  root.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => onToggle(c.dataset.v)));
}
function chipSetGroup(id, items, set) {
  buildChips(id, items, (v) => set.has(v), (v) => {
    set.has(v) ? set.delete(v) : set.add(v);
    renderChipStates();
  });
}
function renderChipStates() {
  const s = state.filters;
  // 单一选择组
  buildChips("f-content-type", CONTENT_TYPE, (v) => s.contentType === v, (v) => { s.contentType = v; renderChipStates(); });
  buildChips("f-gender", GENDER_OPTIONS, (v) => s.gender === v, (v) => { s.gender = v; renderChipStates(); });
  // 多选组
  buildChips("f-identity", IDENTITY.map((x) => ({ value: x, label: x })), (v) => s.identities.has(v), (v) => { s.identities.has(v) ? s.identities.delete(v) : s.identities.add(v); renderChipStates(); });
  buildChips("f-tier", TIER.map((x) => ({ value: x, label: x })), (v) => s.tiers.has(v), (v) => { s.tiers.has(v) ? s.tiers.delete(v) : s.tiers.add(v); renderChipStates(); });
  buildChips("f-persona", PERSONA.map((x) => ({ value: x, label: x })), (v) => s.personas.has(v), (v) => { s.personas.has(v) ? s.personas.delete(v) : s.personas.add(v); renderChipStates(); });
  buildChips("f-dim", DIM.map((x) => ({ value: x, label: x })), (v) => s.dims.has(v), (v) => { s.dims.has(v) ? s.dims.delete(v) : s.dims.add(v); renderChipStates(); });
  buildChips("f-crowd", CROWD_LIST.map((x) => ({ value: x, label: x })), (v) => s.crowds.has(v), (v) => { s.crowds.has(v) ? s.crowds.delete(v) : s.crowds.add(v); renderChipStates(); });
  buildChips("f-age", AGE_LIST.map((x) => ({ value: x, label: x })), (v) => s.ages.has(v), (v) => { s.ages.has(v) ? s.ages.delete(v) : s.ages.add(v); renderChipStates(); });
}

// ---------- 读取输入 ----------
function readInputs() {
  const f = state.filters;
  f.client = el("f-client").value.trim();
  f.category = el("f-category").value.trim();
  f.industry = el("f-industry").value || "";
  f.onlyVertical = el("f-only-vertical").checked && !!f.industry;
  f.cities = el("f-city").value.split(/[,，\s、]+/).map((s) => s.trim()).filter(Boolean);
  const mn = parseFloat(el("f-price-min").value), mx = parseFloat(el("f-price-max").value);
  f.priceMin = isNaN(mn) ? null : mn;
  f.priceMax = isNaN(mx) ? null : mx;
  f.search = el("f-search").value.trim().toLowerCase();
  el("f-only-vertical").parentElement.classList.toggle("hidden", !f.industry);
  if (!f.industry) el("f-only-vertical").checked = false;
}

// ---------- 智能匹配 ----------
function cssEsc(s) { return String(s).replace(/["\\]/g, "\\$&"); }
function findCategoryPreset(cat) {
  if (CATEGORY_PRESETS[cat]) return { mode: "exact", key: cat, preset: CATEGORY_PRESETS[cat] };
  const fuzzyKey = Object.keys(CATEGORY_PRESETS).find((k) => k.includes(cat) || cat.includes(k));
  if (fuzzyKey) return { mode: "fuzzy", key: fuzzyKey, preset: CATEGORY_PRESETS[fuzzyKey] };
  return null;
}
function buildKeywordPreset(cat) {
  const input = String(cat || "").toLowerCase();
  const rule = CATEGORY_KEYWORD_RULES.find((r) => r.keywords.some((k) => input.includes(k)));
  if (!rule) return null;
  return { mode: "keyword", key: rule.industry, preset: { industry: rule.industry, personas: ["专业测评官"], crowds: [], ages: [], gender: "all", contentType: "any", note: `已按品类关键词初步匹配到「${rule.industry}」，可继续补充人群与预算。` } };
}
function smartMatch() {
  const cat = el("f-category").value.trim();
  const client = el("f-client").value.trim();
  const m = cat ? (findCategoryPreset(cat) || buildKeywordPreset(cat)) : null;
  const preset = m?.preset || { industry: "", personas: [], crowds: [], ages: [], gender: "all", contentType: "any", note: client ? "未命中预设，请补充产品品类或手动微调。" : "请输入品牌名称或产品品类。" };
  const f = state.filters;

  f.identities.clear(); f.tiers.clear(); f.personas.clear(); f.dims.clear();
  f.crowds.clear(); f.ages.clear(); f.gender = preset.gender || "all";
  f.contentType = preset.contentType || "any";
  (preset.personas || []).forEach((p) => f.personas.add(p));
  (preset.crowds || []).forEach((c) => f.crowds.add(c));
  (preset.ages || []).forEach((a) => f.ages.add(a));
  f.industry = preset.industry || "";

  el("f-industry").value = f.industry || "";
  renderChipStates();

  const hintMap = {
    exact: `✓ 已按「${escapeHTML(m.key)}」预设回填筛选`,
    fuzzy: `✓ 已按相近品类「${escapeHTML(m.key)}」回填筛选`,
    keyword: `✓ 已按品类关键词匹配到「${escapeHTML(preset.industry)}」`,
  };
  el("smart-hint").innerHTML = hintMap[m?.mode] || `<span style="color:#c2650f">${escapeHTML(preset.note)}</span>`;

  requestMatch();
  el("results-grid").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- 触发匹配 ----------
let pendingTimer = null;
let runMatchCb = null;
function requestMatch() {
  readInputs();
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    if (runMatchCb) runMatchCb();
  }, 120);
}

// ---------- 结果渲染 ----------
function sortResults(list) {
  const by = state.sortBy;
  const s = [...list];
  if (by === "score") return s;
  const cmp = {
    fans: (a, b) => b.fans - a.fans || b.score - a.score,
    cpe: (a, b) => (a.cpeVal || 9e9) - (b.cpeVal || 9e9),
    price_asc: (a, b) => (a.price || 9e9) - (b.price || 9e9),
    price_desc: (a, b) => (b.price || 0) - (a.price || 0),
  };
  return s.sort(cmp[by]);
}

function cardHTML(s) {
  const { meta, decoded } = state;
  const r = decoded.records[s.idx];
  const K = decoded.key;
  const name = K(r, "name"), tag = K(r, "tag");
  const identity = meta.identity[K(r, "ide")] || "";
  const tier = meta.tier[K(r, "tier")] || "";
  const per = meta.persona[K(r, "per")] || "";
  const dim = meta.dim[K(r, "dim")] || "";
  const fans = K(r, "fans") || 0;
  const pImg = K(r, "p_img") || 0, pVid = K(r, "p_video") || 0;
  const cImg = K(r, "c_img") || 0, cVid = K(r, "c_video") || 0;
  const scoreClr = s.score >= 85 ? "#00a854" : s.score >= 70 ? "#2b6cb0" : "#c2650f";
  const reasons = (s.reasons || []).map((x) => `<div>· ${escapeHTML(x)}</div>`).join("");

  return `<div class="card creator-card fade-in" data-idx="${s.idx}">
    <div class="creator-top">
      <div>
        <div class="creator-name">${escapeHTML(name)}</div>
        <div class="badges">
          <span class="badge badge-pink">${escapeHTML(identity)}</span>
          ${s.isVertical ? `<span class="badge badge-orange">⚡ 垂类</span>` : ""}
          <span class="badge">${escapeHTML(tier)}</span>
          <span class="badge badge-blue">${escapeHTML(per || "未标注")}</span>
          <span class="badge">${escapeHTML(dim || "-")}</span>
          ${tag ? `<span class="badge">#${escapeHTML(tag)}</span>` : ""}
        </div>
      </div>
      <div class="score-ring" style="background:conic-gradient(${scoreClr} ${s.score}%, #f2f3f6 0)">
        <div class="val" style="color:${scoreClr}">${s.score}</div>
      </div>
    </div>
    <div class="reasons">${reasons}</div>
    <div class="price-row">
      <div class="price-cell"><span>图文报价</span><b>${fmtMoney(pImg)}</b><div style="font-size:11px;color:var(--ink-4)">CPE ¥${fmtNum(cImg)}</div></div>
      <div class="price-cell"><span>视频报价</span><b>${fmtMoney(pVid)}</b><div style="font-size:11px;color:var(--ink-4)">CPE ¥${fmtNum(cVid)}</div></div>
    </div>
    <div style="font-size:12px;color:var(--ink-4);margin-top:6px">粉丝 ${fmtNum(fans)}</div>
  </div>`;
}

function renderPagination(total) {
  const wrap = el("pagination-wrap");
  if (total <= state.pageSize) { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  const pages = Math.ceil(total / state.pageSize);
  const cur = state.pageIndex;
  const pagesEl = el("pagination");
  let html = `<button data-p="${cur - 1}" ${cur === 0 ? "disabled" : ""}>‹</button>`;
  for (let i = 0; i < pages; i++) {
    if (pages > 9 && i > 0 && i < pages - 1 && Math.abs(i - cur) > 2) {
      if (i === 1 || i === pages - 2) html += `<span>…</span>`;
      continue;
    }
    html += `<button data-p="${i}" class="${i === cur ? "active" : ""}">${i + 1}</button>`;
  }
  html += `<button data-p="${cur + 1}" ${cur >= pages - 1 ? "disabled" : ""}>›</button>`;
  pagesEl.innerHTML = html;
  el("pagination-meta").textContent = `第 ${cur + 1} / ${pages} 页 · 共 ${total} 位博主`;
  pagesEl.querySelectorAll("button[data-p]").forEach((b) => b.addEventListener("click", () => {
    const p = +b.dataset.p;
    if (p >= 0 && p < pages) { state.pageIndex = p; renderResults(); window.scrollTo({ top: el("results-grid").offsetTop - 80, behavior: "smooth" }); }
  }));
}

function renderResults() {
  const list = sortResults(state.results);
  state.results = list;
  const total = list.length;
  el("match-count").textContent = total;
  const vCount = list.filter((x) => x.isVertical).length;
  el("vertical-count").textContent = state.filters.industry ? vCount : "-";
  const avg = total ? Math.round(list.reduce((a, b) => a + b.score, 0) / total) : "-";
  el("avg-score").textContent = avg;
  const prices = list.map((x) => x.price).filter((v) => v).sort((a, b) => a - b);
  el("median-price").textContent = prices.length ? fmtMoney(prices[Math.floor(prices.length / 2)]) : "-";

  const grid = el("results-grid");
  const empty = el("empty");
  if (!total) { grid.innerHTML = ""; empty.classList.remove("hidden"); el("pagination-wrap").classList.add("hidden"); return; }
  empty.classList.add("hidden");
  const start = state.pageIndex * state.pageSize;
  const page = list.slice(start, start + state.pageSize);
  grid.innerHTML = page.map(cardHTML).join("");
  grid.querySelectorAll("[data-idx]").forEach((c) => c.addEventListener("click", () => openModal(+c.dataset.idx)));
  renderPagination(total);
}

// ---------- 详情弹窗 ----------
function barRow(label, value, max = 1) {
  const w = Math.min(100, Math.round((value / max) * 100));
  return `<div class="bar-row"><div class="bar-label"><span>${escapeHTML(label)}</span><span>${fmtPct(value)}</span></div><div class="bar"><span style="width:${w}%"></span></div></div>`;
}
function openModal(idx) {
  const { meta, decoded } = state;
  const r = decoded.records[idx];
  const K = decoded.key;
  const cm = decoded.cityMap(r), cr = decoded.crowdMap(r), ag = decoded.ageMap(r);
  const topCity = Object.entries(cm).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topCrowd = Object.entries(cr).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topAge = Object.entries(ag).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const male = decoded.pct(r, "male"), female = decoded.pct(r, "female"), ios = decoded.pct(r, "ios");
  const eng = decoded.pct(r, "eng"), notes = K(r, "notes30");
  const name = K(r, "name"), id = K(r, "id");
  const identity = meta.identity[K(r, "ide")] || "";
  const home = K(r, "home_url"), pgy = K(r, "pgy_url");
  const mcn = K(r, "mcn") || "";

  el("modal-content").innerHTML = `
    <div class="modal-head">
      <div>
        <div style="font-size:18px;font-weight:800;color:var(--ink-1)">${escapeHTML(name)}</div>
        <div class="kv">小红书ID：<b>${escapeHTML(id)}</b> · 身份：<b>${escapeHTML(identity)}</b>${mcn ? ` · MCN：<b>${escapeHTML(mcn)}</b>` : ""}</div>
      </div>
      <button class="close" onclick="closeModal(event)">✕</button>
    </div>
    <div class="kv" style="margin-bottom:10px">
      粉丝 <b>${fmtNum(K(r, "fans"))}</b> · 近30天笔记 <b>${notes}</b> · 互动率 <b>${fmtPct(eng)}</b> · 图文 CPE <b>¥${fmtNum(K(r, "c_img"))}</b> · 视频 CPE <b>¥${fmtNum(K(r, "c_video"))}</b>
    </div>
    <div class="price-row" style="margin-bottom:12px">
      <div class="price-cell"><span>图文笔记报价</span><b>${fmtMoney(K(r, "p_img"))}</b></div>
      <div class="price-cell"><span>视频笔记报价</span><b>${fmtMoney(K(r, "p_video"))}</b></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
      <div>
        <h3 style="font-size:13px;margin:0 0 6px">粉丝人群 Top3</h3>
        ${topCrowd.map(([k, v]) => barRow(k, v, topCrowd[0][1] || 1)).join("")}
        <h3 style="font-size:13px;margin:12px 0 6px">年龄 Top3</h3>
        ${topAge.map(([k, v]) => barRow(k, v, topAge[0][1] || 1)).join("")}
      </div>
      <div>
        <h3 style="font-size:13px;margin:0 0 6px">城市 Top5</h3>
        ${topCity.map(([k, v]) => barRow(k, v, topCity[0][1] || 1)).join("")}
        <div class="kv" style="margin-top:12px">男粉 <b>${fmtPct(male)}</b> · 女粉 <b>${fmtPct(female)}</b> · iPhone 用户 <b>${fmtPct(ios)}</b></div>
      </div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      ${home ? `<a class="btn-ghost" href="${escapeHTML(home)}" target="_blank" rel="noopener">小红书主页</a>` : ""}
      ${pgy ? `<a class="btn-primary" href="${escapeHTML(pgy)}" target="_blank" rel="noopener">蒲公英主页</a>` : ""}
    </div>`;
  el("detail-modal").classList.add("open");
}
window.closeModal = function (e) {
  if (!e || e.target.id === "detail-modal" || e.target.classList.contains("close")) {
    el("detail-modal").classList.remove("open");
  }
};

// ---------- 洞察 / 策略 ----------
function renderInsights() {
  const ind = state.filters.industry || "__all__";
  const ins = (state.insights && state.insights[ind]) || state.insights?.__all__ || {};
  const trends = ins.hot_trends || [];
  const topics = ins.topic_ideas || [];
  el("insights-panel").innerHTML = `
    <div class="ins-title">📈 ${escapeHTML(state.filters.industry || "平台整体")} · 行业热点</div>
    <div>${trends.map((t) => `· ${escapeHTML(t)}`).join("<br>") || "暂无热点数据"}</div>
    ${topics.length ? `<div class="chips" style="margin-top:8px">${topics.map((t) => `<span class="chip">${escapeHTML(t)}</span>`).join("")}</div>` : ""}`;
}
function renderStrategy() {
  const ind = state.filters.industry || "__all__";
  const ins = (state.insights && state.insights[ind]) || state.insights?.__all__ || {};
  const strat = ins.strategy || "按常规种草节奏推进：头部测评建立信任 + 腰部真实体验种草 + 尾部挑战/剧情拉高传播。";
  const topics = (ins.topic_ideas || []).slice(0, 5);
  el("strategy-panel").innerHTML = `
    <h3>🧭 达人使用策略与选题建议</h3>
    <div class="line">${escapeHTML(strat)}</div>
    ${topics.length ? `<div class="line" style="margin-top:6px;color:var(--ink-4)">选题参考：${topics.map((t) => escapeHTML(t)).join(" · ")}</div>` : ""}`;
}

// ---------- 导出 ----------
function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCSV(topN) {
  const list = sortResults(state.results).slice(0, topN > 0 ? topN : state.results.length);
  if (!list.length) { alert("暂无匹配博主，无法导出"); return; }
  const { meta, decoded } = state;
  const f = state.filters;
  const header = ["排名", "匹配度", "是否垂类", "昵称", "小红书ID", "身份", "MCN", "人设", "内容维度", "粉丝量级", "一级标签",
    "图文报价", "视频报价", "图文CPE", "视频CPE", "男粉占比", "女粉占比", "iPhone占比", "粉丝数", "近30天笔记", "匹配理由", "小红书主页", "蒲公英主页"];
  const rows = list.map((s, i) => {
    const r = decoded.records[s.idx], K = decoded.key;
    return [
      i + 1, s.score, s.isVertical ? "是" : "否", K(r, "name"), K(r, "id"), meta.identity[K(r, "ide")] || "", K(r, "mcn") || "",
      meta.persona[K(r, "per")] || "", meta.dim[K(r, "dim")] || "", meta.tier[K(r, "tier")] || "", K(r, "tag") || "",
      K(r, "p_img") || "", K(r, "p_video") || "", K(r, "c_img") || "", K(r, "c_video") || "",
      fmtPct(decoded.pct(r, "male")), fmtPct(decoded.pct(r, "female")), fmtPct(decoded.pct(r, "ios")),
      K(r, "fans") || "", K(r, "notes30") || "", (s.reasons || []).join(" ｜ "), K(r, "home_url") || "", K(r, "pgy_url") || "",
    ];
  });

  let preamble = [];
  if (topN > 0) {
    const ins = (state.insights && state.insights[f.industry]) || state.insights?.__all__ || {};
    preamble = [
      ["小红书蒲公英 · 达人智能匹配报告"], [],
      ["品牌/客户", f.client], ["产品品类", f.category], ["目标行业", f.industry || "不限"],
      ["内容形式", (CONTENT_TYPE.find((c) => c.key === f.contentType) || {}).label || "不限"],
      ["匹配博主", list.length + " 位"], ["导出时间", new Date().toLocaleString("zh-CN")],
      ["行业热点", (ins.hot_trends || []).slice(0, 4).join(" ｜ ")],
      ["选题建议", (ins.topic_ideas || []).slice(0, 5).join(" ｜ ")],
      ["使用策略", ins.strategy || ""], [],
    ];
  }
  const csv = "\ufeff" + preamble.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n" + header.map(csvEscape).join(",") + "\n" + rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = topN > 0 ? `蒲公英博主报告_${f.client || "客户"}_${f.category || f.industry}_${new Date().toISOString().slice(0, 10)}.csv` : `蒲公英博主名单_${f.industry || "全行业"}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ---------- 初始化 ----------
function initUI(stateRef, { onMatch, onReset }) {
  state = stateRef;
  runMatchCb = onMatch || null;
  const meta = state.meta;

  const indSel = el("f-industry");
  indSel.innerHTML = [`<option value="">全部行业（不限）</option>`].concat(INDUSTRIES.map((x) => `<option value="${x}">${x}</option>`)).join("");

  el("category-suggestions").innerHTML = Object.keys(CATEGORY_PRESETS).map((k) => `<option value="${escapeHTML(k)}"></option>`).join("");
  el("sort-by").innerHTML = SORT_OPTIONS.map((o) => `<option value="${o.key}">${o.label}</option>`).join("");
  el("sort-by").value = state.sortBy;

  renderChipStates();

  el("smart-btn").addEventListener("click", smartMatch);
  el("match-btn").addEventListener("click", () => { readInputs(); requestMatch(); });
  el("reset-btn").addEventListener("click", onReset);
  el("f-industry").addEventListener("change", () => { readInputs(); requestMatch(); });
  el("f-only-vertical").addEventListener("change", () => { readInputs(); requestMatch(); });
  el("f-search").addEventListener("input", () => requestMatch());
  el("f-city").addEventListener("change", () => requestMatch());
  el("f-price-min").addEventListener("change", () => requestMatch());
  el("f-price-max").addEventListener("change", () => requestMatch());
  el("sort-by").addEventListener("change", (e) => { state.sortBy = e.target.value; renderResults(); });
  el("export-csv").addEventListener("click", () => exportCSV(0));
  el("export-report").addEventListener("click", () => exportCSV(30));

  el("pool-industries").textContent = (meta.industries || []).length + " 大";
  el("guide-total").textContent = Number(meta.total || 0).toLocaleString("zh-CN");
}

let state = null;
function applyResults(results) {
  state.results = results;
  state.pageIndex = 0;
  renderResults();
  renderInsights();
  renderStrategy();
}
function resetFilters() {
  const f = state.filters;
  Object.assign(f, {
    industry: "", onlyVertical: false, gender: "all", contentType: "any",
    priceMin: null, priceMax: null, search: "", client: "", category: "", cities: [],
  });
  f.identities.clear(); f.tiers.clear(); f.personas.clear(); f.dims.clear(); f.crowds.clear(); f.ages.clear();
  el("f-industry").value = ""; el("f-client").value = ""; el("f-category").value = "";
  el("f-city").value = ""; el("f-price-min").value = ""; el("f-price-max").value = "";
  el("f-search").value = ""; el("f-only-vertical").checked = false; el("smart-hint").textContent = "";
  renderChipStates();
  requestMatch();
}
