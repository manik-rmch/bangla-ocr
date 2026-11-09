// পৃষ্ঠার ছবি (পিক্সেল) থেকে টেবিলের রেখা, টেবিলের এলাকা এবং "কালি আছে কি না" বের করা।
// এই ফাইলে কোনো Browser API নেই, শুধু সাধারণ JavaScript; তাই সহজে পরীক্ষা করা যায়।
// (OpenCV.js Phase 8-এ Cell Detection-এর জন্য যুক্ত হবে; এই ধাপে অতিরিক্ত ডাউনলোড লাগে না।)

// কালি ধরার সর্বোচ্চ উজ্জ্বলতা। সরকারি ছকে ধূসর (Shaded) সারি থাকে; সেটি যেন কালি না ধরা হয়।
const INK_CAP = 150;

/** RGBA ডেটা থেকে ধূসর (০–২৫৫)। স্বচ্ছ পিক্সেল সাদা পেছনের উপর ধরা হয়। */
export function toGray(rgba, pixelCount) {
  const g = new Uint8Array(pixelCount);
  for (let i = 0, j = 0; i < pixelCount; i++, j += 4) {
    const v = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
    const a = rgba[j + 3];
    g[i] = a === 255 ? v + 0.5 : (v * a + 255 * (255 - a)) / 255 + 0.5;
  }
  return g;
}

/** Otsu পদ্ধতিতে কালো-সাদা ভাগ করার সীমা */
export function otsuThreshold(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/** ধূসর → কালি-মানচিত্র (১ = কালি) */
export function binarize(gray) {
  const t = Math.min(otsuThreshold(gray), INK_CAP);
  const bin = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) bin[i] = gray[i] <= t ? 1 : 0;
  return { bin, threshold: t };
}

// সারি (অনুভূমিক) বা কলাম (উলম্ব) ধরে লম্বা কালির ফালি খোঁজা
function findRuns(bin, w, h, vertical, minLen, gap) {
  const outer = vertical ? w : h;
  const inner = vertical ? h : w;
  const runs = [];
  for (let p = 0; p < outer; p++) {
    let start = -1;
    let last = -1;
    for (let q = 0; q < inner; q++) {
      const v = vertical ? bin[q * w + p] : bin[p * w + q];
      if (v) {
        if (start < 0) start = q;
        last = q;
      } else if (start >= 0 && q - last > gap) {
        if (last - start + 1 >= minLen) runs.push({ pos: p, a: start, b: last });
        start = -1;
      }
    }
    if (start >= 0 && last - start + 1 >= minLen) runs.push({ pos: p, a: start, b: last });
  }
  return runs;
}

// পাশাপাশি সারির ফালিগুলো জুড়ে একটি রেখা বানানো (মোটা রেখা = অনেক সারি)
function mergeRuns(runs, maxThickness) {
  const open = [];
  const done = [];
  for (const r of runs) {
    for (let i = open.length - 1; i >= 0; i--) {
      if (open[i].p1 < r.pos - 1) done.push(open.splice(i, 1)[0]);
    }
    let hit = null;
    for (const b of open) {
      const overlap = Math.min(b.b, r.b) - Math.max(b.a, r.a) + 1;
      const smaller = Math.min(b.b - b.a + 1, r.b - r.a + 1);
      if (b.p1 >= r.pos - 1 && overlap >= smaller * 0.7) { hit = b; break; }
    }
    if (hit) {
      hit.p1 = r.pos;
      hit.a = Math.min(hit.a, r.a);
      hit.b = Math.max(hit.b, r.b);
    } else {
      open.push({ p0: r.pos, p1: r.pos, a: r.a, b: r.b });
    }
  }
  done.push(...open);
  return done
    .filter((b) => b.p1 - b.p0 + 1 <= maxThickness)
    .map((b) => ({ pos: (b.p0 + b.p1) / 2, th: b.p1 - b.p0 + 1, a: b.a, b: b.b }));
}

/**
 * টেবিলের রেখা খোঁজা এবং রেখাগুলো জুড়ে টেবিল (Grid) বানানো।
 * অনুভূমিক রেখা ছোট হলে (বাংলা অক্ষরের মাত্রা-র মতো) তা কেবল তখনই নেওয়া হয় যখন উলম্ব রেখার সঙ্গে মেলে।
 * ফল (পিক্সেলে): { tables: [{ x0, y0, x1, y1, hLines: [y..], vLines: [x..] }] }
 */
