// Layout পুনর্গঠন: একটি পৃষ্ঠার বিশ্লেষণ → "পৃষ্ঠার মডেল" (কোন উপাদান কোথায়, কত বড় লেখা, কোন সারিতে)।
// মডেলটি Phase 10-এর Editor ও Phase 11-এর Export-এর ভিত্তি।

const A_SIZES = [
  ['A4', 595.28, 841.89], ['A3', 841.89, 1190.55], ['Letter', 612, 792]
];

/** পৃষ্ঠা কোন কাগজের মাপে (A4/A3/Letter) এবং কোন দিকে */
export function paperOf(size) {
  if (size.name && size.name !== 'ছবি') return { name: size.name, orientation: size.orientation };
  return { name: 'A4', orientation: size.width > size.height ? 'landscape' : 'portrait' };
}

/**
 * page: document-ocr.js-এর পৃষ্ঠার ফল ({ size, analysis, textReliable, ... })
 * ফেরত: { width, height, paper, margins, elements: [...] }
 */
export function buildPageModel(page) {
  const a = page.analysis;
  const W = page.size.width;
  const H = page.size.height;
  const elements = [];
  for (const b of a.blocks) {
    const el = {
      id: b.id, type: b.type, bbox: b.bbox,
      align: b.align || 'left',
      fontSize: b.fontSize || a.bodySize,
      bold: b.type === 'title' || b.type === 'subtitle' || b.type === 'heading',
      text: b.text || ''
    };
    if (b.type === 'list') { el.listType = b.listType; el.items = b.items.map((i) => ({ bbox: i.bbox, text: i.text })); el.fontSize = a.bodySize; }
    if (b.type === 'table') { el.table = a.tables[b.tableIndex]; el.fontSize = a.bodySize; }
    if (b.type === 'signature') { el.people = b.people; el.fontSize = a.bodySize; el.align = 'center'; }
    if (b.type === 'header' || b.type === 'footer') el.fontSize = a.bodySize * 0.9;
    elements.push(el);
  }
  const xs0 = elements.map((e) => e.bbox.x0); const ys0 = elements.map((e) => e.bbox.y0);
  const xs1 = elements.map((e) => e.bbox.x1); const ys1 = elements.map((e) => e.bbox.y1);
  const margins = elements.length
    ? { left: Math.min(...xs0), top: Math.min(...ys0), right: W - Math.max(...xs1), bottom: H - Math.max(...ys1) }
    : { left: 0, top: 0, right: 0, bottom: 0 };
  return { width: W, height: H, paper: paperOf(page.size), margins, elements, textReliable: page.textReliable };
}

export { A_SIZES };
