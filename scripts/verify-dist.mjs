// Build-এর পর dist/ ঠিক আছে কি না যাচাই। কিছু বাদ পড়লে Build ব্যর্থ হয়, ফলে ভাঙা সাইট কখনও Deploy হয় না।
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] || 'dist');
const BASE = '/bangla-ocr/';
const problems = [];
const need = (rel, minBytes = 1) => {
  const p = path.join(dist, rel);
  if (!fs.existsSync(p)) return problems.push(`নেই: ${rel}`);
  if (fs.statSync(p).size < minBytes) problems.push(`অস্বাভাবিক ছোট: ${rel}`);
};

need('index.html', 200);
need('404.html');
need('.nojekyll', 0);
need('tesseract/worker.min.js', 1000);
need('tessdata/ben.traineddata.gz', 100000);
need('tessdata/eng.traineddata.gz', 100000);
const core = fs.existsSync(path.join(dist, 'tesseract/core')) ? fs.readdirSync(path.join(dist, 'tesseract/core')) : [];
if (!core.some((f) => f.endsWith('.wasm'))) problems.push('নেই: tesseract/core/*.wasm');
if (!core.some((f) => f.endsWith('.js'))) problems.push('নেই: tesseract/core/*.js');

if (fs.existsSync(path.join(dist, 'index.html'))) {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => u.startsWith('/'));
  for (const u of refs) {
    if (!u.startsWith(BASE)) problems.push(`index.html-এ ভুল পথ (base ছাড়া): ${u}`);
    else if (!fs.existsSync(path.join(dist, u.slice(BASE.length)))) problems.push(`index.html-এর ফাইল নেই: ${u}`);
  }
  if (!refs.some((u) => u.endsWith('.js'))) problems.push('index.html-এ কোনো JS লিংক নেই');
}

// ২৫ MB-এর বেশি একক ফাইল Pages-এ সমস্যা করতে পারে (সীমা ১০০ MB); সতর্কতা দেওয়া হয়
let total = 0;
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else { const s = fs.statSync(p).size; total += s; if (s > 25 * 1048576) console.warn(`সতর্কতা: বড় ফাইল ${path.relative(dist, p)} ${(s / 1048576).toFixed(1)} MB`); }
  }
})(dist);

if (problems.length) {
  console.error('\n✘ dist যাচাই ব্যর্থ:\n  - ' + problems.join('\n  - ') + '\n');
  process.exit(1);
}
console.log(`✔ dist ঠিক আছে (মোট ${(total / 1048576).toFixed(1)} MB)`);
