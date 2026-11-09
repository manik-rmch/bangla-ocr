# Phase 5 — PDF Processing (সহজ বাংলা নির্দেশিকা)

## কী তৈরি হলো
- PDF-এর নিজস্ব লেখা ও তার অবস্থান (X/Y) বের করা: `src/modules/pdf/pdf-text-extractor.js`
- লেখা ভালো না ভাঙা — তা যাচাই। ভাঙা হলে অ্যাপ নিজেই OCR করে (কোনো লেখা অনুমান করা হয় না)।
- PDF বিশ্লেষণ: পৃষ্ঠার মাপ (A4/A3/Letter), Portrait/Landscape, লেখা আছে কি স্ক্যান — ফাইল কার্ডে দেখায়।
- Text OCR-এ "PDF-এর জন্য" বিকল্প: স্বয়ংক্রিয় / সব সময় OCR, এবং পৃষ্ঠা-রেঞ্জ (যেমন `1-3, 5`)।
- মেমরি সুরক্ষা: Canvas ১৬ মেগাপিক্সেলের বেশি হয় না; কাজ শেষে Canvas খালি হয়।
- ছোট Bug Fix: OCR শুরুর আগেই "বাতিল করুন" বাটন দেখাচ্ছিল — ঠিক করা হয়েছে।

## কোন ফাইল বদলেছে
নতুন: `src/modules/pdf/pdf-text-extractor.js`
বদলেছে: `pdf-loader.js`, `pdf-renderer.js`, `text-ocr.js`, `text-editor.js`, `uploader.js`,
`utils/helpers.js`, `utils/memory-management.js`, `styles/ocr.css`, `styles/main.css`, `package.json`, `README.md`

## কীভাবে Update করবেন
1. ZIP Extract করে ভেতরের সব ফাইল আপনার GitHub Repository-র ফাইলের উপর Upload করুন (Replace)।
2. `main` ব্রাঞ্চে Commit করুন। GitHub Actions নিজেই Build ও Deploy করবে (Actions ট্যাবে সবুজ টিক দেখুন)।
3. কম্পিউটারে চালাতে চাইলে: `npm install` তারপর `npm run dev`।

## কীভাবে পরীক্ষা করবেন
1. Text OCR খুলে রোস্টার PDF দিন। ফাইল কার্ডে দেখাবে: "A4 Portrait · লেখা ভাঙা, OCR লাগবে"।
2. "OCR শুরু করুন" চাপুন — সবুজ নয়, নীল নোটে জানাবে পৃষ্ঠাটি OCR হয়েছে।
3. একটি ইংরেজি PDF দিন — লেখা সরাসরি PDF থেকে আসবে, ফলের নিচে "উৎস: PDF-এর নিজস্ব লেখা" দেখাবে।
4. অনেক পৃষ্ঠার PDF-এ "পৃষ্ঠা" ঘরে `1-3` লিখে শুধু সেই পৃষ্ঠাগুলো করুন।

## জানা সীমাবদ্ধতা
- PDF.js বাংলা Text Layer প্রায়ই ভাঙা পড়ে (আপনার রোস্টারেও)। তাই এই ধরনের PDF-এ OCR-ই ব্যবহার হবে।
- রোস্টারের OCR মান (যেমন "টা" → "BT") Phase 6 (Image Enhancement) ও পরে উন্নত হবে।

## পরের Phase
Phase 6: Image Enhancement (Grayscale, Contrast, Threshold, Deskew, Crop ইত্যাদি)।
