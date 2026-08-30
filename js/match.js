/* ============================================================
 * 匹配打分引擎（纯函数，可独立测试，也可在 Web Worker 中运行）
 * 设计目标：比「固定 55 分起步」更可解释、更稳定。
 * 每个维度归一化到 0~1，再按 config.MATCH_WEIGHTS 加权 → 0~100。
 * ============================================================ */

// 基于排序数组做「小于等于 v 的比例」查询（双指针，避免每次二分）
function buildPercentile(sortedArr) {
  return (v) => {
    if (sortedArr.length === 0) return 0.5;
    let lo = 0, hi = sortedArr.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sortedArr[mid] <= v) { ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return (ans + 1) / sortedArr.length;
  };
}

function buildContext(records, keyIdx) {
  const K = (r, n) => r[keyIdx[n]];
  const eng = [], notes = [], cpe = [];
  for (const r of records) {
    eng.push(K(r, "eng") || 0);
    notes.push(K(r, "notes30") || 0);
    const c1 = K(r, "c_img") || 0, c2 = K(r, "c_video") || 0;
    const cv = (c1 > 0 && c2 > 0) ? Math.min(c1, c2) : Math.max(c1, c2);
    cpe.push(cv || 0);
  }
  const sortNum = (a) => a.slice().sort((x, y) => x - y);
  return {
    engPct: buildPercentile(sortNum(eng)),
    notePct: buildPercentile(sortNum(notes)),
    cpePct: buildPercentile(sortNum(cpe)),
  };
}

