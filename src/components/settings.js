// Settings পেজ: Google Sheets সংযোগ (ঐচ্ছিক), পছন্দ, গোপনীয়তা, নিজের সংরক্ষিত ফল।
import { escapeHtml } from '../utils/helpers.js';
import { settings, effectiveUrl, getClient } from '../services/cloud.js';
import { CONFIG } from '../services/configuration.js';
import { isValidAppsScriptUrl } from '../services/google-apps-script.js';
import { WORD_FONTS } from '../modules/export/export-model.js';
import { downloadTxt } from '../modules/export/txt-export.js';

export function renderSettings() {
  return `
    <h1>Settings</h1>
    <p class="lead">সবকিছু ঐচ্ছিক। কিছু না করলেও অ্যাপ আগের মতোই চলবে এবং আপনার কোনো ফাইল বা লেখা কোথাও যাবে না।</p>

    <section class="card st-card">
      <h2>১. Google Sheets সংযোগ (ঐচ্ছিক)</h2>
      <p class="muted">নিজের Google Sheet-এ সেটিং ব্যাকআপ ও পছন্দের OCR-ফল সংরক্ষণ করতে চাইলে Apps Script-এর Web App URL দিন। কীভাবে বানাবেন: প্রজেক্টের <code>gas/README.md</code> দেখুন।</p>
      <label class="st-field">Apps Script Web App URL
        <input type="url" class="ed-input st-url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" spellcheck="false" />
      </label>
      <div class="st-btns">
        <button type="button" class="btn btn-primary btn-sm" data-st="save-url">URL সংরক্ষণ</button>
        <button type="button" class="btn btn-ghost btn-sm" data-st="test">সংযোগ পরীক্ষা</button>
        <button type="button" class="btn btn-ghost btn-sm" data-st="clear-url">URL মুছুন</button>
      </div>
      <p class="st-msg" data-msg="url" role="status" aria-live="polite"></p>
    </section>

    <section class="card st-card">
      <h2>২. আমার পছন্দ</h2>
      <div class="st-row">
        <label class="st-field">OCR-এর ডিফল্ট ভাষা
          <select class="ed-input st-lang">
            <option value="ben+eng">বাংলা + English</option>
            <option value="ben">শুধু বাংলা</option>
            <option value="eng">শুধু English</option>
          </select>
        </label>
        <label class="st-field">Word/Excel-এর ডিফল্ট ফন্ট
          <select class="ed-input st-font">${WORD_FONTS.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join('')}</select>
        </label>
      </div>
      <div class="st-btns">
        <button type="button" class="btn btn-primary btn-sm" data-st="save-prefs">এই ব্রাউজারে সংরক্ষণ</button>
        <button type="button" class="btn btn-ghost btn-sm" data-st="backup" data-cloud>Sheets-এ ব্যাকআপ</button>
        <button type="button" class="btn btn-ghost btn-sm" data-st="restore" data-cloud>Sheets থেকে ফিরিয়ে আনুন</button>
      </div>
      <p class="st-msg" data-msg="prefs" role="status" aria-live="polite"></p>
    </section>

    <section class="card st-card">
      <h2>৩. গোপনীয়তা</h2>
      <label class="st-check"><input type="checkbox" class="st-usage" /> বেনামী ব্যবহার-পরিসংখ্যান Google Sheet-এ পাঠান</label>
      <p class="muted">চালু করলে প্রতিবার OCR শেষে শুধু এগুলো যায়: মোড (Text/Document), পৃষ্ঠা-সংখ্যা, সফল হয়েছে কি না, ভাষা ও সময়। <b>কোনো লেখা, ফাইলের নাম বা ছবি যায় না।</b> ডিফল্টে বন্ধ। (Sheets URL না থাকলে এটি কিছুই করে না।)</p>
      <ul class="muted st-list">
        <li>ছবি ও PDF কখনোই কোথাও পাঠানো হয় না; OCR আপনার ব্রাউজারেই হয়।</li>
        <li>OCR-এর লেখা তখনই যায় যখন আপনি নিজে "Google Sheets-এ সংরক্ষণ" চাপেন ও সম্মতি দেন।</li>
        <li>অ্যাপে কোনো পাসওয়ার্ড বা গোপন Key নেই।</li>
      </ul>
      <p class="st-msg" data-msg="privacy" role="status" aria-live="polite"></p>
    </section>

    <section class="card st-card">
      <h2>৪. আমার সংরক্ষিত ফল</h2>
      <div class="st-btns">
        <button type="button" class="btn btn-ghost btn-sm" data-st="list" data-cloud>তালিকা দেখুন</button>
        <button type="button" class="btn btn-ghost btn-sm btn-danger" data-st="wipe" data-cloud>Sheets থেকে আমার সব তথ্য মুছুন</button>
      </div>
      <ul class="st-results"></ul>
      <p class="st-msg" data-msg="results" role="status" aria-live="polite"></p>
    </section>

    <section class="card st-card">
      <h2>৫. আমার পরিচয় (clientId)</h2>
      <p class="muted">এটি এই ব্রাউজারে বানানো একটি এলোমেলো কোড; এটি দিয়েই Sheet-এ আপনার নিজের তথ্য আলাদা করা হয়। কোড বদলালে আগের সংরক্ষিত তথ্য আর দেখা যাবে না (Sheet-এ থেকে যাবে)।</p>
      <p>বর্তমান: <code class="st-cid"></code></p>
      <div class="st-btns"><button type="button" class="btn btn-ghost btn-sm" data-st="reset-id">নতুন পরিচয় বানান</button></div>
    </section>`;
}

