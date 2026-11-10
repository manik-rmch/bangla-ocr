// ছোট ZIP লেখক (কোনো বাইরের লাইব্রেরি ছাড়া)। DOCX, XLSX ও ZIP ডাউনলোড এটি দিয়েই তৈরি হয়।
// ফাইলের নাম UTF-8 (বাংলা নামও চলে)। ব্রাউজারে CompressionStream থাকলে ছোট করা হয়, না থাকলে অসংকুচিত (Store) রাখা হয়।

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();
export const toBytes = (data) => (typeof data === 'string' ? enc.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data));

async function deflateRaw(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter();
    w.write(bytes);
    w.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/**
 * files: [{ name: 'a/b.txt', data: string | Uint8Array }]
 * ফেরত: Uint8Array (ZIP ফাইলের বাইট)
 */
export async function createZip(files, { compress = true, date = new Date() } = {}) {
  const { time, date: dd } = dosDateTime(date);
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const raw = toBytes(f.data);
    const crc = crc32(raw);
    let body = raw;
    let method = 0;
    if (compress && raw.length > 64) {
      const z = await deflateRaw(raw);
      if (z && z.length < raw.length) { body = z; method = 8; }
    }
    const head = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(method), ...u16(time), ...u16(dd),
      ...u32(crc), ...u32(body.length), ...u32(raw.length), ...u16(nameBytes.length), ...u16(0)
    ]);
    chunks.push(head, nameBytes, body);
    central.push({ nameBytes, crc, method, csize: body.length, size: raw.length, offset });
    offset += head.length + nameBytes.length + body.length;
  }
  const cdStart = offset;
  for (const c of central) {
    const rec = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(c.method), ...u16(time), ...u16(dd),
      ...u32(c.crc), ...u32(c.csize), ...u32(c.size), ...u16(c.nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(c.offset)
    ]);
    chunks.push(rec, c.nameBytes);
    offset += rec.length + c.nameBytes.length;
  }
  const cdSize = offset - cdStart;
  chunks.push(new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(cdSize), ...u32(cdStart), ...u16(0)]));
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/** data URL ("data:image/png;base64,...") → { mime, bytes } অথবা null */
export function dataUrlToBytes(url) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url || '');
  if (!m) return null;
  if (m[2]) {
    const bin = atob(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime: m[1], bytes };
  }
  return { mime: m[1], bytes: enc.encode(decodeURIComponent(m[3])) };
}
