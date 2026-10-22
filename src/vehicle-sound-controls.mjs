import {signedShort} from './fixed-integer.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';

//484cb0: CL is the code,DL is the mode; pitch/volume are signed stack words.
//The raw ECX dword is carried into484bb0's unused fifth stack slot.
export function startVehicleSound(code, mode, pitch, volume, position, reverb, runtime) {
  const dispatch40ea40 = runtime.handlers?.dispatch40ea40 ?? (request => dispatchNativeSound(request, runtime));
  return emitNativeEffect(code & 255, position | 0, [0, signedShort(pitch), signedShort(volume), mode & 255, code | 0, 0, (reverb & 255) === 1 ? 1 : 0], {dispatch40ea40});
}

const source = (channel, runtime) => (channel >>> 0) > 256 ? runtime.memory.readUInt32LE(channel >>> 0) : 0;
const invoke = (runtime, pointer, method, args) => {
  if (typeof runtime.handlers?.sourceCall !== 'function') throw Error('Vehicle sound control requires sourceCall.');
  return runtime.handlers.sourceCall(pointer, method, args, runtime);
};

//484d10 tails into the actual audio source's stop method after unsigned guards.
export function stopVehicleSound(channel, runtime) {
  const pointer = source(channel, runtime);
  if (pointer) return invoke(runtime, pointer, 0x34, []);
}

//484d30 clamps two signed16 values, truncates the integer quotient, then
//converts/multiplies with the native float32 rounding before source method14.
export function setVehicleSoundVolume(channel, minimum, value, runtime) {
  const selected = Math.max(signedShort(minimum), signedShort(value)), pointer = source(channel, runtime);
  if (pointer) {
    const scaled = Math.trunc(Math.imul(selected, 0x7fff) / 0x3fff);
    return invoke(runtime, pointer, 0x14, [Math.fround(Math.fround(scaled) * runtime.memory.readFloatLE(0x5dc5dc))]);
  }
}

//484d90 preserves signed-word-1 as its sentinel; all other values use the
//native truncation-toward-zero multiply/1024 conversion before source method20.
export function setVehicleSoundFrequency(channel, value, runtime) {
  value = signedShort(value);
  const frequency = value === -1 ? -1 : Math.trunc(Math.imul(value, 0x2b11) / 1024), pointer = source(channel, runtime);
  if (pointer) return invoke(runtime, pointer, 0x20, [frequency]);
}
