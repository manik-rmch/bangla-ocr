// Settings সংরক্ষণ ও Apps Script Client পরীক্ষা: node --test tests/cloud.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsStore, newClientId } from '../src/services/settings-store.js';
import { createGasClient, isValidAppsScriptUrl, GasError } from '../src/services/google-apps-script.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const OK_URL = 'https://script.google.com/macros/s/AKfycbyABCDEFGHIJ123456/exec';

test('clientId: ৩২ হেক্স, স্থির, রিসেটে বদলায়', () => {
  const st = createSettingsStore(mem());
  const a = st.clientId();
  assert.match(a, /^[a-f0-9]{32}$/);
  assert.equal(st.clientId(), a);
  const b = st.resetClientId();
  assert.notEqual(a, b); assert.match(b, /^[a-f0-9]{32}$/);
  assert.notEqual(newClientId(), newClientId());
});
test('ডিফল্ট: পরিসংখ্যান বন্ধ, URL খালি, ভাষা ben+eng', () => {
  const g = createSettingsStore(mem()).get();
  assert.equal(g.usageStats, false); assert.equal(g.appsScriptUrl, ''); assert.equal(g.prefs.language, 'ben+eng');
});
test('সেটিং সংরক্ষণ ও অবৈধ মান বাদ', () => {
  const s = mem(); const st = createSettingsStore(s);
  st.set({ appsScriptUrl: OK_URL, usageStats: true, prefs: { language: 'ben', wordFont: 'Nikosh' } });
  st.set({ prefs: { language: 'klingon' } });
  const g = createSettingsStore(s).get();
  assert.equal(g.appsScriptUrl, OK_URL); assert.equal(g.usageStats, true);
  assert.equal(g.prefs.language, 'ben'); assert.equal(g.prefs.wordFont, 'Nikosh');
});
test('নষ্ট JSON থাকলেও ভেঙে পড়ে না', () => {
  const s = mem(); s.setItem('bangla-ocr-settings-v1', '{bad');
  assert.equal(createSettingsStore(s).get().usageStats, false);
});
test('URL যাচাই', () => {
  assert.equal(isValidAppsScriptUrl(OK_URL), true);
  assert.equal(isValidAppsScriptUrl('https://script.google.com/a/macros/example.com/s/AKfycbyABCDEFGHIJ123456/exec'), true);
  for (const bad of ['', 'http://script.google.com/macros/s/AKfycbyABCDEFGHIJ123456/exec', 'https://evil.com/macros/s/AKfycbyABCDEFGHIJ123456/exec', OK_URL + '/x', 'https://script.google.com/macros/s/short/exec']) assert.equal(isValidAppsScriptUrl(bad), false, bad);
});
const resp = (obj) => ({ json: async () => obj });
test('Client: অনুরোধের আকার ও সফল উত্তর', async () => {
  let seen;
  const c = createGasClient({ url: OK_URL, clientId: 'a'.repeat(32), fetchImpl: async (u, o) => { seen = { u, o }; return resp({ ok: true, data: { version: '1' } }); } });
  assert.deepEqual(await c.ping(), { version: '1' });
  assert.equal(seen.o.method, 'POST');
  assert.match(seen.o.headers['Content-Type'], /^text\/plain/); // Preflight এড়াতে
  const body = JSON.parse(seen.o.body);
  assert.deepEqual(Object.keys(body).sort(), ['action', 'clientId']);
});
test('Client: saveResult-এ সম্মতি-চিহ্ন ও শুধু প্রয়োজনীয় তথ্য', async () => {
  let body;
  const c = createGasClient({ url: OK_URL, clientId: 'a'.repeat(32), fetchImpl: async (u, o) => { body = JSON.parse(o.body); return resp({ ok: true, data: {} }); } });
  await c.saveResult({ title: 't', mode: 'text', pages: 1, text: 'ক', extra: 'x' });
  assert.equal(body.consent, true); assert.equal(body.extra, undefined);
});
test('Client: ত্রুটির বাংলা বার্তা', async () => {
  const mk = (fetchImpl) => createGasClient({ url: OK_URL, clientId: 'a'.repeat(32), fetchImpl });
  await assert.rejects(() => mk(async () => { throw new TypeError('x'); }).ping(), (e) => e instanceof GasError && e.code === 'network');
  await assert.rejects(() => mk(async () => ({ json: async () => { throw new Error('html'); } })).ping(), (e) => e.code === 'not_json' && /Anyone/.test(e.message));
  await assert.rejects(() => mk(async () => resp({ ok: false, error: 'quota', message: 'x' })).ping(), (e) => e.code === 'quota' && /সীমা/.test(e.message));
  await assert.rejects(() => mk(async (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))))).ping.call(null), () => true).catch(() => {});
});
test('Client: Timeout', async () => {
  const c = createGasClient({ url: OK_URL, clientId: 'a'.repeat(32), timeoutMs: 20, fetchImpl: (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))) });
  await assert.rejects(() => c.ping(), (e) => e.code === 'network' && /Timeout/.test(e.message));
});
