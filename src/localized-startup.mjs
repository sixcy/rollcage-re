import {readLocalizationBlock} from './finish-messages.mjs';
import {formatGameDiagnostic} from './archive-diagnostics.mjs';

const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const length = (m, p) => {let n = 0; while (m[p + n]) n++; return n;};

//439780 raw entry adapter. Existing decoder/search algorithms stay actual;
//the TAB branch enters the real401300 logger at its original nested ESP.
export function readRawLocalizationBlock(destination, key, runtime) {
  const {memory: m, scratchBase: S} = runtime;
  return readLocalizationBlock(destination, key, {...runtime, handlers: {...runtime.handlers, call401300: runtime.handlers?.call401300 ?? (request => {
    const entry = S - 32; put(m, entry, 0x4397d6); put(m, entry + 4, request.args[0]); put(m, entry + 8, request.args[1]);
    formatGameDiagnostic(request.args[0], {...runtime, scratchBase: entry, entryRegisters: undefined});
  })}});
}

//479420. Actual localization
//children are imported unchanged. scratchBase denotes native entry ESP.
export function initializeLocalizedRaceMessages(runtime) {
  const {memory: m, scratchBase, entryRegisters = {}} = runtime;
  const probe = scratchBase - 0x1104, frame = probe - 16, text = frame + 16, line = frame + 0x110, block = frame + 0x910;
  put(m, probe + 0x1100, ptr(m, 0x5e8890) ^ probe);
  for (const [name, offset] of [['EBX', 12], ['EBP', 8], ['EDI', 4], ['ESI', 0]]) if (entryRegisters[name] !== undefined) put(m, frame + offset, entryRegisters[name]);
  let output = ptr(m, 0x5ecb1c) + 0xb20 >>> 0;
  const copy = (name, destination, source, size, returnAddress) => {
    put(m, frame - 4, size); put(m, frame - 8, source); put(m, frame - 12, destination); put(m, frame - 16, returnAddress);
    if (typeof runtime.services?.libraryCall === 'function') runtime.services.libraryCall(name, [destination, source, size], {...runtime, scratchBase: frame - 16});
    else if (name === 'memcpy') Buffer.from(m.subarray(source, source + size)).copy(m, destination);
    else {let i = 0; for (; i < size && m[source + i]; i++) m[destination + i] = m[source + i]; m.fill(0, destination + i, destination + size);}
  };
  for (let index = 0; index < 43; index++) {
    m[text] = 0; put(m, frame - 4, 0x5d3454); put(m, frame - 8, 0x479468);
    const loaded = readRawLocalizationBlock(block, 0x5d3454, {...runtime, scratchBase: frame - 8});
    let missing = loaded === -1;
    if (!missing) {
      let cursor = block, remaining = index;
      for (;;) {
        let destination = line;
        while (m[cursor] && m[cursor] !== 13) m[destination++] = m[cursor++];
        m[destination] = 0;
        if (!remaining) break;
        remaining--; if (!m[cursor]) {missing = true; break;} cursor++;
      }
      if (!missing) {
        const count = length(m, line);
        if (count >= 256) {copy('strncpy', text, line, 255, 0x4794df); m[text + 255] = 0;}
        else if (count) {let i = 0; do {m[text + i] = m[line + i];} while (m[line + i++]);}
      }
    }
    if (missing) m.writeUInt16LE(32, text);
    const bytes = length(m, text) + 1, end = output + bytes >>> 0, currentSession = ptr(m, 0x5ecb1c);
    if (end < (currentSession + 0x12a0 >>> 0)) {copy('memcpy', output, text, bytes, 0x479543); put(m, 0x70ea00 + index * 4, output); output = end;}
    else put(m, 0x70ea00 + index * 4, currentSession + 0xb20);
  }
  m.writeUInt16LE(32, output);
  for (let index = 43; index < 64; index++) put(m, 0x70ea00 + index * 4, output);
  const cookie = ptr(m, probe + 0x1100) ^ probe;
  put(m, probe - 4, 0x479596);
  if (typeof runtime.services?.securityCookie === 'function') runtime.services.securityCookie(cookie >>> 0, {...runtime, scratchBase: probe - 4});
  else if ((cookie >>> 0) !== ptr(m, 0x5e8890)) throw Error('Native localization startup security cookie mismatch.');
}
