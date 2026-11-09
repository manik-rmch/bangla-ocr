// PDF-এর পৃষ্ঠা Canvas-এ আঁকা
// প্রতিবার নতুন Canvas ব্যবহার হয়, তাই আগের কাজ বাতিল করলে কোনো জট লাগে না।
export function renderPageToCanvas(pdf, pageNum, targetWidth) {
  let task = null;
  let cancelled = false;
  const canvas = document.createElement('canvas');

  const promise = (async () => {
    const page = await pdf.getPage(pageNum);
    if (cancelled) { page.cleanup(); return null; }
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: targetWidth / base.width });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
    try {
      await task.promise;
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return null;
      throw e;
    } finally {
      page.cleanup();
    }
    return canvas;
  })();

  return {
    promise,
    cancel() { cancelled = true; if (task) task.cancel(); }
  };
}

// ছোট Thumbnail (Data URL) তৈরি। কাজ শেষে Canvas খালি করা হয়।
export async function renderThumbnail(pdf, pageNum = 1, width = 240) {
  const { promise } = renderPageToCanvas(pdf, pageNum, width);
  const canvas = await promise;
  if (!canvas) return null;
  const url = canvas.toDataURL('image/jpeg', 0.8);
  canvas.width = 0;
  canvas.height = 0;
  return url;
}
