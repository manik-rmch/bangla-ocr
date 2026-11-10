// প্রান্তিক ও খারাপ ইনপুট পরীক্ষা: node --test tests/edge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzePage } from '../src/modules/document-ocr/document-analysis.js';
import { buildDocx } from '../src/modules/export/docx-export.js';
import { buildXlsx } from '../src/modules/export/xlsx-export.js';
import { buildHtmlDocument } from '../src/modules/export/html-export.js';
import { pagesToCsvFiles, tableToCsv } from '../src/modules/export/csv-export.js';
import { pagesToText } from '../src/modules/export/export-model.js';
import { createZip, crc32 } from '../src/modules/export/zip-writer.js';
import { renderPage } from '../src/modules/reconstruction/document-builder.js';
import { textToDocx } from '../src/modules/export/docx-export.js';
import * as te from '../src/modules/reconstruction/table-edit.js';

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/roster-analysis.json', import.meta.url), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const unzipText = async (zip, name) => { // store/deflate দুটোই পড়ে (Central Directory)
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22; while (dv.getUint32(end, true) !== 0x06054b50) end--;
  const n = dv.getUint16(end + 10, true); let p = dv.getUint32(end + 16, true);
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true); const csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true); const el = dv.getUint16(p + 30, true); const cl = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true); const nm = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nl));
    if (nm === name) {
      const lh = 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
      const body = zip.subarray(off + lh, off + lh + csize);
      if (method === 0) return new TextDecoder().decode(body);
      const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(body); w.close();
      return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
    }
    p += 46 + nl + el + cl;
  }
  return null;
};
const emptyPage = (n = 1) => ({ pageNum: n, size: { width: 595, height: 842 }, analysis: { blocks: [], tables: [], counts: {}, bodySize: 12 } });

test('analyzePage: খালি পৃষ্ঠায় ভাঙে না', () => {
  const a = analyzePage({ page: { width: 595, height: 842 }, lines: [], ink: { tables: [], inkIn: () => ({ count: 0, bbox: null }), lineCoverage: () => 1 }, textReliable: true });
  assert.deepEqual(a.blocks, []);
});

test('খালি পৃষ্ঠা Export: কোনো ফাইলই ভাঙে না', async () => {
  const p = [emptyPage()];
  assert.ok((await buildDocx(p)).length > 500);
  assert.ok((await buildXlsx(p)).length > 500);
  assert.match(buildHtmlDocument(p), /rc-page/);
  assert.equal(pagesToCsvFiles(p).length, 0);
  assert.equal(pagesToText(p), '');
});

test('HTML/টেক্সট ইনজেকশন: HTML ও Word/Excel XML-এ কাঁচা ট্যাগ যায় না', async () => {
  const evil = '<img src=x onerror=alert(1)></script><b>&"\'';
  const p = clone(fx.pages[0]);
  p.analysis.blocks.find((b) => b.type === 'title').text = evil;
  p.analysis.tables[0].grid.cells[0].text = evil;
  const html = buildHtmlDocument([p], { title: evil });
  assert.ok(!html.includes('<img src=x'), 'html-এ কাঁচা <img>');
  assert.ok(!/<\/script><b>/.test(html), 'html-এ script ভাঙা');
  assert.ok(!renderPage(p, { edit: true }).html.includes('<img src=x'));
  const doc = await unzipText(await buildDocx([p], { title: evil, compress: false }), 'word/document.xml');
  assert.ok(doc && !doc.includes('<img') && doc.includes('&lt;img'));
  const core = await unzipText(await buildDocx([p], { title: evil, compress: false }), 'docProps/core.xml');
  assert.ok(!core.includes('<img'));
  const sh = await unzipText(await buildXlsx([p], { compress: false }), 'xl/worksheets/sheet1.xml');
  assert.ok(!sh.includes('<img') && sh.includes('&lt;img'));
});

test('অবৈধ XML চিহ্ন (নিয়ন্ত্রণ-চিহ্ন) Word/Excel-এ যায় না', async () => {
  const p = clone(fx.pages[0]);
  p.analysis.tables[0].grid.cells[1].text = 'ক\u0000খ\u0008গ\u000B😀ঘ';
  const doc = await unzipText(await buildDocx([p], { compress: false }), 'word/document.xml');
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(doc));
  assert.ok(doc.includes('😀'));
  const sh = await unzipText(await buildXlsx([p], { compress: false }), 'xl/worksheets/sheet1.xml');
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(sh));
});

test('Word XML-এ NaN/undefined সংখ্যা থাকে না (খারাপ মাপেও)', async () => {
  const p = clone(fx.pages[0]);
  const t = p.analysis.blocks.find((b) => b.type === 'title');
  t.bbox = { x0: NaN, y0: undefined, x1: 'x', y1: null };
  t.fontSize = NaN;
  const xml = await unzipText(await buildDocx([p], { compress: false }), 'word/document.xml');
  assert.ok(!/NaN|undefined|Infinity/.test(xml), 'NaN/undefined পাওয়া গেছে');
});

