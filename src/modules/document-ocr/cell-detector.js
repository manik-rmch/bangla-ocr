// টেবিলের Cell (ঘর) বের করা: রেখার Grid থেকে সারি-কলাম, তারপর জোড়া (Merged) ঘর শনাক্ত।
// পুরোটাই সাধারণ হিসাব; Browser API লাগে না।

const GAP_COVERAGE = 0.5; // দুই ঘরের মাঝের দেয়ালের অর্ধেকের বেশি আঁকা না থাকলে ঘর দুটি জোড়া

/**
 * table: page-geometry.js-এর টেবিল ({ hLines, vLines } পৃষ্ঠার এককে)
 * ink: createInkMap-এর ফল (lineCoverage লাগে)
 * ফল: { nRows, nCols, rowEdges, colEdges, cells: [{ r, c, rowSpan, colSpan, bbox }], headerRows }
 */
export function buildGridFromRules(table, ink) {
  const ys = table.hLines.slice().sort((a, b) => a - b);
  const xs = table.vLines.slice().sort((a, b) => a - b);
  const nR = ys.length - 1;
  const nC = xs.length - 1;
  const id = (r, c) => r * nC + c;
  const parent = Array.from({ length: nR * nC }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { parent[find(a)] = find(b); };

  for (let r = 0; r < nR; r++) {
    for (let c = 0; c < nC; c++) {
      if (c < nC - 1 && ink.lineCoverage(xs[c + 1], ys[r], xs[c + 1], ys[r + 1]) < GAP_COVERAGE) union(id(r, c), id(r, c + 1));
      if (r < nR - 1 && ink.lineCoverage(xs[c], ys[r + 1], xs[c + 1], ys[r + 1]) < GAP_COVERAGE) union(id(r, c), id(r + 1, c));
    }
  }

  const groups = new Map();
  for (let r = 0; r < nR; r++) {
    for (let c = 0; c < nC; c++) {
      const g = find(id(r, c));
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push({ r, c });
    }
  }

  const cells = [];
  for (const members of groups.values()) {
    const r0 = Math.min(...members.map((m) => m.r));
    const r1 = Math.max(...members.map((m) => m.r));
    const c0 = Math.min(...members.map((m) => m.c));
    const c1 = Math.max(...members.map((m) => m.c));
    const rect = (r1 - r0 + 1) * (c1 - c0 + 1) === members.length;
    if (rect) {
      cells.push({ r: r0, c: c0, rowSpan: r1 - r0 + 1, colSpan: c1 - c0 + 1, bbox: { x0: xs[c0], y0: ys[r0], x1: xs[c1 + 1], y1: ys[r1 + 1] } });
    } else {
      // আয়তাকার নয় (অস্বাভাবিক) → নিরাপদে প্রতিটি ঘর আলাদা ধরা হয়
      for (const m of members) cells.push({ r: m.r, c: m.c, rowSpan: 1, colSpan: 1, bbox: { x0: xs[m.c], y0: ys[m.r], x1: xs[m.c + 1], y1: ys[m.r + 1] } });
    }
  }
  cells.sort((a, b) => a.r - b.r || a.c - b.c);
  return { nRows: nR, nCols: nC, rowEdges: ys, colEdges: xs, cells, headerRows: guessHeaderRows(cells) };
}

// প্রথম সারিতে জোড়া ঘর থাকলে Header একাধিক সারির ধরা হয় (যেমন উপরে "সময়", নিচে "সকাল/দুপুর/রাত")
export function guessHeaderRows(cells) {
  const top = cells.filter((c) => c.r === 0);
  const spans = top.filter((c) => c.colSpan > 1 || c.rowSpan > 1);
  if (!spans.length) return 1;
  const reach = Math.max(...top.map((c) => c.rowSpan));
  return Math.max(reach, spans.some((c) => c.colSpan > 1) ? 2 : 1);
}

/**
 * রেখা ছাড়া টেবিলের Grid: প্রতিটি লাইন = এক সারি; প্রতিটি টুকরো (seg) কলামের পরিসর অনুযায়ী ঘরে বসে।
 * colBands: [{ x0, x1 }]; lines: TextLine[]
 */
export function buildGridFromLines(lines, colBands) {
  const bands = colBands.slice().sort((a, b) => a.x0 - b.x0);
  const cells = [];
  const rowEdges = [];
  lines.forEach((l, r) => {
    rowEdges.push(l.y0);
    bands.forEach((b, c) => {
      const mine = l.segs.filter((s) => (s.x0 + s.x1) / 2 >= b.x0 && (s.x0 + s.x1) / 2 <= b.x1);
      cells.push({
        r, c, rowSpan: 1, colSpan: 1,
        bbox: { x0: b.x0, y0: l.y0, x1: b.x1, y1: l.y1 },
        text: mine.map((s) => s.text).join(' ').trim(),
        source: 'lines'
      });
    });
  });
  if (lines.length) rowEdges.push(lines[lines.length - 1].y1);
  return { nRows: lines.length, nCols: bands.length, rowEdges, colEdges: bands.flatMap((b) => [b.x0, b.x1]), cells, headerRows: 1 };
}

/** PDF-এর নিজস্ব লেখার টুকরো (items: {str,x,y,w,h}) ঘরে বসানো — টুকরোর কেন্দ্র যে ঘরে পড়ে */
export function fillCellsFromItems(grid, items) {
  for (const cell of grid.cells) {
    const mine = items.filter((it) => {
      const x = it.x + it.w / 2;
      const y = it.y + it.h / 2;
      return x >= cell.bbox.x0 && x <= cell.bbox.x1 && y >= cell.bbox.y0 && y <= cell.bbox.y1;
    });
    mine.sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.h, b.h) * 0.5 ? a.y - b.y : a.x - b.x));
    cell.text = mine.map((i) => i.str.replace(/\u0000/g, '')).join(' ').replace(/\s+/g, ' ').trim();
    cell.source = mine.length ? 'layer' : 'empty';
  }
}
