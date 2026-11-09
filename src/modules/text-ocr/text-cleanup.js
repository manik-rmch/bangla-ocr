// OCR ফলের নিরাপদ সংশোধন।
// নিয়ম: শুধু এমন ভুলই ঠিক করা হয় যেখানে মূল লেখা নিশ্চিতভাবে জানা যায়।
// কোনো শব্দ অনুমান করে বসানো হয় না (যেমন "AEE" কখনো "নাম্বার" করা হয় না)।

const BN = '\\u0980-\\u09FF';

export function cleanOcrText(input) {
  let t = String(input || '').replace(/\r\n/g, '\n');

  // ১) বাংলা লেখার পরে একা '|' আসলে সেটি দাঁড়ি '।' (OCR প্রায়ই দাঁড়িকে সরলরেখা পড়ে)
  t = t.replace(new RegExp(`([${BN}])(\\s*)\\|(?=\\s|$)`, 'g'), '$1$2।');

  // ২) URL-এর ভেতরের অতিরিক্ত স্পেস
  t = t.replace(/\b(https?|ftp):\s+\/\//gi, '$1://');
  // "rmch. github. io" → "rmch.github.io" (শুধু যে লাইনে URL-এর লক্ষণ আছে সেখানে)
  const parts = '(?:github|google|gmail|facebook|gov|edu|com|org|net|info|io|bd)';
  const urlish = /:\/\/|www\.|github|\.(?:io|com|org|net|bd|edu|info)[ \t]*\//;
  t = t.split('\n').map((line) => (urlish.test(line)
    ? line.replace(new RegExp(`(?<=[a-z0-9-])\\.[ \\t]+(?=${parts}\\b)`, 'g'), '.')
    : line)).join('\n');
  // "io /path" → "io/path"
  t = t.replace(/(\.(?:io|com|org|net|bd|edu|info))[ \t]+\/(?=\S)/g, '$1/');
  // "/ # admin" → "/#admin"
  t = t.replace(/\/[ \t]+#[ \t]*(?=[A-Za-z])/g, '/#');
  // URL আছে এমন লাইনের শেষে '=' থাকলে সেটি লাইন-ভাঙা হাইফেন '-'
  t = t.replace(/^(.*:\/\/\S*[A-Za-z0-9])=[ \t]*$/gm, '$1-');

  // ৩) লাইনের শেষের বাড়তি স্পেস ও তিন বা তার বেশি ফাঁকা লাইন
  t = t.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  return t;
}

// সব ফাঁকা লাইন বাদ দেয় (Editor-এর "ফাঁকা লাইন বাদ" বাটনের জন্য)
export function removeBlankLines(input) {
  return String(input || '').split('\n').filter((l) => l.trim() !== '').join('\n');
}
