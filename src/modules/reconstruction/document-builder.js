// পুনর্গঠিত Document আঁকা: পৃষ্ঠার মডেল → মূল পৃষ্ঠার মতো সাজানো HTML।
// সব মাপ পৃষ্ঠার প্রস্থ/উচ্চতার শতাংশে (cqw/cqh), তাই যেকোনো পর্দায় ও Zoom-এ আনুপাতিক থাকে।
// edit=true হলে লেখা ও টেবিলের ঘর Edit করার উপযোগী (contenteditable) হয়।
import { escapeHtml } from '../../utils/helpers.js';
import { tableToHtml } from './table-reconstruction.js';
import { buildPageModel, computeLayout, FONT_FACTOR } from './layout-reconstruction.js';

export const FONT_FAMILIES = [
  ['', 'পৃষ্ঠার সাধারণ ফন্ট'],
  ['"Noto Sans Bengali", sans-serif', 'Noto Sans Bengali'],
  ['"Kalpurush", "SolaimanLipi", "Noto Sans Bengali", sans-serif', 'Kalpurush / SolaimanLipi'],
  ['"Nirmala UI", "Noto Sans Bengali", sans-serif', 'Nirmala UI'],
  ['"Times New Roman", "Noto Serif Bengali", serif', 'Times New Roman'],
  ['Arial, "Noto Sans Bengali", sans-serif', 'Arial'],
  ['"Courier New", monospace', 'Courier New']
];

const round = (n) => Math.round(n * 1000) / 1000;
const pctW = (v, lay) => round((v / lay.Wpt) * 100);
const pctH = (v, lay) => round((v / lay.Hpt) * 100);
const textHtml = (t) => escapeHtml(t || '').replace(/\n/g, '<br>');

function styleOf(el, lay) {
  const st = el.style || {};
  const defPt = el.fontSize * lay.S * FONT_FACTOR;
  const pt = st.fontSize || defPt;
  const css = [`font-size:${round((pt / lay.Wpt) * 100)}cqw`];
  if (st.fontFamily) css.push(`font-family:${st.fontFamily}`);
  if (st.color) css.push(`color:${st.color}`);
  const bold = st.bold === undefined ? el.bold : st.bold;
  if (bold) css.push('font-weight:700'); else if (st.bold === false) css.push('font-weight:400');
  if (st.italic) css.push('font-style:italic');
  const align = st.align || el.align;
  css.push(`text-align:${align === 'justify' ? 'justify' : align}`);
  return { css: css.join(';'), pt };
}

/**
 * ফেরত: { html, layout }
 * opts: { edit }
 */
