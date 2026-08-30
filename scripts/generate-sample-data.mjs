/* ============================================================
 * 生成可运行的示例数据（data/data-full.json + data/insights.json）
 * 用途：本地演示 + 作为接入真实蒲公英数据的字段模板。
 * 运行：npm run gen:demo
 * ============================================================ */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// config.js 已改为浏览器可直接加载的经典脚本（无 export），这里用 eval 读取其常量
const configPath = fileURLToPath(new URL("../js/config.js", import.meta.url));
new Function(readFileSync(configPath, "utf8") + "\nglobalThis.__PGW_CONFIG = { INDUSTRIES, IDENTITY, PERSONA, DIM, TIER, CROWD_LIST, AGE_LIST, VERTICAL_TAG_MAP };\n")();
const { INDUSTRIES, IDENTITY, PERSONA, DIM, TIER, CROWD_LIST, AGE_LIST, VERTICAL_TAG_MAP } = globalThis.__PGW_CONFIG;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "data");
const TOTAL = Number(process.env.DEMO_TOTAL || 2000);

// 可复现的伪随机
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260830);
const ri = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[ri(0, arr.length - 1)];
const pickW = (items, weightFn) => {
  const total = items.reduce((s, it) => s + weightFn(it), 0);
  let r = rand() * total;
  for (const it of items) { r -= weightFn(it); if (r <= 0) return it; }
  return items[items.length - 1];
};

// 行业先验权重（小红书更偏生活方式/美妆/时尚）
const IND_WEIGHT = {
  "美妆个护": 12, "时尚穿搭": 12, "母婴亲子": 8, "食品饮料": 10,
  "家居家装": 8, "运动户外": 6, "3C数码": 6, "汽车出行": 4,
  "旅行": 8, "萌宠": 6, "教育知识": 6, "医疗健康": 5,
  "金融财经": 3, "游戏": 4, "本地生活": 7, "职场成长": 5,
};

const SURNAMES = "林陈李王张刘黄吴周徐孙马朱胡郭何高罗郑梁谢宋唐许邓冯韩曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤".split("");
const NICK_POOL = ["测评君", "种草日记", "穿搭研究所", "干货铺子", "生活家", "好物雷达", "探店小分队", "知识罐头", "成长笔记", "护肤实验室", "美妆侦探", "健身教练", "读书会", "数码拆解", "旅行画报", "萌宠日常", "厨房日记", "收纳术", "职场充电站", "理财小白"];

const CITY_POOL = [
  ["上海", 120], ["北京", 115], ["广州", 90], ["深圳", 95], ["杭州", 70],
  ["成都", 65], ["重庆", 55], ["武汉", 45], ["南京", 40], ["苏州", 35],
  ["西安", 30], ["长沙", 30], ["郑州", 25], ["天津", 25], ["青岛", 20],
];

