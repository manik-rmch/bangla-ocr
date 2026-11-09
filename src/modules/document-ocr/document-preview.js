// Document বিশ্লেষণের ফল দেখানো: পৃষ্ঠার ছবির উপর রঙিন বাক্স + পাশে ব্লকের তালিকা + JSON ডাউনলোড।
import { escapeHtml } from '../../utils/helpers.js';
import { BLOCK_LABELS } from './document-analysis.js';

const BN = '০১২৩৪৫৬৭৮৯';
const bn = (n) => String(n).replace(/\d/g, (d) => BN[d]);

const SOURCE_LABEL = {
  'pdf-text': 'PDF-এর নিজস্ব লেখা',
  'pdf-text-broken': 'PDF-এর লেখা ভাঙা (শুধু Layout)',
  ocr: 'OCR'
};

function describeBlock(b) {
  switch (b.type) {
    case 'table':
      return `${bn(b.rows)} সারি × ${bn(b.cols)} কলাম · ${b.ruled ? 'রেখাসহ (Border)' : 'রেখা ছাড়া'}`;
    case 'list':
      return `${b.listType === 'numbered' ? 'Numbered' : 'Bullet'} তালিকা · ${bn(b.count)}টি আইটেম`;
    case 'signature':
      return `${bn(b.people.length)}টি স্বাক্ষর স্থান`;
    case 'paragraph':
    case 'header':
    case 'footer':
      return `${bn(b.lines)} লাইন`;
    default:
      return '';
  }
}

function snippet(b) {
  const t = (b.text || '').replace(/\s+/g, ' ').trim();
  return t.length > 90 ? t.slice(0, 90) + '…' : t;
}

/**
 * opts: { pages: [{ pageNum, label, size, source, textReliable, previewUrl, analysis, error }], baseName }
 * ফেরত দেয়: { destroy }
 */
