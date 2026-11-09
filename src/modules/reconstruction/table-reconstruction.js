// টেবিল পুনর্গঠন: Phase 8-এর ঘরের Grid → মূল টেবিলের মতো HTML (কলামের প্রস্থ, সারির উচ্চতা, Border, জোড়া ঘর, ঘরের রঙ)।
import { escapeHtml } from '../../utils/helpers.js';

const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

/**
 * ঘরের পেছনের রং অনুমান: ঘরের ভেতরের কালো লেখা বাদ দিয়ে বাকি পিক্সেলের মধ্যমা রং।
 * প্রায় সাদা হলে null (রং নেই)।
 */
export function sampleBackground(canvas, rectPx) {
  const x0 = Math.max(0, Math.round(rectPx.x0));
  const y0 = Math.max(0, Math.round(rectPx.y0));
  const w = Math.min(canvas.width - x0, Math.round(rectPx.x1 - rectPx.x0));
  const h = Math.min(canvas.height - y0, Math.round(rectPx.y1 - rectPx.y0));
  if (w < 4 || h < 4) return null;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data;
  const rs = []; const gs = []; const bs = [];
  for (let i = 0; i < d.length; i += 16) { // প্রতি ৪র্থ পিক্সেল
    const lum = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    if (lum >= 110) { rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); }
  }
  if (rs.length < 20) return null;
  const r = median(rs); const g = median(gs); const b = median(bs);
  if (r > 244 && g > 244 && b > 244) return null;
  return `rgb(${r}, ${g}, ${b})`;
}

/** পুরো Grid-এর ঘরে bg বসানো */
export function sampleGridBackgrounds(grid, canvas, ppu) {
  for (const c of grid.cells) {
    const inset = Math.round(1.2 * ppu) + 1;
    c.bg = sampleBackground(canvas, {
      x0: c.bbox.x0 * ppu + inset, y0: c.bbox.y0 * ppu + inset, x1: c.bbox.x1 * ppu - inset, y1: c.bbox.y1 * ppu - inset
    });
  }
}

// কলামের লেখা ছোট হলে মাঝে, লম্বা হলে বাঁয়ে
function alignFor(grid, c) {
  const lens = grid.cells.filter((x) => x.c === c && x.r >= grid.headerRows && x.text).map((x) => Array.from(x.text).length);
  return median(lens) <= 28 ? 'center' : 'left';
}

/**
 * ফেরত: HTML স্ট্রিং। অবস্থান ও মাপ নির্ভর করে table.bbox ও page মাপের উপর।
 * ruled=false হলে Border ছাড়া।
 */
export function tableToHtml(table, page) {
  const g = table.grid;
  if (!g) return '';
  const W = page.size.width;
  const H = page.size.height;
  const b = table.bbox;
  const totalW = b.x1 - b.x0;
  const totalH = b.y1 - b.y0;

  // কলামের প্রস্থ: ruled হলে colEdges, নইলে সমান ভাগ
  let colPct;
  if (table.ruled && g.colEdges.length === g.nCols + 1) {
    const e = g.colEdges;
    colPct = Array.from({ length: g.nCols }, (_, i) => ((e[i + 1] - e[i]) / (e[g.nCols] - e[0])) * 100);
  } else {
    colPct = Array.from({ length: g.nCols }, () => 100 / g.nCols);
  }
  const rowH = table.ruled && g.rowEdges.length === g.nRows + 1
    ? Array.from({ length: g.nRows }, (_, i) => g.rowEdges[i + 1] - g.rowEdges[i])
    : Array.from({ length: g.nRows }, () => totalH / g.nRows);

  const aligns = Array.from({ length: g.nCols }, (_, c) => alignFor(g, c));
  const rows = [];
  for (let r = 0; r < g.nRows; r++) {
    const tag = r < g.headerRows ? 'th' : 'td';
    const hPct = (rowH[r] / H) * 100;
    const cells = g.cells.filter((c) => c.r === r).sort((x, y) => x.c - y.c).map((c) => {
      const f = c.flags || [];
      const cls = ['rc-cell'];
      if (f.includes('suggest')) cls.push('is-suggest'); else if (f.includes('pattern')) cls.push('is-pattern'); else if (f.includes('low')) cls.push('is-low');
      const style = [`text-align:${tag === 'th' ? 'center' : aligns[c.c]}`];
      if (c.bg && !f.length) style.push(`background:${c.bg}`);
      return `<${tag} class="${cls.join(' ')}" rowspan="${c.rowSpan}" colspan="${c.colSpan}" style="${style.join(';')}">${escapeHtml(c.text || '')}</${tag}>`;
    });
    rows.push(`<tr style="height:${hPct.toFixed(3)}cqh">${cells.join('')}</tr>`);
  }
  void W; void totalW;
  return `<table class="rc-table${table.ruled ? ' is-ruled' : ''}"><colgroup>${colPct.map((p) => `<col style="width:${p.toFixed(3)}%">`).join('')}</colgroup><tbody>${rows.join('')}</tbody></table>`;
}
