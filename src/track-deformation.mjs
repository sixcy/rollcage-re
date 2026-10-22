import {lookupRawSpatialBucket} from './body-retirement-effects.mjs';
import {normalizeCollisionVector} from './sphere-collision.mjs';

const pointer = (memory, address) => memory.readUInt32LE(address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);

//494c80. Count native flagged segments, allocate28-byte runtime rows, apply
//the phase-zero deformation and publish border displacement/color fields.
//47ea40 calls this after the loaded pack's segment roots are installed.
export function initializeTrackDeformation(runtime) {
  const {memory, handlers = {}, roundingMode} = runtime;
  let pack = pointer(memory, 0x90b98c), count = 0, sectors = pointer(memory, pack), remaining = pointer(memory, pack + 16);
  for (; remaining; remaining--, sectors += 4) if (memory[pointer(memory, sectors) + 6] & 63) count++;
  put(memory, 0x80df00, count); put(memory, 0x80df04, 0);
  if (!count) return;
  if (typeof handlers.allocate !== 'function') throw Error('Track deformation construction requires library allocate service.');
  const size = Math.imul(count, 28) >>> 0, returned = handlers.allocate(size, runtime), allocated = typeof returned === 'number' ? returned : returned?.eax;
  if (!Number.isInteger(allocated)) throw Error('Track deformation allocation requires explicit EAX pointer.');
  const base = allocated >>> 0;
  if (base) memory.fill(0, base, base + size);
  put(memory, 0x80df04, base);
  const sample = phase => memory.readInt16LE(0x5ed030 + (phase & 255) * 2) >> (((phase >> 8) & 3) === 0 ? 9 : 10);
  const enteredScan = pointer(memory, pack + 16) !== 0;
  let record = base;
  for (let sector = 0; sector < pointer(memory, pack + 16); sector++) {
    const authored = pointer(memory, pointer(memory, pack) + sector * 4);
    if (!(memory[authored + 6] & 63)) continue;
    word(memory, record + 2, 0); word(memory, record, sector);
    const skip = memory.readUInt16LE(authored + 6) & 63; word(memory, record + 10, skip);
    const segment = pointer(memory, pointer(memory, 0x909240) + (sector & 65535) * 4);
    word(memory, record + 4, memory.readUInt16LE(segment + 8) - skip + 1); word(memory, record + 6, memory.readUInt16LE(segment + 12));
    word(memory, record + 8, memory[segment + 6] & 64 ? 1 : -1);
    const vertices = pointer(memory, segment + 32); put(memory, record + 12, vertices);
    let border;
    if (memory.readUInt16LE(record + 8) === 1) {put(memory, record + 12, vertices + skip * 8); border = (vertices + skip * 8 - 8) >>> 0;}
    else border = (vertices + memory.readUInt16LE(record + 4) * 8) >>> 0;
    let vertex = pointer(memory, record + 12); put(memory, record + 16, border);
    for (let row = 0; row < memory.readUInt16LE(record + 6); row++) {
      let phase = row * 4;
      for (let column = 0; column < memory.readUInt16LE(record + 4); column++, vertex += 8, phase += 32) word(memory, vertex + 2, memory.readUInt16LE(vertex + 2) + sample(phase));
      vertex += skip * 8;
    }
    const columns = pointer(memory, segment + 8), middle = Math.imul(pointer(memory, segment + 12) >>> 1, (columns + 1) | 0), first = (pointer(memory, segment + 32) + Math.imul(middle, 8)) >>> 0, last = (first + Math.imul(columns, 8)) >>> 0;
    const difference = [0, 2, 4].map(offset => (memory.readInt16LE(last + offset) - memory.readInt16LE(first + offset)) | 0);
    const normalized = normalizeCollisionVector(difference, roundingMode, {normalizeReduction(bits, leading) {put(memory, 0x91d45c, bits); put(memory, 0x91d460, leading);}}).vector;
    const scaled = normalized.map(value => Math.imul(value, 45) >> 6), x = scaled[0] << 16 >> 16, z = scaled[2] << 16 >> 16;
    word(memory, record + 22, scaled[1]);
    const stride = (memory.readUInt16LE(record + 4) + memory.readUInt16LE(record + 10)) * 8;
    word(memory, record + 20, scaled[0]); border = pointer(memory, record + 16); word(memory, record + 24, scaled[2]);
    for (let row = 0, phase = -32; row < memory.readUInt16LE(record + 6); row++, phase += 4, border += stride) {
      const value = sample(phase);
      word(memory, border, memory.readUInt16LE(border) + (Math.imul(value, x) >> 9));
      word(memory, border + 4, memory.readUInt16LE(border + 4) + (Math.imul(value, z) >> 9));
    }
    record += 28; pack = pointer(memory, 0x90b98c);
  }
  //The empty-after-allocation jump bypasses494efb/f01: EDI/EBX still hold
  //the original count/base. A reached scan reloads both ownership globals.
  const finalCount = enteredScan ? pointer(memory, 0x80df00) : count, finalBase = enteredScan ? pointer(memory, 0x80df04) : base;
  if (finalCount) {
    const first = pointer(memory, finalBase + 12);
    let colors = pointer(memory, 0x909270);
    const alpha = memory[colors + (memory.readUInt16LE(first + 6) >>> 6) * 4 + 3];
    for (let value = 40, offset = 0xfbc; ; offset -= 4) {
      memory[colors + offset] = value; memory[colors + offset + 1] = value; memory[colors + offset + 2] = value; memory[colors + offset + 3] = alpha;
      value += 3; if (value >= 136) break;
      colors = pointer(memory, 0x909270);
    }
  }
}

