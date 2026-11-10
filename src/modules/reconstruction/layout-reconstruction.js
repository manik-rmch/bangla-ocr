// Layout পুনর্গঠন: একটি পৃষ্ঠার বিশ্লেষণ → "পৃষ্ঠার মডেল" ও আঁকার হিসাব (মাপ, Margin, স্কেল, টেবিল বাড়লে নিচের উপাদান সরানো)।
// Phase 10-এ ব্যবহারকারীর পরিবর্তন (page.edit, block.style, টেবিলের Grid) এখান দিয়েই আঁকায় প্রভাব ফেলে।

export const PAPERS = {
  A4: { w: 595.28, h: 841.89 },
  A3: { w: 841.89, h: 1190.55 },
  Letter: { w: 612, h: 792 }
};
export const MM = 72 / 25.4; // ১ মিমি = এত Point
export const FONT_FACTOR = 0.95; // ব্রাউজারের বাংলা ফন্ট Nikosh-এর চেয়ে সামান্য চওড়া; তাই সামান্য ছোট করে শুরু

export function paperDims(name, orientation) {
  const p = PAPERS[name] || PAPERS.A4;
  return orientation === 'landscape' ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

/** পৃষ্ঠা কোন কাগজে (A4/A3/Letter) ও কোন দিকে */
export function paperOf(size) {
  const orientation = size.orientation || (size.width > size.height ? 'landscape' : 'portrait');
  const name = PAPERS[size.name] ? size.name : 'A4';
  return { name, orientation };
}

export function buildPageModel(page) {
  const a = page.analysis;
  const W = page.size.width;
  const H = page.size.height;
  const elements = [];
  for (const b of a.blocks) {
    const el = {
      id: b.id, type: b.type, bbox: b.bbox, block: b,
      align: b.align || 'left',
      fontSize: b.fontSize || a.bodySize,
      bold: b.type === 'title' || b.type === 'subtitle' || b.type === 'heading',
      text: b.text || '',
      style: b.style || {}
    };
    if (b.type === 'list') { el.listType = b.listType; el.items = b.items; el.fontSize = a.bodySize; }
    if (b.type === 'table') { el.table = a.tables[b.tableIndex]; el.fontSize = a.bodySize; }
    if (b.type === 'signature') { el.people = b.people; el.fontSize = a.bodySize; el.align = 'center'; }
    if (b.type === 'header' || b.type === 'footer') el.fontSize = a.bodySize * 0.9;
    elements.push(el);
  }
  const xs0 = elements.map((e) => e.bbox.x0); const ys0 = elements.map((e) => e.bbox.y0);
  const xs1 = elements.map((e) => e.bbox.x1); const ys1 = elements.map((e) => e.bbox.y1);
  const margins = elements.length
    ? { left: Math.min(...xs0), top: Math.min(...ys0), right: Math.max(0, W - Math.max(...xs1)), bottom: Math.max(0, H - Math.max(...ys1)) }
    : { left: 0, top: 0, right: 0, bottom: 0 };
  return { width: W, height: H, paper: paperOf(page.size), margins, elements, bodySize: a.bodySize, textReliable: page.textReliable };
}

// টেবিলের বর্তমান উচ্চতা (সম্পাদনার পর বদলাতে পারে) — মূল এককে
function tableHeight(t) {
  const g = t && t.grid;
  if (g && Array.isArray(g.rowEdges) && g.rowEdges.length === g.nRows + 1) return g.rowEdges[g.nRows] - g.rowEdges[0];
  return t.bbox.y1 - t.bbox.y0;
}

/**
 * আঁকার সব হিসাব। ফেরত:
 *  Wpt, Hpt: পৃষ্ঠার মাপ (Point); S: মূল একক → Point; X(x), Y(y), L(len): স্থানাঙ্ক রূপান্তর
 *  margins (Point), detected (Point)
 */
export function computeLayout(page, model) {
  const e = page.edit || {};
  const paper = { name: e.paper || model.paper.name, orientation: e.orientation || model.paper.orientation };
  const origDims = paperDims(model.paper.name, model.paper.orientation);
  const isImage = page.size.name === 'ছবি';
  const up = isImage ? origDims.w / model.width : 1; // ছবির পিক্সেল → Point
  const origW = model.width * up;
  const origH = model.height * up;
  const det = { left: model.margins.left * up, top: model.margins.top * up, right: model.margins.right * up, bottom: model.margins.bottom * up };

  const changed = !!(e.paper || e.orientation);
  const dims = changed ? paperDims(paper.name, paper.orientation) : { w: origW, h: origH };
  const mg = {
    left: e.margins && Number.isFinite(e.margins.left) ? e.margins.left : det.left,
    top: e.margins && Number.isFinite(e.margins.top) ? e.margins.top : det.top,
    right: e.margins && Number.isFinite(e.margins.right) ? e.margins.right : det.right,
    bottom: e.margins && Number.isFinite(e.margins.bottom) ? e.margins.bottom : det.bottom
  };
  const contentW0 = origW - det.left - det.right;
  const areaW = dims.w - mg.left - mg.right;
  const s = contentW0 > 1 && areaW > 20 ? areaW / contentW0 : 1;
  const S = up * s;
  const dx = mg.left - det.left * s;
  const dy = mg.top - det.top * s;

  // টেবিল বাড়লে/কমলে তার নিচের উপাদান সরে যায়
  const tables = model.elements.filter((x) => x.type === 'table');
  const deltas = tables.map((t) => ({ below: t.bbox.y1, d: tableHeight(t.table) - (t.bbox.y1 - t.bbox.y0) }));
  const shift = (y) => deltas.reduce((acc, t) => (t.below <= y + 0.5 ? acc + t.d : acc), 0);

  const X = (x) => dx + x * S;
  const Y = (y) => dy + (y + shift(y)) * S;
  const L = (len) => len * S;

  let bottom = 0;
  for (const el of model.elements) {
    const b = el.bbox;
    const h = el.type === 'table' ? tableHeight(el.table) : b.y1 - b.y0;
    bottom = Math.max(bottom, Y(b.y0) + L(h));
  }
  const Hpt = Math.max(dims.h, bottom + mg.bottom * 0.6);
  return { Wpt: dims.w, Hpt, pageH: dims.h, S, X, Y, L, margins: mg, detected: det, paper, overflow: Hpt > dims.h + 1, up };
}
