// Text OCR: নিয়ন্ত্রণ, প্রক্রিয়াকরণ (পৃষ্ঠা ধরে ধরে), Progress, Cancel ও ফল
import { createProgress } from '../../components/progress.js';
import { createTextEditor } from './text-editor.js';
import { renderPageToCanvas } from '../pdf/pdf-renderer.js';
import { getWorker, recognize, cancelRecognition, terminateWorker, setProgressListener, CancelError } from '../../workers/ocr-worker.js';
import { escapeHtml } from '../../utils/helpers.js';

const MAX_IMAGE_SIDE = 4000; // ছবির বড় দিকের সর্বোচ্চ পিক্সেল (মেমরি বাঁচাতে)
const PDF_RENDER_WIDTH = 2400; // PDF পৃষ্ঠা OCR-এর জন্য এই প্রস্থে আঁকা হয় (A4-এ প্রায় ২৯০ DPI)

const STATUS_BN = {
  'loading tesseract core': 'OCR ইঞ্জিন লোড হচ্ছে…',
  'initializing tesseract': 'OCR ইঞ্জিন চালু হচ্ছে…',
  'loading language traineddata': 'ভাষার ডেটা লোড হচ্ছে (প্রথমবার একটু সময় লাগে)…',
  'loaded language traineddata': 'ভাষার ডেটা লোড হয়েছে',
  'initializing api': 'OCR প্রস্তুত হচ্ছে…',
  'recognizing text': 'লেখা শনাক্ত হচ্ছে…'
};

const tick = () => new Promise((r) => setTimeout(r, 0));

export function friendlyError(e) {
  const msg = String((e && e.message) || e || '');
  if (e instanceof CancelError || (e && e.name === 'CancelError')) return 'প্রক্রিয়া বাতিল করা হয়েছে।';
  if (/traineddata|Network error|Failed to fetch|NetworkError|status code 404|404/i.test(msg)) {
    return 'ভাষার ডেটা (বাংলা/ইংরেজি) লোড করা যায়নি। ইন্টারনেট সংযোগ দেখে পেজ রিফ্রেশ করে আবার চেষ্টা করুন।';
  }
  if (e instanceof RangeError || /memory|allocation|out of/i.test(msg)) {
    return 'মেমরি কম পড়েছে। কম পৃষ্ঠা বা ছোট ফাইল নিয়ে আবার চেষ্টা করুন, অথবা অন্য ট্যাব বন্ধ করুন।';
  }
  return 'OCR Worker চালু করতে বা চালাতে সমস্যা হয়েছে। পেজ রিফ্রেশ করে আবার চেষ্টা করুন।' + (msg ? ' (' + msg + ')' : '');
}

async function imageFileToCanvas(file) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    bmp = await createImageBitmap(file);
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // স্বচ্ছ PNG-র পেছনে সাদা
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas;
}

function baseNameOf(items) {
  const n = items[0] ? items[0].file.name.replace(/\.[^.]+$/, '') : 'ocr-result';
  return items.length > 1 ? `${n}-ও-আরও-${items.length - 1}টি` : n;
}

/**
 * opts: { controlsRoot, progressRoot, resultRoot, getItems, setLocked }
 * ফেরত দেয়: { refresh(items), destroy() }
 */
