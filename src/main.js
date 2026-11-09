import './styles/main.css';
import { CONFIG } from './services/configuration.js';
import { assetUrl, escapeHtml } from './utils/helpers.js';

const app = document.getElementById('app');

app.innerHTML = `
  <div class="wrap">
    <div class="logo">${escapeHtml(CONFIG.appName)}</div>

    <div class="card">
      <h2>Phase 1: Project Setup সম্পন্ন</h2>
      <p>এই পেজ দেখা গেলে Vite, GitHub Pages ও Base Path ঠিকমতো কাজ করছে।</p>
    </div>

    <div class="card" id="checks">
      <h2>স্বয়ংক্রিয় পরীক্ষা</h2>
    </div>

    <div class="card">
      <p>গোপনীয়তা: আপনার PDF ও ছবি কেবল আপনার Browser-এ প্রক্রিয়া হবে, কোনো সার্ভারে যাবে না।</p>
    </div>
  </div>
`;

const checks = document.getElementById('checks');

function addRow(label, ok, detail) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<span>${escapeHtml(label)}${detail ? `<br><code>${escapeHtml(detail)}</code>` : ''}</span>
    <span class="${ok ? 'ok' : 'bad'}">${ok ? '✔ ঠিক আছে' : '✘ সমস্যা'}</span>`;
  checks.appendChild(row);
}

const base = import.meta.env.BASE_URL;
addRow('Base Path সঠিক (/bangla-ocr/)', base === '/bangla-ocr/', base);
addRow('Apps Script ছাড়াই অ্যাপ চলছে', true, CONFIG.appsScriptUrl || 'URL সেট নেই (ঠিক আছে)');

fetch(assetUrl('assets/health.json'))
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
  .then((j) => addRow('public ফোল্ডার থেকে ফাইল লোড', j.status === 'ok', assetUrl('assets/health.json')))
  .catch((e) => addRow('public ফোল্ডার থেকে ফাইল লোড', false, e.message));
