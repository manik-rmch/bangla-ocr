// CSV: একটি টেবিলের ঘরগুলো। UTF-8 BOM থাকায় Excel-এও বাংলা ঠিক দেখায়।
// জোড়া ঘরের লেখা শুধু উপরের-বাঁয়ের ঘরে থাকে, বাকিগুলো ফাঁকা।
import { tableMatrix } from './export-model.js';

export function csvField(v) {
  const s = String(v == null ? '' : v).replace(/\r\n?/g, '\n');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tableToCsv(table) {
  const rows = tableMatrix(table);
  return rows.length ? rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n' : '';
}

/** সব পৃষ্ঠার সব টেবিল: [{ name: 'p1-table1.csv', pageNum, index, csv }] */
export function pagesToCsvFiles(pages) {
  const out = [];
  for (const p of pages) {
    if (!p.analysis) continue;
    const blocks = p.analysis.blocks.filter((b) => b.type === 'table').sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    blocks.forEach((b, i) => {
      const t = p.analysis.tables[b.tableIndex];
      if (!t || !t.grid) return;
      out.push({ name: `page${p.pageNum}-table${i + 1}.csv`, pageNum: p.pageNum, index: i + 1, csv: tableToCsv(t) });
    });
  }
  return out;
}
