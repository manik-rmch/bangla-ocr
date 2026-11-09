# বাংলা OCR Studio

ব্রাউজারে চলা বিনামূল্যের বাংলা ও ইংরেজি OCR। PDF/ছবি কোনো সার্ভারে যায় না।

- Live: https://manik-rmch.github.io/bangla-ocr/
- Hosting: GitHub Pages | Backend (ঐচ্ছিক): Google Apps Script | Data: Google Sheets

## Deploy
`main` ব্রাঞ্চে ফাইল Upload করলে GitHub Actions নিজেই Build করে Deploy করে।
প্রথমবার: Repository → Settings → Pages → Source = **GitHub Actions**।

## অগ্রগতি
- [x] Phase 1: Project Setup
- [x] Phase 2: Dashboard ও Responsive UI
- [x] Phase 3: File Upload ও Preview
- [x] Phase 4: Text OCR Engine (Tesseract.js, Progress, Cancel, Result Editor, TXT)
- [x] Phase 5: PDF Processing (নিজস্ব Text Layer + স্থানাঙ্ক, লেখার মান যাচাই ও OCR-এ স্বয়ংক্রিয় ফিরে যাওয়া, পৃষ্ঠা-রেঞ্জ, মেমরি সীমা, PDF বিশ্লেষণ)
- [x] Phase 6: Image Enhancement (Grayscale, Brightness, Contrast, Threshold, Noise, Sharpen, Upscale, Deskew, Crop, Rotate, Original বনাম Enhanced) + OCR সংশোধন
- [x] Phase 7: Document Analysis (টেবিল, শিরোনাম, উপশিরোনাম, Heading, অনুচ্ছেদ, Bullet/Numbered তালিকা, স্বাক্ষর ব্লক, Header/Footer শনাক্ত; পৃষ্ঠার উপর রঙিন Overlay ও JSON ডাউনলোড)
