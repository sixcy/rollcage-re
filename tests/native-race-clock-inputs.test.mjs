import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {nativeRaceClockCapability,nativeRaceClockPolicy,nativeRaceClockLayout,nativeRaceClockSites,nativeRaceClockFixedRegions,
  nativeRaceClockRanges,createNativeRaceClockInputs,verifyNativeRaceClockEvidence} from '../tools/lib/native-race-clock-inputs.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const imagePromise = readFile('C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe').then(file => {
  assert.equal(sha(file), 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');
  const pe = file.readUInt32LE(60), optional = pe + 24, sections = optional + file.readUInt16LE(pe + 20);
  return (preferred, length) => {
    const rva = preferred - 0x400000;
    for (let i = 0; i < file.readUInt16LE(pe + 6); i++) {
      const s = sections + i * 40, start = file.readUInt32LE(s + 12), size = file.readUInt32LE(s + 16), offset = file.readUInt32LE(s + 20);
      if (rva >= start && rva + length <= start + size) return Buffer.from(file.subarray(offset + rva - start, offset + rva - start + length));
    }
    throw Error('Uninitialized original fixture bytes.');
  };
});
const offsets = {edi: 156, esi: 160, ebx: 164, edx: 168, ecx: 172, eax: 176, ebp: 180, eip: 184, esp: 196, fpuControlWord: 28, fpuStatusWord: 32, mxcsr: 228};

//Constructed raw contexts/rows, using independently read original PE constants.
//These fixtures do not assert original-process runtime provenance.
async function fixture(base = 0x730000, C = 0x9000) {
  const image = await imagePromise, session = 0x1200000;
  const context = Buffer.alloc(716), registers = {edi: 0xfedcba98, esi: 0xabcdef01, ebx: 0x12345678, edx: 0,
    ecx: 1, eax: 1, ebp: 0x87654321, eip: base + 0x41c70, esp: C, fpuControlWord: 0x7f, fpuStatusWord: 0x87b, mxcsr: 0x1fa7};
  for (const [name, offset] of Object.entries(offsets)) context.writeUInt32LE(registers[name], offset);
  const rows = nativeRaceClockRanges(C, base, session).map(row => ({...row, bytes: Buffer.alloc(row.length)}));
  const byId = new Map(rows.map(row => [row.id, row])), get = name => byId.get(`race-clock-${name}`).bytes;
  get('stack').fill(0x69); get('stack').writeUInt32LE(base + 0x50df0, 512); get('stack').writeUInt32LE(base + 0x40cd5, 536);
  get('origin').writeBigUInt64LE(1234567n); get('streak').writeUInt32LE(9); get('delivered').writeUInt32LE(289);
  get('network').writeUInt32LE(0x83); get('enabled').writeInt32LE(1); get('frequency-origin').writeBigInt64LE(10000000n);
  get('frequency-origin').writeBigInt64LE(987654321n, 8); get('qpc-import').writeUInt32LE(0x77111111); get('qpf-import').writeUInt32LE(0x77222222);
  image(0x5dc6e0, 8).copy(get('scale')); image(0x56f6a0, 130).copy(get('conversion-tables'));
  get('logical').writeUInt32LE(288); get('sample').writeUInt32LE(313); get('session-root').writeUInt32LE(session); get('session-phase').writeInt32LE(4);
  for (const row of rows) row.sha256 = sha(row.bytes);
  const snapshot = {breakpointId: 'native-race-clock-entry', mainModuleBaseAddress: base, registers, context, contextSha256: sha(context), ranges: new Map(rows.map(row => [row.id, row]))};
  const change = (name, fn) => {const row = byId.get(`race-clock-${name}`); fn(row.bytes, row); row.sha256 = sha(row.bytes);};
  const register = (name, value) => {registers[name] = value; context.writeUInt32LE(value, offsets[name]); snapshot.contextSha256 = sha(context);};
  return {snapshot, rows, get, change, register, base, C, session, bind: options => createNativeRaceClockInputs(snapshot, {moduleBaseAddress: base, ...options})};
}

