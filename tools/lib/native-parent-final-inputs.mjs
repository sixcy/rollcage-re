import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCapturedMemory} from './captured-memory.mjs';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {REDUX_SHA256} from './retained-native-program.mjs';

export const nativeParentFinalInputsCapability = 'scoped-parent-final-tick-v1';
export const nativeParentFinalInputStages = Object.freeze(['native-control-before', 'native-control-after-ai', 'native-control-after',
  'native-control-after-physics', 'native-control-after-attachments', 'native-control-after-recovery', 'native-control-after-drive',
  'native-control-after-auxiliary', 'native-control-after-cameras', 'native-control-after-world-effects', 'native-parent-return']);
export function nativeParentFinalInputPolicy() {
  return {returnBreakpointId: 'native-parent-return',
    lightBands: {allocationRootRva: '0x40f208', sectorTableRva: '0x40f220', packRootRva: '0x50b98c', maxSectors: 127, maxBandBytes: 65536},
    listenerWrappers: {headerRva: '0x2f2408', maxUsedSlots: 4, wrapperBytes: 80, poseRecordsRva: '0x449480', poseRecordBytes: 84},
    masterLevel: {managerRootRva: '0x314b08', levelOffset: '0x850', vtableBytes: 96, methodOffset: '0x5c', methodRva: '0xa90e0'}};
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const uint = (value, label) => {
  const n = Number(value); assert.ok((typeof value === 'number' || typeof value === 'string' && /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value))
    && Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff, `Final input uint32 ${label}`); return n;
};
const rowsOf = s => s.ranges instanceof Map ? [...s.ranges.values()] : s.ranges;
const finalRow = r => r.source === 'parent-final-inputs' || r.id?.startsWith('parent-final-');
const keys = (value, expected, label) => assert.deepEqual(Object.keys(value).sort(), expected.toSorted(), label);
function exact(value, expected, addressKeys = []) {
  keys(value, Object.keys(expected), 'Exact final input proof fields');
  const normalized = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, addressKeys.includes(k) && v !== null ? uint(v, k) : v]));
  assert.deepEqual(normalized, expected);
}
function baseAddress(value) {const base = uint(value, 'module base'); assert.ok(base > 0 && base + 0x50b990 <= 0x100000000); return base;}
function lightLayout(memory, base) {
  const rootAddress = base + 0x40f208, packRootAddress = base + 0x50b98c, pointerTableAddress = base + 0x40f220;
  const allocationBase = memory.readUInt32LE(rootAddress), packAddress = memory.readUInt32LE(packRootAddress);
  assert.ok(packAddress > 0, 'Nonnull final light pack'); const header = memory.subarray(packAddress, packAddress + 20);
  const sectorTableAddress = header.readUInt32LE(), sectorCount = header.readUInt32LE(16);
  assert.ok(sectorCount <= 127, 'Final light sector observation bound'); assert.ok(!sectorCount || sectorTableAddress > 0);
  const sectors = []; let totalBytes = 0;
  for (let index = 0; index < sectorCount; index++) {
    const address = memory.readUInt32LE(sectorTableAddress + index * 4); assert.ok(address > 0, 'Nonnull final sector');
    const bytes = memory.subarray(address, address + 16), rows = bytes.readUInt32LE(12), length = Math.floor(rows / 16) * 32 + 32;
    assert.ok(length <= 65536 && totalBytes + length <= 65536, 'Final light band size bound without native arithmetic wrap');
    const begin = allocationBase + totalBytes; assert.ok(allocationBase > 0 && begin + length <= 0x100000000);
    sectors.push({index, address, headerBytesHex: bytes.toString('hex'), rows, bytes: length, begin, end: begin + length, offset: totalBytes}); totalBytes += length;
  }
  const pointerBytes = memory.subarray(pointerTableAddress, pointerTableAddress + (sectorCount + 1) * 4);
  for (let i = 0; i <= sectorCount; i++) assert.equal(pointerBytes.readUInt32LE(i * 4), allocationBase + (i === sectorCount ? totalBytes : sectors[i].offset), 'Exact final band pointer/sentinel');
  return {allocationRootAddress: rootAddress, allocationRootBytesHex: memory.subarray(rootAddress, rootAddress + 4).toString('hex'), allocationBase,
    packRootAddress, packRootBytesHex: memory.subarray(packRootAddress, packRootAddress + 4).toString('hex'), packAddress,
    packHeaderHex: header.toString('hex'), sectorTableAddress, sectorCount, pointerTableAddress, pointerTableHex: pointerBytes.toString('hex'), sectors,
    totalBytes, endAddress: allocationBase + totalBytes};
}

