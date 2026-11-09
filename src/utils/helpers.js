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

// বাংলা সংখ্যাকে ইংরেজি সংখ্যায় বদলায় (যেমন "১-৩" → "1-3")
export function bnToEnDigits(text) {
  return String(text).replace(/[\u09E6-\u09EF]/g, (d) => String(d.charCodeAt(0) - 0x09E6));
}

// পৃষ্ঠার রেঞ্জ পড়া। "1-3, 5, 8-" → [1,2,3,5,8,...total]। খালি দিলে সব পৃষ্ঠা।
// ফল: { ok: true, pages: [..] } অথবা { ok: false, error: '...' }
export function parsePageRange(input, total) {
  const text = bnToEnDigits(input || '').replace(/\s+/g, '').replace(/[,،]+/g, ',');
  if (!text) return { ok: true, pages: Array.from({ length: total }, (_, i) => i + 1) };
  const set = new Set();
  for (const part of text.split(',')) {
    if (!part) continue;
    const m = /^(\d*)(?:-(\d*))?$/.exec(part);
    if (!m || (m[1] === '' && !part.startsWith('-'))) {
      return { ok: false, error: `"${part}" বোঝা যায়নি। এভাবে লিখুন: 1-3, 5, 8-10` };
    }
    let a;
    let b;
    if (m[2] === undefined) { a = b = Number(m[1]); }
    else { a = m[1] === '' ? 1 : Number(m[1]); b = m[2] === '' ? total : Number(m[2]); }
    if (a < 1 || b < 1 || a > b) return { ok: false, error: `"${part}" রেঞ্জটি ঠিক নয়।` };
    for (let n = a; n <= Math.min(b, total); n++) set.add(n);
  }
  return { ok: true, pages: Array.from(set).sort((x, y) => x - y) };
}
