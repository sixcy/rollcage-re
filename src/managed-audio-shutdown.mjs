import {getAudioStopwatch, readAudioNanoseconds} from './audio-stopwatch.mjs';
import {getApplicationDebugger} from './application-bootstrap.mjs';
const ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p), u64 = n => BigInt.asUintN(64, n);
function save(r, name, address) {if (Number.isInteger(r.entryRegisters?.[name])) put(r.memory, address, r.entryRegisters[name]);}
function call(r, kind, name, args, top, returned, targetAddress, beforeCall) {
  const m = r.memory;
  for (let i = args.length - 1; i >= 0; i--) put(m, top - (args.length - i) * 4, args[i]);
  beforeCall?.();
  const S = top - args.length * 4 - 4; put(m, S, returned);
  if (typeof r.services?.[kind] !== 'function') throw Error(`Managed shutdown requires ${kind} ${name}.`);
  return r.services[kind](name, args.map((_, i) => ptr(m, S + 4 + i * 4)), {...r, scratchBase: S, targetAddress});
}

//4a3690 pumps all currently available Win32 messages during a timed wait.
//Dispatch is a real platform boundary; this reference does not start a UI loop.
export function pumpManagedAudioMessages(runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 32, message = S - 28, peek = ptr(m, 0x56e5a0);
  put(m, 0x6e6d18, ptr(m, 0x6e6d18) + 1); save(runtime, 'ESI', F);
  let result = call(runtime, 'platformCall', 'PeekMessageW', [message, 0, 0, 0, 1], F, 0x4a36af, peek);
  if (result) {
    save(runtime, 'EBX', F - 4); save(runtime, 'EDI', F - 8);
    const dispatch = ptr(m, 0x56e5b0), translate = ptr(m, 0x56e50c);
    do {
      call(runtime, 'platformCall', 'TranslateMessage', [message], F - 8, 0x4a36c8, translate);
      call(runtime, 'platformCall', 'DispatchMessageW', [message], F - 8, 0x4a36cf, dispatch);
      result = call(runtime, 'platformCall', 'PeekMessageW', [message, 0, 0, 0, 1], F - 8, 0x4a36de, peek);
    } while (result);
  }
  put(m, 0x6e6d18, ptr(m, 0x6e6d18) - 1);
}

//4a35a0 has RET8: its second caller DWORD is unused. Signed64 subtraction
//and division precede the native signed32 comparison of elapsed milliseconds.
export function waitForManagedAudioThread(object, timeout, unused, runtime) {
  const {memory: m, scratchBase: S} = runtime, bp = S - 4, F = (bp & ~7) - 32;
  put(m, S + 4, timeout); put(m, S + 8, unused); save(runtime, 'EBP', bp);
  for (const [name, offset] of [['EBX', 8], ['ESI', 4], ['EDI', 0]]) save(runtime, name, F + offset);
  if (!ptr(m, object + 32) || m[object + 64]) return;
  const registers = {...runtime.entryRegisters, EBP: bp, ESI: object};
  put(m, F - 4, 0x4a35c7); const watch = getAudioStopwatch({...runtime, scratchBase: F - 4, entryRegisters: registers});
  const sample = (output, returned, edi) => {
    put(m, F - 4, output); put(m, F - 8, returned);
    readAudioNanoseconds(watch, output, {...runtime, scratchBase: F - 8, entryRegisters: {...registers, EBX: watch, EDI: edi}});
  };
  sample(F + 16, 0x4a35d5, runtime.entryRegisters?.EDI);
  sample(F + 24, 0x4a35e1, runtime.entryRegisters?.EDI);
  const elapsed = returned => {
    const delta = BigInt.asIntN(64, m.readBigUInt64LE(F + 24) - m.readBigUInt64LE(F + 16));
    m.writeBigUInt64LE(1000000n, F - 8); m.writeBigUInt64LE(u64(delta), F - 16); put(m, F - 20, returned);
    return Number(BigInt.asIntN(32, delta / 1000000n));
  };
  let milliseconds = elapsed(0x4a35fc), waitTarget;
  if (milliseconds < m.readInt32LE(S + 4)) {
    waitTarget = ptr(m, 0x56e0a0);
    do {
      const result = call(runtime, 'platformCall', 'WaitForSingleObject', [ptr(m, object + 44), 10], F, 0x4a360e, waitTarget) >>> 0;
      if (!result) return;
      if (result === 0x102) {
        put(m, F - 4, 0x4a361e);
        pumpManagedAudioMessages({...runtime, scratchBase: F - 4, entryRegisters: {...registers, EBX: watch, EDI: waitTarget}});
      }
      sample(F + 24, 0x4a362a, waitTarget); milliseconds = elapsed(0x4a3645);
    } while (milliseconds < m.readInt32LE(S + 4));
  }
  if (!m[object + 64]) {
    put(m, F - 4, 0x4a3655);
    const context = {...runtime, scratchBase: F - 4, handlers: {...runtime.handlers, registerExit: runtime.handlers?.registerExit ?? ((address, r) => r.services.libraryCall('registerExit', [address], r))}};
    const logger = getApplicationDebugger(context), name = ptr(m, object + 24) >= 16 ? ptr(m, object + 4) : object + 4;
    for (const [i, value] of [name, 0x5d39bc, 2, 0, logger].entries()) put(m, F - (i + 1) * 4, value);
    put(m, F - 24, 0x4a3670); void m[logger + 0x24]; //Actual4a18d0 getter.
    call(runtime, 'platformCall', 'TerminateThread', [ptr(m, object + 32), 0], F, 0x4a367e, ptr(m, 0x56e0ec));
  }
}

