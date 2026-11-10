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
 * ফেরত: টেবিলের HTML। ctx = { S (মূল একক → Point), Hpt (পৃষ্ঠার উচ্চতা), edit (সম্পাদনা-মোড), ti (টেবিলের ক্রম) }
 * Grid-এর rowEdges/colEdges থেকে মাপ নেয়; তাই সারি-কলাম বদলালে মাপও বদলায়।
 * grid.border = 'thin' | 'thick' | 'none' (না থাকলে: রেখা-ওয়ালা টেবিলে thin)
 */
export function tableToHtml(table, ctx) {
  const g = table.grid;
  if (!g) return '';
  const colEdgesOk = Array.isArray(g.colEdges) && g.colEdges.length === g.nCols + 1;
  const rowEdgesOk = Array.isArray(g.rowEdges) && g.rowEdges.length === g.nRows + 1;
  const totalH = table.bbox.y1 - table.bbox.y0;
  const colPct = colEdgesOk
    ? Array.from({ length: g.nCols }, (_, i) => ((g.colEdges[i + 1] - g.colEdges[i]) / (g.colEdges[g.nCols] - g.colEdges[0])) * 100)
    : Array.from({ length: g.nCols }, () => 100 / g.nCols);
  const rowH = rowEdgesOk
    ? Array.from({ length: g.nRows }, (_, i) => g.rowEdges[i + 1] - g.rowEdges[i])
    : Array.from({ length: g.nRows }, () => totalH / g.nRows);
  const border = (g.style && g.style.border) || (table.ruled ? 'thin' : 'none');
  const aligns = Array.from({ length: g.nCols }, (_, c) => alignFor(g, c));
  const ed = ctx.edit ? ' contenteditable="true" spellcheck="false"' : '';

  const rows = [];
  for (let r = 0; r < g.nRows; r++) {
    const tag = r < g.headerRows ? 'th' : 'td';
    const hPct = ((rowH[r] * ctx.S) / ctx.Hpt) * 100;
    const cells = g.cells.filter((c) => c.r === r).sort((x, y) => x.c - y.c).map((c) => {
      const f = c.flags || [];
      const cls = ['rc-cell'];
      if (f.includes('suggest')) cls.push('is-suggest'); else if (f.includes('pattern')) cls.push('is-pattern'); else if (f.includes('low')) cls.push('is-low');
      const style = [`text-align:${c.align || (tag === 'th' ? 'center' : aligns[Math.min(c.c, g.nCols - 1)])}`];
      if (c.bg && (!f.length || c.bgUser)) style.push(`background:${c.bg}`);
      const sel = ctx.edit ? ` data-t="${ctx.ti}" data-r="${c.r}" data-c="${c.c}"` : '';
      return `<${tag} class="${cls.join(' ')}" rowspan="${c.rowSpan}" colspan="${c.colSpan}" style="${style.join(';')}"${sel}${ed}>${escapeHtml(c.text || '')}</${tag}>`;
    });
    rows.push(`<tr style="height:${hPct.toFixed(3)}cqh">${cells.join('')}</tr>`);
  }
  return `<table class="rc-table bd-${border}"><colgroup>${colPct.map((p) => `<col style="width:${p.toFixed(3)}%">`).join('')}</colgroup><tbody>${rows.join('')}</tbody></table>`;
}
