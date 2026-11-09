// ছোট সাহায্যকারী ফাংশন।
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// public ফোল্ডারের ফাইলের সঠিক Path (GitHub Pages-এর /bangla-ocr/ সহ)।
export function assetUrl(path) {
  return import.meta.env.BASE_URL + path.replace(/^\/+/, '');
}
