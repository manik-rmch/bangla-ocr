// TXT ডাউনলোড। UTF-8 BOM থাকায় Windows Notepad-এও বাংলা ঠিক দেখায়।
export function downloadTxt(filename, text) {
  const body = String(text).replace(/\r?\n/g, '\r\n');
  const blob = new Blob(['\ufeff', body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
