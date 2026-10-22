import tables from './game-diagnostics-tables.json' with {type: 'json'};
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
export function initializeGameDiagnosticTables(memory) {for (const table of tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address)); return memory;}
const length = (m, p) => {let end = p; while (m[end]) {if (++end >= m.length) throw RangeError('Unterminated game diagnostic string.');} return end - p;};
const platform = (runtime, name, args) => {if (typeof runtime.services?.platformCall !== 'function') throw Error(`Game diagnostic requires platform service ${name}.`); return runtime.services.platformCall(name, args, runtime);};
const crt = (runtime, name, args) => {if (typeof runtime.services?.crtCall !== 'function') throw Error(`Game diagnostic requires CRT service ${name}.`); return runtime.services.crtCall(name, args, runtime);};
const copyString = (m, source, output) => {let value; do {value = m[source++]; m[output++] = value;} while (value);};
const copyDwords = (m, source, output, count) => {for (let i = 0; i < count; i++) put(m, output + i * 4, get(m, source + i * 4));};

//42c0f0. Width pads with zeroes, sign is outside that width. The native
//negative-width/overwritten-stack domain is intentionally not repaired.
export function formatGameInteger(output, value, format, width, runtime) {
  const {memory: m} = runtime, code = format & 255, signed = code !== 88 && code !== 112 && code !== 98 && code !== 111 && code !== 117 && code !== 120;
  const base = code === 88 || code === 112 || code === 120 ? 16 : code === 98 ? 2 : code === 111 ? 8 : 10, upper = code === 88 || code === 112;
  if (!(value >>> 0) && !width) {m.writeUInt16LE(0x30, output); return output;}
  if (width < 0) throw RangeError('Native diagnostic integer negative width does not terminate in the readable stack domain.');
  const minus = signed && base === 10 && (value | 0) < 0; let remaining = (minus ? -value : value) >>> 0, reversed = [];
  while (remaining || (width && reversed.length < width)) {const digit = remaining % base; remaining = Math.floor(remaining / base); reversed.push(digit < 10 ? digit + 48 : digit - 10 + (upper ? 65 : 97)); if (reversed.length > 100000) throw RangeError('Native diagnostic integer output exceeds bounded stack domain.');}
  if (reversed.length >= 34) {crt(runtime, '__report_rangecheckfailure', []); throw Error('Nonreturning CRT range-check handler returned.');}
  if (minus) {reversed.push(m[0x5d04f8]); if (m[0x5d04f9]) throw Error('Native diagnostic minus literal is not terminated.');}
  for (let i = 0; i < reversed.length; i++) m[output + i] = reversed[reversed.length - 1 - i]; m[output + reversed.length] = 0; return output;
}

//42c2a0. Original formatter writes6fb5e0 and consumes the global va cursor.
//The string-width bug appends WIDTH spaces, rather than WIDTH-length spaces.
export function formatGameDiagnostic(format, runtime) {
  const {memory: m, scratchBase} = runtime;
  //42c2a1 PUSH EBX and42c2a4 PUSH EBP precede the formatter's own register
  //use. Actual outer weapon calls later consume these saved caller words.
  if (Number.isInteger(scratchBase)) for (const [register, offset] of [['EBX', -8], ['EBP', -12]]) if (Number.isInteger(runtime.entryRegisters?.[register])) put(m, scratchBase + offset, runtime.entryRegisters[register]);
  let input = format, output = 0x6fb5e0, cursor = ptr(m, 0x6f9bf8) - 4;
  while (m[input]) {
    if (m[input] !== 37) {m[output++] = m[input++]; continue;}
    input++; let width = 0;
    if (m[input] >= 48 && m[input] <= 57) {while (m[input] === 48) input++; let digits = input; while (m[digits] >= 48 && m[digits] <= 57) width = (Math.imul(width, 10) + m[digits++] - 48) | 0; input = digits;}
    const code = m[input];
    if (code === 37) {m[output++] = 37; m[output] = 0;}
    else if (code === 99) {cursor += 4; m[output] = m[cursor]; m[output + 1] = 0;}
    else if (code === 115) {
      cursor += 4; const source = ptr(m, cursor);
      if (source) copyString(m, source, output); else {copyDwords(m, 0x5d04fc, output, 1); m.writeUInt16LE(m.readUInt16LE(0x5d0500), output + 4); m[output + 6] = m[0x5d0502];}
      //The original then dereferences the null pointer too. A mapped zero
      //address behaves exactly as that raw memory; this is not null recovery.
      if ((length(m, source) >>> 0) < (width >>> 0) && width > 0) for (let i = 0; i < width; i++) m.writeUInt16LE(m.readUInt16LE(0x5d0504), output + length(m, output));
    } else if ([100, 105, 117, 88, 120, 98, 111, 112].includes(code)) {
      if ([88, 120, 112].includes(code)) {m.writeUInt16LE(m.readUInt16LE(0x5d0508), output); m[output + 2] = m[0x5d050a]; output += length(m, output);}
      else if (code === 98 || code === 111) {m.writeUInt16LE(code === 98 ? 37 : 48, output); output += length(m, output);}
      cursor += 4; formatGameInteger(output, get(m, cursor), code, code === 112 ? 8 : width, runtime);
    } else {crt(runtime, 'printf', [0x5d050c, code]); crt(runtime, 'exit', [0]); throw Error('Nonreturning CRT exit returned.');}
    output += length(m, output); input++;
  }
  m[output] = 0; return length(m, 0x6fb5e0);
}

