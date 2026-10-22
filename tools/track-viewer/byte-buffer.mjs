// Buffer operations required by the readers and recovered solo runtime.
export class ByteBuffer extends Uint8Array {
  static isBuffer(value) { return value instanceof ByteBuffer; }
  static alloc(length, fill = 0) {
    if (!Number.isInteger(length) || length < 0) throw new RangeError('Invalid buffer length.');
    return new ByteBuffer(length).fill(fill);
  }
  static from(value, encoding = 'utf8') {
    if (typeof value !== 'string') return new ByteBuffer(value);
    if (encoding === 'hex') {
      const bytes = [];
      for (let i = 0; i + 1 < value.length && /^[0-9a-f]{2}$/i.test(value.slice(i, i + 2)); i += 2) bytes.push(parseInt(value.slice(i, i + 2), 16));
      return new ByteBuffer(bytes);
    }
    if (encoding === 'utf8' || encoding === 'utf-8') return new ByteBuffer(new TextEncoder().encode(value));
    if (encoding === 'ascii' || encoding === 'latin1') return new ByteBuffer(Array.from(value, char => char.charCodeAt(0) & 255));
    throw Error(`Unsupported byte encoding: ${encoding}`);
  }
  view(offset, bytes) {
    if (!Number.isInteger(offset) || offset < 0 || offset + bytes > this.length) throw new RangeError('Read exceeds buffer bounds.');
    return new DataView(this.buffer, this.byteOffset + offset, bytes);
  }
  readUInt32LE(offset) { return this.view(offset, 4).getUint32(0, true); }
  readUInt16LE(offset) { return this.view(offset, 2).getUint16(0, true); }
  readInt16LE(offset) { return this.view(offset, 2).getInt16(0, true); }
  readInt32LE(offset) { return this.view(offset, 4).getInt32(0, true); }
  readUInt8(offset) { return this.view(offset, 1).getUint8(0); }
  readInt8(offset) { return this.view(offset, 1).getInt8(0); }
  readFloatLE(offset) { return this.view(offset, 4).getFloat32(0, true); }
  readDoubleLE(offset) { return this.view(offset, 8).getFloat64(0, true); }
  readBigUInt64LE(offset) { return this.view(offset, 8).getBigUint64(0, true); }
  writeBigUInt64LE(value, offset) {
    if (value < 0n || value > 0xffffffffffffffffn) throw new RangeError('Value exceeds buffer integer range.');
    this.view(offset, 8).setBigUint64(0, value, true); return offset + 8;
  }
  writeNumber(value, offset, bytes, setter, min, max) {
    if (min !== undefined && !(value >= min && value <= max)) throw new RangeError('Value exceeds buffer integer range.');
    this.view(offset, bytes)[setter](0, value, true); return offset + bytes;
  }
  writeUInt8(value, offset) { return this.writeNumber(value, offset, 1, 'setUint8', 0, 255); }
  writeInt8(value, offset) { return this.writeNumber(value, offset, 1, 'setInt8', -128, 127); }
  writeUInt16LE(value, offset) { return this.writeNumber(value, offset, 2, 'setUint16', 0, 65535); }
  writeInt16LE(value, offset) { return this.writeNumber(value, offset, 2, 'setInt16', -32768, 32767); }
  writeUInt32LE(value, offset) { return this.writeNumber(value, offset, 4, 'setUint32', 0, 0xffffffff); }
  writeInt32LE(value, offset) { return this.writeNumber(value, offset, 4, 'setInt32', -2147483648, 2147483647); }
  writeFloatLE(value, offset) { return this.writeNumber(value, offset, 4, 'setFloat32'); }
  writeDoubleLE(value, offset) { return this.writeNumber(value, offset, 8, 'setFloat64'); }
  copy(target, targetStart = 0, sourceStart = 0, sourceEnd = this.length) {
    if (![targetStart, sourceStart, sourceEnd].every(Number.isInteger) || targetStart < 0 || sourceStart < 0 || sourceEnd < 0 || sourceStart > this.length) throw new RangeError('Copy exceeds buffer bounds.');
    const count = Math.max(0, Math.min(sourceEnd, this.length) - sourceStart);
    const copied = Math.min(count, Math.max(0, target.length - targetStart));
    if (copied) target.set(this.subarray(sourceStart, sourceStart + copied), targetStart);
    return copied;
  }
  toString(encoding = 'utf8', start = 0, end = this.length) {
    const bytes = this.subarray(start, end);
    if (encoding === 'ascii') return Array.from(bytes, byte => String.fromCharCode(byte & 127)).join('');
    if (encoding === 'latin1') return Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    if (encoding === 'hex') return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    if (encoding === 'utf8' || encoding === 'utf-8') return new TextDecoder().decode(bytes);
    if (encoding === 'base64') {
      let text = '';
      for (let p = 0; p < bytes.length; p += 8192) text += String.fromCharCode(...bytes.subarray(p, p + 8192));
      return btoa(text);
    }
    throw new Error(`Unsupported byte encoding: ${encoding}`);
  }
}
