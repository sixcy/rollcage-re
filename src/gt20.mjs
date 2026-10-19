// Behavioral reconstruction of Redux 1.3.8.0 FUN_00401380.
// Evidence: analysis/results/014-pseudo-decompress-wrapper.json.
// The original performs unchecked writes; this implementation checks bounds.
export function decodeGT20(input, { maxDecodedBytes = 128 * 1024 * 1024 } = {}) {
  if (!Buffer.isBuffer(input)) throw new TypeError('Input must be a Buffer.');
  if (input.length < 16 || input.toString('ascii', 0, 4) !== 'GT20') throw new Error('Missing GT20 header.');
  const decodedBytes = input.readUInt32LE(4);
  if (decodedBytes > maxDecodedBytes) throw new Error('Decoded size exceeds the configured limit.');
  const output = Buffer.alloc(decodedBytes);
  let source = 16 + input.readUInt32LE(12);
  let destination = 0;
  let control = 0;
  let remainingBits = 0;
  function requireInput(bytes) {
    if (source + bytes > input.length) throw new Error(`Truncated GT20 stream at ${source}.`);
  }
  function byte() { requireInput(1); return input[source++]; }
  function word() {
    requireInput(2);
    const value = input.readUInt16LE(source);
    source += 2;
    return value;
  }
  function bit() {
    // Refill on the next bit request. A token's data may precede the next
    // control word when its bits straddle a 32-bit boundary.
    if (remainingBits === 0) {
      requireInput(4);
      control = input.readUInt32LE(source);
      source += 4;
      remainingBits = 32;
    }
    const value = control & 1;
    control >>>= 1;
    remainingBits--;
    return value;
  }
  function copy(distance, length) {
    if (distance < 1 || distance > destination) throw new Error(`Invalid GT20 back-reference at output ${destination}.`);
    if (destination + length > output.length) throw new Error('GT20 match exceeds the declared decoded size.');
    // Forward byte copies intentionally preserve overlapping LZ matches.
    for (let i = 0; i < length; i++) {
      output[destination] = output[destination - distance];
      destination++;
    }
  }
  for (;;) {
    if (bit() === 0) {
      if (destination >= output.length) throw new Error('GT20 literal exceeds the declared decoded size.');
      output[destination++] = byte();
    } else if (bit() === 0) {
      const distance = 256 - byte();
      const length = 2 + bit() * 2 + bit();
      copy(distance, length);
    } else {
      const token = word();
      let distance = 8192 - (token >>> 3);
      let length = token & 7;
      if (length === 0) {
        const extra = byte();
        if (extra & 0x80) distance += 8192;
        length = extra & 0x7f;
        if (length === 1) {
          if (destination !== output.length) throw new Error(`GT20 ended at ${destination}, expected ${output.length}.`);
          return { data: output, consumedBytes: source, trailingBytes: input.length - source };
        }
        length = length === 0 ? word() : length + 2;
      } else {
        length += 2;
      }
      if (length !== 0) copy(distance, length);
    }
  }
}
