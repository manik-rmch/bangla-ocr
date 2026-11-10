// বাকি সময়ের আন্দাজ (ETA)। কাজ কতটা হলো (শতাংশ) আর কত সময় গেল দেখে হিসাব করা হয়। কোনো Browser API নেই।
const BN = '০১২৩৪৫৬৭৮৯';
export const toBnDigits = (n) => String(n).replace(/\d/g, (d) => BN[d]);

/** মিলিসেকেন্ড → "প্রায় ২ মিনিট ৩০ সেকেন্ড বাকি" */
export function formatEta(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `প্রায় ${toBnDigits(Math.max(5, Math.round(s / 5) * 5))} সেকেন্ড বাকি`;
  const totalMin = Math.floor(s / 60);
  const sec = Math.round((s % 60) / 10) * 10;
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    return `প্রায় ${toBnDigits(h)} ঘণ্টা ${toBnDigits(totalMin % 60)} মিনিট বাকি`;
  }
  if (sec === 0 || sec === 60) return `প্রায় ${toBnDigits(totalMin + (sec === 60 ? 1 : 0))} মিনিট বাকি`;
  return `প্রায় ${toBnDigits(totalMin)} মিনিট ${toBnDigits(sec)} সেকেন্ড বাকি`;
}

/**
 * ETA হিসাবকারী। update(percent) প্রতিবার ডাকুন; ফেরত: বাকি মিলিসেকেন্ড অথবা null (এখনো আন্দাজ করা যায় না)।
 * শুরুতে (৮% এর আগে বা ৫ সেকেন্ডের আগে) আন্দাজ ভুল হয়, তাই তখন null।
 * percent পিছিয়ে গেলে (যেমন নতুন পৃষ্ঠা) আগের নিরাপদ মান ধরে রাখে।
 */
export function createEta(now = () => Date.now()) {
  let t0 = null;
  let best = 0;
  let smooth = null;
  return {
    start() { t0 = now(); best = 0; smooth = null; },
    update(percent) {
      if (t0 == null) t0 = now();
      const p = Math.max(0, Math.min(100, Number(percent) || 0));
      if (p > best) best = p;
      const elapsed = now() - t0;
      if (best >= 100) return 0;
      if (best < 8 || elapsed < 5000) return null;
      const raw = (elapsed * (100 - best)) / best;
      smooth = smooth == null ? raw : smooth * 0.7 + raw * 0.3; // হঠাৎ লাফ কমাতে
      return smooth;
    }
  };
}