export function detectRuledTables(bin, w, h) {
  const maxTh = Math.max(6, Math.round(w / 180));
  const hLines = mergeRuns(findRuns(bin, w, h, false, Math.max(24, Math.round(w * 0.025)), 2), maxTh)
    .map((l) => ({ y: l.pos, x0: l.a, x1: l.b, th: l.th }));
  const vLines = mergeRuns(findRuns(bin, w, h, true, Math.max(30, Math.round(h * 0.02)), 2), maxTh)
    .map((l) => ({ x: l.pos, y0: l.a, y1: l.b, th: l.th }));

  const tol = Math.max(3, Math.round(w / 400));
  const n = hLines.length + vLines.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { parent[find(a)] = find(b); };

  const hi = hLines.length;
  for (let i = 0; i < hLines.length; i++) {
    const H = hLines[i];
    for (let j = 0; j < vLines.length; j++) {
      const V = vLines[j];
      if (V.x >= H.x0 - tol && V.x <= H.x1 + tol && H.y >= V.y0 - tol && H.y <= V.y1 + tol) union(i, hi + j);
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, { hs: [], vs: [] });
    if (i < hi) groups.get(r).hs.push(hLines[i]); else groups.get(r).vs.push(vLines[i - hi]);
  }

  const uniq = (arr, gapPx) => {
    const sorted = arr.slice().sort((a, b) => a - b);
    const out = [];
    for (const v of sorted) {
      if (!out.length || v - out[out.length - 1].last > gapPx) out.push({ sum: v, count: 1, last: v });
      else { const o = out[out.length - 1]; o.sum += v; o.count++; o.last = v; }
    }
    return out.map((o) => o.sum / o.count);
  };

  const tables = [];
  for (const g of groups.values()) {
    const ys = uniq(g.hs.map((l) => l.y), tol + 1);
    const xs = uniq(g.vs.map((l) => l.x), tol + 1);
    if (ys.length < 2 || xs.length < 2) continue;
    const x0 = Math.min(...g.hs.map((l) => l.x0), ...g.vs.map((l) => l.x));
    const x1 = Math.max(...g.hs.map((l) => l.x1), ...g.vs.map((l) => l.x));
    const y0 = Math.min(...g.vs.map((l) => l.y0), ...g.hs.map((l) => l.y));
    const y1 = Math.max(...g.vs.map((l) => l.y1), ...g.hs.map((l) => l.y));
    tables.push({ x0, y0, x1, y1, hLines: ys, vLines: xs });
  }
  tables.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  return { tables };
}

/**
 * পৃষ্ঠার "কালি-মানচিত্র": টেবিল এবং "এই আয়তক্ষেত্রে কালি আছে কি না" প্রশ্নের উত্তর।
 * সব ফল পৃষ্ঠার নিজস্ব একক (PDF-এ Point) -এ; pageW = সেই এককে পৃষ্ঠার প্রস্থ।
 */
export function createInkMap(gray, pxW, pxH, pageW) {
  const { bin, threshold } = binarize(gray);
  const k = pageW / pxW; // পিক্সেল → পৃষ্ঠার একক
  const raw = detectRuledTables(bin, pxW, pxH);
  const tables = raw.tables.map((t) => ({
    x0: t.x0 * k, y0: t.y0 * k, x1: t.x1 * k, y1: t.y1 * k,
    rows: t.hLines.length - 1,
    cols: t.vLines.length - 1,
    hLines: t.hLines.map((y) => y * k),
    vLines: t.vLines.map((x) => x * k)
  }));

  /** rect (পৃষ্ঠার এককে) -এর ভেতরে কালি। exclude = বাদ দেওয়ার আয়তক্ষেত্র (যেমন ছাপা লেখার লাইন)। */
  function inkIn(rect, exclude = []) {
    const x0 = Math.max(0, Math.floor(rect.x0 / k));
    const x1 = Math.min(pxW - 1, Math.ceil(rect.x1 / k));
    const y0 = Math.max(0, Math.floor(rect.y0 / k));
    const y1 = Math.min(pxH - 1, Math.ceil(rect.y1 / k));
    const ex = exclude.map((e) => ({ x0: e.x0 / k, x1: e.x1 / k, y0: e.y0 / k, y1: e.y1 / k }));
    let count = 0;
    let bx0 = Infinity; let by0 = Infinity; let bx1 = -1; let by1 = -1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!bin[y * pxW + x]) continue;
        let skip = false;
        for (const e of ex) { if (x >= e.x0 && x <= e.x1 && y >= e.y0 && y <= e.y1) { skip = true; break; } }
        if (skip) continue;
        count++;
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
    }
    if (!count) return { count: 0, bbox: null };
    return { count, bbox: { x0: bx0 * k, y0: by0 * k, x1: (bx1 + 1) * k, y1: (by1 + 1) * k } };
  }

  /**
   * একটি সরল রেখা-অংশ (সোজা উলম্ব বা অনুভূমিক) বরাবর কত ভাগ জায়গায় কালি আছে (০–১)।
   * টেবিলের দুই ঘরের মাঝের দেয়াল সত্যিই আঁকা আছে, নাকি ঘর দুটি জোড়া (Merged), তা বোঝার কাজে লাগে।
   */
  function lineCoverage(ax, ay, bx, by) {
    const vertical = Math.abs(bx - ax) < Math.abs(by - ay);
    const tol = 2;
    const p = Math.round((vertical ? ax : ay) / k);
    const from = Math.round((vertical ? Math.min(ay, by) : Math.min(ax, bx)) / k) + 2;
    const to = Math.round((vertical ? Math.max(ay, by) : Math.max(ax, bx)) / k) - 2;
    if (to <= from) return 1;
    let hit = 0;
    for (let q = from; q <= to; q++) {
      let found = false;
      for (let d = -tol; d <= tol && !found; d++) {
        const x = vertical ? p + d : q;
        const y = vertical ? q : p + d;
        if (x >= 0 && y >= 0 && x < pxW && y < pxH && bin[y * pxW + x]) found = true;
      }
      if (found) hit++;
    }
    return hit / (to - from + 1);
  }

  return { tables, inkIn, lineCoverage, threshold };
}