//447c50. Lazy initialization clears only each row's first DWORD.
export function findDiagnosticResource(handle, {memory: m}) {
  if (!handle) return -1;
  if (!get(m, 0x6e6708)) {for (let i = 0; i < 344; i++) put(m, 0x90c0a0 + i * 8, 0); put(m, 0x6e6708, 1);}
  for (let i = 0; i < 344; i++) if (ptr(m, 0x90c0a0 + i * 8) === (handle >>> 0)) return i; return -1;
}
function closeDiagnosticHandle(handle, runtime) {
  const {memory: m} = runtime, index = findDiagnosticResource(handle, runtime);
  if ((index & 65535) <= 343) {const stored = ptr(m, 0x90c0a0 + index * 8); if (stored) crt(runtime, 'free', [stored]); put(m, 0x90c0a0 + index * 8, 0);}
  else platform(runtime, 'CloseHandle', [handle]);
}
//489360/4795a0: retry only ERROR_LOCK_VIOLATION33, Sleep500 each retry.
export function openDiagnosticFile(path, access, disposition, runtime) {
  for (;;) {const handle = platform(runtime, 'CreateFileA', [path, access | 0, 0, 0, disposition, 128, 0]); if ((handle >>> 0) !== 0xffffffff) return handle >>> 0; if ((platform(runtime, 'GetLastError', []) | 0) !== 33) return 0; platform(runtime, 'Sleep', [500]);}
}
export function truncateDiagnosticFile(runtime) {
  const handle = openDiagnosticFile(0x7134a0, 0xc0000000, 2, runtime); if (handle) closeDiagnosticHandle(handle, runtime);
}
//4796d0. WriteFile's output slot is native entryESP-4.
export function appendDiagnosticFile(path, text, bytes, runtime) {
  const handle = openDiagnosticFile(path, 0xc0000000, 3, runtime); if (!handle) return;
  platform(runtime, 'SetFilePointer', [handle, 0, 0, 2]); platform(runtime, 'WriteFile', [handle, text, bytes, runtime.scratchBase - 4, 0]); closeDiagnosticHandle(handle, runtime);
}

