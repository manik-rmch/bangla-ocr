// ব্যবহারকারীর সেটিং এই ব্রাউজারেই (localStorage) থাকে। কোনো সার্ভারে নয়।
// localStorage বন্ধ থাকলে (Private window ইত্যাদি) সাময়িকভাবে মেমরিতে চলে; পেজ রিফ্রেশে হারায়।

const KEY = 'bangla-ocr-settings-v1';
export const DEFAULT_PREFS = { language: 'ben+eng', wordFont: 'Nirmala UI' };
export const LANGUAGES = ['ben+eng', 'ben', 'eng'];

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

export function browserStorage() {
  try {
    const s = globalThis.localStorage;
    const probe = '__bocr_probe__';
    s.setItem(probe, '1'); s.removeItem(probe);
    return s;
  } catch {
    return memoryStorage();
  }
}

export function newClientId(cryptoImpl = globalThis.crypto) {
  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// শুধু বৈধ কী/মান রাখে (অবৈধ হলে সেটি বাদ)
function validPartial(p) {
  const out = {};
  if (p && typeof p === 'object') {
    if (LANGUAGES.includes(p.language)) out.language = p.language;
    if (typeof p.wordFont === 'string' && p.wordFont.length > 0 && p.wordFont.length <= 60) out.wordFont = p.wordFont;
  }
  return out;
}
function cleanPrefs(p) { return { ...DEFAULT_PREFS, ...validPartial(p) }; }

export function createSettingsStore(storage = browserStorage(), cryptoImpl = globalThis.crypto) {
  function read() {
    let raw = {};
    try { raw = JSON.parse(storage.getItem(KEY) || '{}') || {}; } catch { raw = {}; }
    return {
      appsScriptUrl: typeof raw.appsScriptUrl === 'string' ? raw.appsScriptUrl : '',
      clientId: /^[a-f0-9]{32}$/.test(raw.clientId || '') ? raw.clientId : '',
      usageStats: raw.usageStats === true, // ডিফল্ট বন্ধ
      prefs: cleanPrefs(raw.prefs)
    };
  }
  function write(v) { try { storage.setItem(KEY, JSON.stringify(v)); } catch { /* সংরক্ষণ না হলে সাময়িক */ } }
  return {
    get() { return read(); },
    set(patch) {
      const cur = read();
      const next = { ...cur, ...patch, prefs: { ...cur.prefs, ...validPartial(patch.prefs) } };
      write(next);
      return next;
    },
    /** clientId না থাকলে বানিয়ে রাখে */
    clientId() {
      const cur = read();
      if (cur.clientId) return cur.clientId;
      const id = newClientId(cryptoImpl);
      write({ ...cur, clientId: id });
      return id;
    },
    resetClientId() {
      const cur = read();
      const id = newClientId(cryptoImpl);
      write({ ...cur, clientId: id });
      return id;
    }
  };
}
