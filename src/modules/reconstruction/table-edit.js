// টেবিল সম্পাদনার সব হিসাব (সারি/কলাম যোগ-মোছা, ঘর জোড়া/ভাঙা, উচ্চতা/প্রস্থ)।
// এখানে কোনো Browser API নেই; তাই সহজে পরীক্ষা করা যায়।
// Grid = { nRows, nCols, rowEdges, colEdges, cells: [{ r, c, rowSpan, colSpan, text, ... }], headerRows }

const AX = {
  row: { pos: 'r', span: 'rowSpan', n: 'nRows', edges: 'rowEdges' },
  col: { pos: 'c', span: 'colSpan', n: 'nCols', edges: 'colEdges' }
};
const OTHER = { row: 'col', col: 'row' };
export const MIN_ROW = 6;
export const MIN_COL = 10;

const sortCells = (g) => g.cells.sort((a, b) => a.r - b.r || a.c - b.c);

/** সারি/কলামের সীমারেখা ঠিক আছে কি না দেখে, না থাকলে টেবিলের মাপ থেকে সমান ভাগে বানায় */
export function normalizeGrid(grid, bbox) {
  const fix = (axis, from, to) => {
    const A = AX[axis];
    if (!Array.isArray(grid[A.edges]) || grid[A.edges].length !== grid[A.n] + 1) {
      grid[A.edges] = Array.from({ length: grid[A.n] + 1 }, (_, i) => from + ((to - from) * i) / grid[A.n]);
    }
  };
  fix('row', bbox.y0, bbox.y1);
  fix('col', bbox.x0, bbox.x1);
  refreshBoxes(grid);
  return grid;
}

export function refreshBoxes(grid) {
  for (const c of grid.cells) {
    c.bbox = { x0: grid.colEdges[c.c], x1: grid.colEdges[c.c + c.colSpan], y0: grid.rowEdges[c.r], y1: grid.rowEdges[c.r + c.rowSpan] };
  }
}

/** index-এর আগে একটি নতুন সারি/কলাম বসায় (index = n হলে শেষে) */
export function insertLine(grid, axis, index) {
  const A = AX[axis]; const B = AX[OTHER[axis]];
  if (!Number.isInteger(index)) return;
  index = Math.max(0, Math.min(grid[A.n], index)); // সীমার বাইরে হলে প্রান্তে বসে
  const covered = new Set();
  for (const cell of grid.cells) {
    const p = cell[A.pos]; const sp = cell[A.span];
    if (p < index && p + sp > index) {
      cell[A.span]++;
      for (let k = 0; k < cell[B.span]; k++) covered.add(cell[B.pos] + k);
    } else if (p >= index) cell[A.pos]++;
  }
  for (let q = 0; q < grid[B.n]; q++) {
    if (covered.has(q)) continue;
    grid.cells.push({ [A.pos]: index, [B.pos]: q, rowSpan: 1, colSpan: 1, text: '', source: 'edited', conf: 100, flags: [], bbox: null });
  }
  const e = grid[A.edges];
  const ref = index > 0 ? e[index] - e[index - 1] : e[1] - e[0];
  grid[A.edges] = [...e.slice(0, index + 1), ...e.slice(index).map((v) => v + ref)];
  grid[A.n]++;
  if (axis === 'row' && index < grid.headerRows) grid.headerRows++;
  sortCells(grid); refreshBoxes(grid);
}

export function deleteLine(grid, axis, index) {
  const A = AX[axis];
  if (grid[A.n] <= 1 || index < 0 || index >= grid[A.n]) return false;
  grid.cells = grid.cells.filter((cell) => !(cell[A.pos] === index && cell[A.span] === 1));
  for (const cell of grid.cells) {
    const p = cell[A.pos]; const sp = cell[A.span];
    if (p <= index && index < p + sp) cell[A.span]--;
    else if (p > index) cell[A.pos]--;
  }
  const e = grid[A.edges];
  const sz = e[index + 1] - e[index];
  grid[A.edges] = [...e.slice(0, index + 1), ...e.slice(index + 2).map((v) => v - sz)];
  grid[A.n]--;
  if (axis === 'row' && index < grid.headerRows) grid.headerRows = Math.max(0, grid.headerRows - 1);
  sortCells(grid); refreshBoxes(grid);
  return true;
}

export function cellAt(grid, r, c) {
  return grid.cells.find((x) => r >= x.r && r < x.r + x.rowSpan && c >= x.c && c < x.c + x.colSpan) || null;
}

