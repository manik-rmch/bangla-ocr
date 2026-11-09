// Document OCR (Phase 7): পৃষ্ঠা বিশ্লেষণ — টেবিল, শিরোনাম, তালিকা, স্বাক্ষর ইত্যাদি শনাক্ত করা।
// Table-এর Cell ধরে OCR (Phase 8) ও পুনর্গঠন (Phase 9) পরের ধাপে যোগ হবে।
import { createProgress } from '../../components/progress.js';
import { createDocumentResult } from './document-preview.js';
import { createInkMap, toGray } from './page-geometry.js';
import { analyzePage } from './document-analysis.js';
import { linesFromPdfItems, linesFromOcr } from './line-source.js';
import { renderPageToCanvas } from '../pdf/pdf-renderer.js';
import { extractPageItems, assessTextQuality } from '../pdf/pdf-text-extractor.js';
import { describePageSize } from '../pdf/pdf-loader.js';
import { imageFileToCanvas, friendlyError } from '../text-ocr/text-ocr.js';
import { releaseCanvas } from '../../utils/memory-management.js';
import { parsePageRange } from '../../utils/helpers.js';
import { getWorker, recognize, cancelRecognition, terminateWorker, setProgressListener, setPageSegMode, CancelError } from '../../workers/ocr-worker.js';

const ANALYSIS_WIDTH = 1600; // টেবিলের রেখা ধরার জন্য পৃষ্ঠার ছবির প্রস্থ (পিক্সেল)
const OCR_WIDTH = 2400; // স্ক্যান করা পৃষ্ঠা OCR-এর প্রস্থ
const PREVIEW_WIDTH = 900;

const STATUS_BN = {
  'loading tesseract core': 'OCR ইঞ্জিন লোড হচ্ছে…',
  'initializing tesseract': 'OCR ইঞ্জিন চালু হচ্ছে…',
  'loading language traineddata': 'ভাষার ডেটা লোড হচ্ছে (প্রথমবার একটু সময় লাগে)…',
  'loaded language traineddata': 'ভাষার ডেটা লোড হয়েছে',
  'initializing api': 'OCR প্রস্তুত হচ্ছে…',
  'recognizing text': 'স্ক্যান করা পৃষ্ঠার লেখা শনাক্ত হচ্ছে…'
};

const tick = () => new Promise((r) => setTimeout(r, 0));

// ছবি → বিশ্লেষণের মাপের Canvas (বড় হলে ছোট করে; মূল Canvas অক্ষত)
function scaledCopy(canvas, width) {
  if (canvas.width <= width) return { canvas, copied: false };
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.max(1, Math.round(canvas.height * (width / canvas.width)));
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return { canvas: c, copied: true };
}

function inkMapOf(canvas, pageW) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = toGray(img.data, canvas.width * canvas.height);
  return createInkMap(gray, canvas.width, canvas.height, pageW);
}

function previewOf(canvas) {
  const { canvas: c, copied } = scaledCopy(canvas, PREVIEW_WIDTH);
  const url = c.toDataURL('image/jpeg', 0.82);
  if (copied) releaseCanvas(c);
  return url;
}

function baseNameOf(item) {
  return item.file.name.replace(/\.[^.]+$/, '') || 'document';
}

/**
 * opts: { controlsRoot, progressRoot, resultRoot, getItems, setLocked }
 * ফেরত দেয়: { refresh(items), getResults(), destroy() }
 */
