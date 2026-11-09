// Upload Component: Drag & Drop, Browse, Preview, Remove, Replace
import { ACCEPT, MAX_FILE_SIZE, formatSize, validateFile } from '../utils/file-validation.js';
import { escapeHtml } from '../utils/helpers.js';
import { openPdf } from '../modules/pdf/pdf-loader.js';
import { renderPageToCanvas, renderThumbnail } from '../modules/pdf/pdf-renderer.js';

const ICON_UPLOAD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>`;

let idCounter = 0;

function disposeItem(item) {
  if (item.url) URL.revokeObjectURL(item.url);
  if (item.pdf) { try { item.pdf.destroy(); } catch (e) { /* ignore */ } }
  item.url = null;
  item.pdf = null;
  item.thumb = null;
}

/**
 * opts: { multiple: boolean, onChange: (items) => void }
 * ফেরত দেয়: { getItems, clear, destroy }
 */
export function createUploader(root, opts = {}) {
  const multiple = !!opts.multiple;
  let items = [];
  let notice = '';
  let previewToken = 0;
  let previewRender = null;
  let replaceId = null;

  root.innerHTML = `
    <div class="dropzone" tabindex="0" role="button" aria-label="ফাইল বাছুন অথবা এখানে ছাড়ুন">
      <div class="dz-icon">${ICON_UPLOAD}</div>
      <p class="dz-title">${multiple ? 'ছবি বা PDF এখানে টেনে ছাড়ুন' : 'PDF বা ছবি এখানে টেনে ছাড়ুন'}</p>
      <p class="dz-sub">অথবা</p>
      <button type="button" class="btn" data-action="browse">${multiple ? 'ফাইল বাছুন' : 'ফাইল বাছুন'}</button>
      <p class="dz-hint">JPG, JPEG, PNG, WEBP, PDF · প্রতি ফাইল সর্বোচ্চ ${formatSize(MAX_FILE_SIZE)} · ${multiple ? 'একাধিক ছবি একসঙ্গে দেওয়া যাবে' : 'একবারে একটি ফাইল'}</p>
    </div>
    <div class="alert" role="alert" hidden></div>
    <div class="list-head" hidden>
      <span class="list-count"></span>
      <button type="button" class="btn btn-ghost btn-sm" data-action="clear">সব মুছুন (Clear All)</button>
    </div>
    <div class="file-list"></div>
    <input type="file" class="file-input" accept="${ACCEPT}" ${multiple ? 'multiple' : ''} hidden />
    <input type="file" class="replace-input" accept="${ACCEPT}" hidden />
    <dialog class="preview-dialog">
      <div class="pv-bar">
        <strong class="pv-title"></strong>
        <button type="button" class="btn btn-ghost btn-sm" data-action="pv-close">বন্ধ করুন ✕</button>
      </div>
      <div class="pv-body"></div>
      <div class="pv-nav" hidden>
        <button type="button" class="btn btn-ghost btn-sm" data-action="pv-prev">← আগের</button>
        <span class="pv-page"></span>
        <button type="button" class="btn btn-ghost btn-sm" data-action="pv-next">পরের →</button>
      </div>
    </dialog>
  `;

  const dropzone = root.querySelector('.dropzone');
  const alertBox = root.querySelector('.alert');
  const listHead = root.querySelector('.list-head');
  const listCount = root.querySelector('.list-count');
  const listEl = root.querySelector('.file-list');
  const fileInput = root.querySelector('.file-input');
  const replaceInput = root.querySelector('.replace-input');
  const dialog = root.querySelector('.preview-dialog');
  const pvTitle = root.querySelector('.pv-title');
  const pvBody = root.querySelector('.pv-body');
  const pvNav = root.querySelector('.pv-nav');
  const pvPage = root.querySelector('.pv-page');

  const pv = { item: null, page: 1 };

  function emit() { if (opts.onChange) opts.onChange(items.filter((i) => i.status === 'ready')); }

  function showNotice(messages) {
    notice = messages.length ? messages.join('\n') : '';
    alertBox.hidden = !notice;
    alertBox.textContent = notice;
  }

  function metaText(item) {
    const parts = [item.kind === 'pdf' ? 'PDF' : 'ছবি', formatSize(item.file.size)];
    if (item.kind === 'pdf' && item.pages) parts.push(item.pages + ' পৃষ্ঠা');
    if (item.kind === 'image' && item.dims) parts.push(item.dims);
    return parts.join(' · ');
  }

  function renderList() {
    listHead.hidden = items.length === 0;
    listCount.textContent = items.length + 'টি ফাইল';
    listEl.innerHTML = items.map((item) => {
      let thumb;
      if (item.status === 'loading') thumb = '<span class="thumb-ph">লোড হচ্ছে…</span>';
      else if (item.status === 'error') thumb = '<span class="thumb-ph bad">✘</span>';
      else if (item.kind === 'image') thumb = `<img src="${item.url}" alt="" />`;
      else if (item.thumb) thumb = `<img src="${item.thumb}" alt="" />`;
      else thumb = '<span class="thumb-ph">PDF</span>';

      const status = item.status === 'error'
        ? `<div class="file-error">${escapeHtml(item.error)}</div>`
        : '';
      const previewBtn = item.status === 'ready'
        ? `<button type="button" class="btn btn-ghost btn-sm" data-action="preview" data-id="${item.id}">Preview</button>` : '';
      return `
        <article class="file-card ${item.status === 'error' ? 'is-error' : ''}">
          <div class="thumb">${thumb}</div>
          <div class="file-info">
            <div class="file-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</div>
            <div class="file-meta">${escapeHtml(metaText(item))}</div>
            ${status}
            <div class="file-actions">
              ${previewBtn}
              <button type="button" class="btn btn-ghost btn-sm" data-action="replace" data-id="${item.id}">Replace</button>
              <button type="button" class="btn btn-ghost btn-sm btn-danger" data-action="remove" data-id="${item.id}">Remove</button>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  async function prepareItem(item) {
    try {
      if (item.kind === 'image') {
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => { item.dims = img.naturalWidth + '×' + img.naturalHeight + ' px'; resolve(); };
          img.onerror = () => reject(new Error('ছবিটি পড়া যাচ্ছে না। ফাইল নষ্ট হতে পারে।'));
          img.src = item.url;
        });
      } else {
        item.pdf = await openPdf(item.file);
        item.pages = item.pdf.numPages;
        item.thumb = await renderThumbnail(item.pdf, 1, 240);
      }
      item.status = 'ready';
    } catch (e) {
      item.status = 'error';
      item.error = e.message || 'ফাইলটি পড়া যায়নি।';
      if (item.pdf) { try { item.pdf.destroy(); } catch (x) { /* ignore */ } item.pdf = null; }
    }
    // ফাইলটি ইতিমধ্যে মুছে ফেলা হলে আর কিছু করার নেই
    if (!items.includes(item)) { disposeItem(item); return; }
    renderList();
    emit();
  }

  function makeItem(file, kind) {
    return {
      id: 'f' + (++idCounter), file, kind, status: 'loading', error: '',
      url: kind === 'image' ? URL.createObjectURL(file) : null,
      pdf: null, pages: 0, thumb: null, dims: ''
    };
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const errors = [];
    const valid = [];
    for (const f of files) {
      const r = validateFile(f);
      if (r.ok) valid.push({ file: f, kind: r.kind });
      else errors.push(r.error);
    }
    if (!multiple && valid.length > 1) {
      errors.push('এই Workspace-এ একবারে একটি ফাইল দেওয়া যায়। প্রথম ফাইলটি নেওয়া হয়েছে।');
      valid.length = 1;
    }
    showNotice(errors);
    if (!valid.length) return;

    if (!multiple) { items.forEach(disposeItem); items = []; }
    const added = valid.map((v) => makeItem(v.file, v.kind));
    items.push(...added);
    renderList();
    emit();
    added.forEach(prepareItem);
  }

  function replaceFile(oldId, fileList) {
    const file = (fileList || [])[0];
    if (!file) return;
    const r = validateFile(file);
    if (!r.ok) { showNotice([r.error]); return; }
    showNotice([]);
    const idx = items.findIndex((i) => i.id === oldId);
    if (idx < 0) return;
    disposeItem(items[idx]);
    const fresh = makeItem(file, r.kind);
    items[idx] = fresh;
    renderList();
    emit();
    prepareItem(fresh);
  }

  function removeItem(id) {
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return;
    disposeItem(items[idx]);
    items.splice(idx, 1);
    showNotice([]);
    renderList();
    emit();
  }

  function clear() {
    items.forEach(disposeItem);
    items = [];
    showNotice([]);
    renderList();
    emit();
  }

  /* ---------- Preview ---------- */
  function cancelPreviewRender() {
    previewToken++;
    if (previewRender) { previewRender.cancel(); previewRender = null; }
  }

  async function drawPdfPage() {
    const item = pv.item;
    if (!item || !item.pdf) return;
    cancelPreviewRender();
    const token = previewToken;
    pvPage.textContent = `পৃষ্ঠা ${pv.page} / ${item.pages}`;
    const width = Math.min(Math.max(window.innerWidth - 64, 280), 900);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const job = renderPageToCanvas(item.pdf, pv.page, Math.floor(width * dpr));
    previewRender = job;
    try {
      const canvas = await job.promise;
      if (!canvas || token !== previewToken) return;
      canvas.className = 'pv-canvas';
      pvBody.replaceChildren(canvas);
    } catch (e) {
      if (token === previewToken) pvBody.innerHTML = '<p class="file-error">এই পৃষ্ঠাটি দেখানো যায়নি।</p>';
    }
  }

  function openPreview(id) {
    const item = items.find((i) => i.id === id);
    if (!item || item.status !== 'ready') return;
    pv.item = item;
    pv.page = 1;
    pvTitle.textContent = item.file.name;
    if (item.kind === 'image') {
      pvNav.hidden = true;
      pvBody.innerHTML = `<img class="pv-img" src="${item.url}" alt="" />`;
    } else {
      pvNav.hidden = item.pages < 2;
      pvBody.innerHTML = '<p class="muted">লোড হচ্ছে…</p>';
      drawPdfPage();
    }
    dialog.showModal();
  }

  function closePreview() {
    cancelPreviewRender();
    pv.item = null;
    pvBody.replaceChildren();
    if (dialog.open) dialog.close();
  }

  /* ---------- Events ---------- */
  function onRootClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.action) {
      case 'browse': e.stopPropagation(); fileInput.click(); break;
      case 'clear': clear(); break;
      case 'preview': openPreview(id); break;
      case 'remove': removeItem(id); break;
      case 'replace': replaceId = id; replaceInput.click(); break;
      case 'pv-close': closePreview(); break;
      case 'pv-prev': if (pv.item && pv.page > 1) { pv.page--; drawPdfPage(); } break;
      case 'pv-next': if (pv.item && pv.page < pv.item.pages) { pv.page++; drawPdfPage(); } break;
      default: break;
    }
  }

  const onDropzoneClick = (e) => { if (!e.target.closest('[data-action]')) fileInput.click(); };
  const onDropzoneKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  };
  const onDragOver = (e) => { e.preventDefault(); dropzone.classList.add('drag'); };
  const onDragLeave = () => dropzone.classList.remove('drag');
  const onDrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag');
    addFiles(e.dataTransfer && e.dataTransfer.files);
  };
  const onFileChange = () => { addFiles(fileInput.files); fileInput.value = ''; };
  const onReplaceChange = () => { replaceFile(replaceId, replaceInput.files); replaceInput.value = ''; replaceId = null; };
  const onDialogClick = (e) => { if (e.target === dialog) closePreview(); };
  const onDialogClose = () => { cancelPreviewRender(); pvBody.replaceChildren(); };

  // Browser-এ ফাইল পাতার বাইরে ছাড়লে যেন নতুন ট্যাবে না খোলে
  const blockWindowDrop = (e) => { if (!root.contains(e.target)) e.preventDefault(); };

  root.addEventListener('click', onRootClick);
  dropzone.addEventListener('click', onDropzoneClick);
  dropzone.addEventListener('keydown', onDropzoneKey);
  dropzone.addEventListener('dragover', onDragOver);
  dropzone.addEventListener('dragleave', onDragLeave);
  dropzone.addEventListener('drop', onDrop);
  fileInput.addEventListener('change', onFileChange);
  replaceInput.addEventListener('change', onReplaceChange);
  dialog.addEventListener('click', onDialogClick);
  dialog.addEventListener('close', onDialogClose);
  window.addEventListener('dragover', blockWindowDrop);
  window.addEventListener('drop', blockWindowDrop);

  renderList();

  return {
    getItems: () => items.filter((i) => i.status === 'ready'),
    clear,
    destroy() {
      cancelPreviewRender();
      if (dialog.open) dialog.close();
      items.forEach(disposeItem);
      items = [];
      window.removeEventListener('dragover', blockWindowDrop);
      window.removeEventListener('drop', blockWindowDrop);
      root.innerHTML = '';
    }
  };
}
