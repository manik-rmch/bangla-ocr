// ব্রাউজারে ফাইল ডাউনলোড ও PDF-এর জন্য ছাপার জানালা (Browser API লাগে; Node-এ পরীক্ষা হয় না)।
export function downloadBytes(filename, data, mime = 'application/octet-stream') {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  html: 'text/html;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  zip: 'application/zip'
};

/**
 * PDF: পুনর্গঠিত HTML একটি লুকানো Frame-এ খুলে ব্রাউজারের Print জানালা দেওয়া হয়।
 * সেখানে "Save as PDF / PDF হিসেবে সংরক্ষণ" বাছলে আসল লেখাসহ PDF হয়। (ফন্ট ও কাগজের মাপ আমরাই ঠিক করে দিই।)
 */
export function printHtml(html) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-99999px;top:0;width:1200px;height:900px;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const cleanup = () => setTimeout(() => frame.remove(), 1500);
    frame.onload = () => {
      const win = frame.contentWindow;
      let tries = 0;
      const wait = () => {
        const ready = win.document.documentElement.getAttribute('data-ready') === '1';
        if (ready || tries++ > 80) {
          try {
            win.addEventListener('afterprint', cleanup);
            win.focus();
            win.print();
            resolve();
          } catch (e) { cleanup(); reject(e); }
        } else setTimeout(wait, 50);
      };
      wait();
    };
    frame.srcdoc = html;
  });
}
