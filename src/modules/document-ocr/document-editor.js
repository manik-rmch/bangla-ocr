// Editable Document Editor (Phase 10): পুনর্গঠিত পৃষ্ঠাতেই সরাসরি সম্পাদনা।
//  লেখা: পাঠ বদল, ফন্ট, মাপ, Bold, Italic, সাজানো, রং
//  টেবিল: ঘর Edit, সারি/কলাম যোগ-মোছা, ঘর জোড়া/ভাঙা, Border, ঘরের রং, সারির উচ্চতা, কলামের প্রস্থ, ঘরের সাজানো
//  পৃষ্ঠা: A4/A3/Letter, Portrait/Landscape, Margin, Header, Footer, পৃষ্ঠা নম্বর
//  আর Undo / Redo (Ctrl+Z / Ctrl+Y)
import { renderPage, fitPage, FONT_FAMILIES } from '../reconstruction/document-builder.js';
import { MM } from '../reconstruction/layout-reconstruction.js';
import { buildPageModel, computeLayout } from '../reconstruction/layout-reconstruction.js';
import {
  normalizeGrid, insertLine, deleteLine, mergeCells, splitCell, expandSelection, cellAt,
  rowHeights, colWidths, setRowHeight, setColWidth
} from '../reconstruction/table-edit.js';
import { validateGrid } from './table-validate.js';
import { escapeHtml } from '../../utils/helpers.js';

const BN = '০১২৩৪৫৬৭৮৯';
const bn = (n) => String(n).replace(/\d/g, (d) => BN[d]);
const MAX_UNDO = 40;

const fontOptions = FONT_FAMILIES.map(([v, l], i) => `<option value="${i}">${escapeHtml(l)}</option>`).join('');

/**
 * opts: { onChange(): পরিবর্তনের পর অন্য অংশ (টেবিল-কার্ড) হালনাগাদ করতে }
 * ফেরত: { setPage(page), refresh(), destroy() }
 */
