// Document Analysis: একটি পৃষ্ঠার লাইন, টেবিল ও কালি-মানচিত্র থেকে বোঝা পৃষ্ঠায় কী কী আছে।
// শনাক্ত হয়: শিরোনাম, উপশিরোনাম, Heading, অনুচ্ছেদ, Bullet/Numbered তালিকা, টেবিল,
// স্বাক্ষর ব্লক (নাম, পদবি, প্রতিষ্ঠান), Header ও Footer।
//
// নিয়ম: কোনো লেখা অনুমান করে বসানো হয় না। লেখা ভাঙা (unreliable) হলে ব্লকের লেখা দেখানো হয় না,
// শুধু অবস্থান ও ধরন দেওয়া হয়। সবই এখানে "Layout-এর হিসাব"; লেখা পড়ার কাজ OCR করে (Phase 8-9)।

export const BLOCK_LABELS = {
  title: 'শিরোনাম',
  subtitle: 'উপশিরোনাম',
  heading: 'Heading',
  paragraph: 'অনুচ্ছেদ',
  list: 'তালিকা',
  table: 'টেবিল',
  signature: 'স্বাক্ষর',
  header: 'Header',
  footer: 'Footer'
};

const BULLET_RE = /^\s*([•●○◦▪■▫‣▸►➢·∙*\-–—])\s+/;
const NUM_RE = /^\s*(?:[(\[]?(?:[০-৯]{1,3}|\d{1,3})[.)\]।:]|[(\[](?:[ক-হ]|[a-zA-Z])[)\]]|(?:[ক-হ]|[a-zA-Z])[.)])\s+/;
const PAGE_NO_RE = /^\s*[-–]?\s*(?:(?:page|পৃষ্ঠা)\s*)?[\d০-৯]+(?:\s*(?:\/|of|এর)\s*[\d০-৯]+)?\s*[-–]?\s*$/i;
const PAREN_NAME_RE = /^[(（].{2,}[)）]\s*।?$/;

const median = (arr) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const bboxOf = (items) => ({
  x0: Math.min(...items.map((i) => i.x0)),
  y0: Math.min(...items.map((i) => i.y0)),
  x1: Math.max(...items.map((i) => i.x1)),
  y1: Math.max(...items.map((i) => i.y1))
});

const cx = (b) => (b.x0 + b.x1) / 2;
const cleanText = (lines) => lines.map((l) => l.text).join('\n');

/** অক্ষরের সাধারণ আকার: লেখার পরিমাণ অনুযায়ী ভারযুক্ত Median */
function bodySize(lines) {
  const weighted = [];
  for (const l of lines) {
    const n = Math.min(40, Math.max(1, l.text.replace(/\s+/g, '').length));
    for (let i = 0; i < n; i++) weighted.push(l.h);
  }
  return median(weighted) || 10;
}

function alignOf(lines, W) {
  if (lines.length === 0) return 'left';
  const centers = lines.map((l) => cx(l));
  const lefts = lines.map((l) => l.x0);
  const rights = lines.map((l) => l.x1);
  const spread = (a) => Math.max(...a) - Math.min(...a);
  const pageC = W / 2;
  const centered = centers.every((c) => Math.abs(c - pageC) < W * 0.05);
  if (centered && (lines.length === 1 ? true : spread(lefts) > W * 0.02)) return 'center';
  if (spread(rights) < W * 0.015 && spread(lefts) > W * 0.04) return 'right';
  if (spread(lefts) < W * 0.03) return lines.length > 2 && spread(rights.slice(0, -1)) < W * 0.03 ? 'justify' : 'left';
  return 'left';
}

/** ধারাবাহিক লাইনগুলো একটি ব্লকে জোড়া লাগাবে কি না */
function sameFlow(prev, cur, W) {
  const gap = cur.y0 - prev.y1;
  if (gap > Math.max(prev.h, cur.h) * 1.1) return false;
  if (Math.abs(prev.h - cur.h) > Math.max(prev.h, cur.h) * 0.2) return false;
  if (cur.x0 - prev.x0 > cur.h * 1.4 && prev.x1 > W * 0.6) return false; // নতুন অনুচ্ছেদের Indent
  return true;
}

/* ---------------- টেবিল ---------------- */

