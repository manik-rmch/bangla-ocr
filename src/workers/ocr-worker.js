// OCR ইঞ্জিন ব্যবস্থাপনা (Tesseract.js নিজেই আলাদা Web Worker-এ চলে, তাই পেজ আটকে যায় না)।
// নিয়ম: একই ভাষার জন্য একটি Worker বারবার ব্যবহার হয়; ভাষা বদলালে নতুন Worker, আর পুরোনোটি বন্ধ।
import { createWorker } from 'tesseract.js';
import { assetUrl } from '../utils/helpers.js';

export class CancelError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelError';
  }
}

let worker = null;
let workerKey = '';
let listener = null;
let pendingReject = null;
let generation = 0;

// অলস থাকলে OCR Worker বন্ধ করে মেমরি খালি করা (বাংলা ভাষার ডেটা সহ প্রতিটি Worker বেশ মেমরি নেয়; মোবাইলে বিশেষ কাজে লাগে)।
// পরের বার OCR চাইলে আবার নিজে থেকে চালু হয় (ভাষার ডেটা Browser-এ জমা থাকে, তাই দ্রুত)।
export const IDLE_MS = 3 * 60 * 1000;
let idleMs = IDLE_MS;
let idleTimer = null;
let busy = 0;
export function setIdleMs(ms) { idleMs = ms; }
function touchIdle() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (!worker || busy > 0 || !(idleMs > 0)) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (busy === 0) terminateWorker();
  }, idleMs);
}

const abs = (p) => new URL(assetUrl(p), location.href).href;

export function setProgressListener(fn) {
  listener = fn;
}

// promise-এর সঙ্গে "বাতিল" প্রতিযোগিতা করায়, যাতে Cancel চাপলেই কাজ থামে।
function raceCancel(promise) {
  return new Promise((resolve, reject) => {
    pendingReject = reject;
    promise.then(
      (v) => { if (pendingReject === reject) pendingReject = null; resolve(v); },
      (e) => { if (pendingReject === reject) pendingReject = null; reject(e); }
    );
  });
}

export async function getWorker(langs) {
  const key = langs.join('+');
  if (worker && workerKey === key) { touchIdle(); return worker; }

  await terminateWorker();
  const gen = generation;

  const created = createWorker(langs, 1, {
    workerPath: abs('tesseract/worker.min.js'),
    corePath: abs('tesseract/core'),
    langPath: abs('tessdata'),
    workerBlobURL: false,
    logger: (m) => { if (listener) listener(m); }
  });
  // বাতিল হওয়ার পর Worker তৈরি শেষ হলে সঙ্গে সঙ্গে বন্ধ করে দেওয়া হয়।
  created.then(
    (w) => { if (gen !== generation) w.terminate().catch(() => {}); },
    () => {}
  );

  const w = await raceCancel(created);
  if (gen !== generation) throw new CancelError();
  worker = w;
  workerKey = key;
  touchIdle();
  return w;
}

// output (ঐচ্ছিক): যেমন { blocks: true } দিলে প্রতিটি লাইন ও শব্দের অবস্থানও ফেরত আসে (Document OCR-এ লাগে)।
export async function recognize(canvas, output) {
  if (!worker) throw new Error('OCR Worker বন্ধ আছে (অনেকক্ষণ অলস ছিল বা বাতিল হয়েছে)। আবার "OCR শুরু" চাপুন।');
  busy++;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  try {
    return await raceCancel(output ? worker.recognize(canvas, {}, output) : worker.recognize(canvas));
  } finally {
    busy = Math.max(0, busy - 1);
    touchIdle();
  }
}

// লেআউট মোড: 3 = স্বয়ংক্রিয়, 6 = একক ব্লক (টেবিল/রোস্টারের জন্য ভালো), 11 = ছড়ানো লেখা
export async function setPageSegMode(mode) {
  if (!worker) return;
  await raceCancel(worker.setParameters({
    tessedit_pageseg_mode: String(mode),
    preserve_interword_spaces: String(mode) === '6' ? '1' : '0'
  }));
}

export async function terminateWorker() {
  generation++;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const w = worker;
  worker = null;
  workerKey = '';
  if (w) {
    try { await w.terminate(); } catch (e) { /* ignore */ }
  }
}

export function cancelRecognition() {
  const reject = pendingReject;
  pendingReject = null;
  terminateWorker();
  if (reject) reject(new CancelError());
}
