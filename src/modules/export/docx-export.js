// Word (.docx) তৈরি: সম্পাদিত Document → আসল Word ফাইল (সম্পাদনাযোগ্য লেখা ও আসল Word টেবিল)।
// কোনো বাইরের লাইব্রেরি নেই: সরাসরি OOXML লিখে ZIP করা হয়; তাই এখানে Node-এ পরীক্ষা করা যায়।
import { createZip, dataUrlToBytes } from './zip-writer.js';
import { pageSetup, firstFontName, colorToHex, cleanXmlText, FONT_FACTOR } from './export-model.js';
import { alignFor } from '../reconstruction/table-reconstruction.js';

const tw = (pt) => Math.max(0, Math.round(pt * 20)); // Point → twip
const esc = (t) => cleanXmlText(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const JC = { left: 'left', center: 'center', right: 'right', justify: 'both' };
const LINE = 1.4; // লাইনের উচ্চতা = ফন্ট × এই সংখ্যা (Exact, তাই হিসাব স্থির)

function rPr({ font, pt, bold, italic, color }) {
  const f = esc(font);
  const sz = Math.max(2, Math.round(pt * 2));
  return `<w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/>${bold ? '<w:b/><w:bCs/>' : ''}${italic ? '<w:i/><w:iCs/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="bn-BD" w:bidi="bn-BD"/></w:rPr>`;
}

/** লাইনগুলো (\n দিয়ে আলাদা) একটি অনুচ্ছেদের Run-এ */
function runs(text, rp) {
  const props = rPr(rp);
  const lines = cleanXmlText(text).split('\n');
  return lines.map((ln, i) => {
    const parts = ln.split('\t');
    const body = parts.map((p, k) => `${k ? '<w:tab/>' : ''}${p ? `<w:t xml:space="preserve">${esc(p)}</w:t>` : ''}`).join('');
    return `<w:r>${props}${i ? '<w:br/>' : ''}${body}</w:r>`;
  }).join('');
}

function para(text, o) {
  const sp = [];
  sp.push(`w:before="${Math.min(31680, tw(o.before || 0))}"`, `w:after="${tw(o.after || 0)}"`);
  if (o.line) sp.push(`w:line="${tw(o.line)}"`, 'w:lineRule="exact"');
  const ind = [];
  if (o.indL) ind.push(`w:left="${tw(o.indL)}"`);
  if (o.indR) ind.push(`w:right="${tw(o.indR)}"`);
  if (o.hanging) ind.push(`w:hanging="${tw(o.hanging)}"`);
  const tabs = o.tabAt ? `<w:tabs><w:tab w:val="left" w:pos="${tw(o.tabAt)}"/></w:tabs>` : '';
  const pPr = `<w:pPr><w:keepLines/>${tabs}<w:spacing ${sp.join(' ')}/>${ind.length ? `<w:ind ${ind.join(' ')}/>` : ''}<w:jc w:val="${JC[o.align] || 'left'}"/>${o.sect || ''}</w:pPr>`;
  return `<w:p>${pPr}${text === null ? '' : runs(text, o.rp)}${o.raw || ''}</w:p>`;
}

/** খালি ফাঁক (উচ্চতা = pt) — টেবিলের আগে-পরে দূরত্ব রাখতে */
function spacer(pt, sect = '') {
  const h = Math.max(1, pt);
  const rp = { font: 'Arial', pt: 1 };
  return `<w:p><w:pPr><w:keepLines/><w:spacing w:before="0" w:after="0" w:line="${tw(h)}" w:lineRule="exact"/>${sect}</w:pPr><w:r>${rPr(rp)}</w:r></w:p>`;
}

function emu(pt) { return Math.round(pt * 12700); }

function drawing(rid, id, wPt, hPt, name) {
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${emu(wPt)}" cy="${emu(hPt)}"/><wp:docPr id="${id}" name="${esc(name)}" descr="স্বাক্ষর"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(wPt)}" cy="${emu(hPt)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

const bdr = (kind, sz) => (kind === 'none' ? '<w:{n} w:val="nil"/>' : `<w:{n} w:val="single" w:sz="${sz}" w:space="0" w:color="000000"/>`);
function tblBorders(kind) {
  if (kind === 'none') return `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((n) => `<w:${n} w:val="nil"/>`).join('')}</w:tblBorders>`;
  const sz = kind === 'thick' ? 18 : 6;
  return `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((n) => `<w:${n} w:val="single" w:sz="${sz}" w:space="0" w:color="000000"/>`).join('')}</w:tblBorders>`;
}

/** আসল Word টেবিল। ফেরত: { xml, height (Point) } */
function tableXml(el, ctx) {
  const { lay, fontOf } = ctx;
  const t = el.table; const g = t.grid;
  const colEdges = g.colEdges && g.colEdges.length === g.nCols + 1 ? g.colEdges : Array.from({ length: g.nCols + 1 }, (_, i) => t.bbox.x0 + ((t.bbox.x1 - t.bbox.x0) * i) / g.nCols);
  const rowEdges = g.rowEdges && g.rowEdges.length === g.nRows + 1 ? g.rowEdges : Array.from({ length: g.nRows + 1 }, (_, i) => t.bbox.y0 + ((t.bbox.y1 - t.bbox.y0) * i) / g.nRows);
  const colW = Array.from({ length: g.nCols }, (_, i) => lay.L(colEdges[i + 1] - colEdges[i]));
  const rowH = Array.from({ length: g.nRows }, (_, i) => lay.L(rowEdges[i + 1] - rowEdges[i]));
  const total = colW.reduce((s, v) => s + v, 0);
  const border = (g.style && g.style.border) || (t.ruled ? 'thin' : 'none');
  const fpt = (g.style && g.style.fontPt) || el.fontSize * lay.S * FONT_FACTOR;
  const fam = (g.style && firstFontName(g.style.fontFamily)) || ctx.font;
  const indent = Math.max(0, lay.X(el.bbox.x0) - lay.margins.left);
  const lineH = fpt * LINE;
  const aligns = Array.from({ length: g.nCols }, (_, c) => alignFor(g, c));

  let xml = `<w:tbl><w:tblPr><w:tblW w:w="${tw(total)}" w:type="dxa"/><w:tblInd w:w="${tw(indent)}" w:type="dxa"/>${tblBorders(border)}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="${tw(2)}" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="${tw(2)}" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr>`;
  xml += `<w:tblGrid>${colW.map((w) => `<w:gridCol w:w="${tw(w)}"/>`).join('')}</w:tblGrid>`;
  for (let r = 0; r < g.nRows; r++) {
    const head = r < g.headerRows;
    xml += `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${tw(rowH[r])}" w:hRule="atLeast"/>${head ? '<w:tblHeader/>' : ''}</w:trPr>`;
    for (let c = 0; c < g.nCols; c++) {
      const cell = g.cells.find((x) => c >= x.c && c < x.c + x.colSpan && r >= x.r && r < x.r + x.rowSpan);
      if (!cell) { xml += `<w:tc><w:tcPr><w:tcW w:w="${tw(colW[c])}" w:type="dxa"/></w:tcPr>${spacer(1)}</w:tc>`; continue; }
      if (cell.c !== c) continue; // বাঁ দিকের জোড়া ঘরের অংশ
      let w = 0;
      for (let k = 0; k < cell.colSpan; k++) w += colW[Math.min(c + k, g.nCols - 1)];
      const first = cell.r === r;
      const fill = colorToHex(cell.bg);
      const align = cell.align || (head ? 'center' : aligns[Math.min(c, g.nCols - 1)]);
      const tcPr = `<w:tcPr><w:tcW w:w="${tw(w)}" w:type="dxa"/>${cell.colSpan > 1 ? `<w:gridSpan w:val="${cell.colSpan}"/>` : ''}${cell.rowSpan > 1 ? `<w:vMerge${first ? ' w:val="restart"' : ''}/>` : ''}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>`;
      const text = first ? (cell.text || '') : '';
      xml += `<w:tc>${tcPr}${para(text, { align, line: lineH, rp: { font: fam, pt: fpt, bold: head } })}</w:tc>`;
    }
    xml += '</w:tr>';
  }
  xml += '</w:tbl>';
  return { xml, height: Math.max(rowH.reduce((s, v) => s + v, 0), lineH * g.nRows) };
}

/** স্বাক্ষরের স্থান: দুটি/তিনটি স্বাক্ষর পাশাপাশি = রেখাহীন (Border-ছাড়া) টেবিল */
function signatureXml(el, ctx) {
  const { lay, st, font, addImage } = ctx;
  const pt = st.pt;
  const lineH = pt * LINE;
  const people = el.people.slice().sort((a, b) => a.bbox.x0 - b.bbox.x0);
  const slack = lay.Wpt * 0.03;
  const cols = [];
  let cursorX = lay.margins.left;
  for (const p of people) {
    let start = Math.max(cursorX, lay.X(p.bbox.x0) - slack);
    let end = lay.X(p.bbox.x1) + slack;
    if (end - start < 20) end = start + 20;
    if (start > cursorX + 0.5) cols.push({ gap: true, w: start - cursorX });
    cols.push({ gap: false, w: end - start, p });
    cursorX = end;
  }
  const total = cols.reduce((s, c) => s + c.w, 0);
  const rowTop = Math.min(...people.map((p) => lay.Y(p.bbox.y0)));
  let maxH = 0;
  const cells = cols.map((c) => {
    if (c.gap) return `<w:tc><w:tcPr><w:tcW w:w="${tw(c.w)}" w:type="dxa"/></w:tcPr>${spacer(1)}</w:tc>`;
    const p = c.p;
    let inner = '';
    let used = 0;
    const img = p.signatureImage && p.signatureInk ? addImage(p.signatureImage) : null;
    if (img) {
      const s = p.signatureInk;
      const wPt = Math.max(8, lay.L(s.x1 - s.x0));
      const hPt = Math.max(8, lay.L(s.y1 - s.y0));
      const before = Math.max(0, lay.Y(s.y0) - rowTop);
      inner += `<w:p><w:pPr><w:keepLines/><w:spacing w:before="${tw(before)}" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>${drawing(img.rid, img.id, wPt, hPt, 'স্বাক্ষর')}</w:p>`;
      used = before + hPt;
    }
    const lines = [p.name, p.designation, p.organization].filter(Boolean);
    const startText = Math.max(0, lay.Y(p.bbox.y0) - rowTop - used);
    lines.forEach((ln, i) => {
      inner += para(ln, { align: 'center', line: lineH, before: i === 0 ? (img ? 0 : startText) : 0, rp: { font: st.font || font, pt, bold: st.bold, italic: st.italic, color: st.color } });
    });
    if (!inner) inner = spacer(1);
    maxH = Math.max(maxH, used + (img ? 0 : startText) + lines.length * lineH);
    return `<w:tc><w:tcPr><w:tcW w:w="${tw(c.w)}" w:type="dxa"/></w:tcPr>${inner}</w:tc>`;
  });
  const xml = `<w:tbl><w:tblPr><w:tblW w:w="${tw(total)}" w:type="dxa"/><w:tblInd w:w="0" w:type="dxa"/>${tblBorders('none')}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>${cols.map((c) => `<w:gridCol w:w="${tw(c.w)}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.join('')}</w:tr></w:tbl>`;
  return { xml, top: rowTop, height: maxH };
}

function textStyleOf(el, lay, font) {
  const s = el.style || {};
  const pt = s.fontSize || el.fontSize * lay.S * FONT_FACTOR;
  return {
    pt,
    font: firstFontName(s.fontFamily) || font,
    bold: s.bold === undefined ? el.bold : s.bold,
    italic: !!s.italic,
    color: colorToHex(s.color),
    align: s.align || el.align
  };
}

function sectXml(lay, hfIds, page) {
  const e = page.edit || {};
  const mg = lay.margins;
  const explicitB = e.margins && Number.isFinite(e.margins.bottom);
  const bottom = explicitB ? mg.bottom : Math.max(14, mg.bottom * 0.5);
  const refs = hfIds ? `<w:headerReference w:type="default" r:id="${hfIds.h}"/><w:footerReference w:type="default" r:id="${hfIds.f}"/>` : '';
  const land = lay.Wpt > lay.pageH ? ' w:orient="landscape"' : '';
  return `<w:sectPr>${refs}<w:pgSz w:w="${tw(lay.Wpt)}" w:h="${tw(lay.pageH)}"${land}/><w:pgMar w:top="${tw(mg.top)}" w:right="${tw(mg.right)}" w:bottom="${tw(bottom)}" w:left="${tw(mg.left)}" w:header="${tw(Math.max(4, mg.top * 0.35))}" w:footer="${tw(Math.max(4, bottom * 0.3))}" w:gutter="0"/></w:sectPr>`;
}

function hfPart(kind, text, withPageNo, font, pt) {
  const tag = kind === 'h' ? 'hdr' : 'ftr';
  const rp = { font, pt };
  let body;
  if (!text && !withPageNo) body = spacer(1);
  else {
    const field = withPageNo ? `<w:r>${rPr(rp)}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rPr(rp)}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>${rPr(rp)}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${rPr(rp)}<w:t>1</w:t></w:r><w:r>${rPr(rp)}<w:fldChar w:fldCharType="end"/></w:r>` : '';
    body = para(text ? `${text}${withPageNo ? ' ' : ''}` : '', { align: 'center', rp, raw: field });
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${tag} ${NS}>${body}</w:${tag}>`;
}

/**
 * pages: [{ pageNum, size, analysis, edit }]
 * opts: { font: 'Nirmala UI', title }
 * ফেরত: Promise<Uint8Array> (.docx)
 */
export async function buildDocx(pages, opts = {}) {
  const font = opts.font || 'Nirmala UI';
  const ok = pages.filter((p) => p.analysis);
  if (!ok.length) throw new Error('Export করার মতো বিশ্লেষিত পৃষ্ঠা নেই।');
  const media = []; const rels = []; let rid = 10; let imgId = 1;
  const addImage = (dataUrl) => {
    const d = dataUrlToBytes(dataUrl);
    if (!d || !/^image\/(png|jpeg)$/.test(d.mime)) return null;
    const ext = d.mime === 'image/png' ? 'png' : 'jpeg';
    const name = `image${imgId}.${ext}`;
    media.push({ name: `word/media/${name}`, data: d.bytes });
    const id = `rId${rid++}`;
    rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
    return { rid: id, id: imgId++ };
  };
  const needHF = ok.some((p) => p.edit && (p.edit.header || p.edit.footer || p.edit.pageNo));
  const parts = []; const hfFiles = [];
  let bodyXml = '';

  ok.forEach((page, pi) => {
    const { model, lay } = pageSetup(page);
    const e = page.edit || {};
    const els = model.elements.slice().sort((a, b) => lay.Y(a.bbox.y0) - lay.Y(b.bbox.y0) || a.bbox.x0 - b.bbox.x0);
    let cursor = lay.margins.top;
    const chunks = [];
    const ctxBase = { lay, font, addImage };

    for (const el of els) {
      const b = el.bbox;
      const top = lay.Y(b.y0);
      const st = textStyleOf(el, lay, font);
      const gap = () => Math.max(0, top - cursor);

      if (el.type === 'table' && el.table && el.table.grid) {
        const t = tableXml(el, { ...ctxBase });
        chunks.push(spacer(gap()), t.xml);
        cursor = Math.max(cursor, top) + t.height;
      } else if (el.type === 'signature') {
        const s = signatureXml(el, { ...ctxBase, st });
        chunks.push(spacer(Math.max(0, s.top - cursor)), s.xml);
        cursor = Math.max(cursor, s.top) + s.height;
      } else if (el.type === 'list') {
        const lineH = st.pt * LINE;
        const hang = Math.max(st.pt * 1.2, 10);
        const indL = Math.max(0, lay.X(b.x0) - lay.margins.left);
        el.items.forEach((it, i) => {
          const itop = lay.Y(it.bbox ? it.bbox.y0 : b.y0);
          const before = Math.max(0, itop - cursor);
          const mark = el.listType === 'numbered' ? `${i + 1}.` : '•';
          chunks.push(para(`${mark}\t${it.text || ''}`, { before, line: lineH, indL: indL + hang, hanging: hang, tabAt: indL + hang, align: 'left', rp: { font: st.font, pt: st.pt, bold: st.bold, italic: st.italic, color: st.color } }));
          cursor = Math.max(cursor, itop) + lineH;
        });
      } else {
        const text = el.text || '';
        const nl = text.split('\n').length;
        const multi = el.type === 'paragraph' && nl > 1;
        const bboxH = lay.L(b.y1 - b.y0);
        const lineH = multi ? Math.max(st.pt * 1.25, bboxH / nl) : st.pt * LINE;
        const slack = st.align === 'center' ? lay.Wpt * 0.03 : lay.Wpt * 0.015;
        const indL = Math.max(0, lay.X(b.x0) - lay.margins.left - slack);
        const indR = Math.max(0, lay.Wpt - lay.margins.right - lay.X(b.x1) - slack);
        chunks.push(para(text, { before: gap(), line: lineH, indL, indR, align: st.align, rp: { font: st.font, pt: st.pt, bold: st.bold, italic: st.italic, color: st.color } }));
        cursor = Math.max(cursor, top) + (el.type === 'paragraph' ? Math.max(nl * lineH, bboxH) : nl * lineH);
      }
    }

    let hfIds = null;
    if (needHF) {
      const hn = pi + 1;
      const hid = `rId${rid++}`; const fid = `rId${rid++}`;
      rels.push(`<Relationship Id="${hid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header${hn}.xml"/>`);
      rels.push(`<Relationship Id="${fid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer${hn}.xml"/>`);
      const hpt = Math.max(6, model.bodySize * lay.S * 0.8);
      hfFiles.push({ name: `word/header${hn}.xml`, data: hfPart('h', e.header || '', false, font, hpt) });
      hfFiles.push({ name: `word/footer${hn}.xml`, data: hfPart('f', e.footer || '', !!e.pageNo, font, hpt) });
      hfIds = { h: hid, f: fid };
    }
    const sect = sectXml(lay, hfIds, page);
    const last = pi === ok.length - 1;
    if (last) {
      chunks.push(spacer(1));
      parts.push(chunks.join('') + sect);
    } else {
      chunks.push(spacer(1, sect));
      parts.push(chunks.join(''));
    }
  });
  bodyXml = parts.join('');

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${bodyXml}</w:body></w:document>`;
  const f = esc(font);
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="bn-BD" w:bidi="bn-BD"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
  const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  const hasPng = media.some((m) => m.name.endsWith('.png')); const hasJpg = media.some((m) => m.name.endsWith('.jpeg'));
  const ctypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${hasPng ? '<Default Extension="png" ContentType="image/png"/>' : ''}${hasJpg ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${hfFiles.map((h) => `<Override PartName="/${h.name}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${h.name.includes('header') ? 'header' : 'footer'}+xml"/>`).join('')}</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${rels.join('')}</Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(opts.title || 'বাংলা OCR Studio')}</dc:title><dc:creator>বাংলা OCR Studio</dc:creator></cp:coreProperties>`;

  return createZip([
    { name: '[Content_Types].xml', data: ctypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'word/document.xml', data: docXml },
    { name: 'word/styles.xml', data: stylesXml },
    { name: 'word/settings.xml', data: settingsXml },
    { name: 'word/_rels/document.xml.rels', data: docRels },
    { name: 'docProps/core.xml', data: core },
    ...hfFiles,
    ...media
  ], { compress: opts.compress !== false });
}

/** সাধারণ লেখা (Text OCR-এর ফল) → Word। প্রতিটি লাইন একটি অনুচ্ছেদ; Tab থাকলে Tab-ই থাকে। */
export async function textToDocx(text, opts = {}) {
  const font = opts.font || 'Nirmala UI';
  const pt = opts.pt || 12;
  const paras = String(text || '').replace(/\r\n?/g, '\n').split('\n').map((ln) => para(ln, { line: pt * 1.5, after: 2, align: 'left', rp: { font, pt } })).join('');
  const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>';
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${paras}${sect}</w:body></w:document>`;
  const f = esc(font);
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="bn-BD" w:bidi="bn-BD"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
  return createZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', data: docXml },
    { name: 'word/styles.xml', data: stylesXml },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' }
  ], { compress: opts.compress !== false });
}
