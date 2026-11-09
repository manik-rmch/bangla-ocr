// টেবিলের প্রতিটি ঘর (Cell) আলাদা করে পড়া, এবং (ভাঙা-লেখার PDF-এ) অটেবিল লাইনের প্রতিটি টুকরো আলাদা OCR।
// কেন আলাদা? পুরো পৃষ্ঠা একসঙ্গে OCR করলে টেবিলের সারি এলোমেলো হয়, কলাম হারায় বা টুকরো ভেঙে যায়।
// প্রতিটি ঘর আলাদা ছোট ছবি হিসেবে পড়লে লেখা সঠিক ঘরেই থাকে।
import { releaseCanvas } from '../../utils/memory-management.js';
import { toGray } from './page-geometry.js';
import { setPageSegMode, recognize } from '../../workers/ocr-worker.js';
import { buildGridFromRules, buildGridFromLines, fillCellsFromItems } from './cell-detector.js';
import { validateGrid } from './table-validate.js';
import { sampleGridBackgrounds } from '../reconstruction/table-reconstruction.js';

const TARGET_LINE_PX = 70; // OCR-এর জন্য এক লাইনের আদর্শ উচ্চতা (পিক্সেল)
const PAD = 12;

/**
 * ধূসর ছবির Contrast প্রসারিত করা (১%–৯৯% পরিসর → ০–২৫৫)।
 * ধূসর (Shaded) ঘরের পেছনও এতে সাদা হয়ে যায়। ফল: { empty } — ঘরে লেখা আছে কি না
 */
export function stretchGray(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const lowCut = gray.length * 0.01;
  const highCut = gray.length * 0.99;
  let acc = 0; let lo = 0; let hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= lowCut) { lo = v; break; } }
  acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= highCut) { hi = v; break; } }
  // সবটাই প্রায় একরঙা = কিছু লেখা নেই
  let darkest = 255;
  for (let v = 0; v < 256; v++) { if (hist[v]) { darkest = v; break; } }
  if (hi - darkest < 45) return { empty: true };
  const range = Math.max(1, hi - Math.min(darkest, lo));
  const floor = Math.min(darkest, lo);
  let dark = 0;
  for (let i = 0; i < gray.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(((gray[i] - floor) * 255) / range)));
    gray[i] = v;
    if (v < 110) dark++;
  }
  return { empty: dark / gray.length < 0.004 };
}

/**
 * Canvas-এর একটি আয়তক্ষেত্র কেটে OCR-এর উপযোগী ছোট Canvas বানায়। লেখা না থাকলে null।
 * rect পিক্সেলে; lineHeightPx = ওই এলাকার সাধারণ লাইন-উচ্চতা (বড় করার মাত্রা ঠিক করতে)
 */
export function cropForOcr(src, rect, lineHeightPx) {
  const x0 = Math.max(0, Math.round(rect.x0));
  const y0 = Math.max(0, Math.round(rect.y0));
  const w = Math.min(src.width - x0, Math.round(rect.x1 - rect.x0));
  const h = Math.min(src.height - y0, Math.round(rect.y1 - rect.y0));
  if (w < 6 || h < 6) return null;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  const img = sctx.getImageData(x0, y0, w, h);
  const gray = toGray(img.data, w * h);
  const st = stretchGray(gray);
  if (st.empty) return null;
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) { img.data[j] = img.data[j + 1] = img.data[j + 2] = gray[i]; img.data[j + 3] = 255; }
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').putImageData(img, 0, 0);
  const f = Math.max(1, Math.min(3, TARGET_LINE_PX / Math.max(1, lineHeightPx)));
  const out = document.createElement('canvas');
  out.width = Math.round(w * f) + PAD * 2;
  out.height = Math.round(h * f) + PAD * 2;
  const octx = out.getContext('2d');
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, out.width, out.height);
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(tmp, PAD, PAD, Math.round(w * f), Math.round(h * f));
  releaseCanvas(tmp);
  return out;
}