test('warm policy, four sites and both aligned timer layouts match the fixed observer contract', () => {
  assert.equal(nativeRaceClockCapability, 'scoped-race-step-clock-v1');
  assert.deepEqual(nativeRaceClockPolicy(), {entryBreakpointId: 'native-race-clock-entry', counterCallBreakpointId: 'native-race-clock-counter-call',
    counterReturnBreakpointId: 'native-race-clock-counter-return', returnBreakpointId: 'native-race-clock-return', minimumLogicalClock: 288,
    stackBytesBefore: 512, stackBytesAfter: 28, maxCounterPairs: 1, maxSnapshots: 4});
  for (const C of [0x9000, 0x9004, 0x6e6740, 0xffffffe4]) {
    const l = nativeRaceClockLayout(C), T = C - 16, A = Math.floor((T - 4) / 8) * 8, F = A - 32;
    assert.deepEqual(l, {entryEsp: C, timerEntryEsp: T, timerEbp: T - 4, alignedAddress: A, frame: F,
      counterCallEsp: F - 4, counterReturnEsp: F, outputAddress: F + 24, returnEsp: C + 4, stackAddress: C - 512, stackBytes: 540});
  }
  for (const C of [511, 513, 0xffffffe8, 0x100000000, -1]) assert.throws(() => nativeRaceClockLayout(C));
  const sites = nativeRaceClockSites(0x730000);
  assert.deepEqual(sites.map(site => site.bytesHex), ['83ec08', 'ffd6', '8b442418', '8b354c6ba100']);
  assert.equal(sites.at(-1).address, 0x780df0);
  assert.throws(() => nativeRaceClockSites(0xfff00000), /does not wrap/);
  assert.throws(() => nativeRaceClockRanges(0x9000, 0x400000, 0));
});

test('fifteen exact original-entry rows produce actual bindings and rawCW/SW without initializing memory', async () => {
  for (const [base, C] of [[0x400000, 0x9000], [0x730000, 0x9004], [0xf0000000, 0x9000]]) {
    const f = await fixture(base, C), initial = f.rows.map(row => Buffer.from(row.bytes)), result = f.bind();
    assert.equal(result.rows.length, 15); assert.equal(result.semanticRegions.length, 15); assert.equal(result.aliases.length, 13);
    assert.equal(result.entryEsp, C); assert.equal(result.sessionAddress, f.session); assert.equal(result.nativeOutputsAdmitted, 0);
    assert.deepEqual(result.entryRegisters, {EBX: 0x12345678, EBP: 0x87654321, ESI: 0xabcdef01, EDI: 0xfedcba98});
    assert.equal(result.numericalContext.x87.controlWord, 0x7f); assert.equal(result.numericalContext.x87.statusWord, 0x87b);
    assert.equal(result.numericalContext.sse.mxcsr, 0x1fa7);
    assert.deepEqual(result.semanticRegions.filter(row => row.comparison === 'mutable').map(row => row.id).sort(), ['race-clock-delivered', 'race-clock-stack', 'race-clock-streak']);
    assert.deepEqual(f.rows.map(row => row.bytes), initial);
    result.rows[0].bytes[0] ^= 255; assert.deepEqual(f.rows.map(row => row.bytes), initial, 'Binding buffers do not mutate retained input bytes.');
  }
});

test('actual stack at preferred6e66xx remains raw; compatibility aliases are never applied automatically', async () => {
  const f = await fixture(0x730000, 0x6e6740), bindings = f.bind();
  const {memory} = createCapturedMemory(bindings.rows);
  assert.equal(memory.readUInt32LE(0x6e66f8), 0x69696969);
  assert.equal(memory.readUInt32LE(0xa166f8), 289);
  assert.deepEqual(bindings.aliases.find(row => row.address === 0x6e66f8), {address: 0x6e66f8, targetAddress: 0xa166f8, length: 4});
  assert.throws(() => memory.readUInt8(f.session), /Uncaptured/, 'The session pointer grants only its observed phase DWORD.');
  assert.throws(() => memory.readUInt8(0x77111111), /Uncaptured/, 'IAT identity grants no external allocation.');
});

