// Workspace: Upload অংশ চালু করা, সারাংশ দেখানো ও (Text OCR-এ) OCR প্যানেল যুক্ত করা
import { createUploader } from './uploader.js';
import { createEnhancementPanel } from './enhancement-panel.js';
import { createTextOcrPanel } from '../modules/text-ocr/text-ocr.js';
import { createDocumentPanel } from '../modules/document-ocr/document-ocr.js';

const CONFIG_BY_MODE = {
  'text-ocr': { multiple: true, next: '' },
  'document-ocr': { multiple: false, next: 'Document বিশ্লেষণ ও টেবিলের ঘর ধরে OCR চালু। সম্পূর্ণ Document পুনর্গঠন (Phase 9) পরের ধাপে যোগ হবে।' }
};

// ফেরত দেয় একটি cleanup ফাংশন
export function mountWorkspace(mode) {
  const cfg = CONFIG_BY_MODE[mode];
  const root = document.getElementById('uploader-root');
  const summary = document.getElementById('ws-summary');
  if (!root || !cfg) return () => {};

  let panel = null;
  let enh = null;
  let uploader = null;

  function updateSummary(items) {
    const hint = cfg.next ? `<p>${cfg.next}</p>` : '';
    if (!items.length) {
      summary.innerHTML = `<p>এখনো কোনো ফাইল যোগ করা হয়নি।</p>${hint}`;
    } else {
      const pages = items.reduce((n, i) => n + (i.kind === 'pdf' ? i.pages : 1), 0);
      summary.innerHTML = `<p><b>${items.length}টি ফাইল প্রস্তুত</b> · মোট ${pages}টি পৃষ্ঠা/ছবি।</p>${hint}`;
    }
    if (enh) enh.refresh(items);
    if (panel) panel.refresh(items);
  }

  uploader = createUploader(root, { multiple: cfg.multiple, onChange: updateSummary });

  if (mode === 'text-ocr') {
    enh = createEnhancementPanel(document.getElementById('enh-root'));
    panel = createTextOcrPanel({
      enhance: enh,
      controlsRoot: document.getElementById('ocr-controls'),
      progressRoot: document.getElementById('ocr-progress'),
      resultRoot: document.getElementById('ocr-result'),
      getItems: () => uploader.getItems(),
      setLocked: (v) => { uploader.setLocked(v); enh.setLocked(v); }
    });
  }

  if (mode === 'document-ocr') {
    enh = createEnhancementPanel(document.getElementById('enh-root'));
    panel = createDocumentPanel({
      enhance: enh,
      controlsRoot: document.getElementById('doc-controls'),
      progressRoot: document.getElementById('doc-progress'),
      resultRoot: document.getElementById('doc-result'),
      getItems: () => uploader.getItems(),
      setLocked: (v) => { uploader.setLocked(v); enh.setLocked(v); }
    });
  }

  updateSummary([]);

  return () => {
    if (panel) panel.destroy();
    if (enh) enh.destroy();
    uploader.destroy();
  };
}
