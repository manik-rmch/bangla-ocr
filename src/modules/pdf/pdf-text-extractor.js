// PDF-এর নিজস্ব Text Layer থেকে লেখা ও তার অবস্থান (X/Y) বের করা এবং লেখার মান যাচাই।
//
// গুরুত্বপূর্ণ: অনেক বাংলা PDF-এ (বিশেষ করে Word/পুরোনো ফন্ট থেকে বানানো) লেখা ভেতরে ভাঙা থাকে,
// যেমন "ডিউটি" হয়ে যায় "িডউটি"। এমন লেখা সরাসরি ব্যবহার করলে ভুল আসে।
// তাই এখানে লেখার মান যাচাই হয়; ভালো না হলে অ্যাপ নিজেই OCR ব্যবহার করে। কোনো লেখা অনুমান করে বসানো হয় না।

const BN_RANGE = /[ঀ-৿]/;
// বাংলা চিহ্ন, যা কখনো শব্দ/অংশের শুরুতে একা আসার কথা নয় (চন্দ্রবিন্দু, অনুস্বার, বিসর্গ, নুক্তা, কার, হসন্ত)
const BN_LEADING_MARK = /^[ঁ-ঃ়া-্ৗ]/;
// শব্দের শুরুতে (স্পেসের পরে) একা কার/হসন্ত থাকা মানেই লেখা ভাঙা, যেমন "মাঃ িমজানুর"-এর "িমজানুর"
const BN_MARK_AFTER_SPACE = /\s[\u0981-\u0983\u09BC\u09BE-\u09CD\u09D7]/;
const BAD_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F�-]/g;

// দুটি Matrix গুণ ([a,b,c,d,e,f] রূপে), যাতে PDF.js-এর Util আলাদা করে আনতে না হয়।
function multiply(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ];
}

/**
 * পৃষ্ঠার সব লেখার টুকরো (item) বের করে। স্থানাঙ্ক PDF Point (১ পয়েন্ট = ১/৭২ ইঞ্চি),
 * বাম-উপর কোণ (0,0), পৃষ্ঠার Rotation মেনে।
 * ফল: { width, height, items: [{ str, x, y, w, h }] } — y = অক্ষরের উপরের দিক, h = ফন্টের উচ্চতা
 */
export async function extractPageItems(page) {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items = [];
  for (const it of content.items) {
    if (typeof it.str !== 'string' || !it.transform) continue;
    const tx = multiply(viewport.transform, it.transform);
    const h = Math.hypot(tx[2], tx[3]) || Math.abs(it.height) || 0;
    const w = Math.abs(it.width || 0) * (Math.hypot(viewport.transform[0], viewport.transform[1]) || 1);
    items.push({ str: it.str, x: tx[4], y: tx[5] - h, w, h });
  }
  return { width: viewport.width, height: viewport.height, items };
}

/**
 * লেখার টুকরোগুলো থেকে মান যাচাই।
 * ফল: { chars, bengali, bad, suspicious, ratio, level }
 *   level: 'none' (লেখা নেই/স্ক্যান) | 'poor' (ভাঙা) | 'good'
 */
export function assessTextQuality(items) {
  let chars = 0;
  let bengali = 0;
  let bad = 0;
  let suspicious = 0;
  let bnItems = 0;
  for (const it of items) {
    const s = it.str;
    if (!s) continue;
    const visible = s.replace(/\s+/g, '');
    chars += visible.length;
    const badHere = (s.match(BAD_CHARS) || []).length;
    bad += badHere;
    const hasBn = BN_RANGE.test(s);
    if (hasBn) {
      bnItems++;
      bengali += (s.match(/[ঀ-৿]/g) || []).length;
      const trimmed = s.replace(/^[\s\u0000]+/, '');
      if (BN_LEADING_MARK.test(trimmed) || BN_MARK_AFTER_SPACE.test(s)) suspicious++;
    }
    if (badHere && !hasBn) suspicious++;
  }

  // ১০টির কম দৃশ্যমান অক্ষর থাকলে ধরা হয় Text Layer নেই (স্ক্যান করা ছবি)
  if (chars < 10) return { chars, bengali, bad, suspicious, ratio: 0, level: 'none' };

  const unit = Math.max(1, bnItems || items.length);
  const ratio = suspicious / unit;
  const badRatio = bad / chars;
  // ভাঙা চিহ্ন ২%-এর বেশি, অথবা সন্দেহজনক টুকরো ২%-এর বেশি হলে লেখাটি ভরসাযোগ্য নয়
  const level = ratio > 0.02 || badRatio > 0.02 ? 'poor' : 'good';
  return { chars, bengali, bad, suspicious, ratio, level };
}

/**
 * টুকরোগুলোকে লাইনে সাজানো (উপর থেকে নিচে, বাম থেকে ডানে)।
 * একই লাইনে বড় ফাঁক থাকলে ট্যাব (টেবিলের কলাম আলাদা বোঝাতে), ছোট ফাঁকে একটি স্পেস।
 * ফল: [{ y, h, text, items }]
 */
export function groupIntoLines(items) {
  const sorted = items
    .filter((i) => i.str && i.str.replace(/[\s\u0000]+/g, '') !== '')
    .sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2) || a.x - b.x);

  const lines = [];
  for (const it of sorted) {
    const mid = it.y + it.h / 2;
    let line = lines[lines.length - 1];
    const tol = Math.max(2, (line ? line.h : it.h) * 0.5);
    if (!line || Math.abs(mid - line.mid) > tol) {
      line = { mid, y: it.y, h: it.h, items: [] };
      lines.push(line);
    }
    line.items.push(it);
    line.mid = line.items.reduce((s, i) => s + i.y + i.h / 2, 0) / line.items.length;
    line.y = Math.min(line.y, it.y);
    line.h = Math.max(line.h, it.h);
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    let text = '';
    let prevEnd = null;
    for (const it of line.items) {
      const piece = it.str.replace(/\u0000/g, '');
      if (prevEnd !== null) {
        const gap = it.x - prevEnd;
        const em = Math.max(line.h, 1);
        if (gap > em * 1.8) text += '\t';
        else if (gap > em * 0.18 && !/\s$/.test(text) && !/^\s/.test(piece)) text += ' ';
      }
      text += piece;
      prevEnd = it.x + it.w;
    }
    line.text = text.replace(/[ \t]+$/g, '');
  }
  return lines.filter((l) => l.text.trim() !== '');
}

/**
 * একটি পৃষ্ঠার লেখা পুরোপুরি বের করা (Text OCR-এর জন্য)।
 * ফল: { text, quality, width, height, items }
 */
export async function extractPageText(page) {
  const { width, height, items } = await extractPageItems(page);
  const quality = assessTextQuality(items);
  const lines = quality.level === 'none' ? [] : groupIntoLines(items);
  const text = lines.map((l) => l.text).join('\n');
  return { text, quality, width, height, items };
}
