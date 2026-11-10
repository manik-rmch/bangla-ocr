// Export-এর সবার কাজে লাগা সাধারণ অংশ (কোনো Browser API নেই): লেখা সাজানো, টেবিলের সারি, ফন্টের নাম, রং।
import { buildPageModel, computeLayout, FONT_FACTOR } from '../reconstruction/layout-reconstruction.js';

/** Word/Excel-এর জন্য ফন্টের তালিকা (Windows-এ সাধারণত থাকে এমন) */
export const WORD_FONTS = [
  ['Nirmala UI', 'Nirmala UI (Windows-এ সবসময় থাকে)'],
  ['Nikosh', 'Nikosh (সরকারি PDF-এর ফন্ট; কম্পিউটারে ইনস্টল থাকতে হবে)'],
  ['Kalpurush', 'Kalpurush'],
  ['SolaimanLipi', 'SolaimanLipi'],
  ['Vrinda', 'Vrinda'],
  ['Noto Sans Bengali', 'Noto Sans Bengali'],
  ['Arial', 'Arial']
];

/** CSS font-family ("\"Kalpurush\", \"SolaimanLipi\", sans-serif") থেকে প্রথম ফন্টের নাম */
export function firstFontName(css) {
  if (!css) return '';
  const m = /^\s*(?:"([^"]+)"|'([^']+)'|([^,]+))/.exec(css);
  const n = m ? (m[1] || m[2] || m[3] || '').trim() : '';
  return /^(sans-serif|serif|monospace)$/i.test(n) ? '' : n;
}

/** "rgb(12, 34, 56)" বা "#abc" / "#aabbcc" → "AABBCC"; না পারলে null */
export function colorToHex(c) {
  if (!c) return null;
  const s = String(c).trim();
  let m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(s);
  if (m) return [m[1], m[2], m[3]].map((v) => Math.max(0, Math.min(255, Number(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return m[1].toUpperCase();
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return m[1].split('').map((ch) => ch + ch).join('').toUpperCase();
  return null;
}

/** XML-এ অবৈধ চিহ্ন বাদ দেওয়া */
export function cleanXmlText(t) {
  // eslint-disable-next-line no-control-regex
  return String(t == null ? '' : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
}

/** একটি পৃষ্ঠার মডেল + আঁকার হিসাব + মাপ (Point) */
export function pageSetup(page) {
  const model = buildPageModel(page);
  const lay = computeLayout(page, model);
  return { model, lay };
}

/** টেবিলের সারি (২-মাত্রার তালিকা)। জোড়া ঘরের শুধু উপরের-বাঁয়ের ঘরে লেখা থাকে। */
export function tableMatrix(table) {
  const g = table && table.grid;
  if (!g) return [];
  const rows = Array.from({ length: g.nRows }, () => Array.from({ length: g.nCols }, () => ''));
  for (const c of g.cells) {
    if (c.r < g.nRows && c.c < g.nCols) rows[c.r][c.c] = c.text || '';
  }
  return rows;
}

const sortY = (a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0;

/** পৃষ্ঠার সব লেখা পড়ার ক্রমে (TXT-এর জন্য)। টেবিল = Tab দিয়ে আলাদা কলাম। */
export function pageToText(page) {
  const a = page.analysis;
  if (!a) return '';
  const out = [];
  for (const b of a.blocks.slice().sort(sortY)) {
    if (b.type === 'table') {
      const t = a.tables[b.tableIndex];
      out.push(tableMatrix(t).map((r) => r.map((x) => String(x).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n'));
    } else if (b.type === 'list') {
      out.push(b.items.map((it, i) => `${b.listType === 'numbered' ? `${i + 1}.` : '•'} ${it.text}`).join('\n'));
    } else if (b.type === 'signature') {
      out.push(b.people.map((p) => [p.name, p.designation, p.organization].filter(Boolean).join('\n')).filter(Boolean).join('\n\n'));
    } else if (b.text) {
      out.push(b.text);
    }
  }
  return out.filter((x) => x !== '').join('\n\n');
}

export function pagesToText(pages) {
  const ok = pages.filter((p) => p.analysis);
  return ok.map((p) => (ok.length > 1 ? `──── পৃষ্ঠা ${p.pageNum} ────\n\n` : '') + pageToText(p)).join('\n\n');
}

/** ফাইলের নামের জন্য নিরাপদ অংশ */
export function safeName(s, fallback = 'document') {
  const t = String(s || '').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim();
  return t || fallback;
}

export { FONT_FACTOR };