// 行业 → 画像倾向
const IND_PROFILE = {
  "美妆个护": { female: 0.82, ages: [0.08, 0.28, 0.36, 0.18, 0.10], crowds: [0.24, 0.16, 0.18, 0.22, 0.08, 0.06, 0.04, 0.02] },
  "时尚穿搭": { female: 0.78, ages: [0.10, 0.34, 0.32, 0.14, 0.10], crowds: [0.28, 0.10, 0.16, 0.28, 0.08, 0.06, 0.03, 0.01] },
  "母婴亲子": { female: 0.72, ages: [0.02, 0.10, 0.44, 0.32, 0.12], crowds: [0.06, 0.34, 0.18, 0.10, 0.18, 0.06, 0.06, 0.02] },
  "食品饮料": { female: 0.60, ages: [0.08, 0.26, 0.34, 0.20, 0.12], crowds: [0.14, 0.14, 0.18, 0.26, 0.08, 0.10, 0.08, 0.02] },
  "家居家装": { female: 0.64, ages: [0.02, 0.14, 0.38, 0.28, 0.18], crowds: [0.08, 0.24, 0.20, 0.10, 0.20, 0.06, 0.08, 0.04] },
  "运动户外": { female: 0.46, ages: [0.08, 0.30, 0.36, 0.18, 0.08], crowds: [0.16, 0.08, 0.20, 0.26, 0.10, 0.10, 0.06, 0.04] },
  "3C数码": { female: 0.38, ages: [0.06, 0.26, 0.38, 0.20, 0.10], crowds: [0.12, 0.06, 0.24, 0.28, 0.12, 0.08, 0.06, 0.04] },
  "汽车出行": { female: 0.34, ages: [0.04, 0.16, 0.36, 0.28, 0.16], crowds: [0.08, 0.10, 0.26, 0.16, 0.22, 0.06, 0.08, 0.04] },
  "旅行": { female: 0.62, ages: [0.06, 0.26, 0.36, 0.20, 0.12], crowds: [0.16, 0.10, 0.22, 0.26, 0.12, 0.06, 0.06, 0.02] },
  "萌宠": { female: 0.66, ages: [0.10, 0.30, 0.34, 0.16, 0.10], crowds: [0.18, 0.12, 0.18, 0.26, 0.10, 0.08, 0.06, 0.02] },
  "教育知识": { female: 0.58, ages: [0.06, 0.24, 0.38, 0.22, 0.10], crowds: [0.10, 0.08, 0.24, 0.22, 0.10, 0.16, 0.06, 0.04] },
  "医疗健康": { female: 0.60, ages: [0.02, 0.10, 0.28, 0.34, 0.26], crowds: [0.04, 0.12, 0.18, 0.08, 0.20, 0.06, 0.08, 0.24] },
  "金融财经": { female: 0.46, ages: [0.02, 0.12, 0.36, 0.32, 0.18], crowds: [0.06, 0.08, 0.28, 0.10, 0.26, 0.04, 0.06, 0.12] },
  "游戏": { female: 0.34, ages: [0.14, 0.40, 0.30, 0.12, 0.04], crowds: [0.20, 0.04, 0.14, 0.38, 0.06, 0.12, 0.04, 0.02] },
  "本地生活": { female: 0.58, ages: [0.08, 0.28, 0.34, 0.20, 0.10], crowds: [0.16, 0.10, 0.20, 0.26, 0.10, 0.08, 0.06, 0.04] },
  "职场成长": { female: 0.56, ages: [0.04, 0.22, 0.42, 0.22, 0.10], crowds: [0.08, 0.08, 0.30, 0.20, 0.12, 0.12, 0.06, 0.04] },
};

const TIER_FANS = [
  [0, 10000], [10000, 50000], [50000, 100000], [100000, 500000],
  [500000, 1000000], [1000000, 5000000], [5000000, 30000000],
];
const TIER_WEIGHT = [0.20, 0.26, 0.16, 0.20, 0.10, 0.07, 0.01];

function distFrom(base, noise = 0.06) {
  return base.map((v) => Math.max(0, v + (rand() - 0.5) * noise));
}
function norm(arr) {
  const s = arr.reduce((a, b) => a + b, 0) || 1;
  return arr.map((v) => Math.round((v / s) * 1000));
}
function pickCityDist() {
  const top = CITY_POOL.slice().sort(() => rand() - 0.5).slice(0, 5);
  const w = top.map(([, w]) => w + rand() * 40);
  const s = w.reduce((a, b) => a + b, 0);
  const flat = [];
  top.forEach(([name], i) => { flat.push(name, Math.round((w[i] / s) * 1000)); });
  return flat;
}

