// টেবিলের OCR ফল যাচাই: কোন ঘর সন্দেহজনক তা চিহ্নিত করা এবং সংশোধনের প্রস্তাব দেওয়া।
// নিয়ম: এখানে কোনো লেখা নিজে থেকে বদলানো হয় না। শুধু "প্রস্তাব" দেওয়া হয়; প্রয়োগ করবেন ব্যবহারকারী।

export const LOW_CONFIDENCE = 60;

const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();

// অক্ষরের ধরন অনুযায়ী ছাঁচ: "০১/১১/২০২৬" → "9/9/9", "রবিবার" → "a"
export function patternOf(text) {
  let out = '';
  for (const ch of norm(text)) {
    let k;
    if (/[০-৯0-9]/.test(ch)) k = '9';
    else if (/[ঀ-৿A-Za-z]/.test(ch)) k = 'a';
    else k = ch;
    if (out[out.length - 1] !== k || (k !== '9' && k !== 'a')) out += k;
  }
  return out;
}

// দুটি লেখার দূরত্ব (কয়টি অক্ষর বদলালে এক হয়)
export function editDistance(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

/**
 * grid.cells-এ প্রতিটি ঘরে flags (সন্দেহের কারণ) বসায় এবং প্রস্তাবের তালিকা ফেরত দেয়।
 * ফল: [{ r, c, from, to, reason }]
 */
export function validateGrid(grid) {
  const body = grid.cells.filter((c) => c.r >= grid.headerRows && c.colSpan === 1);
  const suggestions = [];
  for (const cell of grid.cells) cell.flags = [];

  for (const cell of grid.cells) {
    if (typeof cell.conf === 'number' && cell.source === 'ocr' && cell.text && cell.conf < LOW_CONFIDENCE) cell.flags.push('low');
  }

  for (let c = 0; c < grid.nCols; c++) {
    const col = body.filter((x) => x.c === c);
    if (col.length < 5) continue;
    const filled = col.filter((x) => norm(x.text));

    // ফাঁকা ঘর: কলামের প্রায় সবই ভরা, অথচ এটি ফাঁকা
    if (filled.length >= col.length * 0.9) {
      col.filter((x) => !norm(x.text)).forEach((x) => x.flags.push('empty'));
    }

    // ধরন-মিল: কলামের অধিকাংশ ঘরের ছাঁচ এক হলে ব্যতিক্রম চিহ্নিত
    const pc = new Map();
    filled.forEach((x) => { const p = patternOf(x.text); pc.set(p, (pc.get(p) || 0) + 1); });
    const top = Array.from(pc.entries()).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= filled.length * 0.6 && top[1] >= 5) {
      filled.forEach((x) => { if (patternOf(x.text) !== top[0]) x.flags.push('pattern'); });
    }

    // প্রায়-একই লেখা: কলামে বারবার আসা মান (৩+ বার) থেকে এক-দুই অক্ষর আলাদা বিরল মান
    const freq = new Map();
    filled.forEach((x) => { const t = norm(x.text); freq.set(t, (freq.get(t) || 0) + 1); });
    const common = Array.from(freq.entries()).filter(([, n]) => n >= 3);
    if (common.length) {
      for (const x of filled) {
        const t = norm(x.text);
        if ((freq.get(t) || 0) > 1) continue;
        let best = null;
        for (const [v, n] of common) {
          const d = editDistance(t, v);
          if (d >= 1 && d <= Math.max(2, Math.floor(v.length * 0.15)) && (!best || d < best.d || (d === best.d && n > best.n))) best = { v, d, n };
        }
        if (best) {
          x.flags.push('suggest');
          x.suggestion = best.v;
          suggestions.push({ r: x.r, c: x.c, from: t, to: best.v, reason: `এই কলামে "${best.v}" ${best.n} বার আছে; এটি ${best.d} অক্ষর আলাদা` });
        }
      }
    }
  }
  return suggestions;
}
