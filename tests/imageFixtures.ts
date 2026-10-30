import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
  const body = new Uint8Array([...Buffer.from(type, "latin1"), ...data]);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(8 + data.length, crc32(body));
  return out;
}

export function png(width: number, height: number) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = new Uint8Array((width * 3 + 1) * height);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(rows))),
    chunk("IEND", new Uint8Array()),
  ];
  return new Uint8Array(parts.flatMap((part) => [...part]));
}

function exifSegment(orientation: number, littleEndian: boolean) {
  const tiff = new Uint8Array(26);
  const view = new DataView(tiff.buffer);
  view.setUint16(0, littleEndian ? 0x4949 : 0x4d4d);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian);
  view.setUint16(8, 1, littleEndian);
  view.setUint16(10, 0x0112, littleEndian);
  view.setUint16(12, 3, littleEndian);
  view.setUint32(14, 1, littleEndian);
  view.setUint16(18, orientation, littleEndian);
  const payload = new Uint8Array([...Buffer.from("Exif\0\0", "latin1"), ...tiff]);
  return new Uint8Array([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]);
}

export function jpeg(width: number, height: number, orientation?: number, littleEndian = false) {
  const jfif = [0xff, 0xe0, 0x00, 0x10, ...Buffer.from("JFIF\0", "latin1"), 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const frame = [0xff, 0xc0, 0x00, 0x11, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const exif = orientation === undefined ? [] : [...exifSegment(orientation, littleEndian)];
  return new Uint8Array([0xff, 0xd8, ...jfif, ...exif, ...frame, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
}
