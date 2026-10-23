//Diagnostic input-only candidates. This is intentionally not a register
//binding for an incomplete source prefix: its producer obligations stay open.
import {createCapturedMemory} from './captured-memory.mjs';

//Binding form: all parent trace facts must come from the genuine source
//execution at the listed points, never the native after-register snapshot.
export function deriveNativePhysicsEntryRegisters({memory, moduleBaseAddress, parentEntryEsp, parentEntryEdx, trace}) {
  const u32 = (value, label) => {if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw Error(`Source parent register trace requires ${label}.`); return value;};
  const actual = p => moduleBaseAddress + p - 0x400000;
  u32(moduleBaseAddress, 'actual module base'); u32(parentEntryEsp, 'entry ESP'); u32(parentEntryEdx, 'entry EDX');
  if (parentEntryEsp < 20) throw Error('Physics parent entry stack cannot contain its native saves.');
  const count = u32(trace?.handlingCompleted, 'completed42a9a0 loop count');
  if (count > 255) throw Error('Physics parent loop count exceeds its live byte count.');
  for (const name of ['inputCompleted', 'audioCompleted']) if (trace[name] !== undefined && (u32(trace[name], name) > 255)) throw Error('Physics parent loop count exceeds its live byte count.');
  const registers = {ebx: count, ebp: parentEntryEdx, ecx: memory.readUInt32LE(actual(0x5e8890)), esp: parentEntryEsp - 20, eip: actual(0x4749e0)};
  const unresolved = ['eax', 'edx', 'eflags', 'fpuStatusWord', 'mxcsr-status'];
  const restoration = trace.afterObjects;
  if (typeof restoration?.restorationEnabled !== 'boolean') unresolved.push('esi', 'edi');
  else if (restoration.restorationEnabled) {
    const n = restoration.restorationCount, begin = restoration.restorationBase;
    if (!Number.isInteger(n) || n < -0x80000000 || n > 0x7fffffff) throw Error('Physics register trace requires signed restoration count.');
    u32(begin, 'restoration row pointer');
    registers.esi = n > 0 ? 0 : n >>> 0;
    registers.edi = (begin + Math.max(n, 0) * 24) >>> 0;
  } else {
    if (Number.isInteger(trace.sessionAfterInput)) registers.esi = u32(trace.sessionAfterInput, 'last actual parent session reload'); else unresolved.push('esi');
    if (count) registers.edi = actual(0x909300) + count * 0x30c;
    else if (Number.isInteger(trace.inputCompleted) && trace.inputCompleted > 0) registers.edi = actual(0x909300) + u32(trace.inputCompleted, 'input loop count') * 0x30c;
    else if (trace.inputCompleted === 0 && Number.isInteger(trace.audioCompleted)) registers.edi = u32(trace.audioCompleted, 'audio loop count');
    else unresolved.push('edi');
  }
  return {registers, unresolved,
    evidence: ['450f70 live source session reload', '450fae/450fb4 source loop end pointer/count', '450fc3..451006 source restoration branch',
      '449640/420500 retained nonvolatile preservation', '420682/4206c8 successful original568162 cookie checker preserves ECX'],
    limits: ['Source parent trace must describe the actual executed live loop and restoration inputs.', 'This binds the declared general registers only; volatile EAX/EDX and full private CPU ABI remain unproved.']};
}

export function deriveControlPhysicsRegisterCandidates(before) {
  const rows = [...before.ranges.values()], bases = new Set([before.moduleBaseAddress, ...rows.map(row => row.moduleBaseAddress)].filter(x => x !== undefined && x !== null).map(Number));
  if (bases.size !== 1) throw Error('Register diagnostic requires one actual image base.');
  const base = [...bases][0], actual = p => base + p - 0x400000, memory = createCapturedMemory(rows).memory;
  if (Number(before.registers.eip) !== actual(0x450e50)) throw Error('Register diagnostic requires450e50 entry inputs.');
  const session = memory.readUInt32LE(actual(0x5ecb1c)), count = memory[session + 0x54d];
  const resource = memory.readUInt32LE(actual(0x90b990)), restore = memory[resource + 0xfc] !== 0;
  let esi = session, edi = count ? actual(0x909300) + count * 0x30c : 0;
  let restoration = null;
  if (restore) {
    const restoreCount = memory.readInt32LE(actual(0x90b998)), begin = memory.readUInt32LE(actual(0x90b994));
    esi = restoreCount > 0 ? 0 : restoreCount >>> 0; edi = begin + Math.max(restoreCount, 0) * 24;
    restoration = {count: restoreCount, begin};
  }
  return {moduleBaseAddress: base, inputFacts: {session, count, resource, restore, restoration, cookie: memory.readUInt32LE(actual(0x5e8890))},
    candidates: {ebx: count, ebp: Number(before.registers.edx), esi, edi, ecx: memory.readUInt32LE(actual(0x5e8890)), esp: Number(before.registers.esp) - 20},
    unresolved: ['eax', 'edx'], completeSourceDerivation: false,
    obligations: ['The future input/control loop and42a9a0 loop must execute and publish their live session/count; an unchanged count in snapshots is not source execution.',
      'Use the live restoration flag/count/pointer at450fc8, after real494f60/429f30; before-only candidates are conditional on those inputs remaining equal.',
      'Later game children must preserve EBX/EBP/ESI/EDI through their genuine native ABI.',
      'ECX is the live security-cookie global after successful420500 cookie verification; using the entry cookie requires its intact/stable cookie contract.',
      'EAX/EDX require the actual420500 branch and genuine449640 progress outputs; no captured physics-entry registers may supply them.']};
}