export function createDocumentPanel({ controlsRoot, progressRoot, resultRoot, getItems, setLocked }) {
  controlsRoot.innerHTML = `
    <div class="card ocr-controls">
      <h2>Document বিশ্লেষণ</h2>
      <p class="muted">ফাইলের প্রতিটি পৃষ্ঠায় টেবিল, শিরোনাম, তালিকা, অনুচ্ছেদ ও স্বাক্ষর কোথায় আছে তা খুঁজে বের করা হয়।</p>
      <fieldset class="lang-group">
        <legend>ভাষা (স্ক্যান করা পৃষ্ঠার জন্য)</legend>
        <label><input type="radio" name="doc-lang" value="ben" /> বাংলা (ben)</label>
        <label><input type="radio" name="doc-lang" value="eng" /> English (eng)</label>
        <label><input type="radio" name="doc-lang" value="ben+eng" checked /> বাংলা + English (ben+eng)</label>
      </fieldset>
      <fieldset class="lang-group pdf-options" hidden>
        <legend>PDF-এর জন্য</legend>
        <label class="pdf-range">পৃষ্ঠা:
          <input type="text" class="ed-input doc-range-input" placeholder="সব পৃষ্ঠা (অথবা যেমন 1-3, 5)" aria-label="কোন কোন পৃষ্ঠা" />
        </label>
      </fieldset>
      <div class="ocr-actions">
        <button type="button" class="btn" data-action="start" disabled>বিশ্লেষণ শুরু করুন</button>
        <button type="button" class="btn btn-ghost btn-danger" data-action="cancel" hidden>বাতিল করুন</button>
      </div>
      <p class="muted ocr-hint">PDF-এ নিজস্ব লেখা থাকলে OCR ছাড়াই দ্রুত বিশ্লেষণ হয়। স্ক্যান করা PDF বা ছবি হলে OCR চলে, তাই প্রথমবার একটু সময় লাগে। সব কাজ আপনার Browser-এই হয়।</p>
      <div class="alert ocr-alert" role="alert" hidden></div>
    </div>`;

  const progress = createProgress(progressRoot);
  const startBtn = controlsRoot.querySelector('[data-action="start"]');
  const cancelBtn = controlsRoot.querySelector('[data-action="cancel"]');
  const alertBox = controlsRoot.querySelector('.ocr-alert');
  const langInputs = Array.from(controlsRoot.querySelectorAll('input[name="doc-lang"]'));
  const pdfBox = controlsRoot.querySelector('.pdf-options');
  const rangeInput = controlsRoot.querySelector('.doc-range-input');

  let running = false;
  let cancelled = false;
  let destroyed = false;
  let currentRender = null;
  let currentItems = [];
  let resultView = null;
  let results = [];

  function showAlert(msg) {
    alertBox.hidden = !msg;
    alertBox.textContent = msg || '';
  }

  function syncButtons() {
    startBtn.disabled = running || currentItems.length === 0;
    startBtn.textContent = resultView ? 'আবার বিশ্লেষণ করুন' : 'বিশ্লেষণ শুরু করুন';
    cancelBtn.hidden = !running;
    langInputs.forEach((i) => { i.disabled = running; });
    rangeInput.disabled = running;
    pdfBox.hidden = !currentItems.some((i) => i.kind === 'pdf');
  }

  function clearResult() {
    if (resultView) { resultView.destroy(); resultView = null; }
    results = [];
  }

  // একটি পৃষ্ঠার বিশ্লেষণ
  async function analyzeOne(item, pageNum, langs, state) {
    let pageW;
    let pageH;
    let size;
    let items = null;
    let quality = null;
    let canvas;

    if (item.kind === 'pdf') {
      const page = await item.pdf.getPage(pageNum);
      try {
        const ex = await extractPageItems(page);
        pageW = ex.width; pageH = ex.height; items = ex.items;
        quality = assessTextQuality(items);
      } finally { page.cleanup(); }
      size = describePageSize(pageW, pageH);
      currentRender = renderPageToCanvas(item.pdf, pageNum, ANALYSIS_WIDTH);
      canvas = await currentRender.promise;
      currentRender = null;
      if (!canvas) throw new CancelError();
    } else {
      canvas = await imageFileToCanvas(item.file);
      pageW = canvas.width; pageH = canvas.height;
      size = { name: 'ছবি', orientation: pageW > pageH ? 'landscape' : 'portrait', width: pageW, height: pageH };
    }
    if (cancelled) { releaseCanvas(canvas); throw new CancelError(); }

    let ink;
    let previewUrl;
    let ocrCanvas = null; // স্ক্যান করা ছবি হলে OCR এই Canvas-এই চলবে
    try {
      const sc = scaledCopy(canvas, ANALYSIS_WIDTH);
      try {
        ink = inkMapOf(sc.canvas, pageW);
      } finally { if (sc.copied) releaseCanvas(sc.canvas); }
      previewUrl = previewOf(canvas);
      if (item.kind !== 'pdf') { ocrCanvas = canvas; canvas = null; }
    } finally {
      if (canvas) releaseCanvas(canvas);
    }
    await tick();

    let lines;
    let source;
    let reliable;
    if (quality && quality.level !== 'none') {
      lines = linesFromPdfItems(items);
      reliable = quality.level === 'good';
      source = reliable ? 'pdf-text' : 'pdf-text-broken';
    } else {
      // স্ক্যান করা পৃষ্ঠা বা ছবি: OCR
      if (!state.workerReady) {
        progress.update({ status: 'OCR ইঞ্জিন প্রস্তুত হচ্ছে…' });
        await getWorker(langs);
        await setPageSegMode(3);
        state.workerReady = true;
      }
      if (!ocrCanvas) {
        currentRender = renderPageToCanvas(item.pdf, pageNum, OCR_WIDTH);
        ocrCanvas = await currentRender.promise;
        currentRender = null;
        if (!ocrCanvas) throw new CancelError();
      }
      let res;
      try {
        res = await recognize(ocrCanvas, { blocks: true });
        lines = linesFromOcr(res.data, pageW / ocrCanvas.width);
      } finally { releaseCanvas(ocrCanvas); ocrCanvas = null; }
      reliable = true;
      source = 'ocr';
    }
    if (ocrCanvas) releaseCanvas(ocrCanvas);

    const analysis = analyzePage({ page: { width: pageW, height: pageH }, lines, ink, textReliable: reliable });
    return { pageNum, label: `${item.file.name} — পৃষ্ঠা ${pageNum}`, size, source, textReliable: reliable, previewUrl, analysis };
  }

  async function start() {
    const items = getItems();
    if (!items.length || running) return;
    const item = items[0];

    let pages = [1];
    if (item.kind === 'pdf') {
      const r = parsePageRange(rangeInput.value, item.pages);
      if (!r.ok) { showAlert(r.error); return; }
      if (!r.pages.length) { showAlert('দেওয়া পৃষ্ঠা-রেঞ্জে কোনো পৃষ্ঠা নেই। PDF-এর মোট পৃষ্ঠা সংখ্যা দেখে আবার লিখুন।'); return; }
      pages = r.pages;
    }

    running = true;
    cancelled = false;
    showAlert('');
    clearResult();
    setLocked(true);
    syncButtons();

    const langs = controlsRoot.querySelector('input[name="doc-lang"]:checked').value.split('+');
    const state = { workerReady: false };
    let done = 0;
    progress.show();
    progress.update({ percent: 0, status: 'বিশ্লেষণ শুরু হচ্ছে…', detail: `মোট ${pages.length}টি পৃষ্ঠা` });

    setProgressListener((m) => {
      if (!m || cancelled) return;
      const label = STATUS_BN[m.status] || '';
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        progress.update({ percent: ((done + m.progress) / pages.length) * 100, status: label });
      } else if (label) {
        const p = typeof m.progress === 'number' && m.status.startsWith('loading') ? ` ${Math.round(m.progress * 100)}%` : '';
        progress.update({ status: label + p });
      }
    });

    let failure = null;
    try {
      for (const p of pages) {
        if (cancelled) throw new CancelError();
        progress.update({ status: 'পৃষ্ঠা বিশ্লেষণ হচ্ছে…', detail: `${item.file.name} · পৃষ্ঠা ${p} (${done + 1}/${pages.length})` });
        results.push(await analyzeOne(item, p, langs, state));
        done++;
        progress.update({ percent: (done / pages.length) * 100 });
        await tick();
      }
    } catch (e) {
      failure = e;
      if (!(e instanceof CancelError)) console.error('Document analysis error:', e);
    } finally {
      if (currentRender) { currentRender.cancel(); currentRender = null; }
      setProgressListener(null);
      running = false;
      if (!destroyed) setLocked(false);
    }

    if (destroyed) return;
    progress.hide();
    if (results.length) {
      resultView = createDocumentResult(resultRoot, { pages: results, baseName: baseNameOf(item) });
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
      // ফাইল বদলালে বা মুছলে পুরোনো ফল সরে যায়
      const changed = items[0] !== currentItems[0];
      currentItems = items;
      if (changed && !running) { clearResult(); showAlert(''); }
      syncButtons();
    },
    getResults() { return results; },
    destroy() {
      destroyed = true;
      controlsRoot.removeEventListener('click', onClick);
      if (running) { cancelled = true; if (currentRender) currentRender.cancel(); }
      setProgressListener(null);
      terminateWorker();
      clearResult();
      progress.destroy();
      controlsRoot.innerHTML = '';
      resultRoot.innerHTML = '';
    }
  };
}