//489b80. Paths, rotation-on-first-log and timestamp decisions remain game
//algorithms. Only actual Windows file/time/debug and CRT formatting services
//are external; this module never invokes the host filesystem itself.
export function writeGameDiagnostic(text, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 76, bytes = length(m, text);
  platform(runtime, 'OutputDebugStringA', [text]);
  if (!get(m, 0x6e6c90)) {
    put(m, 0x6e6c90, 1); platform(runtime, 'SHGetFolderPathA', [0, 5, 0, 0, 0x7134a0]); copyString(m, 0x7134a0, 0x7135c0);
    let end = 0x7134a0 + length(m, 0x7134a0); copyDwords(m, 0x5d35a0, end, 8); m[end + 32] = m[0x5d35c0];
    end = 0x7135c0 + length(m, 0x7135c0); copyDwords(m, 0x5d35c4, end, 9); m[end + 36] = m[0x5d35e8];
    platform(runtime, 'CopyFileA', [0x7134a0, 0x7135c0, 0]); truncateDiagnosticFile({...runtime, scratchBase: frame - 4});
  }
  platform(runtime, 'GetSystemTime', [frame + 0x14]);
  const time = [8, 10, 12, 14].map(offset => m.readUInt16LE(frame + 0x14 + offset));
  crt(runtime, 'sprintf', [frame + 0x24, 0x5d35ec, ...time]);
  //489c9e PUSH ESI(timestamp length), then489ca8 PUSH EBX(message length).
  //The two DWORD arguments stay on this frame until489cb9 ADD ESP,8.
  //Actual later protocol-item launch reuses the second word as native light
  //payload padding, so publish these real producers before each file append.
  const timestampBytes = length(m, frame + 0x24); put(m, frame - 4, timestampBytes);
  appendDiagnosticFile(0x7134a0, frame + 0x24, timestampBytes, {...runtime, scratchBase: frame - 8});
  put(m, frame - 8, bytes); appendDiagnosticFile(0x7134a0, text, bytes, {...runtime, scratchBase: frame - 12});
}

//42bfb0. Public args are DWORD varargs, written at native entryESP+8.
//The original uses AX for its256-character limit and leaves a first CR/LF.
export function printGameDiagnostic(format, args, runtime) {
  const {memory: m, scratchBase} = runtime;
  args.forEach((value, i) => put(m, scratchBase + 8 + i * 4, value)); put(m, 0x6f9bf8, scratchBase + 8);
  const formatted = formatGameDiagnostic(format, {...runtime, scratchBase: scratchBase - 4}); put(m, 0x6f9bf8, 0);
  if ((formatted & 65535) > 256) {fatalGameDiagnostic(0x5d04a0, [], {...runtime, scratchBase: scratchBase - 8}); throw Error('Nonreturning game diagnostic limit returned.');}
  let end = 0x6fb5e0 + length(m, 0x6fb5e0) - 1;
  while (end > 0x6fb5e0 && (m[end] === 13 || m[end] === 10)) m[end--] = 0;
  end = 0x6fb5e0 + length(m, 0x6fb5e0); m.writeUInt16LE(m.readUInt16LE(0x5d04cc), end); m[end + 2] = m[0x5d04ce];
  writeGameDiagnostic(0x6fb5e0, runtime); //JMP489b80 reuses original entryESP.
}
//42c050 fatal formatter adapter uses the same formatter/log output and then
//calls CRT exit. This is not the independent4893e0 vsprintf diagnostic.
export function fatalGameDiagnostic(format, args, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 4 & ~7;
  args.forEach((value, i) => put(m, scratchBase + 8 + i * 4, value)); put(m, 0x6f9bf8, scratchBase + 8);
  const formatted = formatGameDiagnostic(format, {...runtime, scratchBase: frame - 4}); put(m, 0x6f9bf8, 0);
  if ((formatted & 65535) > 256) fatalGameDiagnostic(0x5d04d0, [], {...runtime, scratchBase: frame - 8});
  let end = 0x6fb5e0 + length(m, 0x6fb5e0) - 1;
  while (end > 0x6fb5e0 && (m[end] === 13 || m[end] === 10)) m[end--] = 0;
  end = 0x6fb5e0 + length(m, 0x6fb5e0); m.writeUInt16LE(m.readUInt16LE(0x5d04cc), end); m[end + 2] = m[0x5d04ce];
  writeGameDiagnostic(0x6fb5e0, {...runtime, scratchBase: frame - 4}); crt(runtime, 'exit', [0]); throw Error('Nonreturning CRT exit returned.');
}

//4893e0. Native caller passes vaargs on stack; vsprintf is a real CRT bound.
export function reportGameDiagnostic(format, args, runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 0x110;
  const va = scratchBase + 8; args.forEach((value, i) => put(m, va + i * 4, value)); crt(runtime, 'vsprintf', [frame, format, va]);
  const end = frame + length(m, frame); m.writeUInt16LE(m.readUInt16LE(0x5d04cc), end); m[end + 2] = m[0x5d04ce]; writeGameDiagnostic(frame, {...runtime, scratchBase: frame - 4});
}
