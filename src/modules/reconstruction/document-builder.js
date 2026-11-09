// পুনর্গঠিত Document আঁকা: পৃষ্ঠার মডেল → মূল পৃষ্ঠার মতো সাজানো HTML।
// সব মাপ পৃষ্ঠার প্রস্থ/উচ্চতার শতাংশে (cqw/cqh), তাই যেকোনো পর্দায় ও Zoom-এ আনুপাতিক থাকে।
import { escapeHtml } from '../../utils/helpers.js';
import { tableToHtml } from './table-reconstruction.js';
import { buildPageModel } from './layout-reconstruction.js';

const pct = (v, total) => ((v / total) * 100).toFixed(3);

function textHtml(t) {
  return escapeHtml(t || '').replace(/\n/g, '<br>');
}

/** পুরো পৃষ্ঠার HTML (class="rc-page" Container-এর ভেতরে বসবে) */
export function renderPageHtml(page) {
  const m = buildPageModel(page);
  const W = m.width;
  const H = m.height;
  const parts = [];

  for (const el of m.elements) {
    const b = el.bbox;
    const fs = ((el.fontSize / W) * 100).toFixed(3);
    // মাঝ/ডান-সাজানো লেখায় দুই পাশে সামান্য জায়গা দেওয়া হয়, যাতে ফন্ট আলাদা হলেও লাইন ভেঙে না যায়
    const slack = el.align === 'center' ? W * 0.03 : 0;
    const left = Math.max(0, b.x0 - slack);
    const width = Math.min(W - left, b.x1 - b.x0 + slack * 2 + (el.align === 'left' ? W * 0.02 : 0));
    const pos = `left:${pct(left, W)}%;top:${pct(b.y0, H)}%;width:${pct(width, W)}%;`;
    const base = `${pos}font-size:${fs}cqw;`;

    if (el.type === 'table') {
      parts.push(`<div class="rc-el rc-table-wrap" style="left:${pct(b.x0, W)}%;top:${pct(b.y0, H)}%;width:${pct(b.x1 - b.x0, W)}%;font-size:${fs}cqw">${tableToHtml(el.table, { size: { width: W, height: H } })}</div>`);
    } else if (el.type === 'list') {
      const h = b.y1 - b.y0;
      const items = el.items.map((it, i) => `<div class="rc-li"><span class="rc-mark">${el.listType === 'numbered' ? `${i + 1}.` : '•'}</span><span class="rc-li-text">${textHtml(it.text) || '<i class="rc-empty">(লেখা নেই)</i>'}</span></div>`).join('');
      parts.push(`<div class="rc-el rc-list" style="${base}height:${pct(h, H)}%;width:${pct(b.x1 - b.x0 + W * 0.02, W)}%;left:${pct(b.x0, W)}%">${items}</div>`);
    } else if (el.type === 'signature') {
      for (const p of el.people) {
        const pb = p.bbox;
        const w = pb.x1 - pb.x0 + W * 0.06;
        const l = Math.max(0, pb.x0 - W * 0.03);
        const lines = [p.name, p.designation, p.organization].filter(Boolean).map((t) => `<div>${escapeHtml(t)}</div>`).join('');
        let img = '';
        if (p.signatureImage && p.signatureInk) {
          const s = p.signatureInk;
          img = `<img class="rc-sig-img" alt="স্বাক্ষর" src="${p.signatureImage}" style="left:${pct(s.x0, W)}%;top:${pct(s.y0, H)}%;width:${pct(s.x1 - s.x0, W)}%;height:${pct(s.y1 - s.y0, H)}%">`;
        }
        parts.push(`${img}<div class="rc-el rc-sig" style="left:${pct(l, W)}%;top:${pct(pb.y0, H)}%;width:${pct(w, W)}%;font-size:${fs}cqw">${lines || '<i class="rc-empty">(লেখা নেই)</i>'}</div>`);
      }
    } else {
      const cls = `rc-el rc-${el.type}${el.bold ? ' is-bold' : ''}`;
      parts.push(`<div class="${cls}" style="${base}text-align:${el.align === 'justify' ? 'justify' : el.align}">${textHtml(el.text) || '<i class="rc-empty">(লেখা নেই)</i>'}</div>`);
    }
  }
  return parts.join('');
}

export { buildPageModel };