export function createTextOcrPanel({ controlsRoot, progressRoot, resultRoot, getItems, setLocked }) {
  controlsRoot.innerHTML = `
    <div class="card ocr-controls">
      <h2>OCR সেটিংস</h2>
      <fieldset class="lang-group">
        <legend>ভাষা</legend>
        <label><input type="radio" name="ocr-lang" value="ben" /> বাংলা (ben)</label>
        <label><input type="radio" name="ocr-lang" value="eng" /> English (eng)</label>
        <label><input type="radio" name="ocr-lang" value="ben+eng" checked /> বাংলা + English (ben+eng)</label>
      </fieldset>
      <div class="ocr-actions">
        <button type="button" class="btn" data-action="start" disabled>OCR শুরু করুন</button>
        <button type="button" class="btn btn-ghost btn-danger" data-action="cancel" hidden>বাতিল করুন</button>
      </div>
      <p class="muted ocr-hint">প্রথমবার ভাষার ডেটা লোড হতে একটু সময় লাগতে পারে। এরপর Browser সেটি মনে রাখে। সব কাজ আপনার Browser-এই হয়।</p>
      <div class="alert ocr-alert" role="alert" hidden></div>
    </div>`;

  const progress = createProgress(progressRoot);
  const startBtn = controlsRoot.querySelector('[data-action="start"]');
  const cancelBtn = controlsRoot.querySelector('[data-action="cancel"]');
  const alertBox = controlsRoot.querySelector('.ocr-alert');
  const langInputs = Array.from(controlsRoot.querySelectorAll('input[name="ocr-lang"]'));

  let running = false;
  let cancelled = false;
  let currentRender = null;
  let editor = null;
  let currentItems = [];
  let totalUnits = 0;
  let doneUnits = 0;
  let destroyed = false;

  function showAlert(msg) {
    alertBox.hidden = !msg;
    alertBox.textContent = msg || '';
  }

  function syncButtons() {
    startBtn.disabled = running || currentItems.length === 0;
    startBtn.textContent = editor ? 'আবার OCR করুন' : 'OCR শুরু করুন';
    cancelBtn.hidden = !running;
    langInputs.forEach((i) => { i.disabled = running; });
  }

  function clearEditor() {
    if (editor) { editor.destroy(); editor = null; }
  }

  async function prepareCanvas(item, pageNum) {
    if (item.kind === 'image') return imageFileToCanvas(item.file);
    currentRender = renderPageToCanvas(item.pdf, pageNum, PDF_RENDER_WIDTH);
    const canvas = await currentRender.promise;
    currentRender = null;
    if (!canvas) throw new CancelError();
    return canvas;
  }

  async function start() {
    const items = getItems();
    if (!items.length || running) return;

    running = true;
    cancelled = false;
    showAlert('');
    clearEditor();
    setLocked(true);
    syncButtons();

    totalUnits = items.reduce((n, i) => n + (i.kind === 'pdf' ? i.pages : 1), 0);
    doneUnits = 0;
    const langs = controlsRoot.querySelector('input[name="ocr-lang"]:checked').value.split('+');
    const results = [];

    progress.show();
    progress.update({ percent: 0, status: 'OCR ইঞ্জিন প্রস্তুত হচ্ছে…', detail: `মোট ${totalUnits}টি পৃষ্ঠা/ছবি` });

    setProgressListener((m) => {
      if (!m || cancelled) return;
      const label = STATUS_BN[m.status] || '';
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        progress.update({ percent: ((doneUnits + m.progress) / totalUnits) * 100, status: label });
      } else if (label) {
        const p = typeof m.progress === 'number' && m.status.startsWith('loading') ? ` ${Math.round(m.progress * 100)}%` : '';
        progress.update({ status: label + p });
      }
    });

    let failure = null;
    try {
      await getWorker(langs);

      for (let fi = 0; fi < items.length; fi++) {
        const item = items[fi];
        const pageCount = item.kind === 'pdf' ? item.pages : 1;
        for (let p = 1; p <= pageCount; p++) {
          if (cancelled) throw new CancelError();
          progress.update({
            status: 'পৃষ্ঠা প্রস্তুত হচ্ছে…',
            detail: `ফাইল ${fi + 1}/${items.length} · ${item.file.name}` + (item.kind === 'pdf' ? ` · পৃষ্ঠা ${p}/${pageCount}` : '')
          });
          const canvas = await prepareCanvas(item, p);
          let res;
          try {
            res = await recognize(canvas);
          } finally {
            canvas.width = 0; // অস্থায়ী Canvas-এর মেমরি ছাড়া হয়
            canvas.height = 0;
          }
          results.push({
            label: item.kind === 'pdf' ? `${item.file.name} — পৃষ্ঠা ${p}` : item.file.name,
            text: (res.data.text || '').replace(/\r\n/g, '\n'),
            confidence: res.data.confidence
          });
          doneUnits++;
          progress.update({ percent: (doneUnits / totalUnits) * 100 });
          await tick(); // পেজ যেন আটকে না যায়
        }
      }
    } catch (e) {
      failure = e;
      if (!(e instanceof CancelError)) console.error('OCR error:', e);
    } finally {
      if (currentRender) { currentRender.cancel(); currentRender = null; }
      setProgressListener(null);
      running = false;
      if (!destroyed) setLocked(false);
    }

    if (destroyed) return;
    progress.hide();

    if (results.length) {
      editor = createTextEditor(resultRoot, { pages: results, baseName: baseNameOf(items) });
      if (!failure) resultRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (failure) {
      const partial = results.length ? ` এ পর্যন্ত ${results.length}টি পৃষ্ঠার ফল নিচে দেখানো হয়েছে।` : '';
      showAlert(friendlyError(failure) + partial);
    }
    syncButtons();
  }

  function cancel() {
    if (!running) return;
    cancelled = true;
    progress.update({ status: 'বাতিল করা হচ্ছে…' });
    if (currentRender) currentRender.cancel();
    cancelRecognition();
  }

  function onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'start') start();
    if (btn.dataset.action === 'cancel') cancel();
  }
  controlsRoot.addEventListener('click', onClick);

  syncButtons();

  return {
    refresh(items) {
      currentItems = items;
      syncButtons();
    },
    destroy() {
      destroyed = true;
      controlsRoot.removeEventListener('click', onClick);
      if (running) { cancelled = true; if (currentRender) currentRender.cancel(); }
      setProgressListener(null);
      terminateWorker(); // Worker বন্ধ করে মেমরি খালি
      clearEditor();
      progress.destroy();
      controlsRoot.innerHTML = '';
      resultRoot.innerHTML = '';
    }
  };
}