//Shared by the two destructor bodies, preserving their different stack tops,
//captured CloseHandle targets and original callee registers.
function stopAndClose(object, runtime, top, returns, closeTarget, registers) {
  const m = runtime.memory, volatileRegisters = {ECX: object};
  call({...runtime, volatileRegisters}, 'platformCall', 'SetEvent', [ptr(m, object + 40)], top, returns[0], ptr(m, 0x56e0a4));
  put(m, top - 4, volatileRegisters.ECX); put(m, top - 8, 5000); put(m, top - 12, returns[1]);
  waitForManagedAudioThread(object, 5000, volatileRegisters.ECX, {...runtime, scratchBase: top - 12, entryRegisters: registers});
  const captured = closeTarget ?? ptr(m, 0x56e0bc);
  call(runtime, 'platformCall', 'CloseHandle', [ptr(m, object + 40)], top, returns[2], captured);
  call(runtime, 'platformCall', 'CloseHandle', [ptr(m, object + 44)], top, returns[3], captured);
  const handle = ptr(m, object + 32);
  call(runtime, 'platformCall', 'CloseHandle', [handle], top, returns[4], captured, () => {put(m, object + 40, -1); put(m, object + 44, -1);});
  put(m, object + 32, 0);
}

//4a34e0. Event handles become -1 before CloseHandle(thread), and the string
//returns to inline empty form only after both separately owned heaps retire.
export function destroyManagedAudioThread(object, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 20;
  put(m, S - 4, -1); put(m, S - 8, 0x56a25b); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  put(m, F + 4, object); save(runtime, 'EDI', F); put(m, object, 0x5d39f8); put(m, S - 4, 0);
  if (ptr(m, object + 32)) {
    save(runtime, 'ESI', F - 4);
    stopAndClose(object, {...runtime, sehWord: S - 12}, F - 4, [0x4a351b, 0x4a3528, 0x4a3533, 0x4a3538, 0x4a354b], undefined, {...runtime.entryRegisters, EDI: object});
  }
  if (ptr(m, object + 28)) {call(runtime, 'libraryCall', 'operatorDeleteArray', [ptr(m, object + 28)], F, 0x4a3561, ptr(m, 0x56e470)); put(m, object + 28, 0);}
  if (ptr(m, object + 24) >= 16) call(runtime, 'libraryCall', 'operatorDelete', [ptr(m, object + 4)], F, 0x4a357a, ptr(m, 0x56e210));
  put(m, object + 24, 15); put(m, object + 20, 0); m[object + 4] = 0;
}

//4a36f0. The derived wake event is always closed, including a null thread.
export function destroyManagedAudioPollThread(object, runtime) {
  const {memory: m, scratchBase: S} = runtime, F = S - 24;
  put(m, S - 4, -1); put(m, S - 8, 0x56a278); if (Number.isInteger(runtime.sehWord)) put(m, S - 12, runtime.sehWord);
  save(runtime, 'ESI', F + 4); save(runtime, 'EDI', F); put(m, F + 8, object); put(m, object, 0x5d39f0); put(m, S - 4, 0);
  const closeTarget = ptr(m, 0x56e0bc), registers = {...runtime.entryRegisters, ESI: object, EDI: closeTarget};
  if (ptr(m, object + 32)) stopAndClose(object, {...runtime, sehWord: S - 12}, F, [0x4a3731, 0x4a373e, 0x4a3743, 0x4a3748, 0x4a375b], closeTarget, registers);
  call(runtime, 'platformCall', 'CloseHandle', [ptr(m, object + 48)], F, 0x4a3767, closeTarget); put(m, object + 48, -1); put(m, S - 4, -1); put(m, F - 4, 0x4a377d);
  destroyManagedAudioThread(object, {...runtime, scratchBase: F - 4, sehWord: S - 12, entryRegisters: registers});
}

//4a34a0 and4a34c0 scalar-deleting virtual destructors return their object.
export function releaseManagedAudioThread(object, flags, polling, runtime) {
  const {memory: m, scratchBase: S} = runtime; put(m, S + 4, flags); save(runtime, 'ESI', S - 4); put(m, S - 8, polling ? 0x4a34c8 : 0x4a34a8);
  (polling ? destroyManagedAudioPollThread : destroyManagedAudioThread)(object, {...runtime, scratchBase: S - 8, entryRegisters: {...runtime.entryRegisters, ESI: object}});
  if (m[S + 4] & 1) call(runtime, 'libraryCall', 'operatorDelete', [object], S - 4, polling ? 0x4a34d6 : 0x4a34b6, ptr(m, 0x56e210));
  return object;
}
