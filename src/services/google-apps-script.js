// Google Apps Script (Web App)-এর সঙ্গে কথা বলার ছোট Client। সব কাজ ঐচ্ছিক; URL না থাকলে অ্যাপ আগের মতোই চলে।
// এখানে কোনো গোপন Key নেই: Web App-এর URL ও ব্রাউজারে বানানো এলোমেলো clientId ছাড়া কিছু পাঠানো হয় না।

export const MAX_TEXT = 45000; // gas/Code.gs-এর সীমার সঙ্গে মেলানো

export class GasError extends Error {
  constructor(code, message) { super(message); this.name = 'GasError'; this.code = code; }
}

/** https://script.google.com/macros/s/<ID>/exec (Workspace হলে /a/macros/<ডোমেইন>/s/<ID>/exec) */
export function isValidAppsScriptUrl(u) {
  return /^https:\/\/script\.google\.com\/(?:a\/macros\/[A-Za-z0-9.-]+|macros)\/s\/[A-Za-z0-9_-]{10,}\/exec$/.test(String(u || '').trim());
}

const SERVER_MESSAGES = {
  rate_limited: 'অনেক বেশি অনুরোধ হয়েছে। কয়েক মিনিট পরে চেষ্টা করুন।',
  text_too_long: `লেখা খুব বড় (সর্বোচ্চ ${MAX_TEXT} অক্ষর)। পৃষ্ঠা ভাগ করে সংরক্ষণ করুন।`,
  quota: 'সংরক্ষণের সীমা পূর্ণ। পুরনো ফল মুছে আবার চেষ্টা করুন।',
  no_consent: 'সংরক্ষণের সম্মতি পাওয়া যায়নি।',
  empty_text: 'সংরক্ষণ করার মতো লেখা নেই।',
  not_found: 'পাওয়া যায়নি (হয়তো আগেই মুছে গেছে)।'
};

export function createGasClient({ url, clientId, fetchImpl, timeoutMs = 20000 }) {
  const f = fetchImpl || ((...a) => globalThis.fetch(...a));
  async function call(action, payload = {}) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    let res;
    try {
      // Content-Type: text/plain রাখায় ব্রাউজার আগে থেকে "Preflight" অনুমতি চায় না (Apps Script এটি সামলাতে পারে না)
      res = await f(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...payload, action, clientId }), redirect: 'follow', signal: ctl ? ctl.signal : undefined });
    } catch (e) {
      throw new GasError('network', e && e.name === 'AbortError'
        ? 'অনেকক্ষণ উত্তর আসেনি (Timeout)। ইন্টারনেট ও URL দেখে আবার চেষ্টা করুন।'
        : 'সংযোগ করা যায়নি। ইন্টারনেট ও Apps Script URL ঠিক আছে কি দেখুন।');
    } finally { if (timer) clearTimeout(timer); }
    let body;
    try { body = await res.json(); } catch {
      throw new GasError('not_json', 'Apps Script থেকে ঠিক উত্তর আসেনি। Web App Deploy করার সময় "Who has access" = "Anyone" আছে কি এবং URL শেষে /exec আছে কি দেখুন।');
    }
    if (!body || body.ok !== true) {
      const code = (body && body.error) || 'server';
      throw new GasError(code, SERVER_MESSAGES[code] || (body && body.message) || 'Apps Script কাজটি করতে পারেনি।');
    }
    return body.data;
  }
  return {
    ping: () => call('ping'),
    saveSettings: (prefs) => call('saveSettings', { prefs }),
    getSettings: () => call('getSettings'),
    logUsage: (u) => call('logUsage', u),
    saveResult: ({ title, mode, pages, text }) => call('saveResult', { consent: true, title, mode, pages, text }),
    listResults: () => call('listResults'),
    getResult: (id) => call('getResult', { id }),
    deleteResult: (id) => call('deleteResult', { id }),
    deleteMyData: () => call('deleteMyData')
  };
}