function buildRecord(idx) {
  const industry = pickW(INDUSTRIES, (i) => IND_WEIGHT[i] || 1);
  const tags = VERTICAL_TAG_MAP[industry];
  const tag = tags[ri(0, tags.length - 1)];

  const tierIdx = pickW(TIER.map((_, i) => i), (i) => TIER_WEIGHT[i] * 1000);
  const [lo, hi] = TIER_FANS[tierIdx];
  const fans = ri(Math.max(lo, 800), Math.max(hi, lo + 1));

  const profile = IND_PROFILE[industry];
  const femaleBase = Math.round((profile.female + (rand() - 0.5) * 0.2) * 1000);
  const female = Math.max(150, Math.min(900, femaleBase));
  const male = 1000 - female;

  const age = norm(distFrom(profile.ages));
  const crowd = norm(distFrom(profile.crowds));
  const city = pickCityDist();
  const ios = ri(280, 780);

  // 报价随粉丝量级线性放大 + 噪声；视频通常高于图文
  const basePrice = Math.round(fans * (0.012 + rand() * 0.05));
  const p_img = Math.max(200, basePrice);
  const p_video = Math.max(400, Math.round(p_img * (1.3 + rand() * 1.2)));

  const eng = ri(8, 90); // 互动率（千分位），作为互动质量信号
  const expFactor = 0.4 + rand() * 0.6;
  const c_img = Math.max(1, Math.round(p_img / (Math.max(1, fans * (eng / 1000) * expFactor))));
  const c_video = Math.max(1, Math.round(p_video / (Math.max(1, fans * (eng / 1000) * expFactor))));

  const notes30 = ri(0, 48);
  const ide = pickW([0, 1, 2, 3], (i) => [34, 22, 14, 30][i]);
  const mcn = ide === 1 ? pick(["摘星MCN", "红书传媒", "新锐内容", "一方内容", "星图文化", "光点互娱"]) : "";
  const per = ri(0, PERSONA.length - 1);
  const dim = ri(0, DIM.length - 1);

  // 垂类位掩码：主行业必中，约 25% 再命中一个相近行业
  let vmask = 1 << INDUSTRIES.indexOf(industry);
  if (rand() < 0.25) vmask |= 1 << ri(0, INDUSTRIES.length - 1);

  const uid = "5" + String(1000000000000000000 + idx * 7919 + ri(0, 999)).slice(0, 19);
  const id = String(1000000000 + idx * 7919 + ri(0, 999));

  return [
    id,
    SURNAMES[idx % SURNAMES.length] + pick(NICK_POOL),
    ide, mcn, per, dim, tierIdx, tag, vmask,
    male, female, age, city, crowd, ios,
    p_img, p_video, c_img, c_video, eng, notes30, fans,
    `https://www.xiaohongshu.com/user/profile/${uid}`,
    `https://pgy.xiaohongshu.com/kol/${id}`,
  ];
}

function buildRecords() {
  const out = [];
  for (let i = 0; i < TOTAL; i++) out.push(buildRecord(i));
  return out;
}

