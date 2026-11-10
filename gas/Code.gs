/**
 * বাংলা OCR Studio — Google Apps Script (Web App)
 * এটি আপনার নিজের Google Sheet-এর সঙ্গে যুক্ত থাকে (Container-bound Script)।
 *
 * কী করে (সব ঐচ্ছিক; অ্যাপ এটি ছাড়াও চলে):
 *  - ping            : সংযোগ পরীক্ষা
 *  - saveSettings / getSettings : পছন্দের সেটিং ব্যাকআপ ও ফিরিয়ে আনা
 *  - logUsage        : বেনামী পরিসংখ্যান (শুধু মোড, পৃষ্ঠা-সংখ্যা, সফল কি না) — ব্যবহারকারী চালু করলে
 *  - saveResult / listResults / getResult / deleteResult : ব্যবহারকারী নিজে "সংরক্ষণ" চাপলে OCR-এর লেখা
 *  - deleteMyData    : ওই ব্রাউজারের সব তথ্য মুছে ফেলা
 *
 * নিয়ম: কোনো ছবি/PDF এখানে আসে না। OCR-এর লেখা কেবল স্পষ্ট "সংরক্ষণ" অনুরোধে আসে।
 * কোনো পাসওয়ার্ড/API Key কোডে নেই। পরিচয় = ব্রাউজারে বানানো এলোমেলো clientId (৩২ হেক্স অক্ষর)।
 */

var APP_VERSION = '1.0.0';
var SHEETS = {
  settings: { name: 'Settings', header: ['clientId', 'json', 'updatedAt'] },
  usage: { name: 'Usage', header: ['time', 'client', 'mode', 'pages', 'ok', 'lang', 'ms'] },
  results: { name: 'Results', header: ['id', 'time', 'clientId', 'title', 'mode', 'pages', 'chars', 'text'] }
};
var LIMITS = {
  body: 120000,        // একটি অনুরোধের সর্বোচ্চ আকার (অক্ষর)
  text: 45000,         // Google Sheets-এর এক ঘরে ৫০,০০০ অক্ষরের সীমা আছে
  title: 150,
  settingsJson: 4000,
  perClientResults: 200,
  listMax: 50,
  rateCount: 60,       // ১০ মিনিটে একটি clientId থেকে সর্বোচ্চ অনুরোধ
  rateSeconds: 600
};
var ALLOWED_MODES = ['text', 'document'];
var ALLOWED_LANGS = ['ben+eng', 'ben', 'eng'];
var ALLOWED_PREF_KEYS = ['language', 'wordFont'];

/** একবার চালিয়ে নিন: Sheet-এর ট্যাব ও হেডার বানায় (আবার চালালে ক্ষতি নেই) */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (k) { getSheet_(ss, SHEETS[k]); });
  return 'প্রস্তুত: ' + Object.keys(SHEETS).map(function (k) { return SHEETS[k].name; }).join(', ');
}

