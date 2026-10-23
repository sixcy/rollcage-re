import {signedShort} from './fixed-integer.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
import {nativeCodeAddress} from './native-memory-spans.mjs';

//484cb0: CL is the code,DL is the mode; pitch/volume are signed stack words.
//The raw ECX dword is carried into484bb0's unused fifth stack slot.
export function startVehicleSound(code, mode, pitch, volume, position, reverb, runtime) {
  const dispatch40ea40 = runtime.handlers?.dispatch40ea40 ?? (request => dispatchNativeSound(request, runtime));
  return emitNativeEffect(code & 255, position | 0, [0, signedShort(pitch), signedShort(volume), mode & 255, code | 0, 0, (reverb & 255) === 1 ? 1 : 0], {dispatch40ea40});
}

const source = (channel, runtime) => (channel >>> 0) > 256 ? runtime.memory.readUInt32LE(channel >>> 0) : 0;
const invoke = (runtime, pointer, method, args, caller, site, entryOffset, registers, tailCall = false) => {
  if (typeof runtime.handlers?.sourceCall !== 'function') throw Error('Vehicle sound control requires sourceCall.');
  let context = runtime;
  if (runtime.nativeAudioCalls) {
    const entry = runtime.scratchBase + entryOffset;
    const returned = tailCall ? runtime.memory.readUInt32LE(runtime.scratchBase) : nativeCodeAddress(site + 3, runtime);
    args.forEach((value, index) => method === 0x14 ? runtime.memory.writeFloatLE(value, entry + 4 + index * 4) : runtime.memory.writeInt32LE(value | 0, entry + 4 + index * 4));
    runtime.memory.writeUInt32LE(returned, entry);
    const entryRegisters = {...runtime.entryRegisters, ...registers, ECX: pointer};
    context = {...runtime, scratchBase: entry, entryRegisters, nativeSourceCall: {
      callerAddress: nativeCodeAddress(caller, runtime), callerEntryEsp: runtime.scratchBase,
      callAddress: nativeCodeAddress(site, runtime), returnAddress: returned, entryEsp: entry, entryRegisters, tailCall,
    }};
  }
  return runtime.handlers.sourceCall(pointer, method, args, context);
};

//484d10 tails into the actual audio source's stop method after unsigned guards.
export function stopVehicleSound(channel, runtime) {
  const pointer = source(channel, runtime);
  if (pointer) return invoke(runtime, pointer, 0x34, [], 0x484d10, 0x484d24, 0, {}, true);
}

//484d30 clamps two signed16 values, truncates the integer quotient, then
//converts/multiplies with the native float32 rounding before source method14.
export function setVehicleSoundVolume(channel, minimum, value, runtime) {
  const selected = Math.max(signedShort(minimum), signedShort(value)), pointer = source(channel, runtime);
  if (pointer) {
    const scaled = Math.trunc(Math.imul(selected, 0x7fff) / 0x3fff);
    if (runtime.nativeAudioCalls) {
      runtime.memory.writeUInt32LE(runtime.entryRegisters.EDI >>> 0, runtime.scratchBase - 4);
      runtime.memory.writeUInt32LE(runtime.entryRegisters.ESI >>> 0, runtime.scratchBase - 8);
    }
    return invoke(runtime, pointer, 0x14, [Math.fround(Math.fround(scaled) * runtime.memory.readFloatLE(0x5dc5dc))],
      0x484d30, 0x484d86, -16, runtime.nativeAudioCalls ? {EDI: pointer, ESI: runtime.memory.readUInt32LE(pointer)} : {});
  }
}

//484d90 preserves signed-word-1 as its sentinel; all other values use the
//native truncation-toward-zero multiply/1024 conversion before source method20.
export function setVehicleSoundFrequency(channel, value, runtime) {
  value = signedShort(value);
  const frequency = value === -1 ? -1 : Math.trunc(Math.imul(value, 0x2b11) / 1024), pointer = source(channel, runtime);
  if (pointer) return invoke(runtime, pointer, 0x20, [frequency], 0x484d90, 0x484dc5, -8, {});
}