export function verifyNativeParentFinalInputs(snapshot, proof, {moduleBaseAddress, policy = nativeParentFinalInputPolicy()} = {}) {
  assert.deepEqual(policy, nativeParentFinalInputPolicy(), 'Exact bounded final tick policy'); const base = baseAddress(moduleBaseAddress), rows = rowsOf(snapshot);
  assert.ok(Array.isArray(rows) && proof && nativeParentFinalInputStages.includes(snapshot.breakpointId));
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length, 'Unique final input row IDs');
  assert.equal(proof.type, 'parent-final-inputs-observed'); assert.equal(proof.snapshotOrdinal, snapshot.ordinal);
  assert.equal(uint(proof.mainModuleBaseAddress, 'proof module'), base);
  const expectedRows = [];
  function part(name, address, length, index = 0, references) {
    assert.ok(Number.isSafeInteger(address) && address > 0 && Number.isSafeInteger(length) && length > 0 && address + length <= 0x100000000, `Final span ${name}`);
    const id = `parent-final-${name}`, matches = rows.filter(r => r.id === id); assert.equal(matches.length, 1, `Exact final row ${id}`);
    const row = matches[0], role = name.replace(/-\d+$/, ''); assert.equal(uint(row.address, id), address); assert.equal(row.length, length);
    assert.ok(Buffer.isBuffer(row.bytes) && row.bytes.length === length); assert.equal(row.sha256, sha(row.bytes), `Final ${id} hash`);
    assert.deepEqual([row.source, row.graphRole, row.graphIndex], ['parent-final-inputs', role, index]);
    for (const key of ['rangeMode', 'readableRegion', 'dereferenceOffsets', 'dereferenceMinimumValues', 'vectorStorage', 'baseRegister']) assert.equal(row[key], undefined, 'Final input rows grant only exact bytes');
    if (references === undefined) assert.equal(row.referenceIndices, undefined); else assert.deepEqual(row.referenceIndices, references);
    expectedRows.push(row); return row;
  }
  //Parse solely exact custom rows first, then check their intersections with
  //all ordinary snapshot bytes. A broad transport cannot replace missing rows.
  const lightRoot = part('light-root', base + 0x40f208, 4), packRoot = part('light-pack-root', base + 0x50b98c, 4);
  const packAddress = packRoot.bytes.readUInt32LE(), pack = part('light-pack-header', packAddress, 20), count = pack.bytes.readUInt32LE(16), table = pack.bytes.readUInt32LE();
  assert.ok(count <= 127, 'Final light sector observation bound');
  if (count) {const pointers = part('light-sector-pointers', table, count * 4); for (let i = 0; i < count; i++) part(`light-sector-header-${i}`, pointers.bytes.readUInt32LE(i * 4), 16, i);}
  part('light-table', base + 0x40f220, (count + 1) * 4);
  const lightMemory = createCapturedMemory(expectedRows), light = lightLayout(lightMemory.memory, base);
  if (light.totalBytes) part('light-bands', light.allocationBase, light.totalBytes);
  keys(proof.lightBands, Object.keys(light), 'Exact light proof fields');
  const numericLight = Object.fromEntries(Object.entries(proof.lightBands).map(([k, v]) => [k, ['allocationRootAddress', 'allocationBase', 'packRootAddress', 'packAddress', 'sectorTableAddress', 'pointerTableAddress', 'endAddress'].includes(k) ? uint(v, k) : v]));
  assert.ok(Array.isArray(numericLight.sectors)); numericLight.sectors = numericLight.sectors.map((s, i) => {
    keys(s, Object.keys(light.sectors[i] ?? {}), 'Exact sector metadata'); return {...s, address: uint(s.address, 'sector'), begin: uint(s.begin, 'band begin'), end: uint(s.end, 'band end')};
  }); assert.deepEqual(numericLight, light);
  const headerAddress = base + 0x2f2408, header = part('listener-header', headerAddress, 12).bytes;
  const begin = header.readUInt32LE(), end = header.readUInt32LE(4), capacity = header.readUInt32LE(8);
  assert.ok(begin <= end && end <= capacity && (end - begin) % 4 === 0 && (capacity - begin) % 4 === 0 && (begin !== 0 || capacity === 0), 'Actual final listener vector');
  const usedSlots = (end - begin) / 4; assert.ok(usedSlots <= 4, 'Four listener observation domain');
  const storage = usedSlots ? part('listener-slots', begin, usedSlots * 4).bytes : null, wrappers = [], slots = [], wrapperMap = new Map();
  for (let index = 0; index < usedSlots; index++) {
    const address = storage.readUInt32LE(index * 4); let wrapper = null;
    if (address) {wrapper = wrapperMap.get(address); if (!wrapper) {wrapper = {index: wrappers.length, address, rangeId: `parent-final-listener-wrapper-${wrappers.length}`, bytes: 80, sha256: null, referenceIndices: []}; wrappers.push(wrapper); wrapperMap.set(address, wrapper);} wrapper.referenceIndices.push(index);}
    slots.push({index, slotAddress: begin + index * 4, wrapperAddress: address, wrapperIndex: wrapper?.index ?? null, wrapperRangeId: wrapper?.rangeId ?? null});
  }
  for (const wrapper of wrappers) wrapper.sha256 = part(`listener-wrapper-${wrapper.index}`, wrapper.address, 80, wrapper.index, wrapper.referenceIndices).sha256;
  const poseRecordsAddress = base + 0x449480, recordBytes = part('listener-pose-records', poseRecordsAddress, 4 * 84).bytes, poses = [], poseRanges = [], poseMap = new Map();
  for (let index = 0; index < 4; index++) {
    const offset = index * 84, active = recordBytes[offset] !== 0, dynamic = active && recordBytes.readUInt16LE(offset + 2) !== 0, item = {index, active, dynamic};
    for (const [role, length, roleIndex] of [['position', 12, 0], ['velocity', 12, 1], ['rotation', 18, 2]]) {
      const address = active ? recordBytes.readUInt32LE(offset + (dynamic ? 16 + roleIndex * 16 : 4 + roleIndex * 4)) : null;
      let range = null; if (address) {const key = `${address}:${length}`; range = poseMap.get(key); if (!range) {range = {index: poseRanges.length, address, rangeId: `parent-final-listener-pose-${poseRanges.length}`, bytes: length, sha256: null, referenceIndices: []}; poseRanges.push(range); poseMap.set(key, range);} range.referenceIndices.push(index * 3 + roleIndex);}
      item[`${role}Address`] = address; item[`${role}Index`] = range?.index ?? null; item[`${role}RangeId`] = range?.rangeId ?? null;
    } poses.push(item);
  }
  for (const range of poseRanges) range.sha256 = part(`listener-pose-${range.index}`, range.address, range.bytes, range.index, range.referenceIndices).sha256;
  const listener = {headerAddress, headerBytesHex: header.toString('hex'), begin, end, capacity, usedSlots, uniqueWrappers: wrappers.length, slots, wrappers,
    poseRecordsAddress, poseRecordsHex: recordBytes.toString('hex'), poses, poseRanges};
  const claimed = proof.listenerWrappers; keys(claimed, Object.keys(listener), 'Exact listener proof fields');
  for (const key of ['slots', 'wrappers', 'poses', 'poseRanges']) {
    assert.ok(Array.isArray(claimed[key])); assert.equal(claimed[key].length, listener[key].length);
    claimed[key].forEach((item, i) => exact(item, listener[key][i], ['address', 'slotAddress', 'wrapperAddress', 'positionAddress', 'velocityAddress', 'rotationAddress']));
  }
  exact(Object.fromEntries(Object.entries(claimed).filter(([k]) => !['slots', 'wrappers', 'poses', 'poseRanges'].includes(k))),
    Object.fromEntries(Object.entries(listener).filter(([k]) => !['slots', 'wrappers', 'poses', 'poseRanges'].includes(k))), ['headerAddress', 'begin', 'end', 'capacity', 'poseRecordsAddress']);
  const managerRoot = part('manager-root', base + 0x314b08, 4), managerAddress = managerRoot.bytes.readUInt32LE();
  const vptr = part('manager-vtable-pointer', managerAddress, 4), vtableAddress = vptr.bytes.readUInt32LE(), vtable = part('manager-vtable', vtableAddress, 96);
  const methodAddress = vtable.bytes.readUInt32LE(0x5c); assert.equal(methodAddress, base + 0xa90e0, 'Original master-level method target before level admission');
  const levelAddress = managerAddress + 0x850, level = part('manager-level', levelAddress, 4);
  const master = {rootAddress: base + 0x314b08, rootBytesHex: managerRoot.bytes.toString('hex'), managerAddress, vtablePointerBytesHex: vptr.bytes.toString('hex'), vtableAddress,
    levelAddress, levelBytesHex: level.bytes.toString('hex'), methodAddress, methodBytesHex: vtable.bytes.subarray(0x5c, 0x60).toString('hex'), vtableSha256: vtable.sha256};
  exact(proof.masterLevel, master, ['rootAddress', 'managerAddress', 'vtableAddress', 'levelAddress', 'methodAddress']);
  assert.equal(rows.filter(finalRow).length, expectedRows.length, 'Only exact final input rows, no descendants'); createCapturedMemory(rows);
  const additionalBytes = expectedRows.reduce((n, r) => n + r.bytes.length, 0); assert.equal(proof.additionalBytes, additionalBytes);
  assert.deepEqual([proof.sameStoppedDebugEvent, proof.afterParentAdmission, proof.beforeOriginalInstruction, proof.completeInputsObserved], [true, true, true, true]);
  return {verified: true, snapshotOrdinal: snapshot.ordinal, lightBands: light, listenerWrappers: listener, masterLevel: master, additionalBytes,
    semanticInputsAdmitted: 0, originalInput: snapshot.breakpointId === 'native-control-before'};
}

