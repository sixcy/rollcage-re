import {nativeGlobalAddress} from './native-global-address.mjs';
import {loadGameBitmap} from './game-bitmap-images.mjs';
import {constructGameTexture} from './game-texture-construction.mjs';
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const library = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`HUD fonts require CRT ${name}.`); return r.services.libraryCall(name, args, r);};

//44fbc0. Glyph bounds, row/page packing and raw descriptor publication are
//game algorithms; existing actual bitmap/texture algorithms own their children.
export function constructRaceHudFont(object, cellWidth, startRow, scanHeight, unused, retain, reuse, runtime) {
  const {memory: m, scratchBase: S} = runtime, bp = S - 4, frame = S - 0x4c; let rowHeight = 0;
  if (!reuse) {
    const image = library(runtime, 'allocate', [65536]) >>> 0; if (image) {m.fill(0, image, image + 65536); m.fill(0, image, image + 65536);} put(m, 0x6fbb44, image); m.fill(0, image, image + 65536);
    if (!loadGameBitmap(0x5d068c, 0x6ffa40, 0, {...runtime, scratchBase: frame - 8})) return 0;
    const next = get(m, nativeGlobalAddress(m, 0x91ce98)) + 1 | 0; put(m, 0x6fbb18, next === 63 ? 64 : next); put(m, 0x6fc1b8, 0); put(m, 0x6fc198, 0); put(m, 0x6fbb48, 0);
    for (let i = 0, input = ptr(m, 0x6ffa50) + 1, output = 0x6ff642; i < 256; i++, input += 4, output += 4) {m[output - 2] = m[input - 1]; m[output - 1] = m[input]; m[output] = m[input + 1]; m[output + 1] = 0; if ((m[input] + m[input + 1] + m[input - 1] >> 2) < 15) put(m, output - 2, 0);}
    const pixels = m.readInt16LE(0x6ffa46) * m.readInt16LE(0x6ffa44); put(m, 0x6ff640, 0); for (let i = 0, input = ptr(m, 0x6ffa54); i < pixels; i++, input++) if (!get(m, 0x6ff640 + m[input] * 4)) m[input] = 0;
  } else rowHeight = get(m, 0x6fbb48);
  const imageHeight = m.readInt16LE(0x6ffa46); if (startRow >= imageHeight) startRow = imageHeight - 1; if ((scanHeight + startRow | 0) > imageHeight) scanHeight = imageHeight - startRow;
  let minimumTop = 0x8000, maximumBottom = -0x8000, offset = 0, lastHeight = 0;
  const upload = (height, esi, edi) => constructGameTexture(get(m, 0x6fbb18), 256, Math.min(height, 256), 8, ptr(m, 0x6fbb44), 0x6ff640, 0, {...runtime, scratchBase: frame - 24, entryRegisters: {...runtime.entryRegisters, EBP: bp, ESI: esi, EDI: edi}});
  for (let glyph = 0; glyph < 112; glyph++, offset += cellWidth) {
    const pitch = m.readInt16LE(0x6ffa44), input = ptr(m, 0x6ffa54) + Math.imul(pitch, startRow) + offset, limit = cellWidth - 1;
    let left = -1, rightPadding = -1, top = -1, bottomPadding = -1;
    scanLeft: for (let x = 0; x < limit; x++) for (let y = 0; y < scanHeight - 1; y++) if (m[input + x + y * pitch]) {left = x; break scanLeft;}
    scanRight: for (let x = 0; x < limit; x++) for (let y = 0; y < scanHeight - 1; y++) if (m[input + limit - x + y * pitch]) {rightPadding = x; break scanRight;}
    let right = cellWidth - rightPadding - 1;
    scanTop: for (let y = 0; y < scanHeight - 1; y++) for (let x = 0; x < limit; x++) if (m[input + y * pitch + x]) {top = y; break scanTop;}
    scanBottom: for (let y = 0; y < scanHeight - 1; y++) for (let x = 0; x < limit; x++) if (m[input + (scanHeight - 1 - y) * pitch + x]) {bottomPadding = y; break scanBottom;}
    let bottom = scanHeight - bottomPadding - 1; if (left === -1) {left = 0; right = Math.trunc(cellWidth / 2); top = 0; bottom = 1;}
    const paddedWidth = right - left + 3, paddedHeight = bottom - top + 3;
    if ((get(m, 0x6fc1b8) + paddedWidth | 0) > 256) {put(m, 0x6fc198, get(m, 0x6fc198) + rowHeight); rowHeight = 0; put(m, 0x6fc1b8, 0);}
    rowHeight = Math.max(rowHeight, paddedHeight); put(m, 0x6fbb48, rowHeight); maximumBottom = Math.max(maximumBottom, bottom); minimumTop = Math.min(minimumTop, top);
    if ((get(m, 0x6fc198) + paddedHeight | 0) > 256) {if (!upload(rowHeight + get(m, 0x6fc198) | 0, bottom, paddedWidth)) return 0; const image = ptr(m, 0x6fbb44); m.fill(0, image, image + 65536); put(m, 0x6fbb18, get(m, 0x6fbb18) + 1); put(m, 0x6fbb48, 0); put(m, 0x6fc198, 0); put(m, 0x6fc1b8, 0);}
    lastHeight = bottom - top + 1;
    for (let y = 0; y < lastHeight; y++) {
      let from = input + (top + y) * m.readInt16LE(0x6ffa44) + left, output = ptr(m, 0x6fbb44) + (get(m, 0x6fc198) + y) * 256 + get(m, 0x6fc1b8) + 257, length = right - left + 1 >>> 0;
      if (length & 1) m[output++] = m[from++]; if (length & 2) {word(m, output, m.readUInt16LE(from)); from += 2; output += 2;} for (let i = length >>> 2; i; i--, output += 4, from += 4) put(m, output, get(m, from));
    }
    const out = object + 30 + glyph * 16; word(m, out - 2, left); word(m, out, top); word(m, out + 2, right - left + 1); word(m, out + 4, lastHeight);
    let packed = get(m, 0x6fbb18) << 2; packed = packed & ~0xff00 | (packed >>> 8 << 2 & 255) << 8; word(m, out + 6, packed >>> 2); word(m, out + 8, get(m, 0x6fc1b8) + 1); word(m, out + 10, get(m, 0x6fc198) + 1); put(m, 0x6fc1b8, get(m, 0x6fc1b8) + paddedWidth); rowHeight = get(m, 0x6fbb48);
  }
  if (!retain) {
    if (get(m, 0x6fc1b8) || get(m, 0x6fc198)) if (!upload(get(m, 0x6fbb48) + get(m, 0x6fc198) | 0, lastHeight, 256)) return 0;
    for (const address of [0x6ffa4c, 0x6ffa58]) {const pointer = ptr(m, address); if (pointer && !(m[0x6ffa60] & 1)) library(runtime, 'free', [pointer]);}
    for (const address of [0x6ffa4c, 0x6ffa50, 0x6ffa54, 0x6ffa58]) put(m, address, 0); if (ptr(m, 0x6fbb44)) library(runtime, 'free', [ptr(m, 0x6fbb44)]);
  }
  put(m, object + 8, maximumBottom - minimumTop); put(m, object + 12, 112); return 1;
}

