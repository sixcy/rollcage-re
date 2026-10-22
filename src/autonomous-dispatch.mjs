import tables from './autonomous-dispatch-tables.json' with {type: 'json'};
import {dotQ16} from './fixed-integer.mjs';
import {scaleContactVector} from './body-contact-friction.mjs';
import {autonomousRouteGroup, stepRoutePoints, writeRouteDirection} from './autonomous-route-geometry.mjs';
import {updateAutonomousRouteConsistency} from './autonomous-route-connectivity.mjs';
import {updateAutonomousStuckState, maybeStartAutonomousRandomRecovery, updateAutonomousReverseRecovery, updateAutonomousPowerSlide} from './autonomous-recovery.mjs';
import {updateAutonomousProfilePlan} from './autonomous-profile-plan.mjs';
import {updateAutonomousWeaponPolicy} from './autonomous-weapon-policy.mjs';
import {planAutonomousRoute} from './autonomous-route-planner.mjs';

const rng = seed => Math.imul(seed, 0x41a7) & 0x7fffffff;
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
const dword = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const vector = (memory, address) => [0, 4, 8].map(offset => memory.readInt32LE(address + offset));
const resultEax = value => {
  const result = typeof value === 'number' ? value : value?.eax;
  if (!Number.isInteger(result)) throw Error('Autonomous dispatch requires explicit callee EAX.');
  return result | 0;
};
const call = (handlers, name, request) => {
  if (typeof handlers[name] !== 'function') throw Error(`Autonomous dispatch requires reached handler ${name}.`);
  return handlers[name](request);
};

export function initializeAutonomousDispatchTables(memory) {
  for (const table of tables) {
    const bytes = Buffer.from(table.bytes_hex, 'hex'), address = Number(table.address);
    if (!Buffer.isBuffer(memory) || address + bytes.length > memory.length) throw Error('Autonomous tables exceed supplied runtime memory.');
    bytes.copy(memory, address);
  }
  return memory;
}

// 420020. Return values describe the volatile registers consumed by the
// following shared-frame call, rather than introducing a native return value.
export function prepareAutonomousPickupUse(body, {memory}) {
  const seed = rng(memory.readInt32LE(0x5ea4d4)), profile = (memory.readUInt32LE(body + 0x6f8) >>> 6) & 7;
  dword(memory, 0x5ea4d4, seed);
  const shift = memory.readInt32LE(0x5705b0 + profile * 4);
  const selected = ((seed >>> 15) << (shift & 31)) >>> 16;
  if (selected === 0) {
    if (memory[body + 0x68c] !== 0 && !(memory[body + 0x70c] & 4)) dword(memory, body + 0x710, memory.readInt32LE(body + 0x710) | 4);
  } else if (selected === 1 && memory[body + 0x68d] !== 0 && !(memory[body + 0x70c] & 8)) dword(memory, body + 0x710, memory.readInt32LE(body + 0x710) | 8);
  return {eax: body | 0, ecx: shift, edx: selected};
}

// 4355c0. The type2/flag1 event rows are visited backwards once per captured
// dispatcher clock.491470 advances five directional route points atomically.
export function updateAutonomousSharedFrame(initialEcx, {memory, scratchBase, handlers = {}}) {
  const output = scratchBase - 4; dword(memory, output, initialEcx);
  const resource = memory.readUInt32LE(0x90b990), count = memory[resource + 0xf6];
  let row = memory.readUInt32LE(resource + 0xf8) + count * 8 - 8;
  for (let remaining = count; remaining > 0; remaining--, row -= 8) {
    if (memory[row + 4] !== 2 || memory[row + 5] !== 1) continue;
    const groupIndex = memory.readUInt16LE(row), group = autonomousRouteGroup(groupIndex, {memory});
    const ecx = (((groupIndex * 3) & 0xffff0000) | memory.readUInt16LE(row + 2)) | 0;
    const advanced = handlers.call491470
      ? resultEax(call(handlers, 'call491470', {memory, ecx, edx: group, args: [5, output]}))
      : stepRoutePoints(group, ecx, 5, output, {memory});
    if (!advanced) continue;
    const length = memory[memory.readUInt32LE(0x5ecb1c) + 0x54d];
    for (let index = 0; index < length; index++) {
      const record = 0x909300 + index * 0x30c, body = memory.readUInt32LE(record);
      if (memory[body + 0x718] !== 10) continue;
      if (memory[memory.readUInt32LE(record + 0x54) + 5] !== memory.readUInt16LE(row)) continue;
      if (Math.abs(memory.readUInt16LE(record + 0x58) - memory.readUInt16LE(output)) < 2) {memory[row + 5] = 0; break;}
    }
  }
}

// 430930. Completion clears both mode and timer with a single dword write;
// the other path rebuilds the complete control dword from its low word.
export function runAutonomousMode200(body, {memory}) {
  const timer = memory.readUInt16LE(body + 0x6c6), control = memory.readUInt16LE(body + 0x710);
  if (timer === 20) {dword(memory, body + 0x6c4, 0); return;}
  word(memory, body + 0x6c6, timer + 1); dword(memory, body + 0x710, (control & 0x5fbf) | 0x40);
}