function getSheet_(ss, def) {
  var sh = ss.getSheetByName(def.name);
  if (!sh) sh = ss.insertSheet(def.name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, def.header.length).setValues([def.header]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function doGet() {
  return json_({ ok: true, data: { app: 'bangla-ocr-studio', version: APP_VERSION, time: new Date().toISOString() } });
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
    if (!raw) return json_(fail_('empty', 'কোনো তথ্য আসেনি।'));
    if (raw.length > LIMITS.body) return json_(fail_('too_large', 'অনুরোধ খুব বড়।'));
    var body;
    try { body = JSON.parse(raw); } catch (err) { return json_(fail_('bad_json', 'তথ্য পড়া যায়নি।')); }
    return json_(handle_(body));
  } catch (err) {
    // ভেতরের ত্রুটির বিবরণ বাইরে দেওয়া হয় না
    console.error(err && err.stack ? err.stack : err);
    return json_(fail_('server', 'সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।'));
  }
}

function handle_(body) {
  if (!body || typeof body !== 'object') return fail_('bad_request', 'অনুরোধ ঠিক নয়।');
  var action = String(body.action || '');
  var clientId = String(body.clientId || '');
  if (!/^[a-f0-9]{32}$/.test(clientId)) return fail_('bad_client', 'পরিচয় (clientId) ঠিক নয়।');
  if (!rateOk_(clientId)) return fail_('rate_limited', 'অনেক বেশি অনুরোধ। কয়েক মিনিট পরে চেষ্টা করুন।');
  switch (action) {
    case 'ping': return ok_({ app: 'bangla-ocr-studio', version: APP_VERSION, time: new Date().toISOString() });
    case 'saveSettings': return saveSettings_(clientId, body.prefs);
    case 'getSettings': return getSettings_(clientId);
    case 'logUsage': return logUsage_(clientId, body);
    case 'saveResult': return saveResult_(clientId, body);
    case 'listResults': return listResults_(clientId);
    case 'getResult': return getResult_(clientId, body.id);
    case 'deleteResult': return deleteResult_(clientId, body.id);
    case 'deleteMyData': return deleteMyData_(clientId);
    default: return fail_('bad_action', 'অজানা কাজ।');
  }
}

/* ---------- সাহায্যকারী ---------- */
function ok_(data) { return { ok: true, data: data }; }
function fail_(code, message) { return { ok: false, error: code, message: message }; }
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function rateOk_(clientId) {
  var cache = CacheService.getScriptCache();
  var key = 'rl_' + clientId;
  var n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), LIMITS.rateSeconds);
  return n <= LIMITS.rateCount;
}

function hashOf_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
  return bytes.slice(0, 5).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function cleanStr_(v, max) {
  // নিয়ন্ত্রণ-চিহ্ন বাদ; সীমা মানা
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/** সারি লেখা: ঘরকে "সাধারণ লেখা" (@) ধরা হয়, তাই "=..." সূত্র হিসেবে চলে না */
function appendTextRow_(sh, row) {
  var r = sh.getLastRow() + 1;
  var range = sh.getRange(r, 1, 1, row.length);
  range.setNumberFormat('@');
  range.setValues([row.map(function (v) { return typeof v === 'string' ? v : String(v); })]);
}

function rowsOf_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
}

function sheet_(key) {
  return getSheet_(SpreadsheetApp.getActiveSpreadsheet(), SHEETS[key]);
}

/* ---------- সেটিং ---------- */
function validPrefs_(prefs) {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return null;
  var out = {};
  ALLOWED_PREF_KEYS.forEach(function (k) {
    if (prefs[k] == null) return;
    var v = cleanStr_(prefs[k], 60);
    if (k === 'language' && ALLOWED_LANGS.indexOf(v) < 0) return;
    out[k] = v;
  });
  return out;
}

function saveSettings_(clientId, prefs) {
  var p = validPrefs_(prefs);
  if (!p) return fail_('bad_prefs', 'সেটিং ঠিক নয়।');
  var text = JSON.stringify(p);
  if (text.length > LIMITS.settingsJson) return fail_('too_large', 'সেটিং খুব বড়।');
  return withLock_(function () {
    var sh = sheet_('settings');
    var rows = rowsOf_(sh);
    var now = new Date().toISOString();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0] === clientId) {
        var range = sh.getRange(i + 2, 1, 1, 3);
        range.setNumberFormat('@');
        range.setValues([[clientId, text, now]]);
        return ok_({ saved: true });
      }
    }
    appendTextRow_(sh, [clientId, text, now]);
    return ok_({ saved: true });
  });
}

function getSettings_(clientId) {
  var rows = rowsOf_(sheet_('settings'));
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === clientId) {
      try { return ok_({ prefs: validPrefs_(JSON.parse(rows[i][1])) || {}, updatedAt: String(rows[i][2]) }); } catch (e) { return ok_({ prefs: {} }); }
    }
  }
  return ok_({ prefs: null });
}

