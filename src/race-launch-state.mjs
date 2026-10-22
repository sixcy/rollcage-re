import {abs32, multiplyQ16} from './fixed-integer.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound} from './sound-dispatch.mjs';
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const get = (memory, address) => memory.readInt32LE(address);

//48d490: all four contacts are required before adding a local up-axis impulse.
export function applyRaceLaunchImpulse(body, strength, {memory}) {
  for (let wheel = 0; wheel < 4; wheel++) if (!(memory[body + 0x324 + wheel * 200] & 1)) return {ecx: body | 0};
  const impulse = strength << 20;
  const initialAxis = [0xc8, 0xce, 0xd4].map(offset => memory.readInt16LE(body + offset));
  for (let axis = 0; axis < 3; axis++) put(memory, body + 0x40 + axis * 4, get(memory, body + 0x40 + axis * 4) + multiplyQ16(initialAxis[axis], impulse));
  const squared = [0x40, 0x44, 0x48].reduce((sum, offset) => (sum + multiplyQ16(get(memory, body + offset), get(memory, body + offset))) | 0, 0);
  const magnitude = abs32(squared);
  put(memory, 0x91d45c, magnitude); put(memory, 0x91d460, Math.clz32(magnitude));
  //432e70's root return is discarded; only its two process scratch writes survive.
  const projection = [0xc8, 0xce, 0xd4].reduce((sum, offset, axis) => (sum + multiplyQ16(memory.readInt16LE(body + offset) << 4, get(memory, body + 0x40 + axis * 4))) | 0, 0);
  const speed = multiplyQ16(projection, 0x9697);
  for (const offset of [0x37c, 0x444, 0x50c, 0x5d4]) put(memory, body + offset, speed);
  memory[body + 0x670] = strength & 255;
  if (memory[body + 0x70b] && memory[body + 0x71e] <= 10) {
    memory.writeUInt16LE(0x10a, body + 0x71e); memory.writeUInt16LE(255, body + 0x71a); memory[body + 0x71d] = 0x38;
  }
  return {ecx: 0x9697};
}

//48d6e0. EDX supplies age; the separate stack integer controls launch strength.
export function startRaceLaunch(record, age, countdown, runtime) {
  const {memory, handlers = {}} = runtime, body = memory.readUInt32LE(record);
  let repeated = false, ecx = record;
  if (memory.readInt16LE(body + 0x6a0)) {
    if (memory.readInt16LE(body + 0x6a2) > ((age + 1) | 0)) return 0;
    repeated = true;
  }
  let level = memory.readInt16LE(body + 0x6aa);
  memory.writeUInt16LE(1, body + 0x6a0); memory.writeUInt16LE(age & 65535, body + 0x6a2);
  level = level < 9 ? 10 : Math.min(level + 1, 12);
  if (repeated) ecx = applyRaceLaunchImpulse(body, 60, runtime).ecx;
  ecx = countdown | 0;
  if (ecx) {
    memory.writeUInt16LE(14, body + 0x6a2); memory[body + 0x6a7] = memory[memory.readUInt32LE(record) + 0x709];
    ecx = applyRaceLaunchImpulse(body, (20 - Math.imul(ecx, 2)) | 0, runtime).ecx;
  }
  put(memory, body + 0x6ac, level << 16);
  const args = [0, 1200, 15000, 6, ecx, 0, memory[body + 0x6b4] === 1 ? 1 : 0];
  if (handlers.call484bb0) handlers.call484bb0({memory, ecx: 22, edx: body + 0x34, args, scratchBase: runtime.scratchBase - 48});
  else emitNativeEffect(22, body + 0x34, args, {dispatch40ea40: request => dispatchNativeSound(request, runtime)});
  return 1;
}
