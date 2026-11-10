// HTML ও PDF (ছাপার মাধ্যমে): পুনর্গঠিত পৃষ্ঠাগুলো একটি স্বয়ংসম্পূর্ণ HTML ফাইলে।
// print=true হলে প্রতিটি পৃষ্ঠা কাগজের মাপে (Point) স্থির এবং @page দিয়ে কাগজের মাপ বলে দেওয়া হয়; তাই PDF-এ লেখা আসল লেখা থাকে (ছবি নয়)।
import { renderPage } from '../reconstruction/document-builder.js';
import { escapeHtml } from '../../utils/helpers.js';

const FONT_STACK = '"Nirmala UI", "Kalpurush", "SolaimanLipi", "Nikosh", "Vrinda", "Noto Sans Bengali", "Lohit Bengali", "FreeSans", sans-serif';

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:#e5e7eb;font-family:${FONT_STACK};color:#000}
.rc-page{position:relative;container-type:size;background:#fff;color:#000;overflow:hidden;line-height:1.35;margin:14px auto;box-shadow:0 1px 6px rgba(0,0,0,.25)}
.rc-el{position:absolute;margin:0;white-space:pre-wrap;word-break:break-word}
.rc-el.is-bold,.rc-table th{font-weight:700}
.rc-list{display:flex;flex-direction:column;justify-content:space-between}
.rc-li{display:flex;gap:.5em}
.rc-mark{flex:0 0 auto}
.rc-sig{line-height:1.5}
.rc-sig-img{position:absolute;object-fit:contain;mix-blend-mode:multiply}
.rc-table-wrap{position:absolute}
.rc-table{width:100%;table-layout:fixed;border-collapse:collapse}
.rc-cell{padding:0 .4em;vertical-align:middle;overflow:hidden;line-height:1.25;white-space:nowrap}
.rc-nowrap,.rc-sig div{white-space:nowrap}
.rc-li-text{flex:1 1 auto;min-width:0;white-space:nowrap}
.rc-table.bd-thin th,.rc-table.bd-thin td{border:.12cqw solid #000}
.rc-table.bd-thick th,.rc-table.bd-thick td{border:.35cqw solid #000}
.rc-table.bd-none th,.rc-table.bd-none td{border:0}
.rc-hf{color:#444}
.is-low,.is-pattern,.is-suggest{background:transparent!important}
@media print{body{background:#fff}.rc-page{margin:0;box-shadow:none;break-after:page;break-inside:avoid}.rc-page:last-child{break-after:auto}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

// fitPage-এর মতোই: লেখা ঘরে/লাইনে না ধরলে ফন্ট ছোট করা (সম্পাদনা-ছাড়া ফাইলে ব্যবহারের জন্য আলাদা ছোট কপি)
const FIT_JS = `
(function(){
function round(n){return Math.round(n*1000)/1000}
function fit(c){var cw=c.clientWidth;if(!cw)return;var k=100/cw;
function sq(el,min){if(el.scrollWidth<=el.clientWidth+1)return true;var r=Math.max(min,(el.clientWidth/el.scrollWidth)*0.98);var px=parseFloat(getComputedStyle(el).fontSize);el.style.fontSize=round(px*r*k)+'cqw';return el.scrollWidth<=el.clientWidth+1}
c.querySelectorAll('.rc-fit').forEach(function(e){sq(e,0.5)});
c.querySelectorAll('.rc-cell').forEach(function(e){e.style.whiteSpace='nowrap';if(!sq(e,0.62))e.style.whiteSpace='normal'})}
function run(){document.querySelectorAll('.rc-page').forEach(fit);document.documentElement.setAttribute('data-ready','1')}
if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){setTimeout(run,30)})}else{window.addEventListener('load',run)}
})();
`;

/**
 * pages: [{ pageNum, size, analysis, edit }]
 * opts: { title, print }
 * ফেরত: পুরো HTML লেখা
 */
export function buildHtmlDocument(pages, opts = {}) {
  const ok = pages.filter((p) => p.analysis);
  if (!ok.length) throw new Error('Export করার মতো বিশ্লেষিত পৃষ্ঠা নেই।');
  const print = !!opts.print;
  const rules = []; const body = [];
  ok.forEach((page, i) => {
    const { html, layout } = renderPage(page, { edit: false });
    const W = Math.round(layout.Wpt * 100) / 100;
    const H = Math.round(layout.Hpt * 100) / 100;
    rules.push(`@page p${i}{size:${W}pt ${H}pt;margin:0}`);
    const sizing = print ? `width:${W}pt;height:${H}pt` : `width:min(100%,${W}pt);aspect-ratio:${W}/${H}`;
    body.push(`<section class="rc-page" style="${sizing};page:p${i}" aria-label="পৃষ্ঠা ${page.pageNum}">${html}</section>`);
  });
  const printCss = print ? `${rules.join('')}@media screen{.rc-page{margin:10px auto}}` : `@media print{${rules.join('')}}`;
  return `<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title || 'বাংলা OCR Studio')}</title>
<style>${CSS}${printCss}</style></head>
<body>${body.join('\n')}
<script>${FIT_JS}</script></body></html>`;
}
