import { deflateSync } from 'node:zlib';

// A real 2 × 2 PNG, generated entirely from synthetic pixels. No user media.
export function pngBlob(): Blob {
  const crc = (bytes: Uint8Array) => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length);
    result.write(type, 4, 'ascii');
    result.set(data, 8);
    result.writeUInt32BE(crc(result.subarray(4, -4)), result.length - 4);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 6;
  const row = [0, 255, 0, 0, 255, 0, 255, 0, 255];
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(new Uint8Array([...row, ...row]))),
    chunk('IEND', new Uint8Array()),
  ]);
  return new Blob([new Uint8Array(png)], { type: 'image/png' });
}
