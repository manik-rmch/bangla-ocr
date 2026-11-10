// টেবিলের ফল দেখানো ও ঠিক করা: প্রতিটি ঘর সরাসরি Edit করা যায়; সন্দেহজনক ঘর রঙ করা;
// সংশোধনের প্রস্তাব "প্রয়োগ" বাটনে (নিজে থেকে কিছু বদলায় না)।
import { escapeHtml } from '../../utils/helpers.js';

const BN = '০১২৩৪৫৬৭৮৯';
const bn = (n) => String(n).replace(/\d/g, (d) => BN[d]);

const FLAG_TEXT = {
  low: 'OCR-এর আত্মবিশ্বাস কম',
  pattern: 'কলামের অন্য ঘরগুলোর সঙ্গে ধরন মেলেনি',
  suggest: 'সংশোধনের প্রস্তাব আছে',
  empty: 'ফাঁকা, অথচ কলামের বাকি ঘরে লেখা আছে'
};

function cellClass(cell) {
  const f = cell.flags || [];
  const cls = ['dt-cell'];
  if (f.includes('suggest')) cls.push('is-suggest');
  else if (f.includes('pattern')) cls.push('is-pattern');
  else if (f.includes('low')) cls.push('is-low');
  if (f.includes('empty')) cls.push('is-empty');
  return cls.join(' ');
}

function cellTitle(cell) {
  const f = (cell.flags || []).map((x) => FLAG_TEXT[x]).filter(Boolean);
  if (cell.suggestion) f.push(`প্রস্তাব: ${cell.suggestion}`);
  if (typeof cell.conf === 'number' && cell.source === 'ocr') f.push(`আত্মবিশ্বাস ${bn(cell.conf)}%`);
  return f.join(' · ');
}

function gridToTsv(grid) {
  const rows = Array.from({ length: grid.nRows }, () => Array(grid.nCols).fill(''));
  for (const c of grid.cells) rows[c.r][c.c] = (c.text || '').replace(/[\t\n]+/g, ' ');
  return rows.map((r) => r.join('\t')).join('\n');
}

/**
 * root-এ page.analysis.tables-এর সব টেবিল আঁকে। ফেরত দেয় cleanup ফাংশন।
 */
export function renderTables(root, page) {
  const tables = page.analysis ? page.analysis.tables.filter((t) => t.grid) : [];
  if (!tables.length) { root.innerHTML = ''; return () => {}; }

  root.innerHTML = tables.map((t, ti) => {
    const g = t.grid;
    const flagged = g.cells.filter((c) => (c.flags || []).length).length;
    const rows = [];
    for (let r = 0; r < g.nRows; r++) {
      const tag = r < g.headerRows ? 'th' : 'td';
      const tds = g.cells.filter((c) => c.r === r).sort((a, b) => a.c - b.c).map((c) => `<${tag} class="${cellClass(c)}" contenteditable="true" spellcheck="false" data-t="${ti}" data-r="${c.r}" data-c="${c.c}" rowspan="${c.rowSpan}" colspan="${c.colSpan}" title="${escapeHtml(cellTitle(c))}">${escapeHtml(c.text || '')}</${tag}>`);
      rows.push(`<tr>${tds.join('')}</tr>`);
    }
    const liveSug = (g.suggestions || []).filter((s) => g.cells.includes(s.cell) && !s.done);
    g.suggestions = liveSug;
    const sug = liveSug.length
      ? `<div class="dt-sug"><div class="dt-sug-head"><strong>সংশোধনের প্রস্তাব (${bn(liveSug.length)}টি)</strong>
          <button type="button" class="btn btn-ghost btn-sm" data-act="apply-all" data-t="${ti}">সব প্রয়োগ করুন</button></div>
          <ul>${liveSug.map((s, si) => `<li data-t="${ti}" data-s="${si}">সারি ${bn(s.cell.r + 1)}, কলাম ${bn(s.cell.c + 1)}: <del>${escapeHtml(s.from)}</del> → <ins>${escapeHtml(s.to)}</ins>
            <small>${escapeHtml(s.reason)}</small>
            <button type="button" class="btn btn-ghost btn-sm" data-act="apply" data-t="${ti}" data-s="${si}">প্রয়োগ</button></li>`).join('')}</ul></div>`
      : '';
    return `<div class="card dt-card" data-t="${ti}">
      <div class="dr-head"><h2>টেবিল ${bn(ti + 1)} <small class="muted">· ${bn(g.nRows)} সারি × ${bn(g.nCols)} কলাম${g.cells.some((c) => c.rowSpan > 1 || c.colSpan > 1) ? ' · জোড়া ঘরসহ' : ''}${flagged ? ` · ${bn(flagged)}টি ঘর যাচাই দরকার` : ''}</small></h2>
        <button type="button" class="btn btn-ghost btn-sm" data-act="copy" data-t="${ti}">কপি (Excel-এ Paste করার মতো)</button></div>
      <p class="muted dt-legend"><span class="dt-k is-low"></span>আত্মবিশ্বাস কম <span class="dt-k is-pattern"></span>ধরন মেলেনি <span class="dt-k is-suggest"></span>প্রস্তাব আছে — যেকোনো ঘরে ক্লিক করে সরাসরি ঠিক করুন।</p>
      <div class="dt-scroll"><table class="dt-table"><tbody>${rows.join('')}</tbody></table></div>
      ${sug}
    </div>`;
  }).join('');

  const findCell = (ti, r, c) => tables[ti].grid.cells.find((x) => x.r === r && x.c === c);

  function setCellText(ti, r, c, text) {
    const cell = findCell(ti, r, c);
    cell.text = text;
    cell.flags = [];
    cell.suggestion = null;
    cell.source = cell.source === 'empty' ? 'edited' : cell.source;
    const el = root.querySelector(`[data-t="${ti}"][data-r="${r}"][data-c="${c}"]`);
    if (el) { el.textContent = text; el.className = cellClass(cell); el.title = ''; }
  }

  function applySuggestion(ti, si) {
    const s = tables[ti].grid.suggestions[si];
    if (!s || s.done) return;
    s.done = true;
    if (!tables[ti].grid.cells.includes(s.cell)) return; // ঘরটি মুছে গেছে
    setCellText(ti, s.cell.r, s.cell.c, s.to);
    const li = root.querySelector(`li[data-t="${ti}"][data-s="${si}"]`);
    if (li) li.remove();
  }

  function onInput(e) {
    const el = e.target.closest('.dt-cell');
    if (!el) return;
    const cell = findCell(Number(el.dataset.t), Number(el.dataset.r), Number(el.dataset.c));
    cell.text = el.innerText.replace(/ /g, ' ').replace(/\n+$/g, '');
    cell.edited = true;
  }

  async function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const ti = Number(btn.dataset.t);
    if (btn.dataset.act === 'apply') applySuggestion(ti, Number(btn.dataset.s));
    if (btn.dataset.act === 'apply-all') tables[ti].grid.suggestions.forEach((_, si) => applySuggestion(ti, si));
    if (btn.dataset.act === 'copy') {
      const tsv = gridToTsv(tables[ti].grid);
      const old = btn.textContent;
      try { await navigator.clipboard.writeText(tsv); btn.textContent = 'কপি হয়েছে ✓'; } catch (err) { btn.textContent = 'কপি করা যায়নি'; }
      setTimeout(() => { btn.textContent = old; }, 1800);
    }
  }

  root.addEventListener('input', onInput);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('input', onInput);
    root.removeEventListener('click', onClick);
    root.innerHTML = '';
  };
}
