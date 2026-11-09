// Image Enhancement Panel: সেটিংস, Original বনাম Enhanced পাশাপাশি Preview, Crop ও Rotate।
// OCR চলার সময় text-ocr.js এখান থেকে process() ডেকে প্রতিটি পৃষ্ঠা/ছবি পরিষ্কার করে নেয়।
import {
  enhanceCanvas, hasWork, DEFAULT_SETTINGS, RECOMMENDED_SETTINGS
} from '../modules/image-processing/image-enhancement.js';
import { renderPageToCanvas } from '../modules/pdf/pdf-renderer.js';
import { releaseCanvas } from '../utils/memory-management.js';
import { escapeHtml } from '../utils/helpers.js';

const PREVIEW_W = 900;

async function loadPreviewSource(item, page) {
  if (item.kind === 'pdf') {
    const job = renderPageToCanvas(item.pdf, page, PREVIEW_W);
    return job.promise;
  }
  let bmp;
  try { bmp = await createImageBitmap(item.file, { imageOrientation: 'from-image' }); } catch (e) { bmp = await createImageBitmap(item.file); }
  const scale = Math.min(1, PREVIEW_W / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

/**
 * opts: { getItems }
 * ফেরত: { process(canvas, item), refresh(items), setLocked(bool), isActive(), destroy() }
 */
export function createEnhancementPanel(root, opts = {}) {
  const settings = { ...DEFAULT_SETTINGS };
  const perItem = new Map(); // item.id → { rotate, crop }
  let items = [];
  let selectedId = null;
  let page = 1;
  let srcCanvas = null;
  let srcKey = '';
  let outCanvas = null;
  let token = 0;
  let timer = null;
  let locked = false;
  let destroyed = false;

  root.innerHTML = `
    <section class="card enh">
      <div class="enh-head">
        <h2>ছবি উন্নত করুন (Image Enhancement)</h2>
        <label class="enh-switch"><input type="checkbox" data-k="enabled" /> OCR-এর আগে চালু</label>
      </div>
      <p class="muted enh-lead">আসল ছবি কখনো বদলায় না; উন্নত করা কপি আলাদা Canvas-এ তৈরি হয়। ফল ভালো না লাগলে বন্ধ করে আবার OCR করুন।</p>

      <div class="enh-grid">
        <label class="enh-row"><input type="checkbox" data-k="grayscale" /> Grayscale (ধূসর)</label>
        <label class="enh-row"><input type="checkbox" data-k="upscale" /> ছোট ছবি বড় করুন (Upscale)</label>
        <label class="enh-row"><input type="checkbox" data-k="deskew" /> হেলানো ছবি সোজা করুন (Deskew)</label>
        <label class="enh-row"><input type="checkbox" data-k="denoise" /> Noise Reduction (দাগ কমান)</label>

        <label class="enh-range">Brightness <output data-out="brightness"></output>
          <input type="range" min="-100" max="100" step="1" data-k="brightness" /></label>
        <label class="enh-range">Contrast <output data-out="contrast"></output>
          <input type="range" min="-100" max="100" step="1" data-k="contrast" /></label>
        <label class="enh-range">Sharpen <output data-out="sharpen"></output>
          <input type="range" min="0" max="100" step="5" data-k="sharpen" /></label>

        <fieldset class="enh-thr">
          <legend>Black &amp; White / Threshold</legend>
          <label><input type="radio" name="enh-threshold" value="off" /> বন্ধ</label>
          <label><input type="radio" name="enh-threshold" value="auto" /> স্বয়ংক্রিয়</label>
          <label><input type="radio" name="enh-threshold" value="manual" /> নিজে</label>
          <label class="enh-range enh-thr-range"><output data-out="thresholdValue"></output>
            <input type="range" min="0" max="255" step="1" data-k="thresholdValue" /></label>
        </fieldset>
      </div>
      <p class="muted enh-note">Noise, Sharpen ও Threshold চালু থাকলে ছবি ধূসর হয়ে যায় (OCR-এর জন্য সমস্যা নেই)। পাতলা বাংলা মাত্রা-কারে Noise Reduction কখনো ক্ষতি করতে পারে, তাই Preview দেখে ঠিক করুন।</p>

      <div class="enh-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-act="recommended">প্রস্তাবিত সেটিংস</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="reset">রিসেট</button>
      </div>

      <div class="enh-pick" hidden>
        <label class="ocr-field">Preview:
          <select class="ed-input enh-file" aria-label="Preview-এর ফাইল"></select>
        </label>
        <label class="ocr-field enh-page-wrap" hidden>পৃষ্ঠা
          <input type="number" class="ed-input enh-page" min="1" value="1" aria-label="Preview-এর পৃষ্ঠা" />
        </label>
        <span class="enh-tools">
          <button type="button" class="btn btn-ghost btn-sm" data-act="rot-left" title="৯০° বামে">⟲ বামে</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="rot-right" title="৯০° ডানে">ডানে ⟳</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="crop-clear">Crop সরান</button>
        </span>
      </div>

      <div class="enh-compare" hidden>
        <figure class="enh-fig">
          <figcaption>মূল (Original) <span class="muted">— Crop করতে ছবির উপর টেনে নির্বাচন করুন</span></figcaption>
          <div class="enh-orig-wrap"><div class="enh-orig"></div><div class="crop-box" hidden></div></div>
        </figure>
        <figure class="enh-fig">
          <figcaption>উন্নত (Enhanced)</figcaption>
          <div class="enh-out"></div>
        </figure>
      </div>
      <p class="enh-info muted" aria-live="polite">ফাইল যোগ করলে এখানে আগে-পরের তুলনা দেখা যাবে।</p>
    </section>`;

  const $ = (sel) => root.querySelector(sel);
  const pickBox = $('.enh-pick');
  const fileSel = $('.enh-file');
  const pageWrap = $('.enh-page-wrap');
  const pageInput = $('.enh-page');
  const compare = $('.enh-compare');
  const origBox = $('.enh-orig');
  const origWrap = $('.enh-orig-wrap');
  const cropBox = $('.crop-box');
  const outBox = $('.enh-out');
  const infoEl = $('.enh-info');

  const selectedItem = () => items.find((i) => i.id === selectedId) || null;
  const optsOf = (id) => {
    if (!perItem.has(id)) perItem.set(id, { rotate: 0, crop: null });
    return perItem.get(id);
  };

  /* ---------- ফর্ম ↔ সেটিংস ---------- */
  function syncForm() {
    root.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.dataset.k;
      if (el.type === 'checkbox') el.checked = !!settings[k];
      else el.value = settings[k];
    });
    root.querySelectorAll('input[name="enh-threshold"]').forEach((r) => { r.checked = r.value === settings.threshold; });
    root.querySelectorAll('[data-out]').forEach((o) => { o.textContent = settings[o.dataset.out]; });
    $('.enh-thr-range input').disabled = locked || settings.threshold !== 'manual';
    const off = !settings.enabled;
    root.querySelector('.enh-grid').classList.toggle('is-off', off);
  }

  function applyLock() {
    root.querySelectorAll('input, select, button').forEach((el) => { el.disabled = locked; });
    if (!locked) $('.enh-thr-range input').disabled = settings.threshold !== 'manual';
    root.classList.toggle('is-locked', locked);
  }

  function schedule(delay = 150) {
    clearTimeout(timer);
    timer = setTimeout(renderPreview, delay);
  }

  /* ---------- Crop বক্স ---------- */
  function drawCropBox() {
    const it = selectedItem();
    const crop = it ? optsOf(it.id).crop : null;
    if (!crop) { cropBox.hidden = true; return; }
    cropBox.hidden = false;
    cropBox.style.left = crop.x * 100 + '%';
    cropBox.style.top = crop.y * 100 + '%';
    cropBox.style.width = crop.w * 100 + '%';
    cropBox.style.height = crop.h * 100 + '%';
  }

  /* ---------- Preview ---------- */
  async function renderPreview() {
    if (destroyed) return;
    const it = selectedItem();
    if (!it) {
      compare.hidden = true;
      pickBox.hidden = true;
      infoEl.textContent = 'ফাইল যোগ করলে এখানে আগে-পরের তুলনা দেখা যাবে।';
      return;
    }
    pickBox.hidden = false;
    compare.hidden = false;
    const my = ++token;
    const key = it.id + ':' + page;
    try {
      if (srcKey !== key || !srcCanvas) {
        infoEl.textContent = 'Preview তৈরি হচ্ছে…';
        const c = await loadPreviewSource(it, page);
        if (my !== token || destroyed) { releaseCanvas(c); return; }
        if (!c) return;
        releaseCanvas(srcCanvas);
        srcCanvas = c;
        srcKey = key;
        c.className = 'enh-canvas';
        origBox.replaceChildren(c);
      }
      const o = optsOf(it.id);
      const { canvas, info } = await enhanceCanvas(srcCanvas, settings, o, { preview: true });
      if (my !== token || destroyed) { releaseCanvas(canvas); return; }
      releaseCanvas(outCanvas);
      outCanvas = canvas;
      canvas.className = 'enh-canvas';
      outBox.replaceChildren(canvas);
      drawCropBox();
      const bits = [];
      if (o.rotate) bits.push(`ঘোরানো: ${o.rotate}°`);
      if (o.crop) bits.push('Crop করা আছে');
      if (info.angle) bits.push(`হেলানো ছিল ${info.angle}°, সোজা করা হয়েছে`);
      else if (settings.enabled && settings.deskew) bits.push('উল্লেখযোগ্য হেলানো পাওয়া যায়নি');
      if (!settings.enabled) bits.push('Enhancement বন্ধ (শুধু Crop/Rotate প্রযোজ্য)');
      if (it.kind === 'pdf') bits.push('Crop/Rotate এই PDF-এর সব পৃষ্ঠায় প্রযোজ্য');
      if (settings.enabled && settings.upscale) bits.push('OCR-এর সময় ছোট ছবি বড় করা হবে (Preview-তে নয়)');
      infoEl.textContent = bits.join(' · ') || 'কোনো পরিবর্তন নেই।';
    } catch (e) {
      if (my === token) infoEl.textContent = 'Preview দেখানো যায়নি: ' + ((e && e.message) || 'অজানা সমস্যা');
    }
  }

  function rebuildPicker() {
    fileSel.innerHTML = items
      .map((i) => `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${escapeHtml(i.file.name)}</option>`)
      .join('');
    const it = selectedItem();
    pageWrap.hidden = !(it && it.kind === 'pdf' && it.pages > 1);
    if (it && it.kind === 'pdf') { pageInput.max = String(it.pages); pageInput.value = String(page); }
  }

  /* ---------- ঘটনা ---------- */
  function onInput(e) {
    const el = e.target;
    if (el.name === 'enh-threshold') {
      settings.threshold = el.value;
    } else if (el.dataset.k) {
      const k = el.dataset.k;
      settings[k] = el.type === 'checkbox' ? el.checked : Number(el.value);
    } else if (el === fileSel) {
      selectedId = fileSel.value;
      page = 1;
      rebuildPicker();
    } else if (el === pageInput) {
      const it = selectedItem();
      const n = Math.max(1, Math.min(it ? it.pages : 1, parseInt(pageInput.value, 10) || 1));
      if (n === page) return;
      page = n;
    } else {
      return;
    }
    syncForm();
    schedule();
  }

  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn || locked) return;
    const it = selectedItem();
    switch (btn.dataset.act) {
      case 'recommended': Object.assign(settings, RECOMMENDED_SETTINGS); break;
      case 'reset': Object.assign(settings, DEFAULT_SETTINGS); if (it) perItem.set(it.id, { rotate: 0, crop: null }); break;
      case 'rot-left': if (it) { const o = optsOf(it.id); o.rotate = (o.rotate + 270) % 360; } break;
      case 'rot-right': if (it) { const o = optsOf(it.id); o.rotate = (o.rotate + 90) % 360; } break;
      case 'crop-clear': if (it) optsOf(it.id).crop = null; break;
      default: return;
    }
    syncForm();
    schedule(0);
  }

  // Crop নির্বাচন: Original ছবির উপর টেনে
  let drag = null;
  function pointFrom(e) {
    const canvas = origBox.querySelector('canvas');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
    };
  }
  function onPointerDown(e) {
    if (locked || !selectedItem()) return;
    const p = pointFrom(e);
    if (!p) return;
    drag = p;
    origWrap.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onPointerMove(e) {
    if (!drag) return;
    const p = pointFrom(e);
    const it = selectedItem();
    if (!p || !it) return;
    const x = Math.min(drag.x, p.x);
    const y = Math.min(drag.y, p.y);
    optsOf(it.id).crop = { x, y, w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) };
    drawCropBox();
  }
  function onPointerUp() {
    if (!drag) return;
    drag = null;
    const it = selectedItem();
    if (!it) return;
    const o = optsOf(it.id);
    if (o.crop && (o.crop.w < 0.03 || o.crop.h < 0.03)) o.crop = null; // খুব ছোট নির্বাচন বাতিল
    drawCropBox();
    schedule(0);
  }

  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);
  root.addEventListener('click', onClick);
  origWrap.addEventListener('pointerdown', onPointerDown);
  origWrap.addEventListener('pointermove', onPointerMove);
  origWrap.addEventListener('pointerup', onPointerUp);
  origWrap.addEventListener('pointercancel', onPointerUp);

  syncForm();

  return {
    // OCR-এর সময় প্রতিটি Canvas পরিষ্কার করে নতুন Canvas ফেরত দেয়; আসলটি ছেড়ে দেওয়া হয়
    async process(canvas, item) {
      const o = perItem.get(item.id) || { rotate: 0, crop: null };
      if (!hasWork(settings, o)) return canvas;
      const { canvas: out } = await enhanceCanvas(canvas, settings, o);
      releaseCanvas(canvas);
      return out;
    },
    isActive: () => hasWork(settings, {}),
    refresh(next) {
      items = next || [];
      for (const id of Array.from(perItem.keys())) if (!items.some((i) => i.id === id)) perItem.delete(id);
      if (!items.some((i) => i.id === selectedId)) { selectedId = items[0] ? items[0].id : null; page = 1; srcKey = ''; }
      rebuildPicker();
      applyLock();
      schedule(0);
    },
    setLocked(v) { locked = !!v; applyLock(); },
    destroy() {
      destroyed = true;
      token++;
      clearTimeout(timer);
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onInput);
      root.removeEventListener('click', onClick);
      releaseCanvas(srcCanvas);
      releaseCanvas(outCanvas);
      srcCanvas = outCanvas = null;
      root.innerHTML = '';
    }
  };
}
