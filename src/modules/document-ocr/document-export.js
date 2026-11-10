// Document-এর Export প্যানেল: Word, PDF, Excel, CSV, HTML, TXT, ZIP। সব কাজ ব্রাউজারে; কোনো ফাইল সার্ভারে যায় না।
import { escapeHtml } from '../../utils/helpers.js';
import { buildDocx } from '../export/docx-export.js';
import { buildXlsx } from '../export/xlsx-export.js';
import { buildHtmlDocument } from '../export/html-export.js';
import { buildBundle } from '../export/export-bundle.js';
import { pagesToCsvFiles } from '../export/csv-export.js';
import { WORD_FONTS, pagesToText, safeName } from '../export/export-model.js';
import { downloadBytes, MIME, printHtml } from '../export/download.js';
import { downloadTxt } from '../export/txt-export.js';
import { isConfigured, saveTextToSheets, settings } from '../../services/cloud.js';

/**
 * pages: বিশ্লেষণের ফল (সম্পাদনা এই অবজেক্টেই হয়, তাই সবসময় সর্বশেষ অবস্থা পাওয়া যায়)
 * getCurrent(): এখন দেখা পৃষ্ঠার ক্রম (0 থেকে)
 */
export function createExportPanel(root, { pages, baseName, getCurrent }) {
  const usable = pages.filter((p) => p.analysis);
  const multi = usable.length > 1;
  root.innerHTML = `
    <div class="card dx-card">
      <h2>ডাউনলোড (Export)</h2>
      <p class="muted dx-note">Editor-এ যেভাবে সাজিয়েছেন, ফাইলে সেভাবেই যাবে। ফাইল তৈরি হয় আপনার ব্রাউজারে।</p>
      <div class="dx-opts">
        <label class="dx-opt" ${multi ? '' : 'hidden'}>কোন পৃষ্ঠা
          <select class="ed-input dx-scope" aria-label="কোন পৃষ্ঠা">
            <option value="all">সব পৃষ্ঠা</option>
            <option value="current">শুধু এখন দেখা পৃষ্ঠা</option>
          </select>
        </label>
        <label class="dx-opt">Word/Excel-এর ফন্ট
          <select class="ed-input dx-font" aria-label="ফন্ট">${WORD_FONTS.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join('')}</select>
        </label>
      </div>
      <div class="dx-btns">
        <button type="button" class="btn btn-primary btn-sm" data-x="docx">Word (.docx)</button>
        <button type="button" class="btn btn-primary btn-sm" data-x="pdf" title="Print জানালা খুলবে; সেখানে 'PDF হিসেবে সংরক্ষণ' বাছুন">PDF</button>
        <button type="button" class="btn btn-ghost btn-sm" data-x="xlsx">Excel (.xlsx)</button>
        <button type="button" class="btn btn-ghost btn-sm" data-x="csv">CSV (টেবিল)</button>
        <button type="button" class="btn btn-ghost btn-sm" data-x="html">HTML</button>
        <button type="button" class="btn btn-ghost btn-sm" data-x="txt">TXT</button>
        <button type="button" class="btn btn-ghost btn-sm" data-x="zip">সব একসঙ্গে (ZIP)</button>
        ${isConfigured() ? '<button type="button" class="btn btn-ghost btn-sm" data-x="sheets" title="শুধু লেখা আপনার Google Sheet-এ সংরক্ষণ (সম্মতি চাওয়া হবে)">Google Sheets-এ সংরক্ষণ</button>' : ''}
      </div>
      <p class="dx-status" role="status" aria-live="polite"></p>
      <p class="muted dx-help">PDF বাটনে Print জানালা খুলবে। সেখানে Destination/গন্তব্য হিসেবে "Save as PDF" (PDF হিসেবে সংরক্ষণ) বাছুন। Margins "None" ও Background graphics চালু রাখলে সবচেয়ে ভালো মেলে।</p>
    </div>`;
  const scopeEl = root.querySelector('.dx-scope');
  const fontEl = root.querySelector('.dx-font');
  const statusEl = root.querySelector('.dx-status');
  const wantFont = settings.get().prefs.wordFont;
  if ([...fontEl.options].some((o) => o.value === wantFont)) fontEl.value = wantFont;
  const btns = [...root.querySelectorAll('[data-x]')];

  const say = (msg, err = false) => { statusEl.textContent = msg; statusEl.classList.toggle('is-error', err); };
  const picked = () => {
    if (multi && scopeEl.value === 'current') {
      const p = pages[getCurrent()];
      return p && p.analysis ? [p] : [];
    }
    return usable;
  };
  const suffix = () => (multi && scopeEl.value === 'current' ? `-পৃষ্ঠা${pages[getCurrent()].pageNum}` : '');
  const base = () => `${safeName(baseName)}${suffix()}`;

  async function run(kind) {
    const sel = picked();
    if (!sel.length) { say('এই পৃষ্ঠায় Export করার মতো বিশ্লেষণ নেই।', true); return; }
    const font = fontEl.value;
    const title = safeName(baseName);
    switch (kind) {
      case 'docx': downloadBytes(`${base()}.docx`, await buildDocx(sel, { font, title }), MIME.docx); say('Word ফাইল তৈরি হয়েছে ✔ (ডাউনলোড শুরু)'); break;
      case 'xlsx': downloadBytes(`${base()}.xlsx`, await buildXlsx(sel, { font }), MIME.xlsx); say('Excel ফাইল তৈরি হয়েছে ✔ (প্রতিটি টেবিল আলাদা Sheet-এ)'); break;
      case 'html': downloadBytes(`${base()}.html`, buildHtmlDocument(sel, { title }), MIME.html); say('HTML ফাইল তৈরি হয়েছে ✔'); break;
      case 'txt': downloadTxt(`${base()}.txt`, pagesToText(sel)); say('TXT ফাইল তৈরি হয়েছে ✔'); break;
      case 'csv': {
        const files = pagesToCsvFiles(sel);
        if (!files.length) { say('এই পৃষ্ঠায় কোনো টেবিল নেই, তাই CSV হয়নি।', true); break; }
        if (files.length === 1) { downloadBytes(`${base()}.csv`, `﻿${files[0].csv}`, MIME.csv); say('CSV ফাইল তৈরি হয়েছে ✔'); break; }
        const { createZip } = await import('../export/zip-writer.js');
        const zip = await createZip(files.map((f) => ({ name: f.name, data: `﻿${f.csv}` })));
        downloadBytes(`${base()}-csv.zip`, zip, MIME.zip);
        say(`${files.length}টি টেবিল — প্রতিটির CSV একটি ZIP-এ দেওয়া হয়েছে ✔`);
        break;
      }
      case 'zip': {
        const r = await buildBundle(sel, { base: base(), font, title });
        downloadBytes(`${base()}.zip`, r.bytes, MIME.zip);
        say(r.skipped.length ? `ZIP তৈরি হয়েছে, তবে কিছু ফাইল হয়নি: ${r.skipped.join('; ')}` : `ZIP তৈরি হয়েছে ✔ (${r.count}টি ফাইল)`, r.skipped.length > 0);
        break;
      }
      case 'sheets': {
        const r = await saveTextToSheets({ title: base(), mode: 'document', pages: sel.length, text: pagesToText(sel) });
        say(r.message, !r.ok && !r.cancelled);
        break;
      }
      case 'pdf': {
        say('Print জানালা খুলছি… সেখানে "PDF হিসেবে সংরক্ষণ" বাছুন।');
        await printHtml(buildHtmlDocument(sel, { title, print: true }));
        break;
      }
      default: break;
    }
  }

  async function onClick(e) {
    const b = e.target.closest('[data-x]');
    if (!b || b.disabled) return;
    btns.forEach((x) => { x.disabled = true; });
    try { await run(b.dataset.x); } catch (err) { say(`হয়নি: ${err.message || err}`, true); } finally { btns.forEach((x) => { x.disabled = false; }); }
  }
  root.addEventListener('click', onClick);
  return { destroy() { root.removeEventListener('click', onClick); root.innerHTML = ''; } };
}
