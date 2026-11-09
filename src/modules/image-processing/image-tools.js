// ছবি প্রক্রিয়াকরণের মৌলিক টুল (শুধু Canvas ও সাধারণ JavaScript, কোনো বাইরের Library ছাড়া)।
// "gray" মানে প্রতি পিক্সেলে একটি সংখ্যা (০ = কালো, ২৫৫ = সাদা) — Uint8ClampedArray।
import { releaseCanvas, MAX_CANVAS_PIXELS } from '../../utils/memory-management.js';

export function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function whiteFill(ctx, w, h) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
}

/* ---------- পিক্সেল-স্তরের (DOM-ছাড়া) ফাংশন ---------- */

// RGBA → ধূসর (Luma)
export function rgbaToGray(data, w, h) {
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; p < g.length; i += 4, p++) {
    g[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  return g;
}

export function grayToRgba(gray, data) {
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    data[i] = data[i + 1] = data[i + 2] = gray[p];
    data[i + 3] = 255;
  }
}

// Brightness ও Contrast: দুটিই -100 থেকে +100। ফল একটি ২৫৬ ঘরের Lookup Table।
export function brightnessContrastLut(brightness, contrast) {
  const lut = new Uint8ClampedArray(256);
  const c = Math.max(-99, Math.min(99, contrast));
  const factor = (259 * (c * 2.55 + 255)) / (255 * (259 - c * 2.55));
  const shift = brightness * 2.55;
  for (let v = 0; v < 256; v++) lut[v] = factor * (v - 128) + 128 + shift;
  return lut;
}

export function applyLutRgba(data, lut) {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
}

export function applyLutGray(gray, lut) {
  for (let i = 0; i < gray.length; i++) gray[i] = lut[gray[i]];
}

// Otsu পদ্ধতিতে স্বয়ংক্রিয় Threshold (০–২৫৫)
export function otsuThreshold(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestT = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; bestT = t; }
  }
  return bestT;
}

// Threshold-এর নিচে কালো (০), বাকি সাদা (২৫৫)
export function applyThreshold(gray, t) {
  for (let i = 0; i < gray.length; i++) gray[i] = gray[i] > t ? 255 : 0;
}

function sort2(p, a, b) {
  if (p[a] > p[b]) { const t = p[a]; p[a] = p[b]; p[b] = t; }
}

// ৩×৩ Median ফিল্টার (ছোট ছোট ফোঁটা/দাগ কমায়)
export function medianDenoise(gray, w, h) {
  const out = new Uint8ClampedArray(gray);
  const p = new Uint8Array(9);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      p[0] = gray[i - w - 1]; p[1] = gray[i - w]; p[2] = gray[i - w + 1];
      p[3] = gray[i - 1]; p[4] = gray[i]; p[5] = gray[i + 1];
      p[6] = gray[i + w - 1]; p[7] = gray[i + w]; p[8] = gray[i + w + 1];
      sort2(p, 1, 2); sort2(p, 4, 5); sort2(p, 7, 8);
      sort2(p, 0, 1); sort2(p, 3, 4); sort2(p, 6, 7);
      sort2(p, 1, 2); sort2(p, 4, 5); sort2(p, 7, 8);
      sort2(p, 0, 3); sort2(p, 5, 8); sort2(p, 4, 7);
      sort2(p, 3, 6); sort2(p, 1, 4); sort2(p, 2, 5);
      sort2(p, 4, 7); sort2(p, 4, 2); sort2(p, 6, 4);
      sort2(p, 4, 2);
      out[i] = p[4];
    }
  }
  return out;
}

// Unsharp Mask: amount 0–১.৫। লেখার কিনারা স্পষ্ট করে।
export function sharpen(gray, w, h, amount) {
  if (amount <= 0) return gray;
  const out = new Uint8ClampedArray(gray);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const blur = (gray[i - w - 1] + gray[i - w] + gray[i - w + 1] +
        gray[i - 1] + gray[i] + gray[i + 1] +
        gray[i + w - 1] + gray[i + w] + gray[i + w + 1]) / 9;
      out[i] = gray[i] + amount * (gray[i] - blur);
    }
  }
  return out;
}

/**
 * Skew (লেখার লাইন কতটা হেলে আছে) নির্ণয়। ফল: ডিগ্রি (+ = লেখা ডানদিকে নিচে নামছে),
 * অথবা null যদি ভরসাযোগ্য উত্তর না মেলে। সংশোধনের জন্য ছবি উল্টো দিকে (-ফল) ঘোরাতে হয়।
 * Projection Profile পদ্ধতি: সঠিক কোণে লাইনগুলো সবচেয়ে "ধারালো" হয়।
 */