/** নির্বাচিত আয়তক্ষেত্র থেকে একটি আস্ত ঘর-সমষ্টি: আংশিক জোড়া ঘর থাকলে আয়তক্ষেত্র বড় হয় */
export function expandSelection(grid, sel) {
  let { r0, c0, r1, c1 } = sel;
  let changed = true;
  while (changed) {
    changed = false;
    for (const x of grid.cells) {
      const overlap = x.r <= r1 && x.r + x.rowSpan - 1 >= r0 && x.c <= c1 && x.c + x.colSpan - 1 >= c0;
      if (!overlap) continue;
      const nr0 = Math.min(r0, x.r); const nc0 = Math.min(c0, x.c);
      const nr1 = Math.max(r1, x.r + x.rowSpan - 1); const nc1 = Math.max(c1, x.c + x.colSpan - 1);
      if (nr0 !== r0 || nc0 !== c0 || nr1 !== r1 || nc1 !== c1) { r0 = nr0; c0 = nc0; r1 = nr1; c1 = nc1; changed = true; }
    }
  }
  return { r0, c0, r1, c1 };
}

/** ঘর জোড়া। ফেরত: নতুন জোড়া ঘর অথবা null (একটি ঘর হলে কিছু হয় না) */
export function mergeCells(grid, sel) {
  const s = expandSelection(grid, sel);
  const inside = grid.cells.filter((x) => x.r >= s.r0 && x.r + x.rowSpan - 1 <= s.r1 && x.c >= s.c0 && x.c + x.colSpan - 1 <= s.c1);
  if (inside.length < 2) return null;
  inside.sort((a, b) => a.r - b.r || a.c - b.c);
  const first = inside[0];
  first.text = inside.map((x) => (x.text || '').trim()).filter(Boolean).join(' ');
  first.rowSpan = s.r1 - s.r0 + 1;
  first.colSpan = s.c1 - s.c0 + 1;
  first.flags = [];
  first.suggestion = null;
  const drop = new Set(inside.slice(1));
  grid.cells = grid.cells.filter((x) => !drop.has(x));
  sortCells(grid); refreshBoxes(grid);
  return first;
}

/** জোড়া ঘর আবার আলাদা ঘরে ভাঙা; লেখা প্রথম ঘরে থাকে */
export function splitCell(grid, cell) {
  if (cell.rowSpan === 1 && cell.colSpan === 1) return false;
  const { r, c, rowSpan, colSpan } = cell;
  cell.rowSpan = 1; cell.colSpan = 1;
  for (let i = 0; i < rowSpan; i++) {
    for (let j = 0; j < colSpan; j++) {
      if (i === 0 && j === 0) continue;
      grid.cells.push({ r: r + i, c: c + j, rowSpan: 1, colSpan: 1, text: '', source: 'edited', conf: 100, flags: [], bbox: null, bg: cell.bg || null });
    }
  }
  sortCells(grid); refreshBoxes(grid);
  return true;
}

export function rowHeights(grid) { return grid.rowEdges.slice(1).map((v, i) => v - grid.rowEdges[i]); }
export function colWidths(grid) { return grid.colEdges.slice(1).map((v, i) => v - grid.colEdges[i]); }

function setEdges(grid, axis, sizes) {
  const A = AX[axis];
  const out = [grid[A.edges][0]];
  sizes.forEach((s) => out.push(out[out.length - 1] + s));
  grid[A.edges] = out;
  refreshBoxes(grid);
}

export const MAX_ROW = 2000;
export function setRowHeight(grid, r, h) {
  if (!Number.isInteger(r) || r < 0 || r >= grid.nRows || !Number.isFinite(h)) return; // অবৈধ মান উপেক্ষা
  h = Math.min(MAX_ROW, h);
  const hs = rowHeights(grid);
  hs[r] = Math.max(MIN_ROW, h);
  setEdges(grid, 'row', hs);
}

/** কলামের প্রস্থ বদলালে টেবিলের মোট প্রস্থ ঠিক থাকে; বাকি কলাম আনুপাতিক হারে ছোট/বড় হয় */
export function setColWidth(grid, c, w) {
  if (!Number.isInteger(c) || c < 0 || c >= grid.nCols || !Number.isFinite(w)) return; // অবৈধ মান উপেক্ষা
  const ws = colWidths(grid);
  const total = ws.reduce((a, b) => a + b, 0);
  if (ws.length === 1) return;
  const maxW = total - MIN_COL * (ws.length - 1);
  const nw = Math.max(MIN_COL, Math.min(maxW, w));
  const restOld = total - ws[c];
  const restNew = total - nw;
  const out = ws.map((x, i) => (i === c ? nw : Math.max(MIN_COL, (x / restOld) * restNew)));
  setEdges(grid, 'col', out);
}
