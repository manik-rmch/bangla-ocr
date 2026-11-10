// Excel (.xlsx) তৈরি: প্রতিটি টেবিল একটি Sheet; জোড়া ঘর, শেডিং, Border, কলামের প্রস্থ, সারির উচ্চতা, হেডার Freeze।
// সব ঘর লেখা (Text) হিসেবে রাখা হয়: "০১/১১/২০২৬" বা "007"-এর মতো মান যেন নিজে নিজে বদলে না যায়।
import { createZip } from './zip-writer.js';
import { pageSetup, firstFontName, colorToHex, cleanXmlText, tableMatrix, FONT_FACTOR } from './export-model.js';

const esc = (t) => cleanXmlText(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function colLetter(i) { // 0 → A
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Sheet-এর নাম: ৩১ অক্ষরের মধ্যে, নিষিদ্ধ চিহ্নহীন, অনন্য */
export function sheetName(raw, used) {
  let base = String(raw).replace(/[\[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  let name = base; let k = 2;
  while (used.has(name.toLowerCase())) { const suf = ` (${k++})`; name = base.slice(0, 31 - suf.length) + suf; }
  used.add(name.toLowerCase());
  return name;
}

class Styles {
  constructor(font) {
    this.font = font;
    this.fonts = [{ b: false, i: false, sz: 11, name: font, color: null }];
    this.fills = [null, null]; // ০ = none, ১ = gray125 (Excel-এর নিয়ম)
    this.borders = ['none'];
    this.xfs = [{ font: 0, fill: 0, border: 0, h: null }];
    this.cache = new Map();
  }
  idx(list, v, eq) { const k = list.findIndex((x) => eq(x, v)); if (k >= 0) return k; list.push(v); return list.length - 1; }
  get({ b = false, i = false, sz = 11, name, color = null, fill = null, border = 'none', h = null }) {
    const key = JSON.stringify([b, i, sz, name, color, fill, border, h]);
    if (this.cache.has(key)) return this.cache.get(key);
    const f = this.idx(this.fonts, { b, i, sz, name: name || this.font, color }, (x, y) => JSON.stringify(x) === JSON.stringify(y));
    const fl = fill ? this.idx(this.fills, fill, (x, y) => x === y) : 0;
    const bd = this.idx(this.borders, border, (x, y) => x === y);
    const xf = this.idx(this.xfs, { font: f, fill: fl, border: bd, h }, (x, y) => JSON.stringify(x) === JSON.stringify(y));
    this.cache.set(key, xf);
    return xf;
  }
  xml() {
    const fonts = this.fonts.map((f) => `<font>${f.b ? '<b/>' : ''}${f.i ? '<i/>' : ''}<sz val="${f.sz}"/>${f.color ? `<color rgb="FF${f.color}"/>` : ''}<name val="${esc(f.name)}"/><family val="2"/></font>`).join('');
    const fills = this.fills.map((f, i) => (i === 0 ? '<fill><patternFill patternType="none"/></fill>' : i === 1 && !f ? '<fill><patternFill patternType="gray125"/></fill>' : `<fill><patternFill patternType="solid"><fgColor rgb="FF${f}"/><bgColor indexed="64"/></patternFill></fill>`)).join('');
    const side = (n, st) => (st ? `<${n} style="${st}"><color auto="1"/></${n}>` : `<${n}/>`);
    const borders = this.borders.map((k) => {
      const st = k === 'none' ? null : k === 'thick' ? 'medium' : 'thin';
      return `<border>${side('left', st)}${side('right', st)}${side('top', st)}${side('bottom', st)}<diagonal/></border>`;
    }).join('');
    const xfs = this.xfs.map((x) => `<xf numFmtId="49" fontId="${x.font}" fillId="${x.fill}" borderId="${x.border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"${x.h ? ` horizontal="${x.h}"` : ''} wrapText="1"/></xf>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${this.fonts.length}">${fonts}</fonts><fills count="${this.fills.length}">${fills}</fills><borders count="${this.borders.length}">${borders}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

function cellXml(ref, text, s) {
  if (text === '' || text == null) return `<c r="${ref}" s="${s}"/>`;
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
}

function tableSheet(el, lay, styles, font) {
  const g = el.table.grid;
  const colEdges = g.colEdges && g.colEdges.length === g.nCols + 1 ? g.colEdges : null;
  const rowEdges = g.rowEdges && g.rowEdges.length === g.nRows + 1 ? g.rowEdges : null;
  const fpt = (g.style && g.style.fontPt) || el.fontSize * lay.S * FONT_FACTOR;
  const sz = Math.max(8, Math.min(24, Math.round(fpt)));
  const fam = (g.style && firstFontName(g.style.fontFamily)) || font;
  const border = (g.style && g.style.border) || (el.table.ruled ? 'thin' : 'none');
  const grid = Array.from({ length: g.nRows }, () => Array.from({ length: g.nCols }, () => null));
  const merges = [];
  for (const c of g.cells) {
    if (c.r >= g.nRows || c.c >= g.nCols) continue;
    grid[c.r][c.c] = c;
    if (c.rowSpan > 1 || c.colSpan > 1) merges.push(`${colLetter(c.c)}${c.r + 1}:${colLetter(Math.min(g.nCols, c.c + c.colSpan) - 1)}${Math.min(g.nRows, c.r + c.rowSpan)}`);
  }
  // কোন ঘর কোন জোড়া ঘরের অংশ — বর্ডার/রং সবগুলোতে বসাতে
  const owner = new Map();
  for (const c of g.cells) for (let r = c.r; r < c.r + c.rowSpan; r++) for (let k = c.c; k < c.c + c.colSpan; k++) owner.set(`${r},${k}`, c);
  const rows = [];
  for (let r = 0; r < g.nRows; r++) {
    const head = r < g.headerRows;
    const ht = rowEdges ? Math.max(12, Math.round(lay.L(rowEdges[r + 1] - rowEdges[r]) * 100) / 100) : 0;
    let cs = '';
    for (let c = 0; c < g.nCols; c++) {
      const o = owner.get(`${r},${c}`);
      const own = grid[r][c];
      const src = o || own;
      const s = styles.get({ b: head, sz, name: fam, fill: src ? colorToHex(src.bg) : null, border, h: src && src.align && src.align !== 'justify' ? src.align : head ? 'center' : null });
      cs += cellXml(`${colLetter(c)}${r + 1}`, own ? own.text : '', s);
    }
    rows.push(`<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cs}</row>`);
  }
  const cols = Array.from({ length: g.nCols }, (_, i) => {
    const w = colEdges ? lay.L(colEdges[i + 1] - colEdges[i]) / 4.6 : 18;
    return `<col min="${i + 1}" max="${i + 1}" width="${Math.max(6, Math.min(80, Math.round(w * 100) / 100))}" customWidth="1"/>`;
  }).join('');
  const pane = g.headerRows > 0 ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${g.headerRows}" topLeftCell="A${g.headerRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData>${merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}</worksheet>`;
}

function textSheet(rowsData, styles) {
  const head = styles.get({ b: true });
  const norm = styles.get({});
  const rows = [['পৃষ্ঠা', 'ধরন', 'লেখা'], ...rowsData].map((r, i) => `<row r="${i + 1}">${r.map((v, c) => cellXml(`${colLetter(c)}${i + 1}`, String(v), i === 0 ? head : norm)).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="8" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/><col min="3" max="3" width="90" customWidth="1"/></cols><sheetData>${rows}</sheetData></worksheet>`;
}

const TYPE_BN = { title: 'শিরোনাম', subtitle: 'উপশিরোনাম', heading: 'শিরোনাম (Heading)', paragraph: 'অনুচ্ছেদ', list: 'তালিকা', signature: 'স্বাক্ষর', header: 'Header', footer: 'Footer' };

/** ফেরত: Promise<Uint8Array> (.xlsx) */
export async function buildXlsx(pages, opts = {}) {
  const font = opts.font || 'Nirmala UI';
  const ok = pages.filter((p) => p.analysis);
  if (!ok.length) throw new Error('Export করার মতো বিশ্লেষিত পৃষ্ঠা নেই।');
  const styles = new Styles(font);
  const sheets = []; const used = new Set();
  const textRows = [];
  for (const page of ok) {
    const { model, lay } = pageSetup(page);
    let ti = 0;
    for (const el of model.elements.slice().sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)) {
      if (el.type === 'table' && el.table && el.table.grid) {
        ti++;
        const nm = sheetName(ok.length > 1 ? `পৃষ্ঠা ${page.pageNum} টেবিল ${ti}` : `টেবিল ${ti}`, used);
        sheets.push({ name: nm, xml: tableSheet(el, lay, styles, font) });
      } else if (el.type === 'list') {
        textRows.push([page.pageNum, TYPE_BN.list, el.items.map((it, i) => `${el.listType === 'numbered' ? `${i + 1}.` : '•'} ${it.text}`).join('\n')]);
      } else if (el.type === 'signature') {
        textRows.push([page.pageNum, TYPE_BN.signature, el.people.map((p) => [p.name, p.designation, p.organization].filter(Boolean).join('\n')).join('\n\n')]);
      } else if (el.text) {
        textRows.push([page.pageNum, TYPE_BN[el.type] || el.type, el.text]);
      }
    }
  }
  if (textRows.length || !sheets.length) sheets.push({ name: sheetName('সব লেখা', used), xml: textSheet(textRows, styles) });

  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${ns}><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: styles.xml() },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: s.xml }))
  ];
  return createZip(files, { compress: opts.compress !== false });
}

export { tableMatrix };