// OCR-এর সীমানা-খুঁত (| _ ~ [ ]) ঘরের দুই প্রান্ত থেকে সরানো। ভেতরের লেখা বদলায় না।
export function cleanCellText(t) {
  return String(t || '').normalize('NFC').replace(/\r/g, '').replace(/^[\s|_~\[\]]+|[\s|_~\[\]]+$/g, '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

/**
 * একটি টেবিলের Grid তৈরি করে লেখা বসানো ও যাচাই করা।
 * tableInfo = analyzePage-এর tables[i]; ctx = {
 *   ink, canvas, ppu (পিক্সেল ÷ পৃষ্ঠার একক), bodySize, items (শুধু PDF-লেখা ভালো হলে), reliableLayer,
 *   isCancelled(), onCell(done,total)
 * }
 * ফল: grid (cells-এ text, conf, source, flags), suggestions
 */
export async function readTable(tableInfo, ctx) {
  let grid;
  if (tableInfo.ruled) {
    grid = buildGridFromRules(ctx.ink.tables[tableInfo.ruledIndex], ctx.ink);
  } else {
    grid = buildGridFromLines(tableInfo.lines || [], tableInfo.colBands || []);
    validateAndReturn(grid);
    return grid; // রেখা ছাড়া টেবিলের লেখা সরাসরি লাইন থেকেই এসেছে
  }

  if (ctx.items && ctx.reliableLayer) {
    fillCellsFromItems(grid, ctx.items);
    grid.cells.forEach((c) => { c.conf = 100; });
  } else {
    const total = grid.cells.length;
    let done = 0;
    let lastPsm = null;
    const inset = Math.round(1.2 * ctx.ppu) + 1;
    for (const cell of grid.cells) {
      if (ctx.isCancelled()) break;
      const b = cell.bbox;
      const rect = { x0: b.x0 * ctx.ppu + inset, y0: b.y0 * ctx.ppu + inset, x1: b.x1 * ctx.ppu - inset, y1: b.y1 * ctx.ppu - inset };
      const lineH = ctx.bodySize * 1.4 * ctx.ppu;
      const crop = cropForOcr(ctx.canvas, rect, lineH);
      if (!crop) {
        cell.text = ''; cell.source = 'empty'; cell.conf = 100;
      } else {
        const lines = Math.round((rect.y1 - rect.y0) / (ctx.bodySize * 1.5 * ctx.ppu));
        const psm = lines >= 2 ? 6 : 7;
        if (psm !== lastPsm) { await setPageSegMode(psm); lastPsm = psm; }
        try {
          const res = await recognize(crop);
          cell.text = cleanCellText(res.data.text);
          cell.conf = Math.round(res.data.confidence || 0);
          cell.source = 'ocr';
        } finally { releaseCanvas(crop); }
      }
      done++;
      ctx.onCell(done, total);
      if (done % 8 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (ctx.sampleBg) sampleGridBackgrounds(grid, ctx.canvas, ctx.ppu);
  validateAndReturn(grid);
  return grid;
}

function validateAndReturn(grid) {
  grid.suggestions = validateGrid(grid);
}

/**
 * ভাঙা-লেখার PDF: টেবিলের বাইরের প্রতিটি লাইনের প্রতিটি টুকরো (seg) আলাদা ছোট ছবি করে পড়া।
 * (লাইনের অবস্থান PDF থেকে নির্ভুল; শুধু লেখাটা ভাঙা, তাই লেখা OCR থেকে নেওয়া হয়।)
 */
export async function ocrLineSegments(lines, { canvas, ppu, isCancelled, onProgress }) {
  const total = lines.reduce((n, l) => n + l.segs.length, 0);
  let done = 0;
  await setPageSegMode(7);
  for (const l of lines) {
    for (const s of l.segs) {
      if (isCancelled()) return;
      const padX = l.h * 0.4;
      const rect = { x0: (s.x0 - padX) * ppu, y0: (l.y0 - l.h * 0.25) * ppu, x1: (s.x1 + padX) * ppu, y1: (l.y1 + l.h * 0.25) * ppu };
      const crop = cropForOcr(canvas, rect, l.h * 1.4 * ppu);
      if (crop) {
        try {
          const res = await recognize(crop);
          s.text = cleanCellText(res.data.text).replace(/\n/g, ' ');
        } finally { releaseCanvas(crop); }
      } else {
        s.text = '';
      }
      done++;
      onProgress(done, total);
    }
    l.segs = l.segs.filter((s) => s.text);
    l.text = l.segs.map((s) => s.text).join('  ');
  }
}
