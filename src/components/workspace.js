// Workspace: Upload অংশ চালু করা ও সারাংশ দেখানো
import { createUploader } from './uploader.js';

const CONFIG_BY_MODE = {
  'text-ocr': { multiple: true, next: 'OCR শুরু করার সুবিধা Phase 4 (Text OCR Engine)-এ যোগ হবে।' },
  'document-ocr': { multiple: false, next: 'Document Analysis ও Table Detection Phase 7-8-এ যোগ হবে।' }
};

// ফেরত দেয় একটি cleanup ফাংশন
export function mountWorkspace(mode) {
  const cfg = CONFIG_BY_MODE[mode];
  const root = document.getElementById('uploader-root');
  const summary = document.getElementById('ws-summary');
  if (!root || !cfg) return () => {};

  function updateSummary(items) {
    if (!items.length) {
      summary.innerHTML = `<p>এখনো কোনো ফাইল যোগ করা হয়নি।</p><p>${cfg.next}</p>`;
      return;
    }
    const pages = items.reduce((n, i) => n + (i.kind === 'pdf' ? i.pages : 1), 0);
    summary.innerHTML = `<p><b>${items.length}টি ফাইল প্রস্তুত</b> · মোট ${pages}টি পৃষ্ঠা/ছবি।</p><p>${cfg.next}</p>`;
  }

  const uploader = createUploader(root, { multiple: cfg.multiple, onChange: updateSummary });
  updateSummary([]);
  return () => uploader.destroy();
}