//4176b0. Test the complete packed terrain-range chain of the actual spatial
//bucket. Its variable skip uses header bits11..15, then rounds down to even.
export function spatialBucketContainsSector(sector, position, runtime) {
  const {memory} = runtime;
  const found = lookupRawSpatialBucket(memory.readInt32LE(position), memory.readInt32LE(position + 4), memory.readInt32LE(position + 8), runtime);
  let range = pointer(memory, 0x90924c) + memory.readUInt16LE(found.bucket + 4) * 2;
  for (;;) {
    const flags = memory.readUInt16LE(range + 2);
    if (((flags >>> 1) & 127) === (sector >>> 0)) return 1;
    if (flags & 1) return 0;
    range = (range + (memory.readUInt16LE(range) >>> 11) + 4) & 0xfffffffe;
  }
}

//494f60. In-place animated terrain vertices/normals and border coordinates.
//Native mutable record pointers/widths/heights stay live at their read sites.
//The first participant's indirect body handle is reused for every eligible
//participant test; do not replace this native behavior with each body's pose.
export function updateTrackDeformation(runtime) {
  const {memory} = runtime;
  let remaining = memory.readInt32LE(0x80df00), record = pointer(memory, 0x80df04);
  const sample = (phase, shift) => memory.readInt16LE(0x5ed030 + (phase & 255) * 2) >> ((((phase >> 8) & 3) === 0 ? shift - 1 : shift) & 31);
  for (; remaining > 0; remaining--, record += 28) {
    let enabled = !!(memory[0x91ce90] & 2);
    if (!enabled) {
      let participants = memory[pointer(memory, 0x5ecb1c) + 0x54d], participant = 0x909318;
      for (; participants > 0; participants--, participant += 0x30c) {
        if (pointer(memory, participant) === 0x12345678) continue;
        const position = pointer(memory, pointer(memory, 0x909318)) + 0x34;
        if (spatialBucketContainsSector(memory.readUInt16LE(record), position, runtime)) {enabled = true; break;}
      }
    }
    if (!enabled) continue;
    const oldPhase = memory.readUInt16LE(record + 2), next = oldPhase + 1, phase = next >= 2048 ? 0 : next;
    let vertex = pointer(memory, record + 12);
    const skip = memory.readUInt16LE(record + 10) * 8;
    word(memory, record + 2, phase);
    let oldRow = (oldPhase * 4) | 0, newRow = (phase * 4) | 0;
    for (let row = 0; row < memory.readUInt16LE(record + 6); row++) {
      oldRow = (oldRow + 4) | 0; newRow = (newRow + 4) | 0;
      const shift = row === 0 ? 10 : 9, delta = (newRow - oldRow) | 0;
      let pointPhase = oldRow;
      for (let column = 0; column < memory.readUInt16LE(record + 4); column++, vertex += 8) {
        const y = memory.readInt16LE(vertex + 2), previous = sample(pointPhase, shift), current = sample((pointPhase + delta) | 0, shift);
        word(memory, vertex + 2, (y - previous + current) | 0);
        if (column < memory.readUInt16LE(record + 4) - 1) {
          pointPhase = (pointPhase + 32) | 0;
          word(memory, vertex + 6, (((current >> ((12 - shift) & 31)) << 6) - 0x840) | 6);
        }
      }
      vertex += skip;
    }
    const xAmplitude = memory.readInt16LE(record + 20), width = memory.readUInt16LE(record + 4);
    let border = pointer(memory, record + 16);
    const zAmplitude = memory.readInt16LE(record + 24), stride = (width + memory.readUInt16LE(record + 10)) * 8;
    let previousPhase = (oldPhase * 4 - 32) | 0, currentPhase = (previousPhase + (phase - oldPhase) * 4) | 0;
    for (let row = 0; row < memory.readUInt16LE(record + 6); row++, previousPhase = (previousPhase + 4) | 0, border += stride) {
      const previous = sample(previousPhase, 10), current = sample(currentPhase, 10);
      currentPhase = (currentPhase + 4) | 0;
      const zDelta = ((Math.imul(current, zAmplitude) >> 9) - (Math.imul(previous, zAmplitude) >> 9)) | 0;
      word(memory, border + 4, memory.readUInt16LE(border + 4) + zDelta);
      const xDelta = ((Math.imul(current, xAmplitude) >> 9) - (Math.imul(previous, xAmplitude) >> 9)) | 0;
      word(memory, border, memory.readUInt16LE(border) + xDelta);
    }
    const height = memory.readUInt16LE(record + 6), dirtyCount = pointer(memory, 0x80f210);
    if (dirtyCount < 64) {
      const dirty = (((height & 2047) << 18) | 0x40000000 | (memory.readUInt16LE(record) & 127)) | 0;
      if (!dirtyCount || memory.readInt32LE(0x80f41c + dirtyCount * 4) !== dirty) {put(memory, 0x80f420 + dirtyCount * 4, dirty); put(memory, 0x80f210, dirtyCount + 1);}
    }
  }
}
