// Document OCR (Phase 7): পৃষ্ঠা বিশ্লেষণ — টেবিল, শিরোনাম, তালিকা, স্বাক্ষর ইত্যাদি শনাক্ত করা।
// Table-এর Cell ধরে OCR (Phase 8) ও পুনর্গঠন (Phase 9) পরের ধাপে যোগ হবে।
import { createProgress } from '../../components/progress.js';
import { createDocumentResult } from './document-preview.js';
import { createInkMap, toGray } from './page-geometry.js';
import { readTable, ocrLineSegments } from './table-ocr.js';
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
export function createDocumentPanel({ controlsRoot, progressRoot, resultRoot, getItems, setLocked, enhance }) {
  controlsRoot.innerHTML = `
    <div class="card ocr-controls">
      <h2>Document বিশ্লেষণ</h2>
      <p class="muted">প্রতিটি পৃষ্ঠায় টেবিল, শিরোনাম, তালিকা, অনুচ্ছেদ ও স্বাক্ষর খুঁজে বের করা হয়। টেবিলের প্রতিটি ঘর আলাদা করে পড়া হয়, তাই সারি-কলাম এলোমেলো হয় না।</p>
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

  async function ensureWorker(langs, state) {
    const key = langs.join('+');
    if (state.workerKey === key) return;
    progress.update({ status: 'OCR ইঞ্জিন প্রস্তুত হচ্ছে…' });
    await getWorker(langs);
    state.workerKey = key;
    await setPageSegMode(3);
  }

  // একটি পৃষ্ঠার বিশ্লেষণ
  async function analyzeOne(item, pageNum, langsWanted, state, pageIndex, pageCount) {
    let pageW;
    let pageH;
    let size;
    let items = null;
    let quality = null;
    let canvas;
    let langNote = '';
    const isPdf = item.kind === 'pdf';
    const frac = (f) => progress.update({ percent: ((pageIndex + f) / pageCount) * 100 });

    if (isPdf) {
      const page = await item.pdf.getPage(pageNum);
      try {
        const ex = await extractPageItems(page);
        pageW = ex.width; pageH = ex.height; items = ex.items;
        quality = assessTextQuality(items);
      } finally { page.cleanup(); }
      size = describePageSize(pageW, pageH);
      // লেখা ভালো হলে হালকা ছবি যথেষ্ট; নইলে OCR-এর জন্য বেশি রেজোলিউশন
      currentRender = renderPageToCanvas(item.pdf, pageNum, quality.level === 'good' ? ANALYSIS_WIDTH : OCR_WIDTH);
      canvas = await currentRender.promise;
      currentRender = null;
      if (!canvas) throw new CancelError();
    } else {
      canvas = await imageFileToCanvas(item.file);
    }
    if (cancelled) { releaseCanvas(canvas); throw new CancelError(); }

    // স্ক্যান করা পৃষ্ঠা ও ছবিতে Image Enhancement (Crop/Rotate/Deskew ইত্যাদি) প্রযোজ্য।
    // এতে ছবির মাপ বদলায়, তাই এখন থেকে পৃষ্ঠার একক = ছবির পিক্সেল।
    const scanLike = !isPdf || quality.level === 'none';
    if (scanLike && enhance && enhance.isActive()) {
      progress.update({ status: 'ছবি উন্নত হচ্ছে…' });
      canvas = await enhance.process(canvas, item);
      if (cancelled) { releaseCanvas(canvas); throw new CancelError(); }
      pageW = null;
    }
    if (!isPdf || pageW === null) {
      pageW = canvas.width; pageH = canvas.height;
      size = { name: 'ছবি', orientation: pageW > pageH ? 'landscape' : 'portrait', width: pageW, height: pageH };
    }
    const ppu = canvas.width / pageW; // পিক্সেল ÷ পৃষ্ঠার একক

    try {
      let ink;
      const sc = scaledCopy(canvas, ANALYSIS_WIDTH);
      try { ink = inkMapOf(sc.canvas, pageW); } finally { if (sc.copied) releaseCanvas(sc.canvas); }
      const previewUrl = previewOf(canvas);
      await tick();
      frac(0.1);

      // ১) লাইন সংগ্রহ
      let lines;
      let source;
      let reliable;
      let langs = langsWanted;
      if (quality && quality.level !== 'none') {
        lines = linesFromPdfItems(items);
        reliable = quality.level === 'good';
        source = reliable ? 'pdf-text' : 'pdf-text-broken';
        // PDF-এর লেখা প্রায় পুরোটাই বাংলা হলে শুধু "বাংলা" ব্যবহার করলে ভুল ইংরেজি অক্ষর (T, Ts, 18...) আসে না
        if (!reliable && langsWanted.length === 2 && quality.chars && quality.bengali / quality.chars > 0.7) {
          langs = ['ben'];
          langNote = 'লেখা প্রায় পুরোটাই বাংলা, তাই OCR-এ শুধু "বাংলা (ben)" ব্যবহার হয়েছে।';
        }
      } else {
        await ensureWorker(langs, state);
        let res;
        progress.update({ status: 'পুরো পৃষ্ঠার লাইন শনাক্ত হচ্ছে…' });
        res = await recognize(canvas, { blocks: true });
        lines = linesFromOcr(res.data, pageW / canvas.width);
        reliable = true;
        source = 'ocr';
      }
      if (cancelled) throw new CancelError();

      // ২) প্রথম বিশ্লেষণ (Layout)
      let analysis = analyzePage({ page: { width: pageW, height: pageH }, lines, ink, textReliable: reliable });

      // ৩) ভাঙা-লেখার PDF: টেবিলের বাইরের লাইনের প্রতিটি টুকরো আলাদা OCR করে আবার বিশ্লেষণ
      if (source === 'pdf-text-broken') {
        await ensureWorker(langs, state);
        const inTable = (l) => analysis.tables.some((t) => (l.x0 + l.x1) / 2 >= t.bbox.x0 - 3 && (l.x0 + l.x1) / 2 <= t.bbox.x1 + 3 && (l.y0 + l.y1) / 2 >= t.bbox.y0 - 3 && (l.y0 + l.y1) / 2 <= t.bbox.y1 + 3);
        const outside = lines.filter((l) => !inTable(l));
        progress.update({ status: 'শিরোনাম, তালিকা ও স্বাক্ষরের লেখা পড়া হচ্ছে…' });
        await ocrLineSegments(outside, {
          canvas, ppu, isCancelled: () => cancelled,
          onProgress: (d, t) => frac(0.1 + 0.2 * (d / t))
        });
        if (cancelled) throw new CancelError();
        const kept = lines.filter((l) => l.segs.length && l.text.trim());
        analysis = analyzePage({ page: { width: pageW, height: pageH }, lines: kept.filter((l) => !inTable(l)).concat(lines.filter(inTable)), ink, textReliable: true });
        // টেবিলের ভেতরের ভাঙা লাইনের লেখা বিশ্লেষণে ব্যবহার হয় না; ঘর ধরে OCR পরে হবে
        reliable = true;
        source = 'pdf-layout-ocr';
      }

      // ৪) টেবিলের ঘর ধরে লেখা পড়া
      const totalCells = analysis.tables.reduce((n, t) => n + (t.ruled ? (t.rows * t.cols) : 0), 0);
      let cellsDone = 0;
      for (const t of analysis.tables) {
        if (t.ruled && !(items && quality && quality.level === 'good')) await ensureWorker(langs, state);
        // রেখা-ওয়ালা টেবিলে আলাদা ঘর-OCR। সরল ঘরে PSM 7 (এক লাইন) ও লম্বা ঘরে PSM 6।
        const base = cellsDone;
        const grid = await readTable(t, {
          ink, canvas, ppu, sampleBg: true, bodySize: analysis.bodySize, items, reliableLayer: !!(quality && quality.level === 'good'),
          isCancelled: () => cancelled,
          onCell: (d, tot) => {
            progress.update({ status: `টেবিলের ঘর পড়া হচ্ছে… ${d}/${tot}`, detail: `${item.file.name} · পৃষ্ঠা ${pageNum}` });
            frac(0.3 + 0.7 * ((base + d) / Math.max(1, totalCells)));
          }
        });
        if (cancelled) throw new CancelError();
        t.grid = grid;
        cellsDone += grid.cells.length;
      }
      // ৫) স্বাক্ষরের ছবি/কালি পাওয়া গেলে মূল ছবি থেকে কেটে সংরক্ষণ (কৃত্রিম স্বাক্ষর বানানো হয় না)
      for (const b of analysis.blocks) {
        if (b.type !== 'signature') continue;
        for (const pe of b.people) {
          if (!pe.signatureInk) continue;
          const s = pe.signatureInk;
          const c = document.createElement('canvas');
          const sx = Math.max(0, Math.floor(s.x0 * ppu)); const sy = Math.max(0, Math.floor(s.y0 * ppu));
          c.width = Math.max(1, Math.min(canvas.width - sx, Math.ceil((s.x1 - s.x0) * ppu)));
          c.height = Math.max(1, Math.min(canvas.height - sy, Math.ceil((s.y1 - s.y0) * ppu)));
          c.getContext('2d').drawImage(canvas, sx, sy, c.width, c.height, 0, 0, c.width, c.height);
          pe.signatureImage = c.toDataURL('image/png');
          releaseCanvas(c);
        }
      }
      frac(1);

      return { pageNum, label: `${item.file.name} — পৃষ্ঠা ${pageNum}`, size, source, textReliable: reliable, langNote, previewUrl, analysis };
    } finally {
      releaseCanvas(canvas);
    }
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
    const state = { workerKey: '' };
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
        results.push(await analyzeOne(item, p, langs, state, done, pages.length));
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
