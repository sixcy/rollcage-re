import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {decodePhysicsNumericalContext} from '../../src/race-clock.mjs';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {REDUX_SHA256} from './retained-native-program.mjs';

export const nativeRaceClockCapability = 'scoped-race-step-clock-v1';
export function nativeRaceClockPolicy() {
  return {entryBreakpointId: 'native-race-clock-entry', counterCallBreakpointId: 'native-race-clock-counter-call',
    counterReturnBreakpointId: 'native-race-clock-counter-return', returnBreakpointId: 'native-race-clock-return',
    minimumLogicalClock: 288, stackBytesBefore: 512, stackBytesAfter: 28, maxCounterPairs: 1, maxSnapshots: 4};
}
const fixed = [
  ['origin', 0x6e66b0, 8], ['streak', 0x6e66e4, 4, 'mutable'], ['delivered', 0x6e66f8, 4, 'mutable'],
  ['network', 0x6eafe0, 4], ['enabled', 0x6e6c8c, 4], ['frequency-origin', 0x7135a4, 16],
  ['qpc-import', 0x56e0fc, 4], ['qpf-import', 0x56e114, 4], ['scale', 0x5dc6e0, 8],
  ['conversion-tables', 0x56f6a0, 130], ['logical', 0x90a548, 4], ['sample', 0x6e675c, 4], ['session-root', 0x5ecb1c, 4]
];
export const nativeRaceClockFixedRegions = Object.freeze(fixed.map(([name, preferredAddress, length, comparison = 'read-only']) =>
  Object.freeze({id: `race-clock-${name}`, preferredAddress, rva: `0x${(preferredAddress - 0x400000).toString(16)}`, length, comparison})));
const scaleHex = '681d554d1075ff3e';
//Identity checks only. These bytes never initialize memory or replace a native
//input. verifyNativeRaceClockEvidence independently checks the original PE.
const tableHex = '0000000000000000000000000000f041ffffffffffff0f00000000000000100000000000000000800000000000001000000000000000e0c3000000000000e043000000000000f043000000f0ffffef47000000f0ffff0f3800000000000060450810000000000001000000000000f020330400003f04000000080000ff1700003f13';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const uint = (value, label) => {
  const n = Number(value);
  assert.ok((typeof value === 'number' || typeof value === 'string' && /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value))
    && Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff, `Clock uint32 ${label}`);
  return n;
};
function moduleBase(value) {
  const base = uint(value, 'module base');
  assert.ok(base > 0 && base + 0x50a54c <= 0x100000000, 'Clock module observation does not wrap');
  return base;
}

export function nativeRaceClockLayout(entryEsp) {
  const C = uint(entryEsp, 'entry ESP');
  assert.ok(C >= 512 && C % 4 === 0 && C + 28 <= 0x100000000, 'Clock aligned nonwrapping540-byte stack');
  const timerEntryEsp = C - 16, timerEbp = timerEntryEsp - 4, alignedAddress = Math.floor(timerEbp / 8) * 8, frame = alignedAddress - 32;
  return {entryEsp: C, timerEntryEsp, timerEbp, alignedAddress, frame, counterCallEsp: frame - 4,
    counterReturnEsp: frame, outputAddress: frame + 24, returnEsp: C + 4, stackAddress: C - 512, stackBytes: 540};
}

export function nativeRaceClockSites(moduleBaseAddress = 0x400000) {
  const base = moduleBase(moduleBaseAddress), operand = Buffer.alloc(4); operand.writeUInt32LE(base + 0x2e6b4c);
  return [
    ['native-race-clock-entry', 0x441c70, '83ec08'], ['native-race-clock-counter-call', 0x489d11, 'ffd6'],
    ['native-race-clock-counter-return', 0x489d13, '8b442418'], ['native-race-clock-return', 0x450df0, `8b35${operand.toString('hex')}`]
  ].map(([id, preferredAddress, bytesHex]) => ({id, preferredAddress, address: base + preferredAddress - 0x400000, bytesHex}));
}

export function nativeRaceClockRanges(entryEsp, moduleBaseAddress, sessionAddress) {
  const l = nativeRaceClockLayout(entryEsp), base = moduleBase(moduleBaseAddress), session = uint(sessionAddress, 'session pointer');
  assert.ok(session > 0 && session + 0x580 <= 0x100000000, 'Clock nonnull bounded session-phase pointer');
  return [...nativeRaceClockFixedRegions.map(row => ({id: row.id, address: base + row.preferredAddress - 0x400000, length: row.length})),
    {id: 'race-clock-session-phase', address: session + 0x57c, length: 4},
    {id: 'race-clock-stack', address: l.stackAddress, length: l.stackBytes}].map(row => ({...row, source: 'race-clock-observation'}));
}