/** রেখা ছাড়া (Borderless) টেবিল: পরপর অনেক লাইনে একই জায়গায় ৩+ টুকরো */
function detectBorderless(lines, W) {
  const tables = [];
  const isRowLike = (l) => l.segs.length >= 3;
  let run = [];
  const flush = () => {
    if (run.length >= 3) {
      // কলামের পরিসর: টুকরোর x-পরিসর যেখানে ওভারল্যাপ করে সেখানে এক কলাম
      const segs = run.flatMap((l) => l.segs).sort((a, b) => a.x0 - b.x0);
      const cols = [];
      for (const s of segs) {
        const c = cols[cols.length - 1];
        if (c && s.x0 <= c.x1) { c.x1 = Math.max(c.x1, s.x1); c.n++; } else cols.push({ x0: s.x0, x1: s.x1, n: 1 });
      }
      const solid = cols.filter((c) => c.n >= run.length * 0.6);
      if (solid.length >= 3) {
        tables.push({ ...bboxOf(run), ruled: false, rows: run.length, cols: solid.length, lines: run });
      }
    }
    run = [];
  };
  for (const l of lines) {
    if (isRowLike(l) && (!run.length || l.y0 - run[run.length - 1].y1 < Math.max(l.h, run[run.length - 1].h) * 1.6)) {
      run.push(l);
    } else {
      flush();
      if (isRowLike(l)) run.push(l);
    }
  }
  flush();
  return tables;
}

/* ---------------- স্বাক্ষর ---------------- */

function detectSignatures(lines, ctx) {
  const { W, H, ink, tablesBottom } = ctx;
  const regionTop = tablesBottom !== null ? tablesBottom : H * 0.45;
  const segs = [];
  for (const l of lines) {
    if (l.y0 < regionTop - l.h) continue;
    for (const s of l.segs) {
      if (s.x1 - s.x0 < W * 0.45) segs.push({ ...s, y0: l.y0, y1: l.y1, h: l.h, line: l });
    }
  }
  segs.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

  // উপর-নিচে একই কলামে থাকা ছোট টুকরোগুলো এক "স্তূপ"
  const stacks = [];
  for (const s of segs) {
    let hit = null;
    for (const st of stacks) {
      const overlap = Math.min(st.x1, s.x1) - Math.max(st.x0, s.x0);
      const smaller = Math.min(st.x1 - st.x0, s.x1 - s.x0);
      const gap = s.y0 - st.y1;
      if (overlap >= smaller * 0.4 && gap < Math.max(s.h, st.h) * 2.4 && gap > -s.h * 0.5) { hit = st; break; }
    }
    if (hit) {
      hit.segs.push(s);
      hit.x0 = Math.min(hit.x0, s.x0); hit.x1 = Math.max(hit.x1, s.x1);
      hit.y1 = Math.max(hit.y1, s.y1); hit.h = Math.max(hit.h, s.h);
    } else {
      stacks.push({ segs: [s], x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1, h: s.h });
    }
  }

  const good = stacks.filter((st) => st.segs.length >= 2 && st.segs.length <= 6);
  const accepted = [];
  for (const st of good) {
    const siblings = good.filter((o) => o !== st && Math.abs(o.y0 - st.y0) < Math.max(o.h, st.h) * 3);
    const hasName = st.segs.slice(0, 2).some((s) => PAREN_NAME_RE.test(s.text.trim()));
    if (siblings.length >= 1 || (hasName && st.y0 > H * 0.55)) accepted.push(st);
  }
  accepted.sort((a, b) => a.x0 - b.x0);
  if (!accepted.length) return [];

  const used = new Set();
  const people = accepted.map((st) => {
    st.segs.forEach((s) => used.add(s.line));
    const texts = st.segs.map((s) => s.text.trim());
    const nameIdx = Math.max(0, texts.findIndex((t) => PAREN_NAME_RE.test(t)));
    const name = texts[nameIdx];
    const after = texts.slice(nameIdx + 1);
    const organization = after.length >= 2 ? after[after.length - 1] : '';
    const designation = after.length >= 2 ? after.slice(0, -1).join(' ') : after.join(' ');
    // নামের উপরে হাতের সই/ছবির কালি আছে কি না (ছাপা লাইন বাদ দিয়ে)
    let signatureInk = null;
    if (ink) {
      const nameSeg = st.segs[nameIdx];
      const others = lines.filter((l) => !st.segs.some((s) => s.line === l)).map((l) => ({ x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1 }));
      const r = ink.inkIn(
        { x0: st.x0 - 6, x1: st.x1 + 6, y0: Math.max(0, nameSeg.y0 - nameSeg.h * 5), y1: nameSeg.y0 - nameSeg.h * 0.1 },
        others
      );
      if (r.count > nameSeg.h * nameSeg.h * 0.6) signatureInk = r.bbox;
    }
    return {
      bbox: { x0: st.x0, y0: st.y0, x1: st.x1, y1: st.y1 },
      name, designation, organization,
      signatureInk,
      lines: st.segs.length
    };
  });
  return [{ people, used, bbox: bboxOf(people.map((p) => p.bbox)) }];
}

