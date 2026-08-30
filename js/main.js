/* ============================================================
 * 启动入口：读取数据 → 解码 → 初始化 UI → 主线程打分。
 * 数据优先从 <script> 注入的全局变量读取（file:// 直接打开也能用）；
 * 若走 HTTP 且未注入，则回退到 fetch 拉取 JSON。
 * ============================================================ */
(function () {
  const state = createState();
  const el = (id) => document.getElementById(id);
  const CACHE_VER = "2026-08-30-demo";

  function setProgress(pct, text) {
    el("load-status-text").textContent = text || `加载达人数据 ${Math.round(pct)}%`;
  }

  function showBootError(msg) {
    el("load-status").classList.add("hidden");
    el("pool-total").textContent = "加载失败";
    console.error("[boot]", msg);
    alert("达人数据加载失败：\n" + msg + "\n\n请确认已生成 data/data-full.js 或可通过 HTTP 访问 data/data-full.json。");
  }

  function runMatchNow() {
    const t0 = performance.now();
    const results = runMatch(state.decoded.records, state.decoded.keyIdx, state.filters, state.meta);
    applyResults(results);
    console.log(`匹配完成：${results.length} 条 / ${Math.round(performance.now() - t0)}ms`);
  }

  async function boot() {
    try {
      let data, insights;
      if (window.PGW_DATA_FULL && window.PGW_INSIGHTS) {
        data = window.PGW_DATA_FULL;
        insights = window.PGW_INSIGHTS;
        setProgress(100, "数据就绪");
      } else {
        const dataPromise = fetchJSON(`data/data-full.json?v=${CACHE_VER}`, {
          timeoutMs: 90000,
          onProgress: (loaded, total) => {
            const pct = total > 0 ? (loaded / total) * 100 : Math.min(95, (loaded / 4000000) * 100);
            setProgress(pct);
          },
        });
        const insightsPromise = fetchJSON(`data/insights.json?v=${CACHE_VER}`, { timeoutMs: 20000 });
        [data, insights] = await Promise.all([dataPromise, insightsPromise]);
      }

      state.decoded = decodeData(data);
      state.meta = data.meta;
      state.insights = insights;
      el("pool-total").textContent = Number(data.total || 0).toLocaleString("zh-CN");
      el("load-status").classList.add("hidden");

      initUI(state, { onMatch: runMatchNow, onReset: resetFilters });
      runMatchNow();
    } catch (err) {
      showBootError(err && err.message ? err.message : String(err));
    }
  }

  boot();
})();
