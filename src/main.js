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
import { mountWorkspace } from './components/workspace.js';
import { renderSettings, mountSettings } from './components/settings.js';

const app = document.getElementById('app');

// Hash-based Routing (GitHub Pages-এ কোনো সমস্যা ছাড়াই চলে)
const ROUTES = {
  '': { id: 'home', title: 'বাংলা OCR Studio', view: renderDashboard },
  home: { id: 'home', title: 'বাংলা OCR Studio', view: renderDashboard },
  'text-ocr': { id: 'text-ocr', title: 'Text OCR - বাংলা OCR Studio', view: () => renderWorkspace('text-ocr'), mount: () => mountWorkspace('text-ocr') },
  'document-ocr': { id: 'document-ocr', title: 'Document OCR - বাংলা OCR Studio', view: () => renderWorkspace('document-ocr'), mount: () => mountWorkspace('document-ocr') },
  about: { id: 'about', title: 'About - বাংলা OCR Studio', view: renderAbout },
  help: { id: 'help', title: 'Help - বাংলা OCR Studio', view: renderHelp },
  settings: { id: 'settings', title: 'Settings - বাংলা OCR Studio', view: renderSettings, mount: mountSettings }
};

let unmount = null;

function render() {
  // আগের পেজের Object URL ও PDF মেমরি পরিষ্কার
  if (unmount) { unmount(); unmount = null; }
  const key = location.hash.replace(/^#\/?/, '');
  const route = ROUTES[key] || ROUTES[''];
  document.title = route.title;
  app.innerHTML = `
    ${renderHeader(route.id)}
    <main class="wrap">${route.view()}</main>
    ${renderFooter()}`;
  if (route.mount) unmount = route.mount();
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
render();