function inputRows(snapshot) {
  const rows = snapshot.ranges instanceof Map ? [...snapshot.ranges.values()] : snapshot.ranges;
  assert.ok(Array.isArray(rows), 'Clock input rows');
  if (snapshot.ranges instanceof Map) for (const [id, row] of snapshot.ranges) assert.equal(id, row.id, 'Clock map key matches actual row ID');
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length, 'Unique clock row IDs');
  for (const row of rows) {
    const address = uint(row.address, row.id);
    assert.ok(Buffer.isBuffer(row.bytes) && Number.isSafeInteger(row.length) && row.length > 0 && row.length === row.bytes.length
      && address + row.length <= 0x100000000, 'Clock raw input extent');
    assert.equal(sha(row.bytes), row.sha256, `Clock raw hash ${row.id}`);
  }
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < i; j++) {
    const first = rows[i], second = rows[j], start = Math.max(Number(first.address), Number(second.address));
    const end = Math.min(Number(first.address) + first.length, Number(second.address) + second.length);
    if (end > start) assert.deepEqual(first.bytes.subarray(start - Number(first.address), end - Number(first.address)),
      second.bytes.subarray(start - Number(second.address), end - Number(second.address)), 'Clock overlapping actual observations agree');
  }
  return rows;
}

//ENTRY only. Counter/final snapshots are comparison and API-outcome evidence;
//this factory never refreshes source memory from either of those endpoints.
export function createNativeRaceClockInputs(snapshot, {moduleBaseAddress, strictOriginalConstants = true} = {}) {
  assert.equal(snapshot?.breakpointId, nativeRaceClockPolicy().entryBreakpointId, 'Only original clock entry supplies source inputs');
  assert.equal(typeof strictOriginalConstants, 'boolean', 'Explicit constant-identity policy');
  const base = moduleBase(moduleBaseAddress), context = snapshot.context;
  if (snapshot.mainModuleBaseAddress !== undefined) assert.equal(uint(snapshot.mainModuleBaseAddress, 'snapshot module'), base);
  assert.ok(Buffer.isBuffer(context) && context.length === 716, 'Clock raw716-byte context');
  assert.equal(sha(context), snapshot.contextSha256, 'Clock original raw context hash');
  const registerOffsets = {edi: 156, esi: 160, ebx: 164, edx: 168, ecx: 172, eax: 176, ebp: 180, eip: 184, esp: 196,
    fpuControlWord: 28, fpuStatusWord: 32, mxcsr: 228};
  const registers = {};
  for (const [name, offset] of Object.entries(registerOffsets)) {
    registers[name] = context.readUInt32LE(offset);
    assert.equal(uint(snapshot.registers?.[name], name), registers[name], 'Clock summary matches raw context');
  }
  assert.equal(registers.eip, base + 0x41c70, 'Clock actual entry EIP');
  const l = nativeRaceClockLayout(registers.esp), rows = inputRows(snapshot);
  const byId = new Map(rows.map(row => [row.id, row]));
  const root = byId.get('race-clock-session-root');
  assert.ok(root?.length === 4 && Number(root.address) === base + 0x1ecb1c, 'Clock original fixed session root');
  const sessionAddress = root.bytes.readUInt32LE(), expected = nativeRaceClockRanges(l.entryEsp, base, sessionAddress);
  assert.deepEqual(rows.filter(row => row.id !== 'thread-seh-head').map(row => row.id).sort(), expected.map(row => row.id).sort(), 'Exactly fifteen clock input ranges');
  for (const wanted of expected) {
    const row = byId.get(wanted.id);
    assert.equal(Number(row.address), wanted.address, `Clock actual row ${wanted.id}`);
    assert.equal(row.length, wanted.length); assert.equal(row.source, wanted.source);
    if (row.moduleBaseAddress !== undefined && row.moduleBaseAddress !== null) assert.equal(uint(row.moduleBaseAddress, 'row module'), base);
  }
  const get = id => byId.get(`race-clock-${id}`).bytes;
  assert.equal(get('stack').readUInt32LE(512), base + 0x50df0, 'Clock live450d60 return');
  assert.equal(get('stack').readUInt32LE(536), base + 0x40cd5, 'Clock ordinary440930 caller atC+24');
  assert.equal(get('session-phase').readInt32LE(), 4, 'Clock original active session phase');
  assert.ok(get('logical').readUInt32LE() >= 288, 'Clock fixed minimum logical clock');
  assert.notEqual(get('delivered').readUInt32LE(), 0, 'Clock warm delivered count');
  assert.equal(get('enabled').readInt32LE(), 1, 'Clock initialized timer');
  assert.ok(get('frequency-origin').readBigInt64LE() > 0n, 'Clock positive actual original frequency');
  assert.ok(get('qpc-import').readUInt32LE() > 0 && get('qpf-import').readUInt32LE() > 0, 'Clock actual nonnull IAT targets');
  if (strictOriginalConstants) {
    assert.equal(get('scale').toString('hex'), scaleHex, 'Clock immutable original scale identity');
    assert.equal(get('conversion-tables').toString('hex'), tableHex, 'Clock immutable original130-byte table identity');
  }
  assert.ok(registers.fpuStatusWord <= 0xffff, 'Clock raw x87 status WORD');
  const numericalContext = decodePhysicsNumericalContext({x87ControlWord: registers.fpuControlWord, mxcsr: registers.mxcsr});
  assert.ok([24, 53, 64].includes(numericalContext.x87.precisionBits), 'Clock legal captured x87 precision');
  numericalContext.x87.statusWord = registers.fpuStatusWord;
  const observedRows = expected.map(wanted => ({...byId.get(wanted.id), bytes: Buffer.from(byId.get(wanted.id).bytes)}));
  return {rows: observedRows, aliases: nativeRaceClockFixedRegions.map(row => ({address: row.preferredAddress,
    targetAddress: base + row.preferredAddress - 0x400000, length: row.length})),
  semanticRegions: expected.map(row => ({id: row.id, address: row.address, length: row.length,
    comparison: row.id === 'race-clock-stack' ? 'mutable' : nativeRaceClockFixedRegions.find(fixed => fixed.id === row.id)?.comparison ?? 'read-only'})),
  numericalContext, entryEsp: l.entryEsp, entryRegisters: Object.fromEntries(['EBX', 'EBP', 'ESI', 'EDI'].map(name => [name, registers[name.toLowerCase()]])),
  layout: l, sessionAddress, moduleBaseAddress: base, strictOriginalConstants, nativeOutputsAdmitted: 0};
}