function buildInsights(records) {
  const keyIdx = {};
  const KEYS = ["id", "name", "ide", "mcn", "per", "dim", "tier", "tag", "vmask",
    "male", "female", "age", "city", "crowd", "ios",
    "p_img", "p_video", "c_img", "c_video", "eng", "notes30", "fans", "home_url", "pgy_url"];
  KEYS.forEach((k, i) => { keyIdx[k] = i; });
  const K = (r, n) => r[keyIdx[n]];

  const byIndustry = (indIdx) => {
    const rows = records.filter((r) => (K(r, "vmask") & (1 << indIdx)) !== 0);
    const cnt = (arr) => arr.reduce((m, v) => (m[v] = (m[v] || 0) + 1, m), {});
    const tierCnt = cnt(rows.map((r) => K(r, "tier")));
    const perCnt = cnt(rows.map((r) => K(r, "per")));
    const dimCnt = cnt(rows.map((r) => K(r, "dim")));
    const tagCnt = cnt(rows.map((r) => K(r, "tag")));
    const crowdSum = new Array(CROWD_LIST.length).fill(0);
    const ageSum = new Array(AGE_LIST.length).fill(0);
    const citySum = {};
    let male = 0, female = 0;
    for (const r of rows) {
      const c = K(r, "crowd") || [];
      c.forEach((v, i) => { crowdSum[i] += v; });
      const a = K(r, "age") || [];
      a.forEach((v, i) => { ageSum[i] += v; });
      const flat = K(r, "city") || [];
      for (let i = 0; i + 1 < flat.length; i += 2) citySum[flat[i]] = (citySum[flat[i]] || 0) + flat[i + 1];
      male += K(r, "male") || 0;
      female += K(r, "female") || 0;
    }
    const n = rows.length || 1;
    const top = (obj, list) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [list[k] ?? k, v]);
    return {
      total: rows.length,
      top_persona: top(perCnt, PERSONA),
      top_dim: top(dimCnt, DIM),
      top_tag: top(tagCnt, {}),
      tier_dist: Object.entries(tierCnt).sort((a, b) => b[1] - a[1]).map(([k, v]) => [TIER[k], v]),
      crowd_dist: Object.fromEntries(CROWD_LIST.map((k, i) => [k, +(crowdSum[i] / n / 1000).toFixed(4)])),
      age_dist: Object.fromEntries(AGE_LIST.map((k, i) => [k, +(ageSum[i] / n / 1000).toFixed(4)])),
      top_cities: Object.fromEntries(Object.entries(citySum).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, +(v / n / 1000).toFixed(4)])),
      male_ratio: +(male / n / 1000).toFixed(4),
      female_ratio: +(female / n / 1000).toFixed(4),
    };
  };

  const industries = {};
  INDUSTRIES.forEach((ind, i) => {
    industries[ind] = {
      hot_trends: [`${ind}内容在小红书持续走热，真实体验与前后对比最易出圈。`, `${ind}垂类近期更吃「人感种草 + 干货清单」的组合内容。`],
      topic_ideas: [`${ind}选题：普通人也能复刻的实操清单`, `${ind}避坑指南：真实体验者来告诉你`, `${ind}高性价比好物合集`],
      strategy: `头部专业测评建立可信度 + 腰部生活方式达人真实种草 + 尾部挑战/剧情达人拉高破圈度，建议 1 : 3 : 6 比例投放。`,
      stats: byIndustry(i),
    };
  });

  const allRows = records;
  const cnt = (arr) => arr.reduce((m, v) => (m[v] = (m[v] || 0) + 1, m), {});
  industries["__all__"] = {
    hot_trends: ["小红书当前热点集中在真实体验、干货清单与沉浸式挑战三类内容。", "美妆/时尚/生活类是种草主力，数码/知识类呈上升趋势。"],
    topic_ideas: ["跨品类通用的「真实体验 + 前后对比」选题", "高互动「挑战/测评」内容二创"],
    stats: (() => {
      const tierCnt = cnt(allRows.map((r) => K(r, "tier")));
      const perCnt = cnt(allRows.map((r) => K(r, "per")));
      const dimCnt = cnt(allRows.map((r) => K(r, "dim")));
      const tagCnt = cnt(allRows.map((r) => K(r, "tag")));
      return {
        total: allRows.length,
        top_persona: Object.entries(perCnt).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [PERSONA[k], v]),
        top_dim: Object.entries(dimCnt).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [DIM[k], v]),
        top_tag: Object.entries(tagCnt).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [k, v]),
        tier_dist: Object.entries(tierCnt).sort((a, b) => b[1] - a[1]).map(([k, v]) => [TIER[k], v]),
      };
    })(),
  };

  return industries;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const records = buildRecords();
  const KEYS = ["id", "name", "ide", "mcn", "per", "dim", "tier", "tag", "vmask",
    "male", "female", "age", "city", "crowd", "ios",
    "p_img", "p_video", "c_img", "c_video", "eng", "notes30", "fans", "home_url", "pgy_url"];
  const data = {
    meta: {
      keys: KEYS,
      industries: INDUSTRIES,
      identity: IDENTITY,
      persona: PERSONA,
      dim: DIM,
      tier: TIER,
      crowd_list: CROWD_LIST,
      age_list: AGE_LIST,
      unit: "per-mille（除以 1000 即比例）",
      total: records.length,
      version: "2026-08-30-demo",
      generated_at: new Date().toISOString(),
      source: "小红书蒲公英（示例数据）",
    },
    total: records.length,
    records,
  };
  const insights = buildInsights(records);
  // 同时输出 JSON（ETL 参考 / HTTP 拉取）和 JS（file:// 直接打开也能加载数据）
  writeFileSync(join(OUT_DIR, "data-full.json"), JSON.stringify(data));
  writeFileSync(join(OUT_DIR, "insights.json"), JSON.stringify(insights));
  writeFileSync(join(OUT_DIR, "data-full.js"), "window.PGW_DATA_FULL = " + JSON.stringify(data) + ";\n");
  writeFileSync(join(OUT_DIR, "insights.js"), "window.PGW_INSIGHTS = " + JSON.stringify(insights) + ";\n");
  console.log(`✔ 已生成 ${records.length} 条示例达人 → data/data-full.json / data-full.js`);
  console.log(`✔ 已生成行业洞察 → data/insights.json / insights.js`);
}

main();
