/* ============================================================
 * 数据层：加载 data-full.json / insights.json，解码并暴露访问器。
 * 记录采用「按 meta.keys 定位的数组」存储，体积更小、加载更快。
 * ============================================================ */

async function fetchJSON(url, { timeoutMs = 90000, onProgress } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const total = parseInt(resp.headers.get("content-length") || "0", 10) || 0;
    if (!resp.body || !resp.body.getReader) {
      const text = await resp.text();
      onProgress?.(text.length, text.length || total);
      return JSON.parse(text);
    }
    const reader = resp.body.getReader();
    const chunks = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      onProgress?.(loaded, total);
    }
    const buf = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.length; }
    return JSON.parse(new TextDecoder("utf-8").decode(buf));
  } finally {
    clearTimeout(timer);
  }
}

function decodeData(raw) {
  const meta = raw.meta;
  const keyIdx = {};
  meta.keys.forEach((k, i) => { keyIdx[k] = i; });
  const records = raw.records || [];
  const key = (r, name) => r[keyIdx[name]];

  // 派生访问器（千分位 → 比例）
  const pct = (r, name) => (Number(key(r, name)) || 0) / 1000;

  const crowdMap = (r) => {
    const arr = key(r, "crowd") || [];
    const o = {};
    meta.crowd_list.forEach((k, i) => { o[k] = (arr[i] || 0) / 1000; });
    return o;
  };
  const ageMap = (r) => {
    const arr = key(r, "age") || [];
    const o = {};
    meta.age_list.forEach((k, i) => { o[k] = (arr[i] || 0) / 1000; });
    return o;
  };
  const cityMap = (r) => {
    const flat = key(r, "city") || [];
    const o = {};
    for (let i = 0; i + 1 < flat.length; i += 2) o[flat[i]] = (flat[i + 1] || 0) / 1000;
    return o;
  };

  const nameOf = (list, r, field) => {
    const idx = key(r, field);
    return (list[idx] || "").toString();
  };

  return { meta, keyIdx, records, key, pct, crowdMap, ageMap, cityMap, nameOf };
}

function accessor(data) {
  const { keyIdx, records } = data;
  return {
    K: (r, name) => r[keyIdx[name]],
    tier: (r) => (data.meta.tier[r[keyIdx.tier]] || ""),
    persona: (r) => (data.meta.persona[r[keyIdx.per]] || ""),
    dim: (r) => (data.meta.dim[r[keyIdx.dim]] || ""),
    identity: (r) => (data.meta.identity[r[keyIdx.ide]] || ""),
    isVertical: (r, indIdx) => indIdx >= 0 && ((r[keyIdx.vmask] || 0) & (1 << indIdx)) !== 0,
  };
}