export async function verifyNativeRaceClockEvidence({executable = 'C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe'} = {}) {
  const proof = await readInstructionEvidence(['001-frame-parent.json', '010-clock-source-assembly.json', '015-main-loop-assembly.json', '021-platform-clock-assembly.json'],
    {directory: 'analysis/physics-clock-elevated-20261022/results'});
  assert.ok(proof.evidence.every(row => row.subject.digest.sha256 === REDUX_SHA256), 'Clock retained target identity');
  const instructions = new Map(proof.instructions.map(row => [row.address, row]));
  for (const [address, op, args] of [[0x441c70, 'SUB', ['ESP', '0x8']], [0x441cab, 'CALL', ['0x00489cd0']],
    [0x450deb, 'CALL', ['0x00441c70']], [0x450df0, 'MOV', ['ESI', 'dword ptr [0x006e6b4c]']],
    [0x440cd0, 'CALL', ['0x00450d60']], [0x489d11, 'CALL', ['ESI']], [0x489d13, 'MOV', ['EAX', 'dword ptr [ESP + 0x18]']]]) {
    assert.deepEqual(instructions.get(address), {address, op, args}, `Clock retained boundary0x${address.toString(16)}`);
  }
  const file = await readFile(executable); assert.equal(sha(file), REDUX_SHA256, 'Clock original PE digest');
  const pe = file.readUInt32LE(60), optional = pe + 24, sections = optional + file.readUInt16LE(pe + 20);
  assert.equal(file.readUInt32LE(optional + 28), 0x400000, 'Clock preferred PE base');
  const imageBytes = (address, length) => {
    const rva = address - 0x400000;
    for (let i = 0; i < file.readUInt16LE(pe + 6); i++) {
      const row = sections + i * 40, start = file.readUInt32LE(row + 12), bytes = file.readUInt32LE(row + 16), offset = file.readUInt32LE(row + 20);
      if (rva >= start && rva + length <= start + bytes) return file.subarray(offset + rva - start, offset + rva - start + length);
    }
    throw Error('Clock immutable byte span is not in initialized original PE storage.');
  };
  for (const site of nativeRaceClockSites()) assert.equal(imageBytes(site.preferredAddress, site.bytesHex.length / 2).toString('hex'), site.bytesHex, 'Clock exact original code site');
  assert.equal(imageBytes(0x5dc6e0, 8).toString('hex'), scaleHex); assert.equal(imageBytes(0x56f6a0, 130).toString('hex'), tableHex);
  const relocationRva = file.readUInt32LE(optional + 136), relocationLength = file.readUInt32LE(optional + 140);
  let returnOperandRelocations = 0;
  for (let offset = 0; offset < relocationLength;) {
    const header = imageBytes(0x400000 + relocationRva + offset, 8), page = header.readUInt32LE(), length = header.readUInt32LE(4);
    assert.ok(length >= 8 && length % 2 === 0 && offset + length <= relocationLength, 'Clock valid original relocation block');
    const block = imageBytes(0x400000 + relocationRva + offset, length);
    for (let i = 8; i < length; i += 2) {
      const entry = block.readUInt16LE(i);
      if (page + (entry & 4095) === 0x50df2) {assert.equal(entry >>> 12, 3, 'Clock return operand HIGHLOW relocation'); returnOperandRelocations++;}
    }
    offset += length;
  }
  assert.equal(returnOperandRelocations, 1, 'One original450df2 loader relocation');
  return {targetSha256: REDUX_SHA256, evidenceIds: proof.evidence.map(row => row.evidence_id), policy: nativeRaceClockPolicy(),
    sites: nativeRaceClockSites(), relocatedReturnOperand: {preferredAddress: 0x450df2, preferredTarget: 0x6e6b4c, type: 'IMAGE_REL_BASED_HIGHLOW'},
    sourceScope: 'Warm441c70 input/ABI metadata only; no timing cadence or second tick proof.'};
}