// 41f130 chooses an initial countdown from profile bits3..5. Profiles0..3
// consume two RNG transitions; profiles4..7 consume one. EDX is untouched.
export function selectAutonomousStartTimer(body, {memory}) {
  const profile = (memory.readUInt32LE(body + 0x6f4) >>> 3) & 7;
  let seed = rng(memory.readInt32LE(0x5ea4d4)), multiplier, offset;
  if (profile < 4) {
    const rare = (seed >>> (profile === 3 ? 29 : 28)) === 0;
    [multiplier, offset] = profile === 0 ? rare ? [16, 85] : [21, 0]
      : profile === 1 ? rare ? [21, 75] : [31, 10]
      : profile === 2 ? rare ? [21, 70] : [31, 20]
      : rare ? [23, 68] : [31, 30];
    seed = rng(seed);
  } else [multiplier, offset] = [[46, 40], [31, 50], [16, 60], [7, 66]][profile - 4];
  dword(memory, 0x5ea4d4, seed);
  return (((Math.imul(seed >>> 15, multiplier) >>> 16) + offset) & 255) >>> 0;
}

// 430970 handles phase-dependent countdowns, distinct word/dword mode clears,
// the no-op tick at228-clock==69, and the capped two-transition random timer.
export function runAutonomousMode40(body, {memory}) {
  const phase = memory.readUInt32LE(memory.readUInt32LE(0x5ecb1c) + 0x57c);
  const timer = memory.readUInt16LE(body + 0x6c6);
  const control = () => dword(memory, body + 0x710, memory.readInt32LE(body + 0x710) | 0x40);
  if (phase !== 1 && phase !== 2 && phase !== 3 && phase !== 4) {control(); dword(memory, body + 0x6c4, 0); return;}
  if (phase === 4) {
    if (timer) word(memory, body + 0x6c6, timer - 1);
    else {control(); word(memory, body + 0x6c4, 0);}
    return;
  }
  const remaining = (228 - memory.readInt32LE(0x90a548)) | 0;
  if (remaining < 70) {
    if (remaining === 68) word(memory, body + 0x6c6, selectAutonomousStartTimer(body, {memory}));
    else if (remaining < 68) {if (timer) word(memory, body + 0x6c6, timer - 1); else control();}
    return;
  }
  if (timer) {
    if (timer === 1) dword(memory, 0x6e65a8, memory.readInt32LE(0x6e65a8) - 1);
    word(memory, body + 0x6c6, timer - 1); control(); return;
  }
  const active = memory.readInt32LE(0x6e65a8);
  if (active >= 2) return;
  const probability = memory[0x5704f8 + (memory.readUInt32LE(body + 0x6f4) & 7)];
  let seed = rng(memory.readInt32LE(0x5ea4d4)); dword(memory, 0x5ea4d4, seed);
  if ((Math.imul(probability, seed >>> 15) >>> 16) !== 0) return;
  seed = rng(seed); dword(memory, 0x5ea4d4, seed);
  const selected = Math.min(((seed >>> 15) << 4 >>> 16) + 15, (remaining - 70) | 0);
  word(memory, body + 0x6c6, selected);
  if (memory.readUInt16LE(body + 0x6c6) !== 0) dword(memory, 0x6e65a8, active + 1);
}

// 430ae0 scans authored8-byte event records backwards for type4 on the current
// route. It compares the route tangent and normalized target delta against the
// captured forward column before considering pickup4's input bits.
export function runAutonomousMode20(body, {memory, scratchBase}) {
  const groupIndex = memory.readUInt16LE(body + 0x6c0), group = autonomousRouteGroup(groupIndex, {memory});
  const resource = memory.readUInt32LE(0x90b990), count = memory[resource + 0xf6], rows = memory.readUInt32LE(resource + 0xf8);
  const timer = (memory.readUInt16LE(body + 0x6c6) + 1) & 65535; word(memory, body + 0x6c6, timer);
  if (timer > 120) {
    const record = 0x909300 + memory.readUInt16LE(body + 0x65e) * 0x30c, registered = memory.readUInt32LE(record);
    word(memory, registered + 0x6c0, memory[memory.readUInt32LE(record + 0x54) + 5]);
    word(memory, registered + 0x6c2, memory.readUInt16LE(record + 0x58));
    dword(memory, body + 0x6c4, 0); return;
  }
  let index = 0, found = false;
  for (let row = rows + count * 8 - 8, remaining = count; remaining > 0; remaining--, row -= 8) {
    if (memory[row + 4] === 4 && memory.readUInt16LE(row) === groupIndex) {index = memory.readUInt16LE(row + 2); found = true; break;}
  }
  if (!found) word(memory, body + 0x6c4, 0);
  const facing = [0xc8, 0xce, 0xd4].map(offset => memory.readInt16LE(body + offset) << 4);
  const output = scratchBase - 12;
  writeRouteDirection(output, groupIndex, index, {memory, scratchBase: scratchBase - 68});
  const point = memory.readUInt32LE(group + 8) + index * 16;
  const delta = [0, 2, 4].map((offset, axis) => ((memory.readInt16LE(point + offset) << 16) - memory.readInt32LE(body + 0x34 + axis * 4)) | 0);
  const direction = vector(memory, output), target = scaleContactVector(delta, 65536);
  if (dotQ16(direction, facing) > 0xf746 && dotQ16(direction, target) < -0xf746) {
    if (memory[body + 0x68c] === 4) {
      if (!(memory[body + 0x70c] & 4)) dword(memory, body + 0x710, memory.readInt32LE(body + 0x710) | 4);
    } else if (memory[body + 0x68d] === 4 && !(memory[body + 0x70c] & 8)) dword(memory, body + 0x710, memory.readInt32LE(body + 0x710) | 8);
    word(memory, body + 0x6c4, 0);
  }
  word(memory, body + 0x6c4, memory.readUInt16LE(body + 0x6c4) | 0x4000);
}