/* ---------- বেনামী পরিসংখ্যান ---------- */
function logUsage_(clientId, b) {
  var mode = String(b.mode || '');
  if (ALLOWED_MODES.indexOf(mode) < 0) return fail_('bad_mode', 'মোড ঠিক নয়।');
  var pages = Math.max(0, Math.min(1000, parseInt(b.pages, 10) || 0));
  var ms = Math.max(0, Math.min(86400000, parseInt(b.ms, 10) || 0));
  var lang = ALLOWED_LANGS.indexOf(String(b.lang)) >= 0 ? String(b.lang) : '';
  withLock_(function () {
    appendTextRow_(sheet_('usage'), [new Date().toISOString(), hashOf_(clientId), mode, String(pages), b.ok ? 'yes' : 'no', lang, String(ms)]);
  });
  return ok_({ logged: true });
}

/* ---------- ব্যবহারকারীর নিজে-সংরক্ষণ-করা লেখা ---------- */
function saveResult_(clientId, b) {
  if (b.consent !== true) return fail_('no_consent', 'সংরক্ষণের সম্মতি পাওয়া যায়নি।');
  var mode = String(b.mode || '');
  if (ALLOWED_MODES.indexOf(mode) < 0) return fail_('bad_mode', 'মোড ঠিক নয়।');
  var text = cleanStr_(b.text, LIMITS.text + 1);
  if (!text.trim()) return fail_('empty_text', 'সংরক্ষণ করার মতো লেখা নেই।');
  if (text.length > LIMITS.text) return fail_('text_too_long', 'লেখা খুব বড় (সর্বোচ্চ ' + LIMITS.text + ' অক্ষর)। পৃষ্ঠা ভাগ করে সংরক্ষণ করুন।');
  var title = cleanStr_(b.title, LIMITS.title) || 'নামহীন';
  var pages = Math.max(0, Math.min(1000, parseInt(b.pages, 10) || 0));
  return withLock_(function () {
    var sh = sheet_('results');
    var mine = rowsOf_(sh).filter(function (r) { return r[2] === clientId; }).length;
    if (mine >= LIMITS.perClientResults) return fail_('quota', 'সংরক্ষণের সীমা (' + LIMITS.perClientResults + 'টি) পূর্ণ। পুরনো ফল মুছে আবার চেষ্টা করুন।');
    var id = Utilities.getUuid();
    appendTextRow_(sh, [id, new Date().toISOString(), clientId, title, mode, String(pages), String(text.length), text]);
    return ok_({ id: id, chars: text.length });
  });
}

function listResults_(clientId) {
  var items = rowsOf_(sheet_('results')).filter(function (r) { return r[2] === clientId; }).reverse().slice(0, LIMITS.listMax)
    .map(function (r) { return { id: String(r[0]), time: String(r[1]), title: String(r[3]), mode: String(r[4]), pages: Number(r[5]) || 0, chars: Number(r[6]) || 0 }; });
  return ok_({ items: items });
}

function getResult_(clientId, id) {
  var rows = rowsOf_(sheet_('results'));
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === String(id) && rows[i][2] === clientId) {
      return ok_({ id: String(rows[i][0]), time: String(rows[i][1]), title: String(rows[i][3]), mode: String(rows[i][4]), text: String(rows[i][7]) });
    }
  }
  return fail_('not_found', 'পাওয়া যায়নি।');
}

function deleteRowsWhere_(sh, test) {
  var rows = rowsOf_(sh);
  var removed = 0;
  for (var i = rows.length - 1; i >= 0; i--) { // নিচ থেকে মুছলে ক্রম ঠিক থাকে
    if (test(rows[i])) { sh.deleteRow(i + 2); removed++; }
  }
  return removed;
}

function deleteResult_(clientId, id) {
  return withLock_(function () {
    var n = deleteRowsWhere_(sheet_('results'), function (r) { return r[0] === String(id) && r[2] === clientId; });
    return n ? ok_({ deleted: n }) : fail_('not_found', 'পাওয়া যায়নি।');
  });
}

function deleteMyData_(clientId) {
  return withLock_(function () {
    var h = hashOf_(clientId);
    return ok_({
      results: deleteRowsWhere_(sheet_('results'), function (r) { return r[2] === clientId; }),
      settings: deleteRowsWhere_(sheet_('settings'), function (r) { return r[0] === clientId; }),
      usage: deleteRowsWhere_(sheet_('usage'), function (r) { return r[1] === h; })
    });
  });
}
