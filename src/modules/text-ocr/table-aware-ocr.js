// Text OCR-এ টেবিল-সচেতন পড়া: পৃষ্ঠায় রেখা-ওয়ালা টেবিল থাকলে পুরো পৃষ্ঠা একসঙ্গে না পড়ে
//   ১) টেবিলের বাইরের লেখা (টেবিল সাদা করে) পড়া, ২) টেবিলের প্রতিটি ঘর আলাদা পড়া,
//   ৩) উপর থেকে নিচের ক্রমে সাজিয়ে টেবিলের সারি Tab দিয়ে আলাদা করে লেখা।
// এতে সারি এলোমেলো হয় না, কলাম হারায় না। টেবিল না থাকলে null ফেরত দেয়; তখন সাধারণ OCR চলে।
import { createInkMap, toGray } from '../document-ocr/page-geometry.js';
import { readTable } from '../document-ocr/table-ocr.js';
import { linesFromOcr } from '../document-ocr/line-source.js';
import { cleanOcrText } from './text-cleanup.js';
import { recognize, setPageSegMode } from '../../workers/ocr-worker.js';
import { releaseCanvas } from '../../utils/memory-management.js';

const INK_WIDTH = 1600;
const MIN_TABLE_AREA = 0.03; // পৃষ্ঠার অন্তত ৩% জায়গা জুড়ে না থাকলে টেবিল ধরা হয় না

function inkMapOf(canvas) {
  let c = canvas;
  let copied = false;
  if (canvas.width > INK_WIDTH) {
    c = document.createElement('canvas');
    c.width = INK_WIDTH;
    c.height = Math.max(1, Math.round(canvas.height * (INK_WIDTH / canvas.width)));
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    copied = true;
  }
  try {
    const img = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
    return createInkMap(toGray(img.data, c.width * c.height), c.width, c.height, canvas.width); // এককে = মূল ছবির পিক্সেল
  } finally {
    if (copied) releaseCanvas(c);
  }
}

function gridToLines(grid) {
  const rows = Array.from({ length: grid.nRows }, () => Array(grid.nCols).fill(''));
  for (const c of grid.cells) rows[c.r][c.c] = (c.text || '').replace(/[\t\n]+/g, ' ');
  return rows.map((r) => r.join('\t').replace(/\t+$/, ''));
}

/**
 * ফেরত: null (টেবিল নেই) অথবা { text, confidence, stats: { tables, cells, flagged } }
 * opts: { psm, clean, isCancelled, onStatus(msg) }
 */
export async function recognizeWithTables(canvas, opts) {
  const ink = inkMapOf(canvas);
  const area = canvas.width * canvas.height;
  const tables = ink.tables.filter((t) => t.rows >= 2 && t.cols >= 2 && ((t.x1 - t.x0) * (t.y1 - t.y0)) / area >= MIN_TABLE_AREA);
  if (!tables.length) return null;

  // টেবিল সাদা করা কপিতে বাইরের লেখা পড়া
  const outside = document.createElement('canvas');
  outside.width = canvas.width;
  outside.height = canvas.height;
  const octx = outside.getContext('2d');
  octx.drawImage(canvas, 0, 0);
  octx.fillStyle = '#fff';
  for (const t of tables) octx.fillRect(t.x0 - 3, t.y0 - 3, t.x1 - t.x0 + 6, t.y1 - t.y0 + 6);

  let res;
  try {
    await setPageSegMode(opts.psm);
    opts.onStatus('টেবিলের বাইরের লেখা পড়া হচ্ছে…');
    res = await recognize(outside, { blocks: true });
  } finally {
    releaseCanvas(outside);
  }
  if (opts.isCancelled()) return null;

  const lines = linesFromOcr(res.data, 1);
  const pieces = []; // { y, text }
  if (lines.length) {
    for (const l of lines) pieces.push({ y: l.y0, text: l.text });
  } else if ((res.data.text || '').trim()) {
    pieces.push({ y: -1, text: res.data.text.trim() }); // অবস্থান না পেলে বাইরের লেখা আগে
  }

  let cells = 0;
  let flagged = 0;
  let confSum = 0;
  let confN = 0;
  const tableTexts = [];
  for (let ti = 0; ti < tables.length; ti++) {
    const t = tables[ti];
    const info = { ruled: true, ruledIndex: ink.tables.indexOf(t) };
    const grid = await readTable(info, {
      ink, canvas, ppu: 1,
      bodySize: Math.max(8, ((t.y1 - t.y0) / Math.max(1, t.rows)) * 0.55),
      items: null, reliableLayer: false,
      isCancelled: opts.isCancelled,
      onCell: (d, tot) => opts.onStatus(`টেবিল ${ti + 1}-এর ঘর পড়া হচ্ছে… ${d}/${tot}`)
    });
    if (opts.isCancelled()) return null;
    cells += grid.cells.length;
    flagged += grid.cells.filter((c) => (c.flags || []).length).length;
    grid.cells.forEach((c) => { if (c.source === 'ocr' && typeof c.conf === 'number') { confSum += c.conf; confN++; } });
    tableTexts.push({ y: t.y0, text: gridToLines(grid).join('\n') });
  }
  await setPageSegMode(opts.psm); // ব্যবহারকারীর বাছা মোডে ফেরা

  // উপর থেকে নিচের ক্রমে সাজানো; পাশাপাশি বাইরের লাইনগুলো ছোট ছোট অংশে জুড়ে পরিষ্কার করা
  const all = [...pieces.map((p) => ({ ...p, kind: 'line' })), ...tableTexts.map((p) => ({ ...p, kind: 'table' }))].sort((a, b) => a.y - b.y);
  const out = [];
  let chunk = [];
  const flush = () => {
    if (!chunk.length) return;
    const joined = chunk.join('\n');
    out.push(opts.clean ? cleanOcrText(joined) : joined);
    chunk = [];
  };
  for (const p of all) {
    if (p.kind === 'line') chunk.push(p.text);
    else { flush(); out.push(p.text); }
  }
  flush();

  return {
    text: out.join('\n\n'),
    confidence: confN ? confSum / confN : res.data.confidence,
    stats: { tables: tables.length, cells, flagged }
  };
}