export function detectSkewFromGray(gray, w, h, range = 10) {
  const t = otsuThreshold(gray);
  const pts = [];
  const target = 70000;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / target)));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (gray[y * w + x] <= t) pts.push(x, y);
    }
  }
  const n = pts.length / 2;
  if (n < 300) return null;

  const bins = h + Math.ceil(w * Math.tan((range * Math.PI) / 180)) * 2 + 4;
  const offset = Math.ceil(w * Math.tan((range * Math.PI) / 180)) + 2;
  const score = (deg) => {
    const k = Math.tan((deg * Math.PI) / 180);
    const hist = new Float64Array(bins);
    for (let i = 0; i < pts.length; i += 2) {
      const yy = Math.round(pts[i + 1] - pts[i] * k) + offset;
      if (yy >= 0 && yy < bins) hist[yy]++;
    }
    let s = 0;
    for (let i = 0; i < bins; i++) s += hist[i] * hist[i];
    return s;
  };

  let best = 0;
  let bestScore = -1;
  for (let a = -range; a <= range + 1e-9; a += 0.5) {
    const s = score(a);
    if (s > bestScore) { bestScore = s; best = a; }
  }
  const from = best - 0.5;
  for (let a = from; a <= best + 0.5 + 1e-9; a += 0.1) {
    const s = score(a);
    if (s > bestScore) { bestScore = s; best = a; }
  }
  const zero = score(0);
  // ০° থেকে স্পষ্ট উন্নতি না থাকলে হেলানো ধরা হয় না
  if (bestScore < zero * 1.02) return null;
  return Math.round(best * 10) / 10;
}

/* ---------- Canvas-স্তরের ফাংশন (নতুন Canvas ফেরত দেয়, আসল অপরিবর্তিত) ---------- */

// rect: { x, y, w, h } সবগুলো ০–১ অনুপাতে
export function cropCanvas(src, rect) {
  const sx = Math.round(rect.x * src.width);
  const sy = Math.round(rect.y * src.height);
  const sw = Math.max(1, Math.min(src.width - sx, Math.round(rect.w * src.width)));
  const sh = Math.max(1, Math.min(src.height - sy, Math.round(rect.h * src.height)));
  const out = newCanvas(sw, sh);
  const ctx = out.getContext('2d');
  whiteFill(ctx, sw, sh);
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

// ৯০° এর গুণিতকে ঘোরানো (ঘড়ির কাঁটার দিকে)
export function rotateCanvas90(src, degrees) {
  const d = ((degrees % 360) + 360) % 360;
  if (d === 0) return copyCanvas(src);
  const swap = d === 90 || d === 270;
  const out = newCanvas(swap ? src.height : src.width, swap ? src.width : src.height);
  const ctx = out.getContext('2d');
  whiteFill(ctx, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((d * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

// যেকোনো কোণে ঘোরানো (ঘড়ির কাঁটার দিকে ধনাত্মক)। লেখা যেন না কাটে, তাই Canvas বড় হয়।
export function rotateCanvasAngle(src, degrees) {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = Math.ceil(src.width * cos + src.height * sin);
  const h = Math.ceil(src.width * sin + src.height * cos);
  const out = newCanvas(w, h);
  const ctx = out.getContext('2d');
  whiteFill(ctx, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rad);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

// Canvas-কে scale গুণ বড়/ছোট করা (মেমরি সীমা মেনে)
export function scaleCanvas(src, scale) {
  const maxScale = Math.sqrt(MAX_CANVAS_PIXELS / (src.width * src.height));
  const s = Math.min(scale, maxScale);
  const out = newCanvas(src.width * s, src.height * s);
  const ctx = out.getContext('2d');
  whiteFill(ctx, out.width, out.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

export function copyCanvas(src) {
  const out = newCanvas(src.width, src.height);
  out.getContext('2d').drawImage(src, 0, 0);
  return out;
}

// Canvas থেকে ধূসর তথ্য (ছোট করে নিয়ে, Skew নির্ণয়ের জন্য)
export function canvasToGraySmall(src, maxWidth = 800) {
  const scale = Math.min(1, maxWidth / src.width);
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const tmp = newCanvas(w, h);
  const ctx = tmp.getContext('2d');
  whiteFill(ctx, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  const gray = rgbaToGray(ctx.getImageData(0, 0, w, h).data, w, h);
  releaseCanvas(tmp);
  return { gray, w, h };
}

export function detectSkew(src) {
  const { gray, w, h } = canvasToGraySmall(src, 800);
  return detectSkewFromGray(gray, w, h);
}
