// Workspace: Upload অংশ চালু করা, সারাংশ দেখানো ও (Text OCR-এ) OCR প্যানেল যুক্ত করা
import { createUploader } from './uploader.js';
import { createTextOcrPanel } from '../modules/text-ocr/text-ocr.js';

const CONFIG_BY_MODE = {
  'text-ocr': { multiple: true, next: '' },
  'document-ocr': { multiple: false, next: 'Document Analysis ও Table Detection Phase 7-8-এ যোগ হবে।' }
};

// ফেরত দেয় একটি cleanup ফাংশন
export function mountWorkspace(mode) {
  const cfg = CONFIG_BY_MODE[mode];
  const root = document.getElementById('uploader-root');
  const summary = document.getElementById('ws-summary');
  if (!root || !cfg) return () => {};

  let panel = null;
  let uploader = null;

  function updateSummary(items) {
    const hint = cfg.next ? `<p>${cfg.next}</p>` : '';
    if (!items.length) {
      summary.innerHTML = `<p>এখনো কোনো ফাইল যোগ করা হয়নি।</p>${hint}`;
    } else {
      const pages = items.reduce((n, i) => n + (i.kind === 'pdf' ? i.pages : 1), 0);
      summary.innerHTML = `<p><b>${items.length}টি ফাইল প্রস্তুত</b> · মোট ${pages}টি পৃষ্ঠা/ছবি।</p>${hint}`;
    }
    if (panel) panel.refresh(items);
  }

  uploader = createUploader(root, { multiple: cfg.multiple, onChange: updateSummary });

  if (mode === 'text-ocr') {
    panel = createTextOcrPanel({
      controlsRoot: document.getElementById('ocr-controls'),
      progressRoot: document.getElementById('ocr-progress'),
      resultRoot: document.getElementById('ocr-result'),
      getItems: () => uploader.getItems(),
      setLocked: (v) => uploader.setLocked(v)
    });
  }

  updateSummary([]);

  return () => {
    if (panel) panel.destroy();
    uploader.destroy();
  };
}
