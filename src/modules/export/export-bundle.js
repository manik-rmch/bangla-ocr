// সব Export একসঙ্গে একটি ZIP-এ: Word + Excel + HTML + TXT + প্রতিটি টেবিলের CSV + স্বাক্ষরের ছবি।
import { createZip, dataUrlToBytes } from './zip-writer.js';
import { buildDocx } from './docx-export.js';
import { buildXlsx } from './xlsx-export.js';
import { buildHtmlDocument } from './html-export.js';
import { pagesToCsvFiles } from './csv-export.js';
import { pagesToText } from './export-model.js';

export async function buildBundle(pages, { base = 'document', font = 'Nirmala UI', title } = {}) {
  const ok = pages.filter((p) => p.analysis);
  if (!ok.length) throw new Error('Export করার মতো বিশ্লেষিত পৃষ্ঠা নেই।');
  const files = [];
  const skipped = [];
  const add = async (name, fn) => {
    try { files.push({ name, data: await fn() }); } catch (e) { skipped.push(`${name}: ${e.message || e}`); }
  };
  await add(`${base}.docx`, () => buildDocx(ok, { font, title: title || base }));
  await add(`${base}.xlsx`, () => buildXlsx(ok, { font }));
  await add(`${base}.html`, () => buildHtmlDocument(ok, { title: title || base }));
  await add(`${base}.txt`, () => `﻿${pagesToText(ok).replace(/\r?\n/g, '\r\n')}`);
  for (const c of pagesToCsvFiles(ok)) files.push({ name: `csv/${c.name}`, data: `﻿${c.csv}` });
  for (const p of ok) {
    let n = 0;
    for (const b of p.analysis.blocks) {
      if (b.type !== 'signature') continue;
      for (const person of b.people) {
        n++;
        const d = person.signatureImage && dataUrlToBytes(person.signatureImage);
        if (d) files.push({ name: `signatures/page${p.pageNum}-sig${n}.${d.mime === 'image/png' ? 'png' : 'jpg'}`, data: d.bytes });
      }
    }
  }
  const note = ['বাংলা OCR Studio — Export', '', 'এই ZIP-এর ফাইলগুলো আপনার ব্রাউজারেই তৈরি; কোনো সার্ভারে যায়নি।',
    'PDF এখানে নেই: Document-এর "PDF" বাটন দিয়ে আলাদা করে সংরক্ষণ করুন।',
    skipped.length ? `\nতৈরি হয়নি:\n${skipped.join('\n')}` : ''].join('\r\n');
  files.push({ name: 'README.txt', data: `﻿${note}` });
  return { bytes: await createZip(files), skipped, count: files.length };
}
