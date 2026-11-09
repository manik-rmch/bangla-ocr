// মেমরি ব্যবস্থাপনা: বড় PDF/ছবির সময় Browser যেন আটকে না যায়।

// Browser-ভেদে Canvas-এর সর্বোচ্চ আকার আলাদা (মোবাইল Safari প্রায় ১৬.৭ মেগাপিক্সেল)।
// তাই সব Canvas এই সীমার ভেতরে রাখা হয়।
export const MAX_CANVAS_PIXELS = 16_000_000;

// প্রস্থ-উচ্চতা অনুযায়ী Scale ঠিক করে, যাতে Canvas সীমার বেশি না হয়।
export function safeScale(baseWidth, baseHeight, targetWidth) {
  const wanted = targetWidth / baseWidth;
  const maxByArea = Math.sqrt(MAX_CANVAS_PIXELS / (baseWidth * baseHeight));
  return Math.max(0.05, Math.min(wanted, maxByArea));
}

// অস্থায়ী Canvas-এর মেমরি ছেড়ে দেওয়া
export function releaseCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

// PDF Document পুরো বন্ধ করা (Worker ও পৃষ্ঠার ক্যাশ খালি হয়)
export function releasePdf(pdf) {
  if (!pdf) return;
  try { pdf.cleanup(); } catch (e) { /* ignore */ }
  try { pdf.destroy(); } catch (e) { /* ignore */ }
}
