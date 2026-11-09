# Phase 6 — Image Enhancement ও OCR সংশোধন (সহজ বাংলা নির্দেশিকা)

## কী তৈরি হলো
**পূর্বের দুর্বলতা সংশোধন (Text OCR)**
- "নিরাপদ সংশোধন" (চালু থাকে): বাংলা বাক্যের শেষে ভুল `|` → `।`; URL-এর বাড়তি স্পেস (`https: //`, `github. io /path`, `/ # admin`) ঠিক করা।
- "লেখার ধরন" বাছাই: সাধারণ লেখা / **একক ব্লক (টেবিল, রোস্টার, ছকের জন্য)** / ছড়ানো লেখা।
- Editor-এ নতুন বাটন "ফাঁকা লাইন বাদ"।
- আপনার নমুনায় "AEE" (আসলে "নাম্বার") — এমন ভুল শব্দ আমি অনুমান করে বদলাই না; Editor-এ নিজে সংশোধন করুন।
  লেখা প্রায় পুরো বাংলা হলে ভাষা "বাংলা (ben)" বাছুন, এতে ভুল ইংরেজি অক্ষর কম আসে।

**Image Enhancement (নতুন Panel — OCR সেটিংসের উপরে)**
- Grayscale, Brightness, Contrast, Sharpen, Noise Reduction, Black & White (স্বয়ংক্রিয়/নিজে Threshold)
- ছোট ছবি বড় করা (Upscale), হেলানো ছবি সোজা করা (Deskew)
- Crop (Original ছবির উপর মাউস/আঙুলে টেনে), ৯০° Rotate
- Original ও Enhanced পাশাপাশি Preview; আসল ছবি কখনো বদলায় না
- "প্রস্তাবিত সেটিংস" ও "রিসেট" বাটন; পুরো Panel চালু/বন্ধ করা যায়

## নতুন/বদলানো ফাইল
নতুন: `image-processing/image-tools.js`, `image-processing/image-enhancement.js`,
`components/enhancement-panel.js`, `text-ocr/text-cleanup.js`, `styles/enhance.css`
বদলেছে: `text-ocr.js`, `text-editor.js`, `workers/ocr-worker.js`, `workspace.js`, `pages.js`, `main.js`, `ocr.css`, `package.json`, `README.md`

## কীভাবে Update করবেন
1. ZIP Extract করে সব ফাইল GitHub Repository-তে আগের ফাইলের উপর Upload (Replace) করুন।
2. `main` ব্রাঞ্চে Commit করুন; Actions ট্যাবে সবুজ টিক এলে সাইট Update হয়েছে।

## কীভাবে পরীক্ষা করবেন
1. Text OCR-এ আপনার সেই ছবিটি দিন। Panel-এ বাম পাশে Original, ডান পাশে Enhanced দেখুন।
2. প্রথমে Enhancement **বন্ধ** করে OCR করুন, তারপর **চালু** করে (এবং "প্রস্তাবিত সেটিংস" চেপে) আবার করুন — ফল তুলনা করুন।
3. হেলানো ছবিতে "Deskew" চালু করুন; Preview-র নিচে লেখা আসবে "হেলানো ছিল ...°"।
4. রোস্টার/টেবিলের ছবিতে "লেখার ধরন" = "একক ব্লক" দিন।
5. ছবির কোনো অংশ বাদ দিতে Original-এর উপর টেনে Crop করুন; "Crop সরান" দিয়ে ফেরান।

## জানা সীমাবদ্ধতা
- OCR-এর নির্ভুলতা বাড়বে কি না তা ছবির ধরনের উপর নির্ভর করে; তাই চালু/বন্ধ তুলনা করে দেখুন।
  পরিষ্কার ছবিতে Threshold ও Noise Reduction কখনো ক্ষতি করে — সেক্ষেত্রে বন্ধ রাখুন।
- Crop ও Rotate PDF-এর ক্ষেত্রে সব পৃষ্ঠায় একই প্রযোজ্য।
- OpenCV.js ব্যবহার করিনি; সব ধাপ Canvas ও সাধারণ JavaScript-এ, তাই অতিরিক্ত ডাউনলোড ছাড়াই চলে।
  (Phase 8 Table Detection-এ OpenCV.js প্রয়োজন হলে তখন যুক্ত হবে।)

## পরের Phase
Phase 7: Document Analysis (Document OCR মোড — পৃষ্ঠার ধরন, শিরোনাম, অনুচ্ছেদ, টেবিল, স্বাক্ষর শনাক্ত)।