const field = (id, preferredAddress, length) => Object.freeze({id, preferredAddress, length, comparison: 'read-only', evidence: 'Original final-tick fixed instruction operand; exact observed input only, no initializer.'});
export const nativeParentFinalModuleRegions = Object.freeze([
  field('final-light-root', 0x80f208, 4), field('final-light-pack-root', 0x90b98c, 4), field('final-listener-header', 0x6f2408, 12),
  field('final-listener-records', 0x849480, 336), field('final-manager-root', 0x714b08, 4), field('final-master-argument', 0x5ecdb8, 4),
  ...[0x5dc5b8, 0x5dc5d0, 0x5dc5f4, 0x5ecdb0, 0x5ecdb4].map(p => field(`final-listener-scalar-${p.toString(16)}`, p, 4))]);
function originalMemory(snapshot, base) {
  assert.ok(snapshot?.breakpointId === 'native-control-before' && Number(snapshot.registers?.eip) === base + 0x50e50, 'Final inputs require original450e50 entry, never an after snapshot');
  return createCapturedMemory(rowsOf(snapshot));
}
export function nativeParentFinalInputRegions(snapshot, moduleBaseAddress) {
  const base = baseAddress(moduleBaseAddress), original = originalMemory(snapshot, base);
  const graph = verifyNativeParentFinalInputs(snapshot, snapshot.parentFinalInputs, {moduleBaseAddress: base}), regions = [];
  const add = (id, address, length, preferredAddress) => {original.span(address, length); regions.push({id, address, length, comparison: 'read-only', evidence: 'Authenticated original-entry final input metadata only; mutable descendants are admitted at genuine source stages.', ...(preferredAddress === undefined ? {} : {preferredAddress})});};
  for (const r of nativeParentFinalModuleRegions) add(r.id, base + r.preferredAddress - 0x400000, r.length, r.preferredAddress);
  const light = graph.lightBands; add('final-light-table', light.pointerTableAddress, (light.sectorCount + 1) * 4, 0x80f220);
  add('final-light-pack-header', light.packAddress, 20); if (light.sectorCount) add('final-light-sector-pointers', light.sectorTableAddress, light.sectorCount * 4);
  for (const sector of light.sectors) add(`final-light-sector-header-${sector.index}`, sector.address, 16);
  add('final-manager-vtable-pointer', graph.masterLevel.managerAddress, 4); add('final-manager-vtable', graph.masterLevel.vtableAddress, 96);
  return regions;
}
export function nativeParentFinalSourceRegions(snapshot, {moduleBaseAddress, stage, memory} = {}) {
  const base = baseAddress(moduleBaseAddress), original = originalMemory(snapshot, base); assert.ok(Buffer.isBuffer(memory), 'Live source memory required for final admission');
  assert.ok(['lights', 'listeners', 'manager'].includes(stage), 'Known genuine final source stage'); const regions = [], seen = new Set();
  const add = (id, address, length) => {original.span(address, length); memory.subarray(address, address + length); const key = `${address}:${length}`; if (!seen.has(key)) {seen.add(key); regions.push({id, address, length, comparison: 'mutable', evidence: `Original-entry physical bytes owned/reached by genuine final ${stage} stage; no native refresh or initializer.`});}};
  if (stage === 'lights') {
    const layout = lightLayout(memory, base);
    if (layout.totalBytes) add('final-source-owned-light-bands', layout.allocationBase, layout.totalBytes);
    return regions;
  }
  if (stage === 'listeners') {
    const header = base + 0x2f2408, begin = memory.readUInt32LE(header), end = memory.readUInt32LE(header + 4), capacity = memory.readUInt32LE(header + 8);
    assert.ok(begin <= end && end <= capacity && (end - begin) % 4 === 0 && (capacity - begin) % 4 === 0 && (begin || !capacity) && (end - begin) / 4 <= 4);
    for (let i = 0; i < 4; i++) {
      const r = base + 0x449480 + i * 84; if (!memory[r]) continue; const dynamic = memory.readUInt16LE(r + 2) !== 0;
      for (const [role, n, length] of [['position', 0, 12], ['velocity', 1, 12], ['rotation', 2, 18]]) {
        const address = memory.readUInt32LE(r + (dynamic ? 16 + n * 16 : 4 + n * 4)); if (address) add(`final-source-listener-${i}-${role}`, address, length);
      }
      if (i < (end - begin) / 4) {
        add(`final-source-listener-${i}-slot`, begin + i * 4, 4);
        const address = memory.readUInt32LE(begin + i * 4); if (address) add(`final-source-listener-${i}-destination`, address, 80);
      }
    }
    return regions;
  }
  const manager = memory.readUInt32LE(base + 0x314b08); assert.ok(manager > 0); original.span(manager, 4);
  const vtable = memory.readUInt32LE(manager); assert.ok(vtable > 0); original.span(vtable, 96); assert.equal(memory.readUInt32LE(vtable + 0x5c), base + 0xa90e0, 'Live original master-level target');
  add('final-source-manager-level', manager + 0x850, 4); return regions;
}

