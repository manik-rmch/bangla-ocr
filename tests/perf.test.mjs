// ETA হিসাব পরীক্ষা: node --test tests/perf.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEta, formatEta, toBnDigits } from '../src/utils/eta.js';

test('বাংলা অঙ্ক ও সময়ের বাক্য', () => {
  assert.equal(toBnDigits(1205), '১২০৫');
  assert.equal(formatEta(12000), 'প্রায় ১০ সেকেন্ড বাকি');
  assert.equal(formatEta(60000), 'প্রায় ১ মিনিট বাকি');
  assert.equal(formatEta(150000), 'প্রায় ২ মিনিট ৩০ সেকেন্ড বাকি');
  assert.equal(formatEta(3900000), 'প্রায় ১ ঘণ্টা ৫ মিনিট বাকি');
  assert.equal(formatEta(NaN), '');
});
test('শুরুতে আন্দাজ নয়; পরে সঠিক', () => {
  let t = 0; const e = createEta(() => t); e.start();
  t = 2000; assert.equal(e.update(4), null);      // খুব আগে
  t = 10000; assert.equal(e.update(50), 10000);   // অর্ধেক হতে ১০ সেকেন্ড → বাকি ১০ সেকেন্ড
  t = 20000; const r = e.update(100); assert.equal(r, 0);
});
test('শতাংশ পিছিয়ে গেলেও লাফায় না, সর্বোচ্চ অগ্রগতি ধরে', () => {
  let t = 0; const e = createEta(() => t); e.start();
  t = 10000; e.update(50);
  t = 11000; const r = e.update(10); // পিছিয়ে গেল
  assert.ok(r > 0 && r < 20000);
});
test('মসৃণকরণ: হঠাৎ ধীর হলে আন্দাজ একবারে লাফিয়ে ওঠে না', () => {
  let t = 0; const e = createEta(() => t); e.start();
  t = 10000; const a = e.update(50);
  t = 30000; const b = e.update(60); // raw = 20000*40/60... আসলে elapsed*(40)/60
  const rawB = (30000 * 40) / 60;
  assert.ok(b < rawB && b > a * 0.9);
});
