// ফাইল যাচাই: ধরন ও সাইজ
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
export const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf';

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp'];

export function getExtension(name) {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

export function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ফল: { ok: true, kind: 'image' | 'pdf' } অথবা { ok: false, error: '...' }
export function validateFile(file) {
  const ext = getExtension(file.name);
  let kind = null;
  if (ext === 'pdf' || file.type === 'application/pdf') kind = 'pdf';
  else if (IMAGE_EXT.includes(ext) && (!file.type || file.type.startsWith('image/'))) kind = 'image';

  if (!kind) {
    return { ok: false, error: `"${file.name}" সমর্থিত নয়। শুধু JPG, JPEG, PNG, WEBP বা PDF দিন।` };
  }
  if (file.size === 0) {
    return { ok: false, error: `"${file.name}" ফাঁকা ফাইল।` };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: `"${file.name}" অনেক বড় (${formatSize(file.size)})। সর্বোচ্চ ${formatSize(MAX_FILE_SIZE)} দেওয়া যাবে।` };
  }
  return { ok: true, kind };
}