test('Excel: ৩২,৭৬৭ অক্ষরের বেশি লেখা ঘরে/সারিতে ভাঙা হয় (Excel-এর সীমা)', async () => {
  const p = clone(fx.pages[0]);
  p.analysis.blocks.find((b) => b.type === 'title').text = 'ক'.repeat(70000);
  const sh = await unzipText(await buildXlsx([p], { compress: false }), 'xl/worksheets/sheet2.xml');
  const cells = [...sh.matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map((m) => m[1].length);
  assert.ok(Math.max(...cells) <= 32767, 'এক ঘরে ' + Math.max(...cells));
  assert.equal(cells.reduce((a, b) => a + b, 0) >= 70000, true, 'লেখা হারিয়েছে');
});

test('CSV: লাইন-ভাঙা ও কোটেশন ও খালি টেবিল', () => {
  const p = clone(fx.pages[0]);
  p.analysis.tables[0].grid.cells[0].text = 'এক\nদুই "তিন"';
  assert.match(tableToCsv(p.analysis.tables[0]), /"এক\nদুই ""তিন"""/);
  assert.equal(tableToCsv(null), '\r\n'.slice(0, 0) + '');
});

test('ZIP: ফাঁকা তালিকা, ফাঁকা ফাইল, একই নাম, বাংলা নাম', async () => {
  const empty = await createZip([]);
  assert.equal(empty.length, 22);
  const z = await createZip([{ name: 'এ.txt', data: '' }, { name: 'এ.txt', data: 'x' }, { name: 'b', data: new Uint8Array(0) }]);
  assert.ok(z.length > 100);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('textToDocx: খালি লেখা ও Tab/ফাঁকা অনুচ্ছেদ', async () => {
  assert.ok((await textToDocx('')).length > 300);
  const xml = await unzipText(await textToDocx('ক\tখ\n\n  গ', { compress: false }), 'word/document.xml');
  assert.ok(xml.includes('<w:tab/>') && xml.includes('xml:space="preserve"'));
});

test('এক পৃষ্ঠায় টেবিল-ছাড়া শুধু লেখা: Word ও Excel ঠিক', async () => {
  const p = clone(fx.pages[0]);
  p.analysis.blocks = p.analysis.blocks.filter((b) => b.type !== 'table');
  p.analysis.tables = [];
  assert.ok((await buildDocx([p])).length > 500);
  assert.ok((await buildXlsx([p])).length > 500);
});

const mkTable = () => { const t = clone(fx.pages[0].analysis.tables[0]); te.normalizeGrid(t.grid, t.bbox); return t; };
const sane = (g) => [g.rowEdges, g.colEdges].every((e) => e.every(Number.isFinite) && e.every((v, i, a) => !i || v >= a[i - 1]));

test('টেবিল-সম্পাদনা: অবৈধ সংখ্যা/সূচক টেবিল নষ্ট করে না', () => {
  const t = mkTable();
  te.setRowHeight(t.grid, 1, NaN); te.setRowHeight(t.grid, 2, -50); te.setRowHeight(t.grid, 3, 1e9); te.setRowHeight(t.grid, 999, 10); te.setRowHeight(t.grid, 1.5, 10);
  te.setColWidth(t.grid, 0, NaN); te.setColWidth(t.grid, 1, -5); te.setColWidth(t.grid, 2, 1e9); te.setColWidth(t.grid, -3, 10); te.setColWidth(t.grid, 99, 10);
  assert.ok(sane(t.grid));
  assert.ok(te.rowHeights(t.grid)[3] <= te.MAX_ROW);
});
test('টেবিল-সম্পাদনা: সীমার বাইরে সারি/কলাম বসানো', () => {
  const t = mkTable(); const n = t.grid.nRows; const m = t.grid.nCols;
  te.insertLine(t.grid, 'row', -5); te.insertLine(t.grid, 'row', 9999); te.insertLine(t.grid, 'col', -1); te.insertLine(t.grid, 'col', NaN);
  assert.equal(t.grid.nRows, n + 2); assert.equal(t.grid.nCols, m + 1);
  assert.ok(sane(t.grid));
  for (const c of t.grid.cells) assert.ok(c.r + c.rowSpan <= t.grid.nRows && c.c + c.colSpan <= t.grid.nCols);
});
test('টেবিল-সম্পাদনা: শেষ সারি/কলাম মোছা যায় না; সব ঘর জোড়া ও ভাঙা', () => {
  const t = mkTable();
  while (te.deleteLine(t.grid, 'row', 0)) { /* মুছতে থাকো */ }
  while (te.deleteLine(t.grid, 'col', 0)) { /* মুছতে থাকো */ }
  assert.equal(t.grid.nRows, 1); assert.equal(t.grid.nCols, 1); assert.equal(t.grid.cells.length, 1);
  const u = mkTable();
  const m = te.mergeCells(u.grid, { r0: 0, c0: 0, r1: u.grid.nRows - 1, c1: u.grid.nCols - 1 });
  assert.equal(m.rowSpan, u.grid.nRows); assert.equal(u.grid.cells.length, 1);
  assert.equal(te.splitCell(u.grid, m), true); assert.equal(u.grid.cells.length, u.grid.nRows * u.grid.nCols);
});

import { pageSetup } from '../src/modules/export/export-model.js';
test('Margin ও ফন্ট: অসম্ভব মান কেটে সীমায় আনা হয়', async () => {
  const p = clone(fx.pages[0]);
  p.edit = { margins: { left: 5000, right: -30, top: NaN, bottom: 1e9 } };
  const { lay } = pageSetup(p);
  assert.ok(lay.margins.left <= lay.Wpt * 0.4 + 1e-6 && lay.margins.right === 0 && lay.margins.bottom <= lay.pageH * 0.4 + 1e-6);
  assert.ok(Object.values(lay.margins).every(Number.isFinite));
  p.analysis.blocks.find((b) => b.type === 'title').style = { fontSize: 99999 };
  const xml = await unzipText(await buildDocx([p], { compress: false }), 'word/document.xml');
  assert.ok(Math.max(...[...xml.matchAll(/<w:sz w:val="(\d+)"/g)].map((m) => +m[1])) <= 3276);
});