//439150. Both maps are byte tables; bytes overlap the later font records.
export function initializeRaceHudFonts(mode, runtime) {
  const {memory: m, scratchBase: S} = runtime, frame = S - 0x44; Buffer.from(m.subarray(0x5d0658, 0x5d068a)).copy(m, S - 0x38); put(m, S - 4, ptr(m, 0x5e8890) ^ (S - 0x38)); put(m, 0x6e65d4, 0);
  if (!mode) constructRaceHudFont(0x912d80, 46, 0, 50, 0, 1, 0, {...runtime, scratchBase: frame - 28});
  constructRaceHudFont(0x913ea0, 16, 54, 100, mode, 0, mode === 0 ? 1 : 0, {...runtime, scratchBase: frame - 28});
  m.fill(255, 0x914ebc, 0x914fbc); m.fill(255, 0x913d9c, 0x913e9c);
  let lower = 0, other = 0; for (let i = 0; i < 26; i++) {m[0x914efd + i] = lower++; m[0x913ddd + i] = other++;} for (let i = 0; i < 26; i++) {m[0x914f1d + i] = lower++; m[0x913dfd + i] = other++;}
  for (let i = 0; i < 10; i++) {m[0x914eec + i] = lower++; m[0x913dcc + i] = other++;}
  for (let i = 0; i < 50; i++) {const character = m[S - 0x38 + i]; m[0x914ebc + character] = lower++ & 255; m[0x913d9c + character] = other++ & 255;}
  for (const [p, v] of [[0x913ea0, 1], [0x913ea4, 256], [0x913eb8, 1], [0x913eb0, 5], [0x913eb4, 1], [0x912d80, 3], [0x912d84, 256], [0x912d98, 0], [0x912d90, 20], [0x912d94, 0]]) put(m, p, v);
  Buffer.from(m.subarray(0x912d80, 0x913e9c)).copy(m, 0x911c40); put(m, 0x911c40, 2); put(m, 0x911c44, 128); put(m, 0x5eb50c, 1); let count = get(m, 0x6e65d4); put(m, 0x912d60 + count * 4, 0x913ea0); count++; put(m, 0x5eb510, 2); put(m, 0x5eb514, 3); put(m, 0x6e65d4, count);
  if (!mode) {put(m, 0x912d60 + count * 4, 0x911c40); put(m, 0x912d64 + count * 4, 0x912d80); put(m, 0x6e65d4, count + 2);} else put(m, 0x913ea4, 320);
}

//48b750. Glyph/font setup precedes the packed primitive-header writes.
export function initializeRaceHudPrimitives(runtime) {
  initializeRaceHudFonts(1, {...runtime, scratchBase: runtime.scratchBase - 8}); const m = runtime.memory; put(m, 0x82dfa0, 0x913ea0);
  for (let i = 0, p = nativeGlobalAddress(m, 0x8111a7); i < 224; i++, p += 0x210) {m[p - 4] = 12; m[p] = 0x8e; m[p + 0x80] = 12; m[p + 0x84] = 0x8e; m[p + 0x104] = 12; m[p + 0x108] = 0x8e; m[p + 0x188] = 12; m[p + 0x18c] = 0x8e;}
  for (let i = 0, p = 0x82dfac; i < 28; i++, p += 80) m[p] = 0; put(m, 0x6e6b38, 1);
}
