// Build-এর আগে OCR-এর প্রয়োজনীয় ফাইল npm প্যাকেজ থেকে public/ ফোল্ডারে কপি করে।
// ফলে সব ফাইল আমাদের নিজস্ব সাইট (GitHub Pages) থেকেই লোড হয়, বাইরের CDN লাগে না।
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = path.join(root, 'node_modules');
const pub = path.join(root, 'public');

function fail(msg) {
  console.error('\n✘ OCR Asset সমস্যা: ' + msg + '\n');
  process.exit(1);
}
const firstExisting = (list) => list.find((p) => fs.existsSync(p));

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  const mb = (fs.statSync(dest).size / 1048576).toFixed(2);
  console.log(`  ✔ ${path.relative(root, dest)} (${mb} MB)`);
}

console.log('OCR Asset কপি হচ্ছে…');

// 1) Tesseract Worker
const worker = firstExisting([path.join(nm, 'tesseract.js', 'dist', 'worker.min.js')]);
if (!worker) fail('tesseract.js-এর worker.min.js পাওয়া যায়নি। "npm install" চালানো হয়েছে কি?');
copy(worker, path.join(pub, 'tesseract', 'worker.min.js'));

// 2) Tesseract Core (WASM)। LSTM সংস্করণই যথেষ্ট, তাই ছোট রাখা হয়।
const coreDir = firstExisting([
  path.join(nm, 'tesseract.js-core'),
  path.join(nm, 'tesseract.js', 'node_modules', 'tesseract.js-core')
]);
if (!coreDir) fail('tesseract.js-core পাওয়া যায়নি।');
const coreFiles = fs.readdirSync(coreDir);
let selected = coreFiles.filter((f) => /^tesseract-core.*lstm.*\.(js|wasm)$/.test(f));
if (!selected.length) selected = coreFiles.filter((f) => /^tesseract-core.*\.(js|wasm)$/.test(f));
if (!selected.length) fail('tesseract.js-core-এর ভেতরে Core ফাইল পাওয়া যায়নি।');
selected.forEach((f) => copy(path.join(coreDir, f), path.join(pub, 'tesseract', 'core', f)));

// 3) ভাষার ডেটা: বাংলা ও ইংরেজি
for (const lang of ['ben', 'eng']) {
  const base = path.join(nm, '@tesseract.js-data', lang);
  const file = firstExisting([
    path.join(base, '4.0.0_best_int', `${lang}.traineddata.gz`),
    path.join(base, '4.0.0', `${lang}.traineddata.gz`)
  ]);
  if (!file) fail(`${lang}.traineddata.gz পাওয়া যায়নি (@tesseract.js-data/${lang})।`);
  copy(file, path.join(pub, 'tessdata', `${lang}.traineddata.gz`));
}

console.log('✔ OCR Asset প্রস্তুত।\n');
