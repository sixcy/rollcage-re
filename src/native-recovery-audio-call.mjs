//47ccc0 ->484bb0 call publication, retained09847cf54..47cf69:
//ev_b9ab8b14c0affb661a9411d957ed11316ec5017676e0587a0224e8440a223faa.
//This is the real shared-stack boundary, not the numeric-only sound graph.
import {emitNativeEffectOnStack, nativeEffectStackLayout} from './native-effect-emitter.mjs';
import {assertNativeMemorySpan, nativeCodeAddress} from './native-memory-spans.mjs';

function word(value, label) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) throw Error(`Recovery audio requires explicit32-bit ${label}.`);
  return value >>> 0;
}

export function nativeRecoveryAudioCallLayout(parentEntryEsp) {
  if (!Number.isInteger(parentEntryEsp) || parentEntryEsp < 256 || parentEntryEsp > 0xffffffff) throw Error('Recovery audio requires its actual bounded parent entry ESP.');
  const entryEsp = parentEntryEsp - 132;
  return Object.freeze({parentEntryEsp, parentFrame: parentEntryEsp - 100, entryEsp,
    argumentAddress: entryEsp + 4, emitter: nativeEffectStackLayout(entryEsp)});
}

//registerEcx is the actual surviving47d900 ring ECX (or47d440 ECX on the
//nonvehicle branch). It is NOT body, position, or an unused synthesized zero.
//The parent caller supplies the four live preserved registers: selected point
//EBX, second-distance EBP, body+c4 ESI, body EDI. Heap identities stay opaque.
export function publishNativeRecoveryAudioCall({memory, parentEntryEsp, registerEcx, nativeStack, moduleBaseAddress} = {}) {
  const layout = nativeRecoveryAudioCallLayout(parentEntryEsp), leakedEcx = word(registerEcx, 'surviving ECX');
  const incoming = nativeStack?.entryRegisters, registers = {};
  for (const name of ['ebx', 'ebp', 'esi', 'edi']) registers[name] = word(incoming?.[name], `incoming ${name}`);
  if (!Number.isInteger(moduleBaseAddress) || moduleBaseAddress <= 0 || moduleBaseAddress + 0x84c5d > 0xffffffff) throw Error('Recovery audio requires the observed main-module base.');
  const caller = nativeCodeAddress(0x47cf6e, {moduleBaseAddress});
  //Validate the complete existing emitter stack footprint before any PUSH.
  assertNativeMemorySpan(memory, layout.emitter.frame - 32, layout.entryEsp + 32 - (layout.emitter.frame - 32));
  const args = Object.freeze([0, -1, 9000, 6, leakedEcx, 0, 0]);
  let esp = layout.parentFrame;
  for (let index = 6; index >= 0; index--) {esp -= 4; memory.writeUInt32LE(args[index] >>> 0, esp);}
  memory.writeUInt32LE(caller, esp - 4);
  return Object.freeze({memory, code: 43, registerEdx: 0, args, scratchBase: layout.entryEsp,
    moduleBaseAddress, nativeStack: Object.freeze({entryRegisters: Object.freeze(registers)})});
}

//Existing484bb0/40ea40 bindings execute their actual stack writes. Populated
//owners still require complete native child/service bindings; failures are
//preserved, with no fabricated allocations, empty source or absent-bank fallback.
export function callNativeRecoveryAudio(runtime) {
  if (runtime.soundRuntime && runtime.soundRuntime.memory !== runtime.memory) throw Error('Recovery audio sound runtime must share actual memory.');
  const request = publishNativeRecoveryAudioCall(runtime);
  return emitNativeEffectOnStack(43, 0, request.args, {...runtime, ...request});
}
