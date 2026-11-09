// PDF খোলা (শুধু ব্রাউজারে, কোনো সার্ভারে নয়)
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// পুরোনো Browser-এর জন্য ছোট সমাধান
if (!Promise.withResolvers) {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function openPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjsLib.getDocument({ data });
  try {
    return await task.promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') {
      throw new Error('এই PDF পাসওয়ার্ড-সুরক্ষিত। পাসওয়ার্ডমুক্ত ফাইল দিন।');
    }
    throw new Error('PDF ফাইলটি নষ্ট অথবা পড়া যাচ্ছে না।');
  }
}
