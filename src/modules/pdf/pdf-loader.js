// PDF খোলা (শুধু ব্রাউজারে, কোনো সার্ভারে নয়)
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { extractPageItems, assessTextQuality } from './pdf-text-extractor.js';

// পুরোনো Browser-এর জন্য ছোট সমাধান
if (!Promise.withResolvers) {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

// pdf.js বড় লাইব্রেরি; তাই প্রথম PDF খোলার সময়ই লোড হয় (শুধু ছবি নিয়ে কাজ করলে লাগে না)।
let pdfjsPromise = null;
export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((m) => { m.GlobalWorkerOptions.workerSrc = workerUrl; return m; });
    pdfjsPromise.catch(() => { pdfjsPromise = null; }); // ব্যর্থ হলে পরের বার আবার চেষ্টা
  }
  return pdfjsPromise;
}

export async function openPdf(file) {
  const pdfjsLib = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjsLib.getDocument({ data });
  try {
    return await task.promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') {
      throw new Error('এই PDF পাসওয়ার্ড-সুরক্ষিত। পাসওয়ার্ডমুক্ত ফাইল দিন।');
    }
    throw new Error('PDF ফাইলটি নষ্ট অথবা পড়া যাচ্ছে না।');
  }
}

/* ---------- PDF বিশ্লেষণ (হালকা) ---------- */
const SIZES = [
  { name: 'A4', w: 595, h: 842 },
  { name: 'A3', w: 842, h: 1191 },
  { name: 'A5', w: 420, h: 595 },
  { name: 'Letter', w: 612, h: 792 },
  { name: 'Legal', w: 612, h: 1008 }
];

// পৃষ্ঠার মাপ থেকে নাম ও Portrait/Landscape বলে দেয়
export function describePageSize(width, height) {
  const orientation = width > height ? 'landscape' : 'portrait';
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  const hit = SIZES.find((s) => Math.abs(s.w - short) <= 4 && Math.abs(s.h - long) <= 4);
  return { name: hit ? hit.name : 'কাস্টম', orientation, width, height };
}

/**
 * PDF-এর দ্রুত বিশ্লেষণ: প্রথম, মাঝের ও শেষ পৃষ্ঠা পরীক্ষা করে।
 * ফল: { pageSize: {name, orientation}, textLayer: 'good' | 'poor' | 'none' | 'mixed' }
 *   good  = নিজস্ব লেখা পাওয়া যায় এবং ঠিক আছে
 *   poor  = লেখা আছে কিন্তু ভাঙা (OCR দরকার)
 *   none  = স্ক্যান করা (লেখা নেই)
 *   mixed = কিছু পৃষ্ঠা ঠিক, কিছু নয়
 */
export async function analyzePdf(pdf) {
  const n = pdf.numPages;
  const sample = Array.from(new Set([1, Math.ceil(n / 2), n]));
  const levels = [];
  let pageSize = null;
  for (const num of sample) {
    let page = null;
    try {
      page = await pdf.getPage(num);
      const { width, height, items } = await extractPageItems(page);
      if (!pageSize) pageSize = describePageSize(width, height);
      levels.push(assessTextQuality(items).level);
    } catch (e) {
      levels.push('none');
    } finally {
      if (page) page.cleanup();
    }
  }
  const uniq = new Set(levels);
  const textLayer = uniq.size === 1 ? levels[0] : 'mixed';
  return { pageSize: pageSize || describePageSize(595, 842), textLayer };
}
