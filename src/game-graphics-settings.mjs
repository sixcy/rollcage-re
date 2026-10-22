const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, value) => m.writeInt32LE(value | 0, p);
const platform = (r, name, args) => {if (typeof r.services?.platformCall !== 'function') throw Error(`Graphics settings require platform ${name}.`); return r.services.platformCall(name, args, r);};
const library = (r, name, args) => {if (typeof r.services?.libraryCall !== 'function') throw Error(`Graphics settings require CRT ${name}.`); return r.services.libraryCall(name, args, r);};

//402fa0, including reached4023a0/402340 two-element construction. Widths are
//deliberately byte/word sized where the original leaves adjacent bytes intact.
export function initializeGameGraphicsSettings(runtime) {
  const {memory: m, scratchBase} = runtime, frame = scratchBase - 24; put(m, 0x6e63f0, 0); put(m, 0x6e63f4, 0);
  platform(runtime, 'InitializeCriticalSectionAndSpinCount', [0x6e63d8, 4096]);
  m.writeUInt16LE(1, 0x6e63f8); Buffer.from(m.subarray(0x5dccf0, 0x5dcd00)).copy(m, 0x6e63fc);
  put(m, 0x6e640c, 32); put(m, 0x6e6410, 60); m.writeUInt16LE(1, 0x6e6414);
  put(m, 0x6e6428, 4); put(m, 0x6e642c, 0); m[0x6e6430] = 1; put(m, 0x6e6434, 0); put(m, 0x6e6438, 0x10100);
  for (let p = 0x6e6444, i = 0; i < 4; i++, p += 24) {
    //Actual4023a0 arguments and saved registers survive this constructor;
    //texture cleanup subsequently consumes their bytes as stale mask lanes.
    if (Number.isInteger(scratchBase)) {
      for (const [o, value] of [[-4, 0x402340], [-8, 2], [-12, 4], [-16, p], [-20, 0x40307a], [-24, p], [-36, 3 - i], [-40, 0x4023bb]]) put(m, frame + o, value);
      if (runtime.entryRegisters?.EBX !== undefined) put(m, frame - 28, runtime.entryRegisters.EBX);
      if (runtime.entryRegisters?.EBP !== undefined) put(m, frame - 32, runtime.entryRegisters.EBP);
    }
    m[p - 8] = 0; put(m, p - 4, 0); put(m, p, -1); put(m, p + 4, -1); put(m, p + 12, 0); put(m, p + 8, 0);
  }
  put(m, 0x6e649c, 0); m.writeUInt16LE(0, 0x6e64a0); return 0x6e63d8;
}

//405010. Thread-safe singleton policy around the actual settings constructor.
export function getGameGraphicsSettings(runtime) {
  const {memory: m} = runtime;
  if (!(get(m, 0x6e63d0) & 1)) {put(m, 0x6e63d0, get(m, 0x6e63d0) | 1); put(m, 0x6e6380, 0); put(m, 0x6e6384, 0); platform(runtime, 'InitializeCriticalSectionAndSpinCount', [0x6e6368, 4096]); library(runtime, 'registerExit', [0x56d700]);}
  if (!ptr(m, 0x6e64a4)) {
    platform(runtime, 'EnterCriticalSection', [0x6e6368]); const thread = platform(runtime, 'GetCurrentThreadId', []); put(m, 0x6e6380, get(m, 0x6e6380) + 1); put(m, 0x6e6384, thread);
    if (!ptr(m, 0x6e64a4)) {if (!(get(m, 0x6e63d0) & 2)) {put(m, 0x6e63d0, get(m, 0x6e63d0) | 2); initializeGameGraphicsSettings({...runtime, scratchBase: runtime.scratchBase - 40, entryRegisters: {...runtime.entryRegisters, EBP: runtime.scratchBase - 4}}); library(runtime, 'registerExit', [0x56d6e0]);} put(m, 0x6e64a4, 0x6e63d8);}
    put(m, 0x6e6380, get(m, 0x6e6380) - 1); if (!get(m, 0x6e6380)) put(m, 0x6e6384, 0); platform(runtime, 'LeaveCriticalSection', [0x6e6368]);
  }
  return ptr(m, 0x6e64a4);
}