export function createDocumentEditor(root, { onChange }) {
  root.innerHTML = `
    <div class="de">
      <div class="de-bar" role="toolbar" aria-label="সম্পাদনার টুলবার">
        <div class="de-group" data-g="text">
          <span class="de-gl">লেখা</span>
          <select class="ed-input de-font" aria-label="ফন্ট">${fontOptions}</select>
          <span class="de-size"><button type="button" class="btn btn-ghost btn-sm" data-act="size-" aria-label="ছোট">−</button><input type="number" class="ed-input de-size-in" min="4" max="120" step="0.5" aria-label="ফন্ট সাইজ (pt)" /><button type="button" class="btn btn-ghost btn-sm" data-act="size+" aria-label="বড়">+</button></span>
          <button type="button" class="btn btn-ghost btn-sm de-b" data-act="bold" title="Bold"><b>B</b></button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="italic" title="Italic"><i>I</i></button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="align-left" title="বাঁ">⇤</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="align-center" title="মাঝ">↔</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="align-right" title="ডান">⇥</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="align-justify" title="Justify">☰</button>
          <label class="de-color" title="লেখার রং">রং <input type="color" class="de-color-in" value="#000000" /></label>
        </div>
        <div class="de-group" data-g="table">
          <span class="de-gl">টেবিল</span>
          <button type="button" class="btn btn-ghost btn-sm" data-act="row-above">↑ সারি</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="row-below">↓ সারি</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="col-left">← কলাম</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="col-right">→ কলাম</button>
          <button type="button" class="btn btn-ghost btn-sm btn-danger" data-act="row-del">সারি মুছুন</button>
          <button type="button" class="btn btn-ghost btn-sm btn-danger" data-act="col-del">কলাম মুছুন</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="merge">ঘর জোড়া</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="split">ঘর ভাঙা</button>
          <label class="de-color" title="ঘরের পেছনের রং">ঘরের রং <input type="color" class="de-bg-in" value="#ffffff" /></label>
          <button type="button" class="btn btn-ghost btn-sm" data-act="bg-clear">রং মুছুন</button>
          <select class="ed-input de-border" aria-label="Border">
            <option value="thin">Border: সরু</option><option value="thick">Border: মোটা</option><option value="none">Border: নেই</option>
          </select>
          <label class="de-num">সারির উচ্চতা (pt) <input type="number" class="ed-input de-rowh" min="4" step="0.5" /></label>
          <label class="de-num">কলামের প্রস্থ (%) <input type="number" class="ed-input de-colw" min="3" max="90" step="0.5" /></label>
        </div>
        <div class="de-group" data-g="hist">
          <button type="button" class="btn btn-ghost btn-sm" data-act="undo" title="Ctrl+Z">↶ Undo</button>
          <button type="button" class="btn btn-ghost btn-sm" data-act="redo" title="Ctrl+Y">↷ Redo</button>
        </div>
      </div>
      <p class="muted de-status" aria-live="polite"></p>
      <details class="de-pageset">
        <summary>পৃষ্ঠার সেটিং (কাগজ, Margin, Header, Footer)</summary>
        <div class="de-pgrid">
          <label>কাগজ <select class="ed-input pg-paper"><option value="">মূল অনুযায়ী</option><option>A4</option><option>A3</option><option>Letter</option></select></label>
          <label>দিক <select class="ed-input pg-orient"><option value="">মূল অনুযায়ী</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
          <label>উপর Margin (মিমি) <input type="number" class="ed-input pg-m" data-m="top" min="0" max="100" step="1" /></label>
          <label>নিচ Margin (মিমি) <input type="number" class="ed-input pg-m" data-m="bottom" min="0" max="100" step="1" /></label>
          <label>বাঁ Margin (মিমি) <input type="number" class="ed-input pg-m" data-m="left" min="0" max="100" step="1" /></label>
          <label>ডান Margin (মিমি) <input type="number" class="ed-input pg-m" data-m="right" min="0" max="100" step="1" /></label>
          <label class="pg-wide">Header (প্রতি পৃষ্ঠার উপরে) <input type="text" class="ed-input pg-header" /></label>
          <label class="pg-wide">Footer (প্রতি পৃষ্ঠার নিচে) <input type="text" class="ed-input pg-footer" /></label>
          <label class="pg-check"><input type="checkbox" class="pg-pageno" /> পৃষ্ঠা নম্বর দেখান</label>
          <button type="button" class="btn btn-ghost btn-sm" data-act="page-reset">পৃষ্ঠার সেটিং মূলে ফেরান</button>
        </div>
      </details>
      <div class="de-scroll"><div class="rc-page is-edit"></div></div>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const pageEl = $('.rc-page');
  const statusEl = $('.de-status');
  const fontSel = $('.de-font');
  const sizeIn = $('.de-size-in');
  const colorIn = $('.de-color-in');
  const bgIn = $('.de-bg-in');
  const borderSel = $('.de-border');
  const rowhIn = $('.de-rowh');
  const colwIn = $('.de-colw');

  let page = null;
  let lay = null;
  let sel = null; // { kind:'text', id } | { kind:'cell', ti, r0, c0, r1, c1 }
  let undo = [];
  let redo = [];
  let current = '';
  let typingTimer = null;
  let pending = false; // লেখা চলছে, এখনো Undo-তে জমা হয়নি

  /* ---------- অবস্থার Snapshot (Undo/Redo) ---------- */
  function snapshot() {
    const a = page.analysis;
    return JSON.stringify({
      blocks: a.blocks.map((b) => ({
        id: b.id, text: b.text, style: b.style || null,
        items: b.items ? b.items.map((i) => i.text) : null,
        people: b.people ? b.people.map((p) => ({ name: p.name, designation: p.designation, organization: p.organization })) : null
      })),
      grids: a.tables.map((t) => (t.grid ? JSON.parse(JSON.stringify(t.grid, (k, v) => (k === 'suggestions' || k === 'suggestion' ? undefined : v))) : null)),
      edit: page.edit || null
    });
  }
  function restore(json) {
    const d = JSON.parse(json);
    const a = page.analysis;
    d.blocks.forEach((s) => {
      const b = a.blocks.find((x) => x.id === s.id);
      if (!b) return;
      b.text = s.text; b.style = s.style || undefined;
      if (s.items && b.items) s.items.forEach((t, i) => { if (b.items[i]) b.items[i].text = t; });
      if (s.people && b.people) s.people.forEach((p, i) => { if (b.people[i]) Object.assign(b.people[i], p); });
    });
    d.grids.forEach((g, i) => {
      if (!g || !a.tables[i]) return;
      a.tables[i].grid = g;
      g.suggestions = validateGrid(g);
    });
    page.edit = d.edit || undefined;
  }
  function commit() {
    clearTimeout(typingTimer);
    pending = false;
    const next = snapshot();
    if (next === current) return;
    undo.push(current);
    if (undo.length > MAX_UNDO) undo.shift();
    redo = [];
    current = next;
    syncHistoryButtons();
  }
  function commitSoon() { pending = true; clearTimeout(typingTimer); typingTimer = setTimeout(commit, 600); }
  function doUndo() {
    if (pending) commit();
    if (!undo.length) return;
    redo.push(current);
    restore(undo.pop());
    current = snapshot();
    syncHistoryButtons();
    render(); changed();
  }
  function doRedo() {
    if (!redo.length) return;
    undo.push(current);
    restore(redo.pop());
    current = snapshot();
    syncHistoryButtons();
    render(); changed();
  }
  function syncHistoryButtons() {
    root.querySelector('[data-act="undo"]').disabled = !undo.length;
    root.querySelector('[data-act="redo"]').disabled = !redo.length;
  }
  function changed() { if (onChange) onChange(); }

  /* ---------- আঁকা ---------- */
  function blockOf(id) { return page.analysis.blocks.find((b) => b.id === id); }
  function gridOf(ti) { return page.analysis.tables[ti] && page.analysis.tables[ti].grid; }

  function render() {
    const r = renderPage(page, { edit: true });
    lay = r.layout;
    pageEl.style.aspectRatio = `${lay.Wpt} / ${lay.Hpt}`;
    pageEl.innerHTML = r.html;
    fitPage(pageEl);
    paintSelection();
    syncControls();
    const p = lay.paper;
    statusEl.textContent = `${p.name} · ${p.orientation === 'landscape' ? 'Landscape' : 'Portrait'}` +
      (lay.overflow ? ' · ⚠ বিষয়বস্তু পৃষ্ঠার চেয়ে লম্বা হয়েছে, নিচে বেড়ে গেছে (Margin কমান বা Landscape/বড় কাগজ বেছে নিন)' : '') +
      ' · যেকোনো লেখা বা টেবিলের ঘরে ক্লিক করে সরাসরি ঠিক করুন।';
  }

  function paintSelection() {
    pageEl.querySelectorAll('.is-sel, .is-csel').forEach((el) => el.classList.remove('is-sel', 'is-csel'));
    if (!sel) return;
    if (sel.kind === 'text') {
      pageEl.querySelectorAll(`[data-id="${sel.id}"][data-kind]`).forEach((el) => el.classList.add('is-sel'));
    } else {
      const g = gridOf(sel.ti);
      if (!g) return;
      pageEl.querySelectorAll(`[data-t="${sel.ti}"][data-r]`).forEach((el) => {
        const c = cellAt(g, Number(el.dataset.r), Number(el.dataset.c));
        if (c && c.r <= sel.r1 && c.r + c.rowSpan - 1 >= sel.r0 && c.c <= sel.c1 && c.c + c.colSpan - 1 >= sel.c0) el.classList.add('is-csel');
      });
    }
  }

  function syncControls() {
    const g = root.querySelectorAll('.de-group');
    const isText = sel && sel.kind === 'text';
    const isCell = sel && sel.kind === 'cell';
    root.querySelectorAll('[data-g="text"] button, [data-g="text"] select, [data-g="text"] input').forEach((el) => { el.disabled = !(isText || isCell); });
    root.querySelectorAll('[data-g="table"] button, [data-g="table"] select, [data-g="table"] input').forEach((el) => { el.disabled = !isCell; });
    // টেবিলের ঘরে B/I/রং প্রযোজ্য নয়
    if (isCell) root.querySelectorAll('[data-act="bold"], [data-act="italic"], .de-color-in').forEach((el) => { el.disabled = true; });
    void g;
    if (isText) {
      const b = blockOf(sel.id);
      const m = buildPageModel(page);
      const el = m.elements.find((x) => x.id === sel.id);
      const st = (b && b.style) || {};
      const defPt = el ? el.fontSize * lay.S * 0.95 : 12;
      sizeIn.value = String(Math.round((st.fontSize || defPt) * 2) / 2);
      const fi = FONT_FAMILIES.findIndex(([v]) => v === (st.fontFamily || ''));
      fontSel.value = String(fi < 0 ? 0 : fi);
      colorIn.value = st.color || '#000000';
      root.querySelector('[data-act="bold"]').classList.toggle('is-on', st.bold === undefined ? !!(el && el.bold) : !!st.bold);
      root.querySelector('[data-act="italic"]').classList.toggle('is-on', !!st.italic);
    } else if (isCell) {
      const g2 = gridOf(sel.ti);
      if (g2) {
        const defPt = (page.analysis.bodySize || 10) * lay.S * 0.95;
        sizeIn.value = String(Math.round(((g2.style && g2.style.fontPt) || defPt) * 2) / 2);
        const fi = FONT_FAMILIES.findIndex(([v]) => v === ((g2.style && g2.style.fontFamily) || ''));
        fontSel.value = String(fi < 0 ? 0 : fi);
        const tbl = page.analysis.tables[sel.ti];
        borderSel.value = (g2.style && g2.style.border) || (tbl.ruled ? 'thin' : 'none');
        const rh = rowHeights(g2); const cw = colWidths(g2);
        rowhIn.value = String(Math.round(rh[sel.r0] * lay.S * 10) / 10);
        const tot = cw.reduce((a, b2) => a + b2, 0);
        colwIn.value = String(Math.round((cw[sel.c0] / tot) * 1000) / 10);
        const c0 = cellAt(g2, sel.r0, sel.c0);
        if (c0 && c0.bg && /^rgb/.test(c0.bg) === false) bgIn.value = c0.bg;
      }
    }
    // পৃষ্ঠার সেটিং ফর্ম
    const e = page.edit || {};
    $('.pg-paper').value = e.paper || '';
    $('.pg-orient').value = e.orientation || '';
    root.querySelectorAll('.pg-m').forEach((i) => {
      const k = i.dataset.m;
      i.value = e.margins && Number.isFinite(e.margins[k]) ? String(Math.round(e.margins[k] / MM)) : '';
      i.placeholder = String(Math.round(lay.margins[k] / MM));
    });
    $('.pg-header').value = e.header || '';
    $('.pg-footer').value = e.footer || '';
    $('.pg-pageno').checked = !!e.pageNo;
  }

  /* ---------- নির্বাচন ---------- */
  function onPointer(e) {
    const cellEl = e.target.closest('[data-t][data-r]');
    if (cellEl) {
      const ti = Number(cellEl.dataset.t); const r = Number(cellEl.dataset.r); const c = Number(cellEl.dataset.c);
      const g = gridOf(ti);
      const cell = cellAt(g, r, c);
      if (e.shiftKey && sel && sel.kind === 'cell' && sel.ti === ti) {
        const ex = expandSelection(g, { r0: Math.min(sel.r0, cell.r), c0: Math.min(sel.c0, cell.c), r1: Math.max(sel.r1, cell.r + cell.rowSpan - 1), c1: Math.max(sel.c1, cell.c + cell.colSpan - 1) });
        sel = { kind: 'cell', ti, ...ex };
        e.preventDefault();
      } else {
        sel = { kind: 'cell', ti, r0: cell.r, c0: cell.c, r1: cell.r + cell.rowSpan - 1, c1: cell.c + cell.colSpan - 1 };
      }
      paintSelection(); syncControls();
      return;
    }
    const tEl = e.target.closest('[data-id][data-kind]') || e.target.closest('[data-id]');
    if (tEl && tEl.closest('.rc-page')) {
      const id = Number(tEl.dataset.id);
      if (blockOf(id) && blockOf(id).type !== 'table') { sel = { kind: 'text', id }; paintSelection(); syncControls(); return; }
    }
    if (e.target.closest('.rc-page') && !e.target.closest('[contenteditable]')) { sel = null; paintSelection(); syncControls(); }
  }

  /* ---------- লেখা বদল ---------- */
  function onInput(e) {
    const el = e.target;
    const val = () => el.innerText.replace(/ /g, ' ').replace(/\n$/, '');
    const cellEl = el.closest('[data-t][data-r]');
    if (cellEl) {
      const cell = cellAt(gridOf(Number(cellEl.dataset.t)), Number(cellEl.dataset.r), Number(cellEl.dataset.c));
      if (cell) { cell.text = val(); cell.source = 'edited'; cell.flags = []; cell.suggestion = null; }
    } else if (el.dataset.f !== undefined) {
      const b = blockOf(Number(el.dataset.id));
      b.people[Number(el.dataset.p)][el.dataset.f] = val();
    } else if (el.dataset.item !== undefined) {
      const b = blockOf(Number(el.dataset.id));
      b.items[Number(el.dataset.item)].text = val();
      b.text = b.items.map((i) => i.text).join('\n');
    } else if (el.dataset.kind === 'text') {
      blockOf(Number(el.dataset.id)).text = val();
    } else return;
    commitSoon();
  }
  function onFocusOut() { commit(); fitPage(pageEl); changed(); }

  /* ---------- সাজসজ্জা ও টেবিল-কাজ ---------- */
  function setStyle(patch) {
    if (!sel) return;
    if (sel.kind === 'text') {
      const b = blockOf(sel.id);
      b.style = { ...(b.style || {}), ...patch };
    } else {
      const g = gridOf(sel.ti);
      g.style = g.style || {};
      if (patch.fontSize) g.style.fontPt = patch.fontSize;
      if (patch.fontFamily !== undefined) g.style.fontFamily = patch.fontFamily || undefined;
      if (patch.align) forSelectedCells((c) => { c.align = patch.align; });
    }
  }
  function forSelectedCells(fn) {
    const g = gridOf(sel.ti);
    g.cells.forEach((c) => {
      if (c.r <= sel.r1 && c.r + c.rowSpan - 1 >= sel.r0 && c.c <= sel.c1 && c.c + c.colSpan - 1 >= sel.c0) fn(c);
    });
  }
  function done() { commit(); render(); changed(); }

  function currentSize() {
    return Number(sizeIn.value) || 12;
  }

  function act(name) {
    const isText = sel && sel.kind === 'text';
    const isCell = sel && sel.kind === 'cell';
    const g = isCell ? gridOf(sel.ti) : null;
    switch (name) {
      case 'undo': doUndo(); return;
      case 'redo': doRedo(); return;
      case 'size+': if (sel) { sizeIn.value = String(currentSize() + 1); setStyle({ fontSize: currentSize() }); done(); } return;
      case 'size-': if (sel) { sizeIn.value = String(Math.max(4, currentSize() - 1)); setStyle({ fontSize: currentSize() }); done(); } return;
      case 'bold': if (isText) { const b = blockOf(sel.id); const cur = (b.style && b.style.bold !== undefined) ? b.style.bold : (['title', 'subtitle', 'heading'].includes(b.type)); setStyle({ bold: !cur }); done(); } return;
      case 'italic': if (isText) { const b = blockOf(sel.id); setStyle({ italic: !(b.style && b.style.italic) }); done(); } return;
      case 'align-left': case 'align-center': case 'align-right': case 'align-justify':
        if (sel) { setStyle({ align: name.slice(6) }); done(); } return;
      case 'page-reset': page.edit = undefined; done(); return;
      default: break;
    }
    if (!isCell) return;
    const s = expandSelection(g, { r0: sel.r0, c0: sel.c0, r1: sel.r1, c1: sel.c1 });
    switch (name) {
      case 'row-above': insertLine(g, 'row', s.r0); sel = { ...sel, r0: s.r0, r1: s.r0, c0: s.c0, c1: s.c0 }; break;
      case 'row-below': insertLine(g, 'row', s.r1 + 1); sel = { ...sel, r0: s.r1 + 1, r1: s.r1 + 1, c0: s.c0, c1: s.c0 }; break;
      case 'col-left': insertLine(g, 'col', s.c0); sel = { ...sel, c0: s.c0, c1: s.c0, r0: s.r0, r1: s.r0 }; break;
      case 'col-right': insertLine(g, 'col', s.c1 + 1); sel = { ...sel, c0: s.c1 + 1, c1: s.c1 + 1, r0: s.r0, r1: s.r0 }; break;
      case 'row-del': {
        if (g.nRows - (s.r1 - s.r0 + 1) < 1) { statusEl.textContent = 'টেবিলের সব সারি মোছা যায় না।'; return; }
        for (let r = s.r1; r >= s.r0; r--) deleteLine(g, 'row', r);
        const nr = Math.min(s.r0, g.nRows - 1); sel = { ...sel, r0: nr, r1: nr, c0: 0, c1: 0 }; break;
      }
      case 'col-del': {
        if (g.nCols - (s.c1 - s.c0 + 1) < 1) { statusEl.textContent = 'টেবিলের সব কলাম মোছা যায় না।'; return; }
        for (let c = s.c1; c >= s.c0; c--) deleteLine(g, 'col', c);
        const nc = Math.min(s.c0, g.nCols - 1); sel = { ...sel, c0: nc, c1: nc, r0: 0, r1: 0 }; break;
      }
      case 'merge': {
        const m = mergeCells(g, s);
        if (!m) { statusEl.textContent = 'জোড়া লাগাতে একাধিক ঘর বাছুন (Shift চেপে আরেকটি ঘরে ক্লিক করুন)।'; return; }
        sel = { kind: 'cell', ti: sel.ti, r0: m.r, c0: m.c, r1: m.r + m.rowSpan - 1, c1: m.c + m.colSpan - 1 }; break;
      }
      case 'split': {
        const c = cellAt(g, sel.r0, sel.c0);
        if (!c || !splitCell(g, c)) { statusEl.textContent = 'এটি জোড়া ঘর নয়।'; return; }
        sel = { kind: 'cell', ti: sel.ti, r0: c.r, c0: c.c, r1: c.r, c1: c.c }; break;
      }
      case 'bg-clear': forSelectedCells((c) => { c.bg = null; c.bgUser = false; }); break;
      default: return;
    }
    done();
  }

  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (btn && !btn.disabled) act(btn.dataset.act);
  }

  function onChangeCtl(e) {
    const t = e.target;
    if (t === fontSel) { if (sel) { setStyle({ fontFamily: FONT_FAMILIES[Number(fontSel.value)][0] }); done(); } return; }
    if (t === sizeIn) { const v = Number(sizeIn.value); if (sel && v >= 4) { setStyle({ fontSize: v }); done(); } return; }
    if (t === colorIn) { if (sel && sel.kind === 'text') { setStyle({ color: colorIn.value }); done(); } return; }
    if (t === bgIn) { if (sel && sel.kind === 'cell') { forSelectedCells((c) => { c.bg = bgIn.value; c.bgUser = true; }); done(); } return; }
    if (t === borderSel) { if (sel && sel.kind === 'cell') { const g = gridOf(sel.ti); g.style = g.style || {}; g.style.border = borderSel.value; done(); } return; }
    if (t === rowhIn) { if (sel && sel.kind === 'cell') { const v = Number(rowhIn.value); if (v > 0) { setRowHeight(gridOf(sel.ti), sel.r0, v / lay.S); done(); } } return; }
    if (t === colwIn) {
      if (sel && sel.kind === 'cell') {
        const g = gridOf(sel.ti); const tot = colWidths(g).reduce((a, b) => a + b, 0);
        const v = Number(colwIn.value);
        if (v > 0) { setColWidth(g, sel.c0, (v / 100) * tot); done(); }
      }
      return;
    }
    // পৃষ্ঠার সেটিং
    const pe = (page.edit = page.edit || {});
    if (t.classList.contains('pg-paper')) { if (t.value) pe.paper = t.value; else delete pe.paper; done(); return; }
    if (t.classList.contains('pg-orient')) { if (t.value) pe.orientation = t.value; else delete pe.orientation; done(); return; }
    if (t.classList.contains('pg-m')) {
      pe.margins = pe.margins || {};
      const v = t.value.trim();
      if (v === '' || Number(v) < 0) delete pe.margins[t.dataset.m]; else pe.margins[t.dataset.m] = Number(v) * MM;
      done(); return;
    }
    if (t.classList.contains('pg-header')) { pe.header = t.value; done(); return; }
    if (t.classList.contains('pg-footer')) { pe.footer = t.value; done(); return; }
    if (t.classList.contains('pg-pageno')) { pe.pageNo = t.checked; done(); }
  }

  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); doRedo(); }
  }

  root.addEventListener('mousedown', onPointer);
  root.addEventListener('input', onInput);
  root.addEventListener('focusout', (e) => { if (e.target.closest && e.target.closest('.rc-page')) onFocusOut(); });
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChangeCtl);
  root.addEventListener('keydown', onKey);

  return {
    setPage(p) {
      clearTimeout(typingTimer);
      page = p;
      sel = null; undo = []; redo = [];
      if (!p || !p.analysis) { pageEl.innerHTML = ''; return; }
      // সম্পাদনার জন্য প্রতিটি টেবিলের সারি-কলামের সীমারেখা নিশ্চিত করা
      p.analysis.tables.forEach((t) => { if (t.grid) normalizeGrid(t.grid, t.bbox); });
      current = snapshot();
      syncHistoryButtons();
      render();
    },
    refresh() { if (page && page.analysis) { render(); } },
    destroy() {
      clearTimeout(typingTimer);
      root.innerHTML = '';
    }
  };
}

export { computeLayout };