/* ---------------- মূল ফাংশন ---------------- */

/**
 * input: {
 *   page: { width, height },          // পৃষ্ঠার একক (PDF-এ Point)
 *   lines: TextLine[],
 *   ink: { tables, inkIn } | null,    // page-geometry.js-এর createInkMap ফল
 *   textReliable: boolean             // লেখা ভরসাযোগ্য হলে true
 * }
 * ফল: { blocks, tables, counts, bodySize }
 */
export function analyzePage(input) {
  const W = input.page.width;
  const H = input.page.height;
  const reliable = input.textReliable !== false;
  const ink = input.ink || null;
  const all = input.lines.slice().sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const body = bodySize(all);
  const blocks = [];
  let nextId = 1;
  const add = (type, bbox, extra = {}) => {
    const b = { id: nextId++, type, bbox, ...extra };
    blocks.push(b);
    return b;
  };
  const textOf = (lines) => (reliable ? cleanText(lines) : '');

  /* ১) টেবিল: আগে রেখা-ওয়ালা, পরে রেখা ছাড়া */
  const tableInfos = [];
  const taken = new Set();
  const lineCenterY = (l) => (l.y0 + l.y1) / 2;
  for (const t of ink ? ink.tables : []) {
    const inside = all.filter((l) => cx(l) >= t.x0 - 3 && cx(l) <= t.x1 + 3 && lineCenterY(l) >= t.y0 - 3 && lineCenterY(l) <= t.y1 + 3);
    inside.forEach((l) => taken.add(l));
    tableInfos.push({ x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1, ruled: true, rows: t.rows, cols: t.cols, textLines: inside.length });
  }
  const free = all.filter((l) => !taken.has(l));
  for (const t of detectBorderless(free, W)) {
    t.lines.forEach((l) => taken.add(l));
    tableInfos.push({ x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1, ruled: false, rows: t.rows, cols: t.cols, textLines: t.lines.length });
  }
  tableInfos.sort((a, b) => a.y0 - b.y0);
  for (const t of tableInfos) {
    add('table', { x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1 }, { ruled: t.ruled, rows: t.rows, cols: t.cols, textLines: t.textLines });
  }
  const tablesBottom = tableInfos.length ? Math.max(...tableInfos.map((t) => t.y1)) : null;

  let rest = all.filter((l) => !taken.has(l));

  /* ২) Header / Footer */
  const topEdge = H * 0.045;
  const bottomEdge = H * 0.955;
  const isHF = (l) => PAGE_NO_RE.test(l.text) || l.h <= body * 0.95;
  const headerLines = rest.filter((l) => l.y1 <= topEdge + l.h && isHF(l));
  const footerLines = rest.filter((l) => l.y0 >= bottomEdge - l.h && isHF(l));
  if (headerLines.length) add('header', bboxOf(headerLines), { text: textOf(headerLines), lines: headerLines.length });
  if (footerLines.length) add('footer', bboxOf(footerLines), { text: textOf(footerLines), lines: footerLines.length });
  rest = rest.filter((l) => !headerLines.includes(l) && !footerLines.includes(l));

  /* ৩) শিরোনাম ও উপশিরোনাম: উপরের মাঝ-বরাবর বড় লেখার গুচ্ছ */
  const isCentered = (l) => Math.abs(cx(l) - W / 2) < W * 0.07;
  const group = [];
  for (const l of rest) {
    const prev = group[group.length - 1];
    if (!isCentered(l) || l.x1 - l.x0 > W * 0.8) break;
    if (!group.length && (l.h < body * 1.12 || l.y0 > H * 0.35)) break;
    if (prev && l.y0 - prev.y1 > Math.max(prev.h, l.h) * 2.5) break;
    if (prev && l.h < prev.h * 0.8 && l.h < body * 1.12) break;
    group.push(l);
  }
  if (group.length) {
    const first = group[0];
    let titleLines = [];
    for (const l of group) { if (l.h >= first.h * 0.9 && titleLines.length === group.indexOf(l)) titleLines.push(l); else break; }
    let subLines = group.slice(titleLines.length);
    if (!subLines.length && titleLines.length >= 2) {
      const last = titleLines[titleLines.length - 1];
      const widest = Math.max(...titleLines.slice(0, -1).map((l) => l.x1 - l.x0));
      if (last.x1 - last.x0 < widest * 0.6) { subLines = [last]; titleLines = titleLines.slice(0, -1); }
    }
    add('title', bboxOf(titleLines), { text: textOf(titleLines), lines: titleLines.length, align: 'center', fontSize: first.h });
    if (subLines.length) add('subtitle', bboxOf(subLines), { text: textOf(subLines), lines: subLines.length, align: 'center', fontSize: subLines[0].h });
    rest = rest.filter((l) => !group.includes(l));
  }

  /* ৪) স্বাক্ষর ব্লক */
  const sig = detectSignatures(rest, { W, H, ink, tablesBottom });
  if (sig.length) {
    add('signature', sig[0].bbox, { people: sig[0].people, text: reliable ? sig[0].people.map((p) => [p.name, p.designation, p.organization].filter(Boolean).join('\n')).join('\n\n') : '' });
    rest = rest.filter((l) => !sig[0].used.has(l));
  }

  /* ৫) তালিকা, Heading, অনুচ্ছেদ */
  const markOf = (l) => {
    if (l.h >= body * 1.15) return null; // বড় অক্ষরের "১. পরিচিতি" Heading, তালিকা নয়
    const t = l.text;
    const b = BULLET_RE.exec(t);
    if (b) return { kind: 'bullet', cut: b[0].length };
    const n = NUM_RE.exec(t);
    if (n) return { kind: 'numbered', cut: n[0].length };
    if (ink) {
      // লেখার বাঁ পাশে ছোট একটি কালির ফোঁটা = Bullet চিহ্ন (PDF-এর বুলেট প্রায়ই ছবির মতো আঁকা থাকে)
      const r = ink.inkIn({ x0: l.x0 - l.h * 1.9, x1: l.x0 - l.h * 0.1, y0: l.y0, y1: l.y1 });
      if (r.count > 0 && r.bbox) {
        const bw = r.bbox.x1 - r.bbox.x0;
        const bh = r.bbox.y1 - r.bbox.y0;
        if (bw <= l.h * 0.75 && bh <= l.h * 0.75 && bw >= l.h * 0.12) return { kind: 'bullet', cut: 0 };
      }
    }
    return null;
  };

  let pendingList = null;
  const flushList = () => {
    if (!pendingList) return;
    const ls = pendingList.items.flatMap((it) => it.lines);
    add('list', bboxOf(ls), {
      listType: pendingList.kind,
      count: pendingList.items.length,
      items: pendingList.items.map((it) => ({ bbox: bboxOf(it.lines), text: reliable ? it.lines.map((l, i) => (i === 0 ? l.text.slice(it.cut) : l.text)).join(' ').trim() : '' })),
      text: reliable ? pendingList.items.map((it) => it.lines.map((l, i) => (i === 0 ? l.text.slice(it.cut) : l.text)).join(' ').trim()).join('\n') : '',
      align: 'left'
    });
    pendingList = null;
  };

  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    const first = para[0];
    const single = para.length === 1;
    const isHeading = single && first.h >= body * 1.15 && first.x1 - first.x0 < W * 0.85;
    add(isHeading ? 'heading' : 'paragraph', bboxOf(para), {
      text: textOf(para), lines: para.length, align: alignOf(para, W), fontSize: first.h
    });
    para = [];
  };

  for (const l of rest) {
    const mk = markOf(l);
    if (mk) {
      flushPara();
      if (!pendingList || pendingList.kind !== mk.kind) { flushList(); pendingList = { kind: mk.kind, items: [] }; }
      pendingList.items.push({ lines: [l], cut: mk.cut });
      continue;
    }
    if (pendingList) {
      const lastItem = pendingList.items[pendingList.items.length - 1];
      const prev = lastItem.lines[lastItem.lines.length - 1];
      // বাঁ দিকে ঢুকে থাকা পরের লাইন = আগের তালিকা-আইটেমেরই অংশ
      if (l.y0 - prev.y1 <= Math.max(prev.h, l.h) * 1.1 && l.x0 >= lastItem.lines[0].x0 - l.h * 0.5 && l.x0 <= lastItem.lines[0].x0 + l.h * 3 && Math.abs(l.h - prev.h) < prev.h * 0.2) {
        lastItem.lines.push(l);
        continue;
      }
      flushList();
    }
    if (para.length && !sameFlow(para[para.length - 1], l, W)) flushPara();
    para.push(l);
  }
  flushList();
  flushPara();

  blocks.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  blocks.forEach((b, i) => { b.id = i + 1; });

  const counts = {};
  for (const b of blocks) counts[b.type] = (counts[b.type] || 0) + 1;
  if (sig.length) counts.signaturePeople = sig[0].people.length;
  return {
    blocks,
    tables: tableInfos.map((t) => ({ bbox: { x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1 }, ruled: t.ruled, rows: t.rows, cols: t.cols })),
    counts,
    bodySize: body
  };
}
