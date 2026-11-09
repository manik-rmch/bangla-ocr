// লেখার লাইন তৈরি: PDF-এর Text Layer অথবা OCR ফল → একই রকম "TextLine"
// TextLine = { x0, y0, x1, y1, h, text, segs: [{ x0, x1, text }] }
//   h    = অক্ষরের আনুমানিক আকার (শুধু তুলনার জন্য)
//   segs = লাইনের ভেতরের আলাদা টুকরো (বড় ফাঁকে ভাগ করা; টেবিলের কলাম ও স্বাক্ষর বোঝার কাজে লাগে)
import { groupIntoLines } from '../pdf/pdf-text-extractor.js';

const SEG_GAP_EM = 1.2; // এর চেয়ে বড় ফাঁক হলে নতুন টুকরো

function splitSegments(parts, h) {
  const segs = [];
  for (const p of parts) {
    const last = segs[segs.length - 1];
    if (last && p.x0 - last.x1 <= h * SEG_GAP_EM) {
      const glue = p.x0 - last.x1 > h * 0.12 && !/\s$/.test(last.text) && !/^\s/.test(p.text) ? ' ' : '';
      last.text += glue + p.text;
      last.x1 = Math.max(last.x1, p.x1);
    } else {
      segs.push({ x0: p.x0, x1: p.x1, text: p.text });
    }
  }
  for (const s of segs) s.text = s.text.trim();
  return segs.filter((s) => s.text !== '');
}

/** PDF.js-এর টুকরো (extractPageItems-এর items) → TextLine তালিকা। এককে: PDF Point */
export function linesFromPdfItems(items) {
  const out = [];
  for (const line of groupIntoLines(items)) {
    const parts = line.items
      .map((it) => ({ x0: it.x, x1: it.x + it.w, text: it.str.replace(/\u0000/g, '') }))
      .filter((p) => p.text.replace(/\s+/g, '') !== '');
    if (!parts.length) continue;
    const segs = splitSegments(parts, line.h);
    if (!segs.length) continue;
    out.push({
      x0: Math.min(...segs.map((s) => s.x0)),
      x1: Math.max(...segs.map((s) => s.x1)),
      y0: line.y,
      y1: line.y + line.h,
      h: line.h,
      text: line.text.replace(/\t/g, '  ').trim(),
      segs
    });
  }
  return out;
}

// Tesseract.js-এর ফলের কাঠামো সংস্করণ-ভেদে আলাদা; তাই সব পরিচিত রূপ সামলানো হয়।
function collectOcrLines(data) {
  const lines = [];
  if (Array.isArray(data.blocks)) {
    for (const b of data.blocks) {
      for (const p of b.paragraphs || []) for (const l of p.lines || []) lines.push(l);
    }
  }
  if (!lines.length && Array.isArray(data.lines)) lines.push(...data.lines);
  if (!lines.length && Array.isArray(data.words)) {
    // শুধু শব্দ থাকলে নিজেরাই লাইন বানাই
    const words = data.words.filter((w) => w.bbox && String(w.text || '').trim());
    words.sort((a, b) => (a.bbox.y0 + a.bbox.y1) - (b.bbox.y0 + b.bbox.y1));
    let cur = null;
    for (const w of words) {
      const mid = (w.bbox.y0 + w.bbox.y1) / 2;
      if (!cur || Math.abs(mid - cur.mid) > (cur.bbox.y1 - cur.bbox.y0) * 0.6) {
        cur = { mid, bbox: { ...w.bbox }, words: [], text: '' };
        lines.push(cur);
      }
      cur.words.push(w);
      cur.bbox.x0 = Math.min(cur.bbox.x0, w.bbox.x0);
      cur.bbox.x1 = Math.max(cur.bbox.x1, w.bbox.x1);
      cur.bbox.y0 = Math.min(cur.bbox.y0, w.bbox.y0);
      cur.bbox.y1 = Math.max(cur.bbox.y1, w.bbox.y1);
    }
    for (const l of lines) {
      l.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      l.text = l.words.map((w) => w.text).join(' ');
    }
  }
  return lines;
}

/**
 * OCR ফল → TextLine তালিকা। scale = (পৃষ্ঠার একক) ÷ (পিক্সেল)।
 * Tesseract-এর লাইন-বাক্সে উপরের মাত্রা ও নিচের কার চিহ্নও থাকে, তাই অক্ষরের আকার ≈ বাক্সের উচ্চতা ÷ ১.৪।
 */
export function linesFromOcr(data, scale) {
  const out = [];
  for (const l of collectOcrLines(data || {})) {
    const text = String(l.text || '').replace(/\s+$/g, '').trim();
    if (!text || !l.bbox) continue;
    const y0 = l.bbox.y0 * scale;
    const y1 = l.bbox.y1 * scale;
    const h = Math.max(1, (y1 - y0) / 1.4);
    const words = (l.words || []).filter((w) => w.bbox && String(w.text || '').trim());
    let segs;
    if (words.length) {
      words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      segs = splitSegments(words.map((w) => ({ x0: w.bbox.x0 * scale, x1: w.bbox.x1 * scale, text: String(w.text).trim() })), h);
    } else {
      segs = [{ x0: l.bbox.x0 * scale, x1: l.bbox.x1 * scale, text }];
    }
    if (!segs.length) continue;
    out.push({ x0: l.bbox.x0 * scale, x1: l.bbox.x1 * scale, y0, y1, h, text, segs });
  }
  out.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  return out;
}
