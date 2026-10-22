import {abs32, divideQ16, multiplyQ16} from './fixed-integer.mjs';
import {rawVectorLength} from './raw-vector-normalization.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);

//41e910. Accumulate packed polygon normals by occurrence, then normalize
//their sum. Duplicate indices count repeatedly, including a fourth vertex.
//The unused fourth WORD in each eight-byte output record stays untouched.
export function buildModelVertexNormals(model, output, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 48;
  put(m, scratchBase - 28, 0); put(m, scratchBase - 16, model);
  if (!m.readUInt16LE(model + 4)) return;
  put(m, frame + 0x1c, output + 4);
  do {
    model = ptr(m, frame + 0x20);
    let face = ptr(m, model + 12), x = 0, y = 0, z = 0, matches = 0;
    put(m, frame + 0x10, 0); put(m, frame + 0x2c, 0); put(m, frame + 0x28, 0); put(m, frame + 0x24, 0);
    put(m, frame + 0x18, m.readUInt16LE(model + 6));
    if (get(m, frame + 0x18)) {
      do {
        let packed = ptr(m, face);
        for (let lane = 0; lane < 4; lane++) {
          if ((packed & 255) - 1 === get(m, frame + 0x14)) {
            const normal = get(m, face + 4);
            x = x + (((normal << 2) >> 18) << 4) | 0;
            z = z + (((normal << 22) >> 18) << 4) | 0;
            y = y + (((normal << 12) >> 18) << 4) | 0;
            put(m, frame + 0x24, x); put(m, frame + 0x28, y); put(m, frame + 0x2c, z);
            matches++; put(m, frame + 0x10, matches);
          }
          packed >>>= 8;
        }
        face += 8; put(m, frame + 0x18, get(m, frame + 0x18) - 1);
      } while (get(m, frame + 0x18));
      if (matches > 0 && (x || y || z)) {
        if (abs32(x) > 0x230000 || abs32(y) > 0x230000 || abs32(z) > 0x230000) {
          x >>= 3; y >>= 3; z >>= 3; put(m, frame + 0x24, x); put(m, frame + 0x28, y); put(m, frame + 0x2c, z);
        }
        const length = rawVectorLength(frame + 0x24, runtime), inverse = divideQ16(65536, length);
        put(m, frame + 0x10, inverse); put(m, frame + 0x18, x); x = multiplyQ16(x, inverse);
        put(m, frame + 0x18, y); y = multiplyQ16(y, inverse);
        put(m, frame + 0x18, z); z = multiplyQ16(z, inverse);
      }
    }
    const target = ptr(m, frame + 0x1c), index = get(m, frame + 0x14) + 1;
    m.writeUInt16LE((x >> 4) & 65535, target - 4); m.writeUInt16LE((y >> 4) & 65535, target - 2); m.writeUInt16LE((z >> 4) & 65535, target);
    put(m, frame + 0x1c, target + 8); put(m, frame + 0x14, index);
  } while (get(m, frame + 0x14) < m.readUInt16LE(ptr(m, frame + 0x20) + 4));
}

//41e850. Lazy one-allocation cache shared by the base model and two optional
//relative child models. Native third-child placement reads firstChild+4 even
//when firstChild is zero; preserve that read rather than inventing a count.
export function initializeModelVertexNormals(model, runtime) {
  const {memory: m, scratchBase} = runtime;
  if (ptr(m, model + 0x48)) return;
  const firstOffset = m.readUInt16LE(model + 0x1c), first = firstOffset ? model + firstOffset : 0;
  let count = m.readUInt16LE(model + 4); if (first) count += m.readUInt16LE(first + 4);
  const secondOffset = m.readUInt16LE(model + 0x1e), second = secondOffset ? model + secondOffset : 0;
  if (second) count += m.readUInt16LE(second + 4);
  const size = count * 8, service = runtime.allocate ?? runtime.handlers?.allocate;
  if (typeof service !== 'function') throw Error('Model normal construction requires CRT allocation.');
  put(m, scratchBase - 4, size);
  const returned = service(size, runtime), base = typeof returned === 'number' ? returned : returned?.eax;
  if (!Number.isInteger(base)) throw Error('Model normal allocation requires explicit EAX pointer.');
  if (base) m.fill(0, base >>> 0, (base >>> 0) + size);
  put(m, model + 0x48, base);
  buildModelVertexNormals(model, base >>> 0, {...runtime, scratchBase: scratchBase - 24});
  if (first) {
    const destination = (base + m.readUInt16LE(model + 4) * 8) >>> 0; put(m, first + 0x48, destination);
    buildModelVertexNormals(first, destination, {...runtime, scratchBase: scratchBase - 24});
  }
  if (second) {
    const destination = (base + (m.readUInt16LE(first + 4) + m.readUInt16LE(model + 4)) * 8) >>> 0;
    put(m, second + 0x48, destination); buildModelVertexNormals(second, destination, runtime);
  }
}
