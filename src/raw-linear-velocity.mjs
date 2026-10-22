import {abs32, multiplyQ16, divideQ16} from './fixed-integer.mjs';

//41ca60 accepts the machine's signed word, including overflowed squared sums.
//Normalization uses abs(input), but the signed root walk uses input itself.
function signedRoot(value, memory) {
  const absolute = abs32(value), leading = Math.clz32(absolute);
  memory.writeInt32LE(absolute, 0x91d45c); memory.writeInt32LE(leading, 0x91d460);
  const shift = Math.min(16, (leading - 2) & ~1);
  const scaled = shift > 0 ? value << shift : value >> (-shift & 31);
  let root = 0, square = 0, bit = 0x8000;
  for (let step = 15; step >= 0; step--) {
    const candidate = (square + ((bit + root * 2) << step)) | 0;
    if (candidate <= scaled) {root = (root + bit) | 0; square = candidate;}
    bit = (bit >>> 1) | ((bit & 1) << 31);
  }
  return root << (((16 - shift) / 2) & 31);
}

//479b30. body is the enclosing rigid object (native ECX=body+34h).
//Numeric locals are published when produced: later callers share this stack.
//Saved registers/return addresses remain ABI state, outside this adapter.
export function updateRawLinearVelocity(body, {memory, scratchBase}) {
  const get = address => memory.readInt32LE(address), put = (address, value) => memory.writeInt32LE(value | 0, address);
  const local = scratchBase - 32;
  if (get(body + 0xac) !== 65536) {
    for (let axis = 0; axis < 3; axis++) {
      put(local + 0x18, get(body + 0xac));
      put(local + 0x1c, get(body + 0x40 + axis * 4));
      const result = multiplyQ16(get(local + 0x1c), get(local + 0x18));
      if (axis < 2) put(body + 0x68 + axis * 4, result);
      else {
        const x = get(body + 0x68); put(body + 0x70, result);
        return limit(x);
      }
    }
  } else {
    put(body + 0x68, get(body + 0x40)); put(body + 0x6c, get(body + 0x44));
    const z = get(body + 0x48), x = get(body + 0x68); put(body + 0x70, z);
    return limit(x);
  }
  function limit(x) {
    if (abs32(x) <= 0x490000 && abs32(get(body + 0x6c)) <= 0x490000 && abs32(get(body + 0x70)) <= 0x490000) return;
    const y = get(body + 0x6c), z = get(body + 0x70);
    put(local + 12, x); put(local + 16, y); put(local + 20, z);
    const frame = local - 4;
    put(frame + 12, x >> 8); put(frame + 28, y >> 8); put(frame + 32, z >> 8);
    const reduced = [12, 28, 32].map(offset => get(frame + offset));
    const squared = reduced.reduce((sum, value) => (sum + multiplyQ16(value, value)) | 0, 0);
    if ((squared >>> 0) <= 0x4000) return;
    const length = signedRoot(squared << 8, memory) << 4;
    put(frame + 12, divideQ16(0x800000, length));
    const vx = multiplyQ16(get(frame + 12), get(frame + 16)); put(frame + 16, vx);
    const vy = multiplyQ16(get(frame + 12), get(frame + 20)); put(frame + 20, vy);
    const vz = multiplyQ16(get(frame + 12), get(frame + 24)); put(frame + 24, vz);
    put(body + 0x70, vz);
    const mass = get(body + 0xa8);
    put(body + 0x68, vx); put(body + 0x6c, vy); put(frame + 12, mass);
    const momentum = [16, 20, 24].map(offset => multiplyQ16(get(frame + 12), get(frame + offset)));
    momentum.forEach((value, axis) => put(body + 0x40 + axis * 4, value));
  }
}