export async function verifyNativeParentFinalInputsEvidence() {
  const proof = await readInstructionEvidence(['1252-light-sector-construction-assembly.json', '971-race-phase-audio-update-assembly.json', '9190-sound-manager-level-procedure_assembly.json'], {directory: 'analysis/native-simulation/results'});
  assert.ok(proof.evidence.every(r => r.subject?.digest?.sha256 === REDUX_SHA256)); const list = new Map(proof.instructions.map(i => [i.address, i]));
  for (const [address, op, args] of [[0x48ef6d, 'MOV', ['EAX', 'dword ptr [EAX + 0xc]']], [0x48ef70, 'SHR', ['EAX', '0x4']], [0x48ef73, 'SHL', ['EAX', '0x5']], [0x48ef76, 'ADD', ['EAX', '0x20']],
    [0x4848d7, 'MOV', ['EDI', 'dword ptr [ECX]']], [0x4848d9, 'MOV', ['EDX', 'dword ptr [ECX + 0x10]']], [0x4848dc, 'MOV', ['EAX', 'dword ptr [ECX + 0x20]']],
    [0x484af8, 'MOV', ['dword ptr [EDX + 0x4c]', 'EAX']], [0x4a90e4, 'MOV', ['dword ptr [ECX + 0x850]', 'EAX']]]) {
    const row = list.get(address); assert.ok(row?.op === op && JSON.stringify(row.args) === JSON.stringify(args), `Final input producer0x${address.toString(16)}`);
  }
  return {targetSha256: REDUX_SHA256, evidenceIds: proof.evidence.map(r => r.evidence_id), scope: 'Constructor-derived band extent, actual listener pointer modes/80B writes and raw master-level field; no initialized values or runtime outcome is supplied.'};
}
