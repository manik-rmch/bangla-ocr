# Phase 15 — GitHub Pages ডিপ্লয় (v0.15.0)

সাইটের ঠিকানা: https://manik-rmch.github.io/bangla-ocr/

## এই ধাপে যা যোগ/পরিবর্তন হলো
- `scripts/verify-dist.mjs`: `npm run build`-এর পর নিজে নিজে চলে। OCR ইঞ্জিন, বাংলা/ইংরেজি ডেটা, `index.html`-এর লিংক (base `/bangla-ocr/`) না থাকলে Build ব্যর্থ হয়, ফলে ভাঙা সাইট Deploy হয় না।
- `.github/workflows/deploy.yml`: Deploy-এর আগে `npm test` চলে; ১৫ মিনিটের সময়সীমা।
- `public/404.html`: ভুল ঠিকানায় গেলে ৩ সেকেন্ডে মূল পাতায় ফেরে।
- `public/.nojekyll`, ফেভিকন (ব্রাউজার ট্যাবের আইকন), `health.json` ফেজ ১৫।
- যাচাই: কোড ও কনফিগে কোনো বাইরের CDN বা `/`-দিয়ে-শুরু হার্ডকোডেড পথ নেই; সব ফাইল `BASE_URL` দিয়ে লোড হয়।

## প্রথমবার Deploy (ধাপে ধাপে)
1. GitHub-এ `bangla-ocr` Repository খুলুন (নামটি হুবহু `bangla-ocr` হতে হবে)।
2. ZIP খুলে ভেতরের সব ফাইল Repository-র মূলে রাখুন (`.github` ফোল্ডারসহ) এবং `main` branch-এ push/upload করুন।
3. Repository → **Settings → Pages → Source = GitHub Actions** বাছুন।
4. **Actions** ট্যাবে "Deploy to GitHub Pages" চলবে (২–৫ মিনিট)। দুটি ধাপই সবুজ হলে সাইট চালু।
5. ঠিকানা খুলে ১) Text OCR-এ একটি ছবি ও ২) Document OCR-এ একটি PDF দিয়ে দেখুন।

## সমস্যা হলে
| লক্ষণ | কারণ/সমাধান |
|---|---|
| সাইট সাদা, Console-এ ৪০৪ | Repository-র নাম `bangla-ocr` নয়; অথবা `vite.config.js`-এর `base` বদলান |
| Actions-এ "npm test" লাল | লগের লাল অংশের ছবি পাঠান |
| "dist যাচাই ব্যর্থ" | বার্তায় কোন ফাইল নেই লেখা থাকবে; ছবি পাঠান |
| Pages Source বিকল্প নেই | Settings → Pages-এ GitHub Actions বাছাই করা হয়নি |
| বাংলা OCR ধীর/ভুল | প্রথমবার ~১২–২০ MB ডেটা নামে; পরের বার ক্যাশ থেকে। নির্ভুলতা ছবির মানের ওপর নির্ভর করে |

## সৎ সীমাবদ্ধতা
- আসল `npm install`/`vite build` এই পরিবেশে চালানো যায়নি (npm বন্ধ)। `verify-dist` কৃত্রিম dist-এ পরীক্ষিত (ঠিক/ভুল দুই অবস্থায়), আসল build-এ নয়। আপনার Actions-এ প্রথম চালানোই আসল পরীক্ষা।
- লক ফাইল (`package-lock.json`) নেই, তাই প্যাকেজ সংস্করণ `^` সীমার মধ্যে নতুনতম নেওয়া হবে। প্রথম সফল build-এর পর আপনার কম্পিউটারে `npm install` চালিয়ে `package-lock.json` Commit করলে সংস্করণ স্থির থাকবে।
- Google Apps Script ঐচ্ছিক; Settings-এ URL না দিলে সব কাজ শুধু ব্রাউজারে হয়।
