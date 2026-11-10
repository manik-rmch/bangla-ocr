// OCR ফলের Editor: পৃষ্ঠাভিত্তিক ট্যাব, Copy, Clear, Find & Replace, গণনা, TXT ডাউনলোড
import { escapeHtml } from '../../utils/helpers.js';
import { downloadTxt } from '../export/txt-export.js';
import { textToDocx } from '../export/docx-export.js';
import { downloadBytes, MIME } from '../export/download.js';
import { removeBlankLines } from './text-cleanup.js';
import { isConfigured, saveTextToSheets } from '../../services/cloud.js';

/* ---------- বিশুদ্ধ (DOM-ছাড়া) সাহায্যকারী ফাংশন ---------- */
export function countStats(text) {
  const trimmed = text.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    chars: Array.from(text).length,
    lines: text ? text.split('\n').length : 0
  };
}

export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replaceInText(text, query, replacement) {
  if (!query) return { text, count: 0 };
  let count = 0;
  const re = new RegExp(escapeRegExp(query), 'gi');
  const out = text.replace(re, () => { count++; return replacement; });
  return { text: out, count };
}

export function countMatches(text, query) {
  return replaceInText(text, query, '').count;
}

export function combinePages(pages) {
  if (pages.length === 1) return pages[0].text;
  return pages.map((p) => `──── ${p.label} ────\n${p.text.trim()}`).join('\n\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (x) { ok = false; }
    ta.remove();
    return ok;
  }
}

