// Export পরীক্ষা (Node ১৮+): node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDocx, textToDocx } from '../src/modules/export/docx-export.js';
import { buildXlsx, colLetter, sheetName } from '../src/modules/export/xlsx-export.js';
import { buildHtmlDocument } from '../src/modules/export/html-export.js';
import { pagesToCsvFiles, csvField } from '../src/modules/export/csv-export.js';
import { buildBundle } from '../src/modules/export/export-bundle.js';
import { crc32 } from '../src/modules/export/zip-writer.js';
import { pagesToText } from '../src/modules/export/export-model.js';

const data = JSON.parse(fs.readFileSync(new URL('./fixtures/roster-analysis.json', import.meta.url), 'utf8'));
const pages = data.pages;
const names = (zip) => { // ZIP-এর Central Directory থেকে ফাইলের নাম
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22; while (dv.getUint32(end, true) !== 0x06054b50) end--;
  const n = dv.getUint16(end + 10, true); let p = dv.getUint32(end + 16, true); const out = [];
  for (let i = 0; i < n; i++) { const nl = dv.getUint16(p + 28, true); const el = dv.getUint16(p + 30, true); const cl = dv.getUint16(p + 32, true); out.push(new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nl))); p += 46 + nl + el + cl; }
  return out;
};

test('crc32', () => assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926));
test('docx অংশগুলো', async () => {
  const z = await buildDocx(pages, { font: 'Nirmala UI' });
  const n = names(z);
  for (const k of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', '_rels/.rels']) assert.ok(n.includes(k), k);
});
test('docx খালি হলে ত্রুটি', async () => { await assert.rejects(() => buildDocx([{ pageNum: 1 }])); });
test('textToDocx', async () => assert.ok(names(await textToDocx('ক\nখ\tগ')).includes('word/document.xml')));
test('xlsx Sheet ও নাম', async () => {
  const n = names(await buildXlsx(pages));
  assert.ok(n.includes('xl/worksheets/sheet1.xml') && n.includes('xl/workbook.xml'));
  assert.equal(colLetter(0), 'A'); assert.equal(colLetter(26), 'AA');
  assert.notEqual(sheetName('a:b', new Set(['a b'])), 'a b');
});
test('csv', () => {
  const f = pagesToCsvFiles(pages);
  assert.equal(f.length, 1); assert.equal(f[0].csv.trim().split('\r\n').length, 31);
  assert.equal(csvField('ক,খ'), '"ক,খ"'); assert.equal(csvField('a"b'), '"a""b"');
});
test('html ও print', () => {
  assert.match(buildHtmlDocument(pages), /rc-page/);
  assert.match(buildHtmlDocument(pages, { print: true }), /@page p0\{size:/);
});
test('txt', () => assert.ok(pagesToText(pages).includes('\t')));
test('bundle', async () => {
  const r = await buildBundle(pages, { base: 'doc' });
  const n = names(r.bytes);
  for (const k of ['doc.docx', 'doc.xlsx', 'doc.html', 'doc.txt', 'README.txt']) assert.ok(n.includes(k), k);
});
