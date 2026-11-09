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
  if (worker && workerKey === key) return worker;

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
  return w;
}

export async function recognize(canvas) {
  if (!worker) throw new Error('OCR Worker চালু নেই।');
  return raceCancel(worker.recognize(canvas));
}

export async function terminateWorker() {
  generation++;
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