/* ---------- Editor ---------- */
// pages: [{ label, text, confidence, source: 'ocr' | 'pdf-text' }]
export function createTextEditor(root, { pages, baseName }) {
  const multi = pages.length > 1;
  const state = { pages: pages.map((p) => ({ ...p })), view: multi ? 'all' : 0 };
  let toastTimer = null;

  root.innerHTML = `
    <section class="card editor">
      <h2>OCR ফল</h2>
      <div class="ed-tabs" role="tablist" aria-label="পৃষ্ঠা"></div>
      <div class="ed-toolbar">
        <button type="button" class="btn btn-ghost btn-sm" data-ed="select">Select All</button>
        <button type="button" class="btn btn-ghost btn-sm" data-ed="copy">Copy</button>
        <button type="button" class="btn btn-ghost btn-sm btn-danger" data-ed="clear">Clear</button>
        <button type="button" class="btn btn-ghost btn-sm" data-ed="squeeze" title="লাইনের মাঝের সব ফাঁকা লাইন মুছে ফেলে">ফাঁকা লাইন বাদ</button>
        <button type="button" class="btn btn-ghost btn-sm" data-ed="download">TXT ডাউনলোড</button>
        <button type="button" class="btn btn-ghost btn-sm" data-ed="download-docx" title="লেখাটি Word (.docx) ফাইলে; Tab-ওয়ালা টেবিল-সারি Tab হিসেবেই থাকে">Word ডাউনলোড</button>
        ${isConfigured() ? '<button type="button" class="btn btn-ghost btn-sm" data-ed="save-sheets" title="আপনার Google Sheet-এ এই লেখা সংরক্ষণ (সম্মতি চাওয়া হবে)">Google Sheets-এ সংরক্ষণ</button>' : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-ed="find-toggle">Find &amp; Replace</button>
        <span class="ed-toast" aria-live="polite"></span>
      </div>
      <div class="ed-find" hidden>
        <input type="text" class="ed-input ed-find-q" placeholder="যা খুঁজবেন" aria-label="খুঁজুন" />
        <input type="text" class="ed-input ed-find-r" placeholder="যা দিয়ে বদলাবেন" aria-label="বদলান" />
        <div class="ed-find-btns">
          <button type="button" class="btn btn-ghost btn-sm" data-ed="find-next">পরেরটি খুঁজুন</button>
          <button type="button" class="btn btn-ghost btn-sm" data-ed="replace">বদলান</button>
          <button type="button" class="btn btn-ghost btn-sm" data-ed="replace-all">সব বদলান</button>
        </div>
        <label class="ed-scope" ${multi ? '' : 'hidden'}><input type="checkbox" class="ed-find-all" checked /> সব পৃষ্ঠায় (বন্ধ করলে শুধু এই পৃষ্ঠায়)</label>
        <span class="ed-find-msg" aria-live="polite"></span>
      </div>
      <p class="ed-note" hidden>এই দৃশ্যে লেখা শুধু পড়া যায়। সম্পাদনা করতে উপরে কোনো পৃষ্ঠার ট্যাব বাছুন।</p>
      <textarea class="ed-text" spellcheck="false" lang="bn" aria-label="OCR ফল"></textarea>
      <div class="ed-stats"></div>
    </section>`;

  const tabsEl = root.querySelector('.ed-tabs');
  const ta = root.querySelector('.ed-text');
  const noteEl = root.querySelector('.ed-note');
  const statsEl = root.querySelector('.ed-stats');
  const toastEl = root.querySelector('.ed-toast');
  const findBox = root.querySelector('.ed-find');
  const findQ = root.querySelector('.ed-find-q');
  const findR = root.querySelector('.ed-find-r');
  const findAll = root.querySelector('.ed-find-all');
  const findMsg = root.querySelector('.ed-find-msg');

  const viewText = () => (state.view === 'all' ? combinePages(state.pages) : state.pages[state.view].text);

  function toast(msg) {
    toastEl.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.textContent = ''; }, 2200);
  }

  function renderTabs() {
    if (!multi) { tabsEl.hidden = true; return; }
    const tab = (id, label, title) =>
      `<button type="button" role="tab" class="ed-tab ${state.view === id ? 'active' : ''}" data-tab="${id}" aria-selected="${state.view === id}" title="${escapeHtml(title)}">${escapeHtml(label)}</button>`;
    tabsEl.innerHTML =
      tab('all', 'সব পৃষ্ঠা', 'সব পৃষ্ঠার লেখা একসঙ্গে') +
      state.pages.map((p, i) => tab(i, `${i + 1}. ${p.label}`, p.label)).join('');
  }

  function updateStats() {
    const s = countStats(ta.value);
    let extra = '';
    if (state.view !== 'all') {
      const pg = state.pages[state.view];
      const c = pg.confidence;
      if (pg.source === 'pdf-text') {
        extra = ' · উৎস: PDF-এর নিজস্ব লেখা (OCR নয়)';
      } else if (typeof c === 'number') {
        extra = ` · OCR আত্মবিশ্বাস: ${Math.round(c)}%` + (c < 70 ? ' (কম, মূল ফাইলের সঙ্গে মিলিয়ে নিন)' : '');
      }
    }
    statsEl.textContent = `শব্দ: ${s.words} · অক্ষর: ${s.chars} · লাইন: ${s.lines}${extra}`;
  }

  function setView(v) {
    state.view = v;
    renderTabs();
    ta.value = viewText();
    ta.readOnly = v === 'all';
    noteEl.hidden = v !== 'all';
    findMsg.textContent = '';
    updateStats();
  }

  function refreshTextarea() {
    ta.value = viewText();
    updateStats();
  }

  /* ---------- Find & Replace ---------- */
  function findNext() {
    const q = findQ.value;
    if (!q) { findMsg.textContent = 'আগে খোঁজার লেখা দিন।'; return false; }
    const total = countMatches(ta.value, q);
    if (!total) { findMsg.textContent = 'পাওয়া যায়নি।'; return false; }
    const re = new RegExp(escapeRegExp(q), 'gi');
    re.lastIndex = ta.selectionEnd > ta.selectionStart ? ta.selectionEnd : ta.selectionStart;
    let m = re.exec(ta.value);
    if (!m) { re.lastIndex = 0; m = re.exec(ta.value); }
    ta.focus();
    ta.setSelectionRange(m.index, m.index + m[0].length);
    findMsg.textContent = `মোট ${total}টি মিল পাওয়া গেছে।`;
    return true;
  }

  function replaceOne() {
    const q = findQ.value;
    if (!q) { findMsg.textContent = 'আগে খোঁজার লেখা দিন।'; return; }
    if (state.view === 'all') {
      findMsg.textContent = 'এই দৃশ্যে "সব বদলান" ব্যবহার করুন, অথবা কোনো পৃষ্ঠার ট্যাবে যান।';
      return;
    }
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (sel && sel.toLowerCase() === q.toLowerCase()) {
      ta.setRangeText(findR.value, ta.selectionStart, ta.selectionEnd, 'end');
      state.pages[state.view].text = ta.value;
      updateStats();
    }
    findNext();
  }

  function replaceAll() {
    const q = findQ.value;
    if (!q) { findMsg.textContent = 'আগে খোঁজার লেখা দিন।'; return; }
    const allScope = state.view === 'all' || (multi && findAll.checked);
    const targets = allScope ? state.pages : [state.pages[state.view]];
    let total = 0;
    targets.forEach((p) => {
      const r = replaceInText(p.text, q, findR.value);
      p.text = r.text;
      total += r.count;
    });
    refreshTextarea();
    findMsg.textContent = total ? `${total}টি বদলানো হয়েছে।` : 'পাওয়া যায়নি।';
  }

  /* ---------- Events ---------- */
  async function onClick(e) {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      const v = tabBtn.dataset.tab === 'all' ? 'all' : Number(tabBtn.dataset.tab);
      setView(v);
      return;
    }
    const btn = e.target.closest('[data-ed]');
    if (!btn) return;
    switch (btn.dataset.ed) {
      case 'select':
        ta.focus();
        ta.select();
        break;
      case 'copy':
        toast((await copyText(ta.value)) ? 'কপি হয়েছে ✔' : 'কপি করা যায়নি। Select All চেপে নিজে কপি করুন।');
        break;
      case 'clear': {
        const msg = state.view === 'all' ? 'সব পৃষ্ঠার লেখা মুছে ফেলবেন?' : 'এই পৃষ্ঠার লেখা মুছে ফেলবেন?';
        if (!window.confirm(msg)) break;
        if (state.view === 'all') state.pages.forEach((p) => { p.text = ''; });
        else state.pages[state.view].text = '';
        refreshTextarea();
        break;
      }
      case 'squeeze': {
        if (state.view === 'all') state.pages.forEach((p) => { p.text = removeBlankLines(p.text); });
        else state.pages[state.view].text = removeBlankLines(state.pages[state.view].text);
        refreshTextarea();
        toast('ফাঁকা লাইন বাদ দেওয়া হয়েছে ✔');
        break;
      }
      case 'download': {
        const suffix = state.view === 'all' || !multi ? '' : `-পৃষ্ঠা${state.view + 1}`;
        downloadTxt(`${baseName}${suffix}.txt`, ta.value);
        toast('ডাউনলোড শুরু হয়েছে ✔');
        break;
      }
      case 'download-docx': {
        const suffix = state.view === 'all' || !multi ? '' : `-পৃষ্ঠা${state.view + 1}`;
        textToDocx(ta.value).then((bytes) => {
          downloadBytes(`${baseName}${suffix}.docx`, bytes, MIME.docx);
          toast('Word ডাউনলোড শুরু হয়েছে ✔');
        }).catch((err) => toast(`Word তৈরি হয়নি: ${err.message || err}`));
        break;
      }
      case 'save-sheets': {
        const label = state.view === 'all' || !multi ? '' : ` (পৃষ্ঠা ${state.view + 1})`;
        btn.disabled = true;
        saveTextToSheets({ title: `${baseName}${label}`, mode: 'text', pages: state.view === 'all' ? state.pages.length : 1, text: ta.value })
          .then((r) => toast(r.message)).finally(() => { btn.disabled = false; });
        break;
      }
      case 'find-toggle':
        findBox.hidden = !findBox.hidden;
        if (!findBox.hidden) findQ.focus();
        break;
      case 'find-next': findNext(); break;
      case 'replace': replaceOne(); break;
      case 'replace-all': replaceAll(); break;
      default: break;
    }
  }

  function onInput() {
    if (state.view !== 'all') state.pages[state.view].text = ta.value;
    updateStats();
  }

  function onFindKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); findNext(); }
  }

  root.addEventListener('click', onClick);
  ta.addEventListener('input', onInput);
  findQ.addEventListener('keydown', onFindKey);

  setView(state.view);

  return {
    getPages: () => state.pages.map((p) => ({ ...p })),
    destroy() {
      clearTimeout(toastTimer);
      root.removeEventListener('click', onClick);
      root.innerHTML = '';
    }
  };
}