test('rehashed selector, caller, row-identity and pointer mutations fail independently of transport hashes', async () => {
  const mutations = [
    f => f.change('stack', b => b.writeUInt32LE(f.base + 0x50df6, 512)),
    f => f.change('stack', b => b.writeUInt32LE(f.base + 0x40cd0, 536)),
    f => f.change('logical', b => b.writeUInt32LE(287)),
    f => f.change('delivered', b => b.writeUInt32LE(0)),
    f => f.change('enabled', b => b.writeInt32LE(-1)),
    f => f.change('frequency-origin', b => b.writeBigInt64LE(-1n)),
    f => f.change('qpc-import', b => b.writeUInt32LE(0)),
    f => f.change('qpf-import', b => b.writeUInt32LE(0)),
    f => f.change('session-root', b => b.writeUInt32LE(0)),
    f => f.change('session-phase', b => b.writeInt32LE(3)),
    f => f.change('session-phase', (_b, row) => {row.address++;}),
    f => f.change('scale', (_b, row) => {row.source = 'foreign-observation';})
  ];
  for (const mutate of mutations) {const f = await fixture(); mutate(f); assert.throws(() => f.bind());}
  const extra = await fixture(); extra.snapshot.ranges.set('extra', {id: 'extra', address: 0x1300000, length: 4, bytes: Buffer.alloc(4), sha256: sha(Buffer.alloc(4))});
  assert.throws(() => extra.bind(), /Exactly fifteen/);
  const missing = await fixture(); missing.snapshot.ranges.delete('race-clock-scale'); assert.throws(() => missing.bind(), /Exactly fifteen/);
  const hash = await fixture(); hash.get('origin')[0] ^= 1; assert.throws(() => hash.bind(), /raw hash/);
  const overlap = await fixture(0x730000, 0xa16700);
  assert.throws(() => overlap.bind(), /overlapping actual observations agree/);
});

test('raw context and summary agree, observedSWzero survives, and later endpoints never become source inputs', async () => {
  const f = await fixture(); f.register('fpuStatusWord', 0); assert.equal(f.bind().numericalContext.x87.statusWord, 0);
  for (const id of ['native-race-clock-counter-call', 'native-race-clock-counter-return', 'native-race-clock-return']) {
    f.snapshot.breakpointId = id; assert.throws(() => f.bind(), /Only original clock entry/);
  }
  const changed = await fixture(); changed.snapshot.context[164] ^= 1; assert.throws(() => changed.bind(), /context hash/);
  changed.snapshot.contextSha256 = sha(changed.snapshot.context); assert.throws(() => changed.bind(), /summary matches/);
  const eip = await fixture(); eip.register('eip', eip.base + 0x89d11); assert.throws(() => eip.bind(), /entry EIP/);
  const sw = await fixture(); sw.register('fpuStatusWord', 0x10000); assert.throws(() => sw.bind(), /status WORD/);
  const pc = await fixture(); pc.register('fpuControlWord', 0x17f); assert.throws(() => pc.bind(), /legal captured/);
  const base = await fixture(); base.snapshot.mainModuleBaseAddress++; assert.throws(() => base.bind());
});

test('constant pins compare observed input and never substitute default tables', async () => {
  for (const name of ['scale', 'conversion-tables']) {
    const f = await fixture(); f.change(name, b => {b[0] ^= 1;}); const changed = Buffer.from(f.get(name));
    assert.throws(() => f.bind(), /immutable original/);
    const admitted = f.bind({strictOriginalConstants: false});
    assert.deepEqual(admitted.rows.find(row => row.id === `race-clock-${name}`).bytes, changed);
    assert.equal(admitted.strictOriginalConstants, false); assert.equal(admitted.nativeOutputsAdmitted, 0);
  }
  const f = await fixture(); assert.throws(() => f.bind({strictOriginalConstants: null}), /constant-identity policy/);
});

test('retained caller/clock/counter instructions and originalPE prove the fixed sites and HIGHLOW return operand', async () => {
  const evidence = await verifyNativeRaceClockEvidence(); assert.equal(evidence.evidenceIds.length, 4);
  assert.deepEqual(evidence.relocatedReturnOperand, {preferredAddress: 0x450df2, preferredTarget: 0x6e6b4c, type: 'IMAGE_REL_BASED_HIGHLOW'});
  assert.equal(nativeRaceClockFixedRegions.length, 13); assert.equal(nativeRaceClockFixedRegions.find(row => row.id === 'race-clock-conversion-tables').length, 130);
});
