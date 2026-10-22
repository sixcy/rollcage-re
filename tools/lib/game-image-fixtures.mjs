// Synthetic CRT/Win32/GDI+ services only. All game resource/bitmap algorithms
// execute from the reconstructed source or the retained native instructions.
export function createGameImageServices(memory, {file = Buffer.alloc(0), width = 5, height = 3, negativeStride = false, openFailure = false, lockFailure = false, widthFailure = false, allocationBase = 0x400000, allocationLimit = 0x580000} = {}) {
  let next = allocationBase, cursor = 0, creates = 0; const calls = [];
  const put = (p, v) => memory.writeInt32LE(v | 0, p), str = p => {let end = p; while (memory[end]) end++; return memory.toString('latin1', p, end);};
  const libraryCall = (name, args) => {calls.push([name, ...args]); switch (name) {
    case 'allocate': case 'operatorNew': case 'operatorNewArray': {const result = next; next = (next + args[0] + 31) & ~15; if (next > allocationLimit) throw Error('Fixture allocation bound exceeded.'); memory.fill(0xcd, result, next); return result;}
    case 'free': case 'operatorDelete': case 'operatorDeleteArray': return 0;
    case 'fopen': cursor = 0; return 0x1234;
    case 'fclose': return 0;
    case 'fseek': cursor = args[1]; return 0;
    case 'fread': {const count = Math.min(args[1] * args[2], file.length - cursor); file.copy(memory, args[0], cursor, cursor + count); cursor += count; return count / args[1] | 0;}
    case 'memcpy': case 'memmove': Buffer.from(memory.subarray(args[1], args[1] + args[2])).copy(memory, args[0]); return args[0];
    case 'memset': memory.fill(args[1] & 255, args[0], args[0] + args[2]); return args[0];
    case 'strrchr': {let found = 0; for (let p = args[0]; memory[p]; p++) if (memory[p] === (args[1] & 255)) found = p; return found;}
    case 'toupper': return args[0] >= 97 && args[0] <= 122 ? args[0] - 32 : args[0];
    default: throw Error(`Unknown fixture CRT ${name}`);
  }};
  const platformCall = (name, args) => {calls.push([name, ...args]); switch (name) {
    case 'CreateFileA': creates++; cursor = 0; return openFailure ? -1 : 0x1234;
    case 'GetLastError': return 2;
    case 'Sleep': return 0;
    case 'CloseHandle': return 1;
    case 'ReadFile': {const count = Math.min(args[2], file.length - cursor); file.copy(memory, args[1], cursor, cursor + count); cursor += count; put(args[3], count); return 1;}
    case 'CreatePalette': return 0x3456;
    case 'MultiByteToWideChar': for (let i = 0; i < args[3]; i++) memory.writeUInt16LE(memory[args[2] + i], args[4] + i * 2); return args[3];
    case 'GdipAlloc': return libraryCall('allocate', args);
    case 'GdipCreateBitmapFromFile': put(args[1], 0x990001); return 0;
    case 'GdipGetImageWidth': put(args[1], widthFailure ? 0 : width); return 0;
    case 'GdipGetImageHeight': put(args[1], height); return 0;
    case 'GdipBitmapLockBits': {if (lockFailure) return 2; const data = args[4], pitch = width * 4 + 4; put(data + 8, negativeStride ? -pitch : pitch); put(data + 16, 0x300000); for (let i = 0; i < height * pitch; i++) memory[0x300000 + i] = i * 7 + 3 & 255; return 0;}
    case 'GdipBitmapUnlockBits': case 'GdipDisposeImage': case 'GdipFree': return 0;
    default: throw Error(`Unknown fixture platform ${name} ${args.map(a => a.toString(16))} ${str(args[0] || 0)}`);
  }};
  return {libraryCall, platformCall, calls, get creates() {return creates;}};
}

export function bindGameImageServices(machine, services) {
  const definitions = [
    [0x56e220, 'operatorNew', 1], [0x56e210, 'operatorDelete', 1], [0x56e474, 'operatorNewArray', 1], [0x56e470, 'operatorDeleteArray', 1], [0x56e478, 'memmove', 3], [0x56e258, 'allocate', 1], [0x56e23c, 'free', 1], [0x56e250, 'toupper', 1], [0x5e8000, 'allocate', 1], [0x5e8004, 'free', 1],
    [0x56e0d0, 'CreateFileA', 7, true], [0x56e0e4, 'GetLastError', 0, true], [0x56e0cc, 'Sleep', 1, true], [0x56e0bc, 'CloseHandle', 1, true], [0x56e100, 'ReadFile', 5, true], [0x56e04c, 'CreatePalette', 1, true],
    [0x56e0c0, 'MultiByteToWideChar', 6, true], [0x56e6e4, 'GdipAlloc', 1, true], [0x56e6ec, 'GdipCreateBitmapFromFile', 2, true], [0x56e6f4, 'GdipGetImageWidth', 2, true], [0x56e6d0, 'GdipGetImageHeight', 2, true], [0x56e704, 'GdipBitmapLockBits', 5, true], [0x56e6e0, 'GdipBitmapUnlockBits', 2, true],
    [0x5685c8, 'fopen', 2], [0x5685ce, 'fclose', 1], [0x5688a2, 'fseek', 3], [0x568896, 'fread', 4], [0x568a48, 'memcpy', 3], [0x568a50, 'memset', 3], [0x56889c, 'strrchr', 2],
  ];
  // Map imported addresses to unique fixture thunks; absolute CRT functions
  // retain their actual address and caller stack cleanup convention.
  definitions.forEach(([slot, name, count, stdcall], index) => {const address = slot >= 0x56e000 && slot < 0x56e800 || slot >= 0x5e8000 && slot <= 0x5e8004 ? 0x590000 + index * 16 : slot; if (address !== slot) machine.bytes.writeUInt32LE(address, slot); machine.externalCalls.set(address, m => {const args = Array.from({length: count}, (_, i) => m.bytes.readUInt32LE(m.r.ESP + i * 4)); m.r.EAX = (stdcall ? services.platformCall(name, args) : services.libraryCall(name, args)) | 0; if (stdcall) m.r.ESP += count * 4;});});
  for (const [slot, name] of [[0x56e6e8, 'GdipDisposeImage'], [0x56e6d8, 'GdipFree']]) {const address = slot + 0x23000; machine.bytes.writeUInt32LE(address, slot); machine.externalCalls.set(address, m => {m.r.EAX = services.platformCall(name, [m.bytes.readUInt32LE(m.r.ESP)]) | 0; m.r.ESP += 4;});}
  machine.externalCalls.set(0x568162, () => {});
}