function scoreRecord(r, keyIdx, f, ctx, meta) {
  const K = (name) => r[keyIdx[name]];
  const indIdx = f.industry ? INDUSTRIES.indexOf(f.industry) : -1;
  const isVertical = indIdx >= 0 && ((K("vmask") || 0) & (1 << indIdx)) !== 0;

  // ---- 硬过滤 ----
  if (indIdx >= 0 && f.onlyVertical && !isVertical) return null;
  if (f.identities.size && !f.identities.has(meta.identity[K("ide")] || "")) return null;
  if (f.tiers.size && !f.tiers.has(meta.tier[K("tier")] || "")) return null;
  if (f.personas.size && !f.personas.has(meta.persona[K("per")] || "")) return null;
  if (f.dims.size && !f.dims.has(meta.dim[K("dim")] || "")) return null;
  if (f.search && !String(K("name") || "").toLowerCase().includes(f.search)) return null;

  const pImg = K("p_img") || 0, pVid = K("p_video") || 0;
  const price = f.contentType === "image" ? pImg
    : f.contentType === "video" ? pVid
    : (pImg > 0 && pVid > 0 ? Math.min(pImg, pVid) : Math.max(pImg, pVid));
  if (f.priceMin != null && price > 0 && price < f.priceMin) return null;
  if (f.priceMax != null && price > 0 && price > f.priceMax) return null;

  const female = (K("female") || 0) / 1000;
  const male = (K("male") || 0) / 1000;

  // ---- 各维度 0~1 ----
  const comps = {};
  const reasons = [];

  // 1) 行业垂类
  if (indIdx >= 0) {
    comps.vertical = isVertical ? 1 : 0.25;
    if (isVertical) reasons.push(`命中「${f.industry}」垂类标签`);
  } else {
    comps.vertical = 0.6;
  }

  // 2) 目标人群 / 年龄 / 城市 覆盖度
  const activeAud = [];
  if (f.crowds.size) {
    const crowdArr = K("crowd") || [];
    const hasData = crowdArr.some((v) => (v || 0) > 0);
    let s = 0;
    if (hasData) meta.crowd_list.forEach((k, i) => { if (f.crowds.has(k)) s += (crowdArr[i] || 0) / 1000; });
    activeAud.push(hasData ? s : 0.5);
    if (hasData && s > 0.05) reasons.push(`目标人群占比 ${(s * 100).toFixed(0)}%`);
  }
  if (f.ages.size) {
    const ageArr = K("age") || [];
    const hasData = ageArr.some((v) => (v || 0) > 0);
    let s = 0;
    if (hasData) meta.age_list.forEach((k, i) => { if (f.ages.has(k)) s += (ageArr[i] || 0) / 1000; });
    activeAud.push(hasData ? s : 0.5);
    if (hasData && s > 0.05) reasons.push(`目标年龄占比 ${(s * 100).toFixed(0)}%`);
  }
  if (f.cities.length) {
    const flat = K("city") || [];
    const hasData = flat.some((v, i) => i % 2 === 1 && (v || 0) > 0);
    const cm = {};
    for (let i = 0; i + 1 < flat.length; i += 2) cm[flat[i]] = (flat[i + 1] || 0) / 1000;
    let s = 0;
    for (const c of f.cities) s += cm[c] || 0;
    activeAud.push(hasData ? s : 0.5);
    if (hasData && s > 0.05) reasons.push(`覆盖目标城市 ${(s * 100).toFixed(0)}%`);
  }
  comps.audience = activeAud.length ? activeAud.reduce((a, b) => a + b, 0) / activeAud.length : 0.5;

  // 3) 性别偏好
  const hasGender = (male + female) > 0;
  if (f.gender === "female") {
    comps.gender = hasGender ? female : 0.5;
    if (hasGender && female > 0.7) reasons.push(`女粉占比 ${(female * 100).toFixed(0)}%`);
  } else if (f.gender === "male") {
    comps.gender = hasGender ? male : 0.5;
    if (hasGender && male > 0.7) reasons.push(`男粉占比 ${(male * 100).toFixed(0)}%`);
  } else {
    comps.gender = 0.5;
  }

  // 4) 互动质量（互动率百分位；缺数据按中性 0.5 处理）
  const engVal = K("eng") || 0;
  comps.engagement = engVal > 0 ? ctx.engPct(engVal) : 0.5;
  if (comps.engagement >= 0.7) reasons.push("互动率优于大盘");

  // 5) 更新活跃（近 30 天笔记数百分位；缺数据按中性 0.5 处理）
  const notesVal = K("notes30") || 0;
  comps.activity = notesVal > 0 ? ctx.notePct(notesVal) : 0.5;
  if (comps.activity >= 0.7) reasons.push("近期更新活跃");

  // 6) 性价比（CPE 越低越优）
  const cImg = K("c_img") || 0, cVid = K("c_video") || 0;
  const cpeVal = (cImg > 0 && cVid > 0) ? Math.min(cImg, cVid) : Math.max(cImg, cVid);
  comps.cpe = cpeVal > 0 ? 1 - ctx.cpePct(cpeVal) : 0.5;
  if (comps.cpe >= 0.7) reasons.push("互动成本（CPE）较低");

  let score = 0;
  for (const [name, w] of Object.entries(MATCH_WEIGHTS)) score += w * (comps[name] ?? 0.5);
  score = Math.max(1, Math.min(99, Math.round(score * 100)));

  if (!reasons.length) {
    const per = meta.persona[K("per")] || "";
    const dim = meta.dim[K("dim")] || "";
    if (per) reasons.push(`人设：${per}`);
    if (dim) reasons.push(`内容：${dim}`);
  }

  return {
    idx: -1, // 由 runMatch 填充
    score,
    reasons: reasons.slice(0, 3),
    isVertical,
    tierIdx: K("tier"),
    perIdx: K("per"),
    dimIdx: K("dim"),
    ideIdx: K("ide"),
    price,
    cpeVal,
    fans: K("fans") || 0,
  };
}

function runMatch(records, keyIdx, f, meta, ctx = buildContext(records, keyIdx)) {
  const scored = [];
  for (let i = 0; i < records.length; i++) {
    const s = scoreRecord(records[i], keyIdx, f, ctx, meta);
    if (s) { s.idx = i; scored.push(s); }
  }
  scored.sort((a, b) => {
    if (f.industry && a.isVertical !== b.isVertical) return b.isVertical - a.isVertical;
    return b.score - a.score;
  });
  return scored;
}

/* 过滤器在 UI 侧用 Set 维护，跨线程传输前需转成可克隆的数组 */
function serializeFilters(f) {
  return {
    ...f,
    identities: [...f.identities],
    tiers: [...f.tiers],
    personas: [...f.personas],
    dims: [...f.dims],
    crowds: [...f.crowds],
    ages: [...f.ages],
    cities: [...f.cities],
  };
}
function deserializeFilters(o) {
  return {
    ...o,
    identities: new Set(o.identities || []),
    tiers: new Set(o.tiers || []),
    personas: new Set(o.personas || []),
    dims: new Set(o.dims || []),
    crowds: new Set(o.crowds || []),
    ages: new Set(o.ages || []),
    cities: o.cities || [],
  };
}
