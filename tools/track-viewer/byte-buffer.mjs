// Only the Buffer operations used by the recovered readers; no Node polyfill.
export class ByteBuffer extends Uint8Array {
  static isBuffer(value) { return value instanceof ByteBuffer; }
  static alloc(length) { return new ByteBuffer(length); }
  static from(value) { return new ByteBuffer(value); }
  view(offset, bytes) {
    if (!Number.isInteger(offset) || offset < 0 || offset + bytes > this.length) throw new RangeError('Read exceeds buffer bounds.');
    return new DataView(this.buffer, this.byteOffset + offset, bytes);
  }
  readUInt32LE(offset) { return this.view(offset, 4).getUint32(0, true); }
  readUInt16LE(offset) { return this.view(offset, 2).getUint16(0, true); }
  readInt16LE(offset) { return this.view(offset, 2).getInt16(0, true); }
  toString(encoding, start = 0, end = this.length) {
    const bytes = this.subarray(start, end);
    if (encoding === 'ascii') return Array.from(bytes, byte => String.fromCharCode(byte & 127)).join('');
    if (encoding === 'base64') {
      let text = '';
      for (let p = 0; p < bytes.length; p += 8192) text += String.fromCharCode(...bytes.subarray(p, p + 8192));
      return btoa(text);
    }
    throw new Error(`Unsupported byte encoding: ${encoding}`);
  }
}
