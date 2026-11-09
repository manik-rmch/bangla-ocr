// Image Enhancement: OCR-এর আগে ছবি পরিষ্কার করার পুরো ধাপ।
// নিয়ম: আসল Canvas কখনো বদলায় না; প্রতিবার নতুন Canvas ফেরত আসে।
import { releaseCanvas } from '../../utils/memory-management.js';
import {
  cropCanvas, rotateCanvas90, rotateCanvasAngle, scaleCanvas, copyCanvas, detectSkew,
  rgbaToGray, grayToRgba, brightnessContrastLut, applyLutRgba, applyLutGray,
  otsuThreshold, applyThreshold, medianDenoise, sharpen
} from './image-tools.js';

export const UPSCALE_TARGET_WIDTH = 2000; // এর চেয়ে ছোট প্রস্থের ছবি বড় করা হয়
export const UPSCALE_MAX = 2.5;

// "off" = কোনো Threshold নয়, "auto" = Otsu, "manual" = নিজের মান
export const DEFAULT_SETTINGS = {
  enabled: true,
  grayscale: true,
  brightness: 0,
  contrast: 15,
  threshold: 'off',
  thresholdValue: 128,
  denoise: false,
  sharpen: 0,
  upscale: true,
  deskew: false
};

// OCR-এর জন্য সাধারণত ভালো ফল দেয় এমন নিরাপদ সেটিংস
export const RECOMMENDED_SETTINGS = {
  ...DEFAULT_SETTINGS,
  contrast: 25,
  sharpen: 30,
  deskew: true
};

const tick = () => new Promise((r) => setTimeout(r, 0));

// কোনো পরিবর্তনই দরকার কি না
export function hasWork(s, o = {}) {
  return !!(s.enabled && (s.grayscale || s.brightness || s.contrast || s.threshold !== 'off' ||
    s.denoise || s.sharpen || s.upscale || s.deskew)) || !!(o.crop || o.rotate);
}

/**
 * source: আসল Canvas (অপরিবর্তিত থাকে)
 * s: সেটিংস (DEFAULT_SETTINGS-এর মতো)
 * o: { rotate: 0|90|180|270, crop: {x,y,w,h}|null }  — ছবি-ভিত্তিক
 * flags: { preview: true } হলে Upscale হয় না (Preview ছোট আকারে দেখানো হয়)
 * ফল: { canvas, info: { angle, scale } }  — নতুন Canvas, আসলটি নয়
 */
export async function enhanceCanvas(source, s, o = {}, flags = {}) {
  const info = { angle: 0, scale: 1 };
  let cur = null; // বর্তমান মধ্যবর্তী Canvas (আসল নয়)
  const advance = (next) => {
    if (cur && cur !== source) releaseCanvas(cur);
    cur = next;
  };
  const apply = !!s.enabled;

  // ১) Crop, ২) ৯০° ঘোরানো — এগুলো ব্যবহারকারীর নিজের নির্বাচন, Enhancement বন্ধ থাকলেও কাজ করে
  if (o.crop) advance(cropCanvas(cur || source, o.crop));
  if (o.rotate) advance(rotateCanvas90(cur || source, o.rotate));

  if (apply) {
    // ৩) Deskew
    if (s.deskew) {
      const skew = detectSkew(cur || source);
      if (skew !== null && Math.abs(skew) >= 0.3) {
        advance(rotateCanvasAngle(cur || source, -skew));
        info.angle = skew;
      }
      await tick();
    }
    // ৪) ছোট ছবি বড় করা
    const w = (cur || source).width;
    if (s.upscale && !flags.preview && w < UPSCALE_TARGET_WIDTH) {
      const scale = Math.min(UPSCALE_MAX, UPSCALE_TARGET_WIDTH / w);
      const big = scaleCanvas(cur || source, scale);
      info.scale = big.width / w;
      advance(big);
      await tick();
    }
  }

  // সব সময় একটি নতুন Canvas ফেরত দিতে হবে
  let out = cur || copyCanvas(source);
  if (!apply) return { canvas: out, info };

  // ৫) পিক্সেল-স্তরের ধাপ
  const needGray = s.grayscale || s.denoise || s.sharpen > 0 || s.threshold !== 'off';
  const ctx = out.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const w = out.width;
  const h = out.height;

  const lut = (s.brightness || s.contrast) ? brightnessContrastLut(s.brightness, s.contrast) : null;
  if (!needGray) {
    if (lut) applyLutRgba(img.data, lut);
  } else {
    let g = rgbaToGray(img.data, w, h);
    if (lut) applyLutGray(g, lut);
    await tick();
    if (s.denoise) { g = medianDenoise(g, w, h); await tick(); }
    if (s.sharpen > 0) { g = sharpen(g, w, h, (s.sharpen / 100) * 1.5); await tick(); }
    if (s.threshold !== 'off') {
      const t = s.threshold === 'auto' ? otsuThreshold(g) : s.thresholdValue;
      applyThreshold(g, t);
    }
    grayToRgba(g, img.data);
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: out, info };
}