export function renderPage(page, opts = {}) {
  const edit = !!opts.edit;
  const m = buildPageModel(page);
  const lay = computeLayout(page, m);
  const e = page.edit || {};
  const parts = [];
  const ced = edit ? ' contenteditable="true" spellcheck="false"' : '';

  // পৃষ্ঠার Margin-এর সীমারেখা (শুধু সম্পাদনার সময়)
  if (edit) {
    parts.push(`<div class="rc-margin" style="left:${pctW(lay.margins.left, lay)}%;top:${pctH(lay.margins.top, lay)}%;right:${pctW(lay.margins.right, lay)}%;bottom:${pctH(lay.margins.bottom, lay)}%"></div>`);
  }

  m.elements.forEach((el) => {
    const b = el.bbox;
    const { css } = styleOf(el, lay);
    const slack = el.align === 'center' || el.type === 'signature' ? lay.Wpt * 0.03 : 0;
    const x0 = lay.X(b.x0);
    const left = Math.max(0, x0 - slack);
    const width = Math.min(lay.Wpt - left, lay.L(b.x1 - b.x0) + slack * 2 + (el.align === 'left' ? lay.Wpt * 0.02 : 0));
    const pos = `left:${pctW(left, lay)}%;top:${pctH(lay.Y(b.y0), lay)}%;width:${pctW(width, lay)}%;`;
    const nowrap = el.type !== 'paragraph';
    const id = `data-id="${el.id}"`;

    if (el.type === 'table') {
      const ti = el.block.tableIndex;
      const g = el.table.grid;
      const fpt = (g && g.style && g.style.fontPt) || el.fontSize * lay.S * FONT_FACTOR;
      parts.push(`<div class="rc-el rc-table-wrap" ${id} data-kind="table" style="left:${pctW(lay.X(b.x0), lay)}%;top:${pctH(lay.Y(b.y0), lay)}%;width:${pctW(lay.L(b.x1 - b.x0), lay)}%;font-size:${round((fpt / lay.Wpt) * 100)}cqw${g && g.style && g.style.fontFamily ? `;font-family:${g.style.fontFamily}` : ''}">${tableToHtml(el.table, { S: lay.S, Hpt: lay.Hpt, edit, ti })}</div>`);
    } else if (el.type === 'list') {
      const h = lay.L(b.y1 - b.y0);
      const items = el.items.map((it, i) => `<div class="rc-li"><span class="rc-mark">${el.listType === 'numbered' ? `${i + 1}.` : '•'}</span><span class="rc-li-text rc-fit"${ced} data-id="${el.id}" data-item="${i}">${textHtml(it.text)}</span></div>`).join('');
      parts.push(`<div class="rc-el rc-list" ${id} data-kind="list" style="${css};left:${pctW(lay.X(b.x0), lay)}%;top:${pctH(lay.Y(b.y0), lay)}%;width:${pctW(lay.L(b.x1 - b.x0) + lay.Wpt * 0.02, lay)}%;height:${pctH(h, lay)}%">${items}</div>`);
    } else if (el.type === 'signature') {
      el.people.forEach((p, pi) => {
        const pb = p.bbox;
        const w = lay.L(pb.x1 - pb.x0) + lay.Wpt * 0.06;
        const l = Math.max(0, lay.X(pb.x0) - lay.Wpt * 0.03);
        const fields = [['name', p.name], ['designation', p.designation], ['organization', p.organization]];
        const lines = fields.filter(([, v]) => edit || v).map(([k, v]) => `<div class="rc-fit"${ced} data-id="${el.id}" data-p="${pi}" data-f="${k}">${escapeHtml(v || '')}</div>`).join('');
        let img = '';
        if (p.signatureImage && p.signatureInk) {
          const s = p.signatureInk;
          img = `<img class="rc-sig-img" alt="স্বাক্ষর" src="${p.signatureImage}" style="left:${pctW(lay.X(s.x0), lay)}%;top:${pctH(lay.Y(s.y0), lay)}%;width:${pctW(lay.L(s.x1 - s.x0), lay)}%;height:${pctH(lay.L(s.y1 - s.y0), lay)}%">`;
        }
        parts.push(`${img}<div class="rc-el rc-sig" ${id} data-kind="signature" style="${css};left:${pctW(l, lay)}%;top:${pctH(lay.Y(pb.y0), lay)}%;width:${pctW(w, lay)}%">${lines}</div>`);
      });
    } else {
      const cls = ['rc-el', `rc-${el.type}`, nowrap ? 'rc-nowrap rc-fit' : ''].join(' ');
      parts.push(`<div class="${cls}" ${id} data-kind="text" style="${pos}${css}"${ced}>${textHtml(el.text)}</div>`);
    }
  });

  // নিজের যোগ করা Header / Footer / পৃষ্ঠা নম্বর
  const hf = (txt, top) => `<div class="rc-el rc-hf rc-nowrap rc-fit" style="left:${pctW(lay.margins.left, lay)}%;width:${pctW(lay.Wpt - lay.margins.left - lay.margins.right, lay)}%;${top ? `top:${pctH(Math.max(4, lay.margins.top * 0.35), lay)}%` : `bottom:${pctH(Math.max(4, lay.margins.bottom * 0.3), lay)}%`};font-size:${round(((m.bodySize * lay.S * 0.8) / lay.Wpt) * 100)}cqw;text-align:center">${escapeHtml(txt)}</div>`;
  const pn = e.pageNo ? ` ${page.pageNum}` : '';
  if (e.header) parts.push(hf(e.header, true));
  if (e.footer || e.pageNo) parts.push(hf(`${e.footer || ''}${pn}`.trim(), false));

  return { html: parts.join(''), layout: lay };
}

// সাধারণ ব্যবহারের জন্য (শুধু HTML)
export function renderPageHtml(page) { return renderPage(page, {}).html; }

/**
 * লেখা ঘর/লাইনে না ধরলে ফন্ট ছোট করে বসানো। (ব্রাউজারের ফন্ট মূল ফন্টের চেয়ে চওড়া হলে লেখা ভাঙে না।)
 * container = .rc-page; পৃষ্ঠা দৃশ্যমান থাকা অবস্থায় ডাকতে হবে।
 */
export function fitPage(container) {
  const cw = container.clientWidth;
  if (!cw) return;
  const px2cq = 100 / cw;
  const squeeze = (el, minRatio) => {
    if (el.scrollWidth <= el.clientWidth + 1) return true;
    const ratio = Math.max(minRatio, (el.clientWidth / el.scrollWidth) * 0.98);
    const px = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = `${round(px * ratio * px2cq)}cqw`;
    return el.scrollWidth <= el.clientWidth + 1;
  };
  container.querySelectorAll('.rc-fit').forEach((el) => { squeeze(el, 0.5); });
  // টেবিলের ঘর: এক লাইনে ধরাতে চেষ্টা; তবুও না ধরলে লাইন ভাঙতে দেওয়া হয়
  container.querySelectorAll('.rc-cell').forEach((el) => {
    el.style.whiteSpace = 'nowrap';
    if (!squeeze(el, 0.62)) el.style.whiteSpace = 'normal';
  });
}