// 410220: prepare, once-per-captured-clock shared stage, six-tick phase,
// specialized modes, then common planning and the controller-ready bit4000.
export function runAutonomousDispatch(body, {memory, scratchBase, handlers = {}} = {}) {
  const clock = memory.readUInt32LE(0x90a548);
  word(memory, body + 0x6c4, memory.readUInt16LE(body + 0x6c4) & 0xbfff); dword(memory, body + 0x710, 0);
  const recovered = {call47fc20: updateAutonomousRouteConsistency, call47ff20: updateAutonomousStuckState, call41f0d0: maybeStartAutonomousRandomRecovery, call47ffb0: updateAutonomousReverseRecovery, call4311e0: updateAutonomousPowerSlide};
  const invoke = (name, ecx = body, edx, args = []) => {
    if (handlers[name] === undefined && name === 'call41f900') return updateAutonomousProfilePlan(ecx, edx, {memory, scratchBase: scratchBase - 16});
    if (handlers[name] === undefined && name === 'call4103f0') return updateAutonomousWeaponPolicy(ecx, {memory, scratchBase: scratchBase - 16});
    if (handlers[name] === undefined && name === 'call421430') return planAutonomousRoute(ecx, {memory, scratchBase: scratchBase - 16, handlers});
    if (handlers[name] === undefined && recovered[name]) return recovered[name](ecx, {memory, scratchBase: scratchBase - 16});
    return call(handlers, name, {memory, ecx, edx, args});
  };
  if (clock % 120 === memory.readUInt16LE(body + 0x65e) * 16) invoke('call41f900', body, 0);
  const prepared = handlers.call420020 ? invoke('call420020') : prepareAutonomousPickupUse(body, {memory});
  if (memory.readUInt32LE(0x6e6510) < clock) {
    dword(memory, 0x6e6510, clock);
    if (!Number.isInteger(prepared?.ecx)) throw Error('Autonomous shared-frame stage requires ECX left by420020.');
    if (handlers.call4355c0) invoke('call4355c0', prepared.ecx);
    else updateAutonomousSharedFrame(prepared.ecx, {memory, scratchBase: scratchBase - 16, handlers});
  }
  memory[body + 0x6d9] = memory[body + 0x6d9] < 5 ? memory[body + 0x6d9] + 1 : 0;
  const mode = memory.readUInt16LE(body + 0x6c4) & 0x3ff;
  if (mode === 0x200) {if (handlers.call430930) invoke('call430930'); else runAutonomousMode200(body, {memory}); return;}
  if (mode === 0x100) {
    const timer = memory.readUInt16LE(body + 0x6c6);
    if (!timer) word(memory, body + 0x6c4, 0);
    else {word(memory, body + 0x6c6, timer - 1); if (((timer - 1) & 65535) >= 30) {dword(memory, body + 0x710, memory.readInt32LE(body + 0x710) | 0x40); return;}}
  } else if (mode === 0x80) {invoke('call47ffb0'); return;}
  else if (mode === 0x40) {if (handlers.call430970) invoke('call430970'); else runAutonomousMode40(body, {memory}); return;}
  else if (mode === 0x20) {if (handlers.call430ae0) invoke('call430ae0'); else runAutonomousMode20(body, {memory, scratchBase: scratchBase - 16}); return;}
  else if ((mode === 1 || mode === 2) && resultEax(invoke('call4311e0')) !== 0) return;
  invoke('call47fc20'); invoke('call47ff20'); invoke('call41f0d0');
  if (memory[body + 0x6d9] === 0) {invoke('call421430'); if (memory[body + 0x6d9] === 0) invoke('call4103f0');}
  word(memory, body + 0x6c4, memory.readUInt16LE(body + 0x6c4) | 0x4000);
}
