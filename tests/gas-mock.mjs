// gas/Code.gs চালানোর নকল Google Sheet পরিবেশ (পরীক্ষার জন্য)
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

class MockSheet {
  constructor(name) { this.name = name; this.rows = []; this.frozen = 0; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); }
  setFrozenRows(n) { this.frozen = n; }
  deleteRow(r) { this.rows.splice(r - 1, 1); }
  getRange(r, c, nr, nc) {
    const sh = this;
    return {
      fmt: null,
      setNumberFormat(f) { this.fmt = f; return this; },
      setValues(vals) {
        vals.forEach((row, i) => {
          const tgt = sh.rows[r - 1 + i] || (sh.rows[r - 1 + i] = []);
          row.forEach((v, j) => { tgt[c - 1 + j] = { v, formula: typeof v === 'string' && v.startsWith('=') && this.fmt !== '@' }; });
        });
      },
      getValues() {
        const out = [];
        for (let i = 0; i < nr; i++) { const row = sh.rows[r - 1 + i] || []; out.push(Array.from({ length: nc }, (_, j) => (row[c - 1 + j] ? row[c - 1 + j].v : ''))); }
        return out;
      }
    };
  }
}

export function makeEnv() {
  const sheets = new Map();
  const ss = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = new MockSheet(n); sheets.set(n, s); return s; }
  };
  const cache = new Map();
  const env = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (a, s) => Array.from(new Int8Array(crypto.createHash('sha256').update(s).digest()))
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; } }) }
  };
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(new URL('../gas/Code.gs', import.meta.url), 'utf8'), env);
  const call = (body) => JSON.parse(env.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).s);
  return { env, sheets, call };
}
