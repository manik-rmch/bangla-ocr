// অ্যাপের বাকি অংশ থেকে Google Sheets ব্যবহারের একমাত্র দরজা। URL না থাকলে সব কাজ নীরবে বাদ।
import { CONFIG } from './configuration.js';
import { createSettingsStore } from './settings-store.js';
import { createGasClient, isValidAppsScriptUrl, MAX_TEXT } from './google-apps-script.js';

export const settings = createSettingsStore();

export function effectiveUrl() {
  const own = settings.get().appsScriptUrl.trim();
  return own || String(CONFIG.appsScriptUrl || '').trim();
}

export function isConfigured() { return isValidAppsScriptUrl(effectiveUrl()); }

export function getClient(urlOverride) {
  const url = (urlOverride || effectiveUrl()).trim();
  if (!isValidAppsScriptUrl(url)) return null;
  return createGasClient({ url, clientId: settings.clientId() });
}

/** বেনামী পরিসংখ্যান: ব্যবহারকারী চালু করলে তবেই; ব্যর্থ হলে চুপচাপ বাদ (OCR-এর কাজ আটকায় না) */
export function reportUsage({ mode, pages, ok, lang, ms }) {
  try {
    if (!settings.get().usageStats) return;
    const c = getClient();
    if (!c) return;
    c.logUsage({ mode, pages, ok: !!ok, lang, ms }).catch(() => {});
  } catch { /* কিছু না */ }
}

/** পছন্দের ভাষা: radio-গুলোর মধ্যে সংরক্ষিত মানটি বাছা */
export function applyLanguagePref(root, radioName) {
  try {
    const want = settings.get().prefs.language;
    const el = root.querySelector(`input[name="${radioName}"][value="${want}"]`);
    if (el) el.checked = true;
  } catch { /* কিছু না */ }
}

/**
 * ব্যবহারকারী "Google Sheets-এ সংরক্ষণ" চাপলে: কী যাবে তা জানিয়ে সম্মতি নিয়ে তবেই পাঠানো।
 * ফেরত: { ok, message }
 */
export async function saveTextToSheets({ title, mode, pages, text }) {
  const c = getClient();
  if (!c) return { ok: false, message: 'আগে Settings পেজে Apps Script URL দিন।' };
  const t = String(text || '');
  if (!t.trim()) return { ok: false, message: 'সংরক্ষণ করার মতো লেখা নেই।' };
  if (t.length > MAX_TEXT) return { ok: false, message: `লেখা খুব বড় (${t.length} অক্ষর; সর্বোচ্চ ${MAX_TEXT})। একটি পৃষ্ঠা বেছে সংরক্ষণ করুন।` };
  const ok = typeof window === 'undefined' || window.confirm(
    `আপনার Google Sheet-এ এই লেখাটি সংরক্ষণ করা হবে:\n\n• ফাইলের নাম: ${title}\n• লেখা: ${t.length} অক্ষর\n\nশুধু লেখা যাবে, মূল ছবি/PDF নয়। এগিয়ে যাবেন?`);
  if (!ok) return { ok: false, message: 'সংরক্ষণ বাতিল করা হয়েছে।', cancelled: true };
  try {
    await c.saveResult({ title, mode, pages, text: t });
    return { ok: true, message: 'Google Sheet-এ সংরক্ষণ হয়েছে ✔ (Settings পেজে "আমার সংরক্ষিত ফল" দেখুন)' };
  } catch (e) {
    return { ok: false, message: e.message || 'সংরক্ষণ হয়নি।' };
  }
}