export function createDocumentResult(root, { pages, baseName }) {
  let cur = 0;
  let selected = null;

  root.innerHTML = `
    <div class="card doc-result">
      <div class="dr-head">
        <h2>Document বিশ্লেষণের ফল</h2>
        <button type="button" class="btn btn-ghost btn-sm" data-action="json">বিশ্লেষণ JSON ডাউনলোড</button>
      </div>
      <div class="dr-summary"></div>
      <div class="dr-nav">
        <button type="button" class="btn btn-ghost btn-sm" data-action="prev">← আগের</button>
        <label class="dr-pick">পৃষ্ঠা
          <select class="ed-input dr-select" aria-label="পৃষ্ঠা বাছুন"></select>
        </label>
        <button type="button" class="btn btn-ghost btn-sm" data-action="next">পরের →</button>
      </div>
      <p class="notice dr-note" hidden></p>
      <div class="alert dr-error" role="alert" hidden></div>
      <div class="dr-body">
        <div class="dr-page">
          <div class="dr-stage"><img class="dr-img" alt="পৃষ্ঠার Preview" /><div class="dr-boxes"></div></div>
          <div class="dr-legend"></div>
        </div>
        <ol class="dr-blocks"></ol>
      </div>
    </div>`;

  const summaryEl = root.querySelector('.dr-summary');
  const selectEl = root.querySelector('.dr-select');
  const noteEl = root.querySelector('.dr-note');
  const errEl = root.querySelector('.dr-error');
  const imgEl = root.querySelector('.dr-img');
  const boxesEl = root.querySelector('.dr-boxes');
  const legendEl = root.querySelector('.dr-legend');
  const listEl = root.querySelector('.dr-blocks');
  const stageEl = root.querySelector('.dr-stage');
  const prevBtn = root.querySelector('[data-action="prev"]');
  const nextBtn = root.querySelector('[data-action="next"]');

  selectEl.innerHTML = pages.map((p, i) => `<option value="${i}">${bn(p.pageNum)}${pages.length > 1 ? ' / ' + escapeHtml(p.label) : ''}</option>`).join('');

  function renderSummary() {
    const ok = pages.filter((p) => p.analysis);
    const sum = (key) => ok.reduce((n, p) => n + (p.analysis.counts[key] || 0), 0);
    const chips = [
      `${bn(ok.length)}টি পৃষ্ঠা বিশ্লেষিত`,
      `${bn(sum('table'))}টি টেবিল`,
      `${bn(sum('list'))}টি তালিকা`,
      `${bn(sum('heading') + sum('title') + sum('subtitle'))}টি শিরোনাম/Heading`,
      `${bn(sum('paragraph'))}টি অনুচ্ছেদ`,
      `${bn(sum('signaturePeople'))}টি স্বাক্ষর স্থান`
    ];
    summaryEl.innerHTML = chips.map((c) => `<span class="badge">${c}</span>`).join('');
  }

  function showPage(i) {
    cur = Math.max(0, Math.min(pages.length - 1, i));
    selected = null;
    selectEl.value = String(cur);
    prevBtn.disabled = cur === 0;
    nextBtn.disabled = cur === pages.length - 1;
    const p = pages[cur];

    errEl.hidden = !p.error;
    errEl.textContent = p.error || '';

    if (!p.analysis) {
      stageEl.hidden = true;
      legendEl.innerHTML = '';
      listEl.innerHTML = '';
      noteEl.hidden = true;
      return;
    }
    stageEl.hidden = false;

    const a = p.analysis;
    const orient = p.size.orientation === 'landscape' ? 'Landscape' : 'Portrait';
    const sizeText = p.size.name === 'ছবি' ? `ছবি ${bn(Math.round(p.size.width))}×${bn(Math.round(p.size.height))} px` : `${p.size.name} · ${orient}`;
    noteEl.hidden = false;
    noteEl.innerHTML = `${escapeHtml(sizeText)} · লেখার উৎস: <b>${escapeHtml(SOURCE_LABEL[p.source] || p.source)}</b>` +
      (p.textReliable ? '' : '<br>এই পৃষ্ঠার PDF-লেখা ভাঙা, তাই এখন শুধু Layout (টেবিল, তালিকা, স্বাক্ষর ইত্যাদির অবস্থান) শনাক্ত হয়েছে। প্রতিটি অংশের লেখা পরের ধাপে OCR করে বসানো হবে।');

    imgEl.src = p.previewUrl;
    const W = p.size.width;
    const H = p.size.height;
    stageEl.style.aspectRatio = `${W} / ${H}`;

    boxesEl.innerHTML = a.blocks.map((b) => {
      const bb = b.bbox;
      const pad = 1.5;
      const l = Math.max(0, bb.x0 - pad); const t = Math.max(0, bb.y0 - pad);
      const w = Math.min(W, bb.x1 + pad) - l; const h = Math.min(H, bb.y1 + pad) - t;
      return `<button type="button" class="dr-box dr-t-${b.type}" data-id="${b.id}" style="left:${(l / W) * 100}%;top:${(t / H) * 100}%;width:${(w / W) * 100}%;height:${(h / H) * 100}%" title="${BLOCK_LABELS[b.type]}" aria-label="${BLOCK_LABELS[b.type]} ${bn(b.id)}"></button>`;
    }).join('');

    const used = Array.from(new Set(a.blocks.map((b) => b.type)));
    legendEl.innerHTML = used.map((t) => `<span class="dr-key"><i class="dr-sw dr-t-${t}"></i>${BLOCK_LABELS[t]}</span>`).join('');

    listEl.innerHTML = a.blocks.length
      ? a.blocks.map((b) => {
        const desc = describeBlock(b);
        const txt = snippet(b);
        let extra = '';
        if (b.type === 'signature') {
          extra = '<ul class="dr-people">' + b.people.map((pe) => {
            const parts = [pe.name && `নাম: ${pe.name}`, pe.designation && `পদবি: ${pe.designation}`, pe.organization && `প্রতিষ্ঠান: ${pe.organization}`].filter(Boolean);
            const lines = p.textReliable ? parts.map(escapeHtml).join(' · ') : `${bn(pe.lines)} লাইনের স্বাক্ষর স্তম্ভ`;
            return `<li>${lines}${pe.signatureInk ? ' · <b>স্বাক্ষরের ছবি/কালি পাওয়া গেছে</b>' : ' · স্বাক্ষরের ছবি নেই'}</li>`;
          }).join('') + '</ul>';
        }
        return `<li class="dr-item" data-id="${b.id}" tabindex="0">
          <span class="dr-chip dr-t-${b.type}">${BLOCK_LABELS[b.type]}</span>
          <span class="dr-desc">${escapeHtml(desc)}</span>
          ${txt ? `<span class="dr-text">${escapeHtml(txt)}</span>` : ''}${extra}
        </li>`;
      }).join('')
      : '<li class="dr-empty">এই পৃষ্ঠায় কিছু শনাক্ত করা যায়নি।</li>';
  }

  function select(id) {
    selected = selected === id ? null : id;
    root.querySelectorAll('.dr-box, .dr-item').forEach((el) => {
      el.classList.toggle('is-selected', selected !== null && Number(el.dataset.id) === selected);
    });
    if (selected !== null) {
      const item = listEl.querySelector(`.dr-item[data-id="${selected}"]`);
      if (item && item.scrollIntoView) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function downloadJson() {
    const data = {
      app: 'বাংলা OCR Studio',
      phase: 7,
      file: baseName,
      pages: pages.map((p) => ({
        pageNum: p.pageNum, size: p.size, source: p.source, textReliable: p.textReliable,
        error: p.error || null, analysis: p.analysis || null
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}-analysis.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (btn) {
      if (btn.dataset.action === 'prev') showPage(cur - 1);
      if (btn.dataset.action === 'next') showPage(cur + 1);
      if (btn.dataset.action === 'json') downloadJson();
      return;
    }
    const el = e.target.closest('.dr-box, .dr-item');
    if (el) select(Number(el.dataset.id));
  }
  function onKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('.dr-item');
    if (el) { e.preventDefault(); select(Number(el.dataset.id)); }
  }
  function onSelect() { showPage(Number(selectEl.value)); }

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  selectEl.addEventListener('change', onSelect);

  renderSummary();
  showPage(0);

  return {
    destroy() {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKey);
      selectEl.removeEventListener('change', onSelect);
      root.innerHTML = '';
    }
  };
}
