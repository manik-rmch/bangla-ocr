// gas/Code.gs পরীক্ষা: নকল Google Sheet দিয়ে (Node ১৮+): node --test tests/gas.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { makeEnv } from './gas-mock.mjs';

const ID = 'a'.repeat(32);
const ID2 = 'b'.repeat(32);

test('setup ট্যাব ও হেডার বানায়, আবার চালালে ঠিক থাকে', () => {
  const { env, sheets } = makeEnv();
  env.setup(); env.setup();
  assert.deepEqual([...sheets.keys()], ['Settings', 'Usage', 'Results']);
  assert.equal(sheets.get('Results').rows.length, 1);
});

test('doGet ও ping', () => {
  const { env, call } = makeEnv();
  assert.equal(JSON.parse(env.doGet().s).ok, true);
  assert.equal(call({ action: 'ping', clientId: ID }).ok, true);
});

test('ভুল অনুরোধ প্রত্যাখ্যান', () => {
  const { call } = makeEnv();
  assert.equal(call('').error, 'empty');
  assert.equal(call('{oops').error, 'bad_json');
  assert.equal(call({ action: 'ping', clientId: 'short' }).error, 'bad_client');
  assert.equal(call({ action: 'hack', clientId: ID }).error, 'bad_action');
  assert.equal(call('x'.repeat(130000)).error, 'too_large');
});

test('settings: সংরক্ষণ, ফিরিয়ে আনা, অনুমোদিত-নয় এমন কী বাদ', () => {
  const { call } = makeEnv();
  assert.deepEqual(call({ action: 'getSettings', clientId: ID }).data.prefs, null);
  assert.equal(call({ action: 'saveSettings', clientId: ID, prefs: { language: 'ben', wordFont: 'Nikosh', evil: 'x' } }).ok, true);
  assert.equal(call({ action: 'saveSettings', clientId: ID, prefs: { language: 'ben+eng' } }).ok, true); // আপডেট
  assert.deepEqual(call({ action: 'getSettings', clientId: ID }).data.prefs, { language: 'ben+eng' });
  assert.equal(call({ action: 'getSettings', clientId: ID2 }).data.prefs, null); // অন্যজন দেখে না
  assert.equal(call({ action: 'saveSettings', clientId: ID, prefs: [1] }).ok, false);
});

test('usage: শুধু অনুমোদিত তথ্য, clientId সরাসরি নয়', () => {
  const { call, sheets } = makeEnv();
  assert.equal(call({ action: 'logUsage', clientId: ID, mode: 'text', pages: 3, ok: true, lang: 'ben+eng', ms: 1200, text: 'গোপন লেখা' }).ok, true);
  assert.equal(call({ action: 'logUsage', clientId: ID, mode: 'virus' }).error, 'bad_mode');
  const row = sheets.get('Usage').rows[1].map((c) => c.v);
  assert.ok(!row.join('|').includes(ID) && !row.join('|').includes('গোপন'));
  assert.equal(row[2], 'text'); assert.equal(row[3], '3');
});

test('result: সম্মতি ছাড়া নয়; সংরক্ষণ-তালিকা-পড়া-মোছা শুধু নিজের', () => {
  const { call } = makeEnv();
  assert.equal(call({ action: 'saveResult', clientId: ID, mode: 'text', text: 'ক' }).error, 'no_consent');
  const s = call({ action: 'saveResult', clientId: ID, consent: true, mode: 'text', title: 'রোস্টার', pages: 2, text: 'বাংলা লেখা' });
  assert.equal(s.ok, true);
  assert.equal(call({ action: 'listResults', clientId: ID }).data.items.length, 1);
  assert.equal(call({ action: 'listResults', clientId: ID2 }).data.items.length, 0);
  assert.equal(call({ action: 'getResult', clientId: ID, id: s.data.id }).data.text, 'বাংলা লেখা');
  assert.equal(call({ action: 'getResult', clientId: ID2, id: s.data.id }).error, 'not_found');
  assert.equal(call({ action: 'deleteResult', clientId: ID2, id: s.data.id }).error, 'not_found');
  assert.equal(call({ action: 'deleteResult', clientId: ID, id: s.data.id }).data.deleted, 1);
  assert.equal(call({ action: 'listResults', clientId: ID }).data.items.length, 0);
});

test('result: খালি/বড় লেখা, সূত্র-ইনজেকশন', () => {
  const { call, sheets } = makeEnv();
  assert.equal(call({ action: 'saveResult', clientId: ID, consent: true, mode: 'text', text: '   ' }).error, 'empty_text');
  assert.equal(call({ action: 'saveResult', clientId: ID, consent: true, mode: 'text', text: 'ক'.repeat(45001) }).error, 'text_too_long');
  assert.equal(call({ action: 'saveResult', clientId: ID, consent: true, mode: 'text', title: '=HYPERLINK("http://x")', text: '=1+1' }).ok, true);
  for (const row of sheets.get('Results').rows.slice(1)) for (const c of row) assert.equal(c.formula, false);
});

test('result: কোটা (প্রতি clientId-তে সর্বোচ্চ ২০০)', () => {
  const { env, sheets, call } = makeEnv();
  env.setup();
  const sh = sheets.get('Results');
  for (let i = 0; i < 200; i++) sh.rows.push(['id' + i, 't', ID, 'x', 'text', '1', '1', 'ক'].map((v) => ({ v, formula: false })));
  assert.equal(call({ action: 'saveResult', clientId: ID, consent: true, mode: 'text', text: 'ক' }).error, 'quota');
  assert.equal(call({ action: 'saveResult', clientId: ID2, consent: true, mode: 'text', text: 'ক' }).ok, true);
});

test('rate limit', () => {
  const { call } = makeEnv();
  let last;
  for (let i = 0; i < 62; i++) last = call({ action: 'ping', clientId: ID2 });
  assert.equal(last.error, 'rate_limited');
});

test('deleteMyData শুধু নিজের সব তথ্য মোছে', () => {
  const { call } = makeEnv();
  call({ action: 'saveResult', clientId: ID, consent: true, mode: 'text', text: 'ক' });
  call({ action: 'saveResult', clientId: ID2, consent: true, mode: 'text', text: 'খ' });
  call({ action: 'saveSettings', clientId: ID, prefs: { language: 'ben' } });
  call({ action: 'logUsage', clientId: ID, mode: 'text', pages: 1, ok: true });
  call({ action: 'logUsage', clientId: ID2, mode: 'text', pages: 1, ok: true });
  const r = call({ action: 'deleteMyData', clientId: ID });
  assert.deepEqual(r.data, { results: 1, settings: 1, usage: 1 });
  assert.equal(call({ action: 'listResults', clientId: ID2 }).data.items.length, 1);
});

test('ভেতরের ত্রুটির বিবরণ ফাঁস হয় না', () => {
  const { env } = makeEnv();
  env.SpreadsheetApp.getActiveSpreadsheet = () => { throw new Error('SECRET-INTERNAL'); };
  const out = JSON.parse(env.doPost({ postData: { contents: JSON.stringify({ action: 'listResults', clientId: 'c'.repeat(32) }) } }).s);
  assert.equal(out.error, 'server');
  assert.ok(!JSON.stringify(out).includes('SECRET'));
});
