import {nativeGlobalAddress} from './native-global-address.mjs';
import {abs32, multiplyQ16, signedShort} from './fixed-integer.mjs';
import {emitNativeEffect} from './effect-emitter.mjs';
import {dispatchNativeSound, configureSoundPlayback} from './sound-dispatch.mjs';
import {startVehicleSound, stopVehicleSound, setVehicleSoundVolume, setVehicleSoundFrequency} from './vehicle-sound-controls.mjs';
import {applyVehicleHapticEffect, stopVehicleHapticEffect, applyVehicleDirectionalHaptics, applyVehicleConstantHaptics} from './vehicle-haptics.mjs';
import originalTables from './vehicle-audio-tables.json' with {type: 'json'};
import {nativeCodeAddress} from './native-memory-spans.mjs';

const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);

export function initializeVehicleAudioTables(memory) {
  for (const table of originalTables.tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address));
  return memory;
}

//485300: game-owned sound/haptic decisions. Runtime provides libaudio/device
//services; named call overrides are for retained-instruction interface probes.
//scratchBase is native entry ESP, not a fresh allocation or invented stack.
export function updateVehicleAudio(initialBody, index, runtime) {
  const {memory, scratchBase, handlers = {}} = runtime;
  const get = address => memory.readInt32LE(address), pointer = address => memory.readUInt32LE(address);
  const local = scratchBase - 84, audio = 0x713190 + Math.imul(index, 40), horn = 0x713280 + Math.imul(index, 16);
  const field = offset => local + offset, record = 0x909300 + Math.imul(index, 0x30c);
  const native = runtime.nativeAudioCalls === true;
  if (native) for (const [name, offset] of [['EBX', 12], ['EBP', 8], ['ESI', 4], ['EDI', 0]]) {
    if (!Number.isInteger(runtime.entryRegisters?.[name])) throw Error(`Native485300 requires original incoming ${name}.`);
    put(memory, local + offset, runtime.entryRegisters[name]);
  }
  let body = initialBody;
  const nativeContext = (caller, callAddress, returned, entry, args, registers, floating = false) => {
    if (!native) return runtime;
    if (!Number.isInteger(callAddress)) throw Error(`Native485300 has an unbound actual call site for ${caller}.`);
    args.forEach((value, i) => floating ? memory.writeFloatLE(value, entry + 4 + i * 4) : put(memory, entry + 4 + i * 4, value));
    put(memory, entry, nativeCodeAddress(returned, runtime));
    return {...runtime, scratchBase: entry, entryRegisters: registers,
      nativeCaller: {callerAddress: nativeCodeAddress(caller, runtime), callerEntryEsp: scratchBase,
        callAddress: nativeCodeAddress(callAddress, runtime), returnAddress: nativeCodeAddress(returned, runtime), entryEsp: entry, entryRegisters: registers}};
  };
  const invoke = (name, ecx, edx, args = [], callAddress, registers) => {
    callAddress ??= {call407670: 0x485943, call407380: 0x485a39, call4074e0: 0x485a70, call407570: 0x485b4a}[name];
    const entry = local - args.length * 4 - 4;
    const nativeRuntime = nativeContext(0x485300, callAddress, callAddress + 5, entry, args, {...registers, ECX: ecx, EDX: edx});
    if (native && /^call407/.test(name)) throw Error('Native485300 haptic caller register frame remains unbound.');
    if (handlers[name]) return handlers[name]({memory, ecx, edx, args, scratchBase: entry, ...(native ? {runtime: nativeRuntime, nativeCaller: nativeRuntime.nativeCaller} : {})});
    if (name === 'call484cb0') return startVehicleSound(ecx, edx, args[0], args[1], args[2], args[3], nativeRuntime);
    if (name === 'call484d10') return stopVehicleSound(ecx, nativeRuntime);
    if (name === 'call484d90') return setVehicleSoundFrequency(ecx, edx, nativeRuntime);
    if (name === 'call484d30') return setVehicleSoundVolume(ecx, edx, args[0], nativeRuntime);
    if (name === 'call484bb0') return emitNativeEffect(ecx, edx, args, {dispatch40ea40: handlers.dispatch40ea40 ?? (request => dispatchNativeSound(request, nativeRuntime))});
    if (name === 'call40e5e0') return configureSoundPlayback(ecx, edx, args[0], nativeRuntime);
    const context = {...runtime, scratchBase: entry};
    if (name === 'call407380') {const descriptor = Buffer.alloc(20); args.forEach((value, i) => descriptor.writeInt32LE(value | 0, i * 4)); return applyVehicleHapticEffect(ecx, edx, descriptor, context);}
    if (name === 'call4074e0') return stopVehicleHapticEffect(ecx, context);
    if (name === 'call407570') return applyVehicleDirectionalHaptics(ecx, edx, args[0], context);
    if (name === 'call407670') return applyVehicleConstantHaptics(ecx, edx, args[0], context);
    throw Error(`Vehicle audio requires reached handler ${name}.`);
  };
  const result = (name, ecx, edx, args, callAddress, registers) => {
    const returned = invoke(name, ecx, edx, args, callAddress, registers), value = typeof returned === 'number' ? returned : returned?.eax;
    if (!Number.isInteger(value)) throw Error(`Vehicle audio requires EAX from ${name}.`);
    return value | 0;
  };
  const source = (handle, method, args = [], callAddress, registers) => {
    if ((handle >>> 0) <= 256) return 0;
    const object = pointer(handle >>> 0);
    if (!object) return 0;
    if (typeof handlers.sourceCall !== 'function') throw Error('Vehicle audio requires sourceCall.');
    const entry = local - args.length * 4 - 4;
    const context = nativeContext(0x485300, callAddress, callAddress + (method === 0x38 ? 2 : 3), entry, args, {...registers, ECX: object}, method === 0x14);
    if (native) context.nativeSourceCall = context.nativeCaller;
    return handlers.sourceCall(object, method, args, context);
  };
  const live = (esi, edi) => ({EBX: body, EBP: Math.imul(index, 5), ESI: esi, EDI: edi});
  const frequency = (handle, value, site, esi, edi) => source(handle, 0x20, [signedShort(value) === -1 ? -1 : Math.trunc(Math.imul(signedShort(value), 0x2b11) / 1024)], site, live(esi, edi));
  const volume = (handle, value, site, edi) => {
    if ((handle >>> 0) <= 256 || !pointer(handle >>> 0)) return;
    const scaled = Math.trunc(Math.imul(signedShort(value), 0x7fff) / 0x3fff);
    if (native) put(memory, field(0x38), pointer(handle >>> 0));
    source(handle, 0x14, [Math.fround(Math.fround(scaled) * memory.readFloatLE(0x5dc5dc))], site, live(native ? pointer(pointer(handle >>> 0)) : undefined, edi));
  };
  const reverb = (handle, site, esi, edi) => invoke('call40e5e0', handle, memory[body + 0x6b4] === 1 ? 1 : 0, [0], site, live(esi, edi));
  const emit = (code, pitch, gain, mode, velocity = 0, unused = 0, useReverb = 0, site, registers = live(undefined, undefined)) => result('call484bb0', code, body + 0x34, [velocity, pitch, gain, mode, unused, 0, useReverb], site, registers);
  const originalRpm = memory.readInt16LE(audio + 24), contact = (memory[body + 0x4b4] | memory[body + 0x57c]) & 1;
  const throttle = memory[body + 0x64d], hornType = memory[pointer(0x5ecb1c) + index + 0x1c];
  if (native) memory[field(0x13)] = throttle;
  put(memory, field(0x1c), 0); put(memory, field(0x14), originalRpm); put(memory, field(0x30), index);
  put(memory, field(0x34), body); put(memory, field(0x38), Math.imul(index, 5));
  put(memory, field(0x3c), (abs32(get(body + 0x5f8)) + abs32(get(body + 0x530))) | 0);
  put(memory, field(0x28), contact); put(memory, field(0x2c), pointer(0x5750a0 + hornType * 4));
  put(memory, field(0x20), get(audio));
  if (get(nativeGlobalAddress(memory, 0x811180)) && get(nativeGlobalAddress(memory, 0x811184)) !== body) put(memory, field(0x1c), (65536 - get(nativeGlobalAddress(memory, 0x81118c))) >>> 7);

  let session = pointer(0x5ecb1c);
  if (memory.readInt16LE(session + 0x61c) !== 0 && memory[session + 0x585]) {
    if (hornType === 6) {
      if (memory[body + 0x710] & 0x20) {
        if (get(horn + 8) === 127) put(memory, horn + 8, result('call484cb0', 58, 9, [1024, 16000, body + 0x34, memory[body + 0x6b4]], 0x48540c, live(index * 16, index)));
      } else if (get(horn + 8) !== 127) {invoke('call484d10', get(horn + 8), 0, [], 0x485428, live(index * 16, index)); put(memory, horn + 8, 127);}
    } else {
      if ((memory[body + 0x714] & 0x20) && get(horn) === 255) {put(memory, horn, 0); put(memory, horn + 4, 0); put(memory, horn + 8, 127);}
      if (get(horn) !== 255) {
        put(memory, horn + 4, (get(horn + 12) * 2 - get(0x90a548) * 2 + get(horn + 4)) | 0);
        if (get(horn + 4) <= 0) {
          const row = pointer(field(0x2c)) + Math.imul(get(horn), 4), duration = memory.readUInt16LE(row + 2);
          put(memory, horn + 4, duration);
          if (duration === 255) put(memory, horn, 255);
          else {
            put(memory, horn + 4, duration * 2);
            const played = result('call484cb0', memory[row], 7, [900, 16000, body + 0x34, memory[body + 0x6b4]], 0x4854ef, live(index * 16, index));
            put(memory, horn, get(horn) + 1); put(memory, horn + 8, played);
          }
        }
      }
    }
    if (get(horn + 8) !== 127) reverb(get(horn + 8), 0x48551c, index * 16, index);
    put(memory, horn + 12, get(0x90a548));
  }

  let material = 0;
  if (memory[body + 0x57c] & 1) {
    const first = pointer(body + 0x1d0), second = pointer(body + 0x1ec);
    material = second ? memory[second + 12] : 0;
    put(memory, field(0x18), material);
    if ((first && memory[first + 12] === 1) || material === 1) {
      const handle = get(audio + 16);
      if (handle === 127) put(memory, audio + 16, emit(62, 1536, 14000, 7, 0, first, 0, 0x485594));
      else if (!((handle >>> 0) > 256 && pointer(handle >>> 0) && (source(handle, 0x38, [1], 0x4855cd, live(originalRpm, index)) & 255))) put(memory, audio + 16, 127);
    } else put(memory, audio + 16, 127);
    if (material > 26) material = 0;
  }
  put(memory, field(0x18), material);
  if (get(body + 0x11c) !== -1) {
    const sector = pointer(pointer(pointer(0x90b98c)) + memory[body + 0x11c] * 4);
    let owner = get(0x5eced4);
    if (memory[sector + 4] & 2) {if (owner === -1 && memory[body + 0x718] !== 8) owner = index; put(memory, 0x5eced4, owner); put(memory, body + 0x6b4, 1);}
    else {if (owner === index && memory[body + 0x718] !== 8) owner = -1; put(memory, 0x5eced4, owner); put(memory, body + 0x6b4, 0);}
  }

  let rpm;
  if (contact) {
    session = pointer(0x5ecb1c);
    rpm = get(session + 0x57c) < 4 ? get(body + 0x6b0) >> 4 : Math.max(get(body + 0x5d4), get(body + 0x50c)) >> 8;
    put(memory, field(0x14), rpm);
    const counter = memory.readInt16LE(audio + 30); word(memory, audio + 30, counter > 0 ? counter - 2 : 0);
  } else {
    rpm = originalRpm < 9000 && throttle > 32 ? (originalRpm + throttle) | 0 : originalRpm > 0 ? originalRpm - 100 : 0;
    put(memory, field(0x14), rpm); word(memory, audio + 30, memory.readUInt16LE(audio + 30) + 1);
  }
  if (memory.readInt16LE(audio + 30) === 0 && get(pointer(0x5ecb1c) + 0x57c) >= 4) {
    const oldPitch = get(field(0x20)) >> 16;
    if (oldPitch > 13000 && memory[audio + 33] === 0 && memory.readInt8(audio + 32) < 2) {
      if (memory[body + 0x71e] <= 10) {word(memory, body + 0x71e, 0x10a); word(memory, body + 0x71a, 200); memory[body + 0x71d] = 70;}
      memory[audio + 32]++; memory[audio + 33] = (memory[audio + 32] << 2) & 255;
    }
    if (oldPitch < 8000 && rpm > 0 && memory.readInt8(audio + 32) > 0) {
      memory[audio + 32]--; if (memory[body + 0x71e] <= 2) {memory[body + 0x71f] = 0; memory[body + 0x71c] = 3;}
    }
    if (rpm < 0) memory[audio + 32] = 0;
  }
  const accelerating = (get(pointer(0x5ecb1c) + 0x57c) <= 4 || (!memory[body + 0x722] && !memory[body + 0x70a])) && abs32(rpm) >= 500;
  const wheelSpeed = ((get(body + 0x5d4) >> 8) + (get(body + 0x50c) >> 8)) >> 1;
  const retainedSpeed = memory.readInt16LE(audio + 26);
  if (wheelSpeed > retainedSpeed) word(memory, audio + 26, ((wheelSpeed - retainedSpeed) >> 1) + retainedSpeed);
  else if (retainedSpeed >= 100) word(memory, audio + 26, retainedSpeed - 100);
  let pitch = get(field(0x20));
  if (memory[audio + 33]) {memory[audio + 33]--; pitch = (pitch - 0x1000000) | 0;}
  else if (!accelerating) pitch = (pitch - 0x1000000) | 0;
  else pitch = Math.imul(abs32(rpm), get(0x5750b8 + memory.readInt8(audio + 32) * 4));
  word(memory, audio + 24, rpm);
  if ((pitch & 0xffff0000) > 0x3e800000) pitch = 0x3e800000;
  if ((pitch & 0xffff0000) <= 0) pitch = 0;
  put(memory, audio, pitch); word(memory, audio + 36, pitch >> 16);
  const halfPitch = memory.readInt16LE(audio + 36) >> 1;
  put(memory, field(0x24), halfPitch); put(memory, field(0x20), Math.imul(index, 0x30c));

  if (memory.readInt8(record + 0x258) !== 0) {
    const device = () => memory.readInt16LE(record + 0x25c);
    if (memory.readInt8(record + 0x258) > 1) invoke('call407670', device(), 100000 - Math.imul(Math.min(halfPitch, 6500), 13), [Math.min(Math.trunc(halfPitch / 5) + 1750, 10000)]);
    const values = [0x3e8, 0x4b0, 0x578, 0x640].map(offset => get(body + offset));
    const largest = Math.max(0, ...values), other = Math.max(0x7fffffff, ...values);
    if (get(pointer(0x5ecb1c) + 0x57c) < 4 || other === 0 || largest < 70000) invoke('call4074e0', device(), 0);
    else {
      const scaled = Math.fround(Math.fround(Math.min(largest >> 6, 3000)) * memory.readFloatLE(0x5dc5e8));
      const intensity = scaled < memory.readFloatLE(0x5dcb10) ? memory.readFloatLE(0x5dcb10) : scaled > memory.readFloatLE(0x5dc774) ? memory.readFloatLE(0x5dc774) : scaled;
      const encoded = Buffer.alloc(4); encoded.writeFloatLE(intensity);
      invoke('call407380', device(), 1, [0x3d8f5c29, 0, 0, encoded.readInt32LE(), 0]);
    }
    const axis = [0xc4, 0xca, 0xd0].map(offset => memory.readInt16LE(body + offset) << 4), registered = pointer(record);
    const momentum = [0x680, 0x684, 0x688].map(offset => get(registered + offset));
    const projected = axis.reduce((sum, value, i) => (sum + multiplyQ16(value, momentum[i])) | 0, 0), liveBody = pointer(record);
    const force = memory[liveBody + 0x64f] ? projected < 0 ? 27000 : 9000 : projected > 0 ? 27000 : 9000;
    invoke('call407570', device(), force, [Math.min(memory[liveBody + 0x66f] << 9, 10000)]);
    body = pointer(field(0x34)); rpm = get(field(0x14));
  }

  session = pointer(0x5ecb1c);
  const alternate = get(session + 0x724) !== 0;
  let enginePitch = (halfPitch >> 1) + 600;
  const engineGain = 13000 - (memory.readInt16LE(audio + 36) >> (alternate ? 4 : 3));
  if (native) {put(memory, field(0x14), Number(alternate)); put(memory, field(0x20), engineGain);}
  enginePitch = (Math.min(enginePitch, 9000) - get(field(0x1c)) + 128) | 0;
  put(memory, field(0x34), enginePitch);
  if (get(audio + 12) === 127) put(memory, audio + 12, emit(0, signedShort(enginePitch), 0, 9, body + 0x68, memory[body + 0x6b4] === 1 ? 1 : 0, memory[body + 0x6b4] === 1 ? 1 : 0, 0x485bf1));
  reverb(get(audio + 12), 0x485c15, enginePitch, rpm); frequency(get(audio + 12), enginePitch, 0x485c62, enginePitch, rpm); volume(get(audio + 12), engineGain, 0x485cc1, rpm);
  let boostGain = halfPitch > 5000 ? (halfPitch * 4 - 15000) | 0 : halfPitch; boostGain = Math.min(boostGain, 10000);
  if (native) put(memory, field(0x24), boostGain);
  if (get(audio + 20) === 127 && alternate) put(memory, audio + 20, emit(memory[0x6e6bdc], signedShort(enginePitch), boostGain & 65535, 9, body + 0x68, memory[body + 0x6b4] === 1 ? 1 : 0, memory[body + 0x6b4] === 1 ? 1 : 0, 0x485d26));
  if (get(audio + 20) !== 127) {reverb(get(audio + 20), 0x485d53, enginePitch, rpm); frequency(get(audio + 20), enginePitch, 0x485da0, enginePitch, rpm); volume(get(audio + 20), boostGain, 0x485dfb, rpm);}
  let roadSpeed = Math.min(memory.readInt16LE(audio + 26), 16000), roadGain = Math.min((roadSpeed * 2) & 65535, 12500);
  const roadPitch = ((abs32(roadSpeed >> 3) - (get(field(0x1c)) >>> 1)) >>> 1);
  if (native) put(memory, field(0x24), roadGain);
  if (get(audio + 8) === 127) put(memory, audio + 8, emit(1, signedShort(roadPitch), signedShort(roadGain), 9, 0, memory[body + 0x6b4] === 1 ? 1 : 0, memory[body + 0x6b4] === 1 ? 1 : 0, 0x485e6f));
  reverb(get(audio + 8), 0x485e93, roadPitch, rpm); frequency(get(audio + 8), roadPitch, 0x485ee0, roadPitch, rpm); volume(get(audio + 8), roadGain, 0x485f3b, rpm);

  const slip = Math.min(get(field(0x3c)), 0x1e0000);
  const delay = memory.readUInt16LE(audio + 28); word(memory, audio + 28, delay && contact ? delay - 1 : 0);
  const table = 0x5750d0 + get(field(0x18)) * 20;
  const firstCode = get(table), loopCode = get(table + 4), maximumGain = get(table + 8), basePitch = get(table + 12), allowLowSlip = get(table + 16);
  const slipUnits = slip >> 16;
  if (native) {for (const [offset, value] of [[0x3c, firstCode], [0x28, loopCode], [0x2c, maximumGain], [0x14, basePitch], [0x20, allowLowSlip], [0x24, slipUnits]]) put(memory, field(offset), value);}
  let surface = get(audio + 4);
  const nativeSurfaceObject = () => native && (surface >>> 0) > 256 ? pointer(surface >>> 0) : undefined;
  if (slipUnits < 4 && surface !== 127 && allowLowSlip === 0) {source(surface, 0x34, [], 0x485fdc, live(allowLowSlip, rpm)); put(memory, audio + 4, 127); word(memory, audio + 38, 5);}
  else {
    if (slipUnits > 6 || allowLowSlip) {
      let unused = slip;
      if (slipUnits > 6 && memory[body + 0x718] === 10 && memory[body + 0x71e] <= 8) {
        const amount = (((slip >> 18) & 2) | 1) + 4;
        //486033 SAR ECX,18 precedes the CL operations: its old slip high
        //bits do not survive in the otherwise-unused fifth sound argument.
        word(memory, body + 0x71e, 0x108); memory[body + 0x71d] = 40; word(memory, body + 0x71a, (amount * 10) & 255); unused = (amount << 2) & 255;
      }
      const counter = memory.readInt16LE(audio + 38);
      if (counter > 1) {
        if (counter === 5) emit(firstCode & 255, signedShort(basePitch), 0, 7, 0, unused, 0, 0x48608f, live(surface, rpm));
        if (memory.readInt16LE(audio + 38) > 1) word(memory, audio + 38, memory.readUInt16LE(audio + 38) - 1);
      } else if (surface === 127) {surface = emit(loopCode & 255, signedShort(basePitch), 0, 9, 0, unused, 0, 0x4860db, {...live(surface, rpm), EAX: loopCode}); memory[audio + 34] = get(field(0x18)) & 255;}
      if (surface !== 127) {
        if (get(field(0x18)) !== memory.readInt8(audio + 34) && memory.readInt16LE(audio + 38) === 1) {
          source(surface, 0x34, [], 0x486121, live(surface, rpm)); surface = emit(loopCode & 255, -1, 0, 9, 0, memory[body + 0x6b4] === 1 ? 1 : 0, memory[body + 0x6b4] === 1 ? 1 : 0, 0x486146, {...live(surface, rpm), EAX: loopCode});
        }
        if (surface !== 127) {
          reverb(surface, 0x486169, surface, rpm);
          if (slipUnits > 6) {frequency(surface, (abs32(rpm >> 7) + basePitch - get(field(0x1c))) | 0, 0x4861c5, surface, nativeSurfaceObject()); invoke('call484d30', surface, maximumGain, [maximumGain], 0x4861ff, live(surface, nativeSurfaceObject()));}
          else if (allowLowSlip) {invoke('call484d90', surface, basePitch - get(field(0x1c)), [], 0x4861e2, live(surface, rpm)); const scaled = ((abs32(rpm) * 3) | 0) >> 1, gain = Math.min(maximumGain >>> 0, scaled >>> 0) | 0; invoke('call484d30', surface, gain, [gain], 0x4861ff, live(surface, rpm));}
        }
      }
      memory[audio + 34] = get(field(0x18)) & 255;
    }
    put(memory, audio + 4, surface);
  }
  const collision = memory[body + 0x66f];
  if (collision & 0xe0) {
    const previous = get(body + 0x3e74), clock = get(0x90a548);
    if (previous === -1 || ((clock - previous) >>> 0) >= 10) {
      put(memory, body + 0x3e74, clock);
      put(memory, 0x5eced0, emit(19, signedShort(collision + 256), signedShort(Math.min((collision << 6) - ((collision << 6) >> 2), 16383)), 7, 0, previous, 0, 0x48627c));
    }
  }
  word(memory, body + 0x66f, 0);
}