export function mountSettings() {
  const root = document.querySelector('main.wrap');
  const q = (s) => root.querySelector(s);
  const msg = (k, text, err = false) => { const el = q(`[data-msg="${k}"]`); el.textContent = text; el.classList.toggle('is-error', err); };
  const urlEl = q('.st-url'); const langEl = q('.st-lang'); const fontEl = q('.st-font'); const usageEl = q('.st-usage');
  const listEl = q('.st-results');

  function fill() {
    const s = settings.get();
    urlEl.value = s.appsScriptUrl || CONFIG.appsScriptUrl || '';
    langEl.value = s.prefs.language;
    if ([...fontEl.options].some((o) => o.value === s.prefs.wordFont)) fontEl.value = s.prefs.wordFont;
    usageEl.checked = s.usageStats;
    q('.st-cid').textContent = `${settings.clientId().slice(0, 6)}…`;
    syncCloudButtons();
  }
  function syncCloudButtons() {
    const on = isValidAppsScriptUrl(effectiveUrl());
    root.querySelectorAll('[data-cloud]').forEach((b) => { b.disabled = !on; b.title = on ? '' : 'আগে Apps Script URL সংরক্ষণ করুন'; });
  }

  async function guarded(key, fn) {
    const c = getClient();
    if (!c) { msg(key, 'আগে সঠিক Apps Script URL সংরক্ষণ করুন।', true); return; }
    msg(key, 'অপেক্ষা করুন…');
    try { await fn(c); } catch (e) { msg(key, e.message || 'হয়নি।', true); }
  }

  async function list() {
    await guarded('results', async (c) => {
      const { items } = await c.listResults();
      listEl.innerHTML = items.length ? items.map((it) => `<li data-id="${escapeHtml(it.id)}"><div><b>${escapeHtml(it.title)}</b><small>${escapeHtml(it.time.slice(0, 16).replace('T', ' '))} · ${it.mode === 'document' ? 'Document' : 'Text'} · ${it.chars} অক্ষর</small></div><div class="st-btns"><button type="button" class="btn btn-ghost btn-sm" data-st="dl">TXT</button><button type="button" class="btn btn-ghost btn-sm btn-danger" data-st="del">মুছুন</button></div></li>`).join('') : '';
      msg('results', items.length ? `${items.length}টি সংরক্ষিত ফল।` : 'কোনো সংরক্ষিত ফল নেই।');
    });
  }

  async function onClick(e) {
    const b = e.target.closest('[data-st]');
    if (!b || b.disabled) return;
    switch (b.dataset.st) {
      case 'save-url': {
        const v = urlEl.value.trim();
        if (v && !isValidAppsScriptUrl(v)) { msg('url', 'URL ঠিক মনে হচ্ছে না। এটি https://script.google.com/macros/s/…/exec ধরনের হতে হবে।', true); return; }
        settings.set({ appsScriptUrl: v });
        syncCloudButtons();
        msg('url', v ? 'URL সংরক্ষণ হয়েছে ✔ (এখন "সংযোগ পরীক্ষা" চাপুন)' : 'URL সরানো হয়েছে।');
        break;
      }
      case 'clear-url': urlEl.value = ''; settings.set({ appsScriptUrl: '' }); syncCloudButtons(); msg('url', 'URL মুছে ফেলা হয়েছে। অ্যাপ এখন Sheets ছাড়াই চলবে।'); break;
      case 'test': {
        const v = urlEl.value.trim();
        const c = getClient(v);
        if (!c) { msg('url', 'আগে সঠিক URL লিখুন।', true); return; }
        msg('url', 'পরীক্ষা চলছে…');
        try { const d = await c.ping(); msg('url', `সংযোগ ঠিক আছে ✔ (Script সংস্করণ ${escapeHtml(String(d.version || '?'))})`); } catch (err) { msg('url', err.message, true); }
        break;
      }
      case 'save-prefs': settings.set({ prefs: { language: langEl.value, wordFont: fontEl.value } }); msg('prefs', 'পছন্দ এই ব্রাউজারে সংরক্ষণ হয়েছে ✔ (পরের বার OCR-এ কাজ করবে)'); break;
      case 'backup': await guarded('prefs', async (c) => { await c.saveSettings({ language: langEl.value, wordFont: fontEl.value }); settings.set({ prefs: { language: langEl.value, wordFont: fontEl.value } }); msg('prefs', 'Sheets-এ ব্যাকআপ হয়েছে ✔'); }); break;
      case 'restore': await guarded('prefs', async (c) => {
        const { prefs } = await c.getSettings();
        if (!prefs) { msg('prefs', 'Sheets-এ আপনার কোনো ব্যাকআপ নেই।', true); return; }
        settings.set({ prefs }); fill(); msg('prefs', 'Sheets থেকে ফিরিয়ে আনা হয়েছে ✔');
      }); break;
      case 'list': await list(); break;
      case 'dl': {
        const id = b.closest('li').dataset.id;
        await guarded('results', async (c) => { const r = await c.getResult(id); downloadTxt(`${r.title || 'ফল'}.txt`, r.text); msg('results', 'ডাউনলোড শুরু হয়েছে ✔'); });
        break;
      }
      case 'del': {
        const id = b.closest('li').dataset.id;
        if (!window.confirm('এই সংরক্ষিত ফলটি Google Sheet থেকে মুছে ফেলবেন?')) return;
        await guarded('results', async (c) => { await c.deleteResult(id); await list(); msg('results', 'মুছে ফেলা হয়েছে ✔'); });
        break;
      }
      case 'wipe': {
        if (!window.confirm('Google Sheet থেকে এই ব্রাউজারের সব তথ্য (সংরক্ষিত ফল, সেটিং ব্যাকআপ, পরিসংখ্যান) মুছে ফেলবেন? এটি ফেরানো যায় না।')) return;
        await guarded('results', async (c) => { const r = await c.deleteMyData(); listEl.innerHTML = ''; msg('results', `মুছে ফেলা হয়েছে ✔ (ফল ${r.results}, সেটিং ${r.settings}, পরিসংখ্যান ${r.usage})`); });
        break;
      }
      case 'reset-id':
        if (!window.confirm('নতুন পরিচয় বানালে আগের সংরক্ষিত তথ্য আর দেখা যাবে না। এগিয়ে যাবেন?')) return;
        settings.resetClientId(); fill(); listEl.innerHTML = ''; msg('results', ''); break;
      default: break;
    }
  }
  function onChange(e) {
    if (e.target === usageEl) {
      settings.set({ usageStats: usageEl.checked });
      msg('privacy', usageEl.checked ? 'চালু হয়েছে। বন্ধ করতে টিক তুলে দিন।' : 'বন্ধ আছে।');
    }
  }
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  fill();
  return () => { root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); };
}
