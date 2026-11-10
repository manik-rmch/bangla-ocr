import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/500.css';
import '@fontsource/noto-sans-bengali/600.css';
import '@fontsource/noto-sans-bengali/700.css';
import './styles/main.css';
import './styles/dashboard.css';
import './styles/uploader.css';
import './styles/ocr.css';
import './styles/enhance.css';
import './styles/document.css';
import './styles/settings.css';
import { renderHeader, renderFooter } from './components/header.js';
import { renderDashboard } from './components/dashboard.js';
import { renderAbout, renderHelp, renderWorkspace } from './components/pages.js';

const app = document.getElementById('app');

// Hash-based Routing (GitHub Pages-এ কোনো সমস্যা ছাড়াই চলে)
const ROUTES = {
  '': { id: 'home', title: 'বাংলা OCR Studio', view: renderDashboard },
  home: { id: 'home', title: 'বাংলা OCR Studio', view: renderDashboard },
  'text-ocr': { id: 'text-ocr', title: 'Text OCR - বাংলা OCR Studio', view: () => renderWorkspace('text-ocr'), mount: async () => (await import('./components/workspace.js')).mountWorkspace('text-ocr') },
  'document-ocr': { id: 'document-ocr', title: 'Document OCR - বাংলা OCR Studio', view: () => renderWorkspace('document-ocr'), mount: async () => (await import('./components/workspace.js')).mountWorkspace('document-ocr') },
  about: { id: 'about', title: 'About - বাংলা OCR Studio', view: renderAbout },
  help: { id: 'help', title: 'Help - বাংলা OCR Studio', view: renderHelp },
  settings: { id: 'settings', title: 'Settings - বাংলা OCR Studio', view: async () => (await import('./components/settings.js')).renderSettings(), mount: async () => (await import('./components/settings.js')).mountSettings() }
};

let unmount = null;
let token = 0; // দ্রুত পেজ বদলালে পুরোনো (দেরিতে আসা) পেজ যেন নতুনটাকে ঢেকে না দেয়

function shell(route, inner) {
  app.innerHTML = `
    ${renderHeader(route.id)}
    <main class="wrap">${inner}</main>
    ${renderFooter()}`;
}

async function render() {
  const my = ++token;
  // আগের পেজের Object URL ও PDF মেমরি পরিষ্কার
  if (unmount) { unmount(); unmount = null; }
  const key = location.hash.replace(/^#\/?/, '');
  const route = ROUTES[key] || ROUTES[''];
  document.title = route.title;
  try {
    let html = route.view();
    if (html && typeof html.then === 'function') {
      shell(route, '<p class="lead" role="status">লোড হচ্ছে…</p>'); // ভারী অংশ প্রথমবার নামার সময়
      html = await html;
      if (my !== token) return;
    }
    shell(route, html);
    window.scrollTo(0, 0);
    if (route.mount) {
      const u = await route.mount();
      if (my !== token) { if (typeof u === 'function') u(); return; }
      unmount = typeof u === 'function' ? u : null;
    }
  } catch (e) {
    if (my !== token) return;
    shell(route, `<div class="card"><h2>পেজটি লোড হয়নি</h2><p>ইন্টারনেট সংযোগ দেখে পেজটি আবার লোড করুন।</p><p><button type="button" class="btn btn-primary" id="reload-btn">আবার চেষ্টা করুন</button></p><p class="muted">${String((e && e.message) || e).replace(/</g, '&lt;')}</p></div>`);
    const b = document.getElementById('reload-btn');
    if (b) b.addEventListener('click', () => location.reload());
  }
}

window.addEventListener('hashchange', render);
render();
