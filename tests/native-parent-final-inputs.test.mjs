import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {nativeParentFinalInputPolicy, nativeParentFinalInputsCapability, nativeParentFinalInputStages, nativeParentFinalModuleRegions,
  verifyNativeParentFinalInputs, verifyNativeParentFinalInputsEvidence, nativeParentFinalInputRegions, nativeParentFinalSourceRegions} from '../tools/lib/native-parent-final-inputs.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
const word = n => {const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b;};

//Constructed exact-row graph, without original process or game-stage execution.
function fixture({base = 0x400000, rowCounts = [48, 96, 0], bandBase = 0x20000000, breakpointId = 'native-control-before', slotCount = 3} = {}) {
  const ranges = [], part = (name, address, bytes, index = 0, references) => {
    const r = {id: `parent-final-${name}`, address, bytes, length: bytes.length, sha256: hash(bytes), source: 'parent-final-inputs',
      graphRole: name.replace(/-\d+$/, ''), graphIndex: index, ...(references === undefined ? {} : {referenceIndices: references})}; ranges.push(r); return r;
  };
  const packAddress = 0x32000000, sectorTableAddress = 0x30000000, count = rowCounts.length, packHeader = Buffer.alloc(20);
  packHeader.writeUInt32LE(sectorTableAddress); packHeader.writeUInt32LE(count, 16);
  const root = part('light-root', base + 0x40f208, word(bandBase)), packRoot = part('light-pack-root', base + 0x50b98c, word(packAddress));
  part('light-pack-header', packAddress, packHeader);
  const sectorPointers = Buffer.alloc(count * 4), sectors = [], pointers = Buffer.alloc((count + 1) * 4); let totalBytes = 0;
  for (let i = 0; i < count; i++) {
    const address = 0x31000000 + i * 0x100, header = Buffer.alloc(16), bytes = Math.floor(rowCounts[i] / 16) * 32 + 32;
    header.write('SEGM'); header.writeUInt32LE(rowCounts[i], 12); sectorPointers.writeUInt32LE(address, i * 4); pointers.writeUInt32LE(bandBase + totalBytes, i * 4);
    part(`light-sector-header-${i}`, address, header, i);
    sectors.push({index: i, address, headerBytesHex: header.toString('hex'), rows: rowCounts[i], bytes, begin: bandBase + totalBytes, end: bandBase + totalBytes + bytes, offset: totalBytes}); totalBytes += bytes;
  }
  if (count) part('light-sector-pointers', sectorTableAddress, sectorPointers);
  pointers.writeUInt32LE(bandBase + totalBytes, count * 4); part('light-table', base + 0x40f220, pointers);
  if (totalBytes) part('light-bands', bandBase, Buffer.alloc(totalBytes, 0x55));
  const lightBands = {allocationRootAddress: root.address, allocationRootBytesHex: root.bytes.toString('hex'), allocationBase: bandBase,
    packRootAddress: packRoot.address, packRootBytesHex: packRoot.bytes.toString('hex'), packAddress, packHeaderHex: packHeader.toString('hex'),
    sectorTableAddress, sectorCount: count, pointerTableAddress: base + 0x40f220, pointerTableHex: pointers.toString('hex'), sectors, totalBytes, endAddress: bandBase + totalBytes};
  const begin = 0x40000000, header = Buffer.concat([word(begin), word(begin + slotCount * 4), word(begin + (slotCount + 2) * 4)]);
  part('listener-header', base + 0x2f2408, header); const slotBytes = Buffer.alloc(slotCount * 4), wrappers = [], slots = [];
  for (let i = 0; i < slotCount; i++) {
    const address = i === 1 ? 0 : 0x50000000; slotBytes.writeUInt32LE(address, i * 4);
    if (address) {if (!wrappers.length) wrappers.push({index: 0, address, rangeId: 'parent-final-listener-wrapper-0', bytes: 80, sha256: null, referenceIndices: []}); wrappers[0].referenceIndices.push(i);}
    slots.push({index: i, slotAddress: begin + i * 4, wrapperAddress: address, wrapperIndex: address ? 0 : null, wrapperRangeId: address ? wrappers[0].rangeId : null});
  }
  if (slotCount) part('listener-slots', begin, slotBytes);
  for (const w of wrappers) w.sha256 = part(`listener-wrapper-${w.index}`, w.address, Buffer.alloc(80, 0x66), w.index, w.referenceIndices).sha256;
  const records = Buffer.alloc(336);
  records[0] = 1; records.writeUInt32LE(0x60000000, 4); records.writeUInt32LE(0x60000000, 8); records.writeUInt32LE(0x60000020, 12);
  records.writeUInt16LE(1, 84 + 2); records.writeUInt32LE(0xffffffff, 84 + 4); //Inactive poison must not be followed.
  records[168] = 1; records.writeUInt16LE(1, 170); records.writeUInt32LE(0x60000040, 184); records.writeUInt32LE(0x60000040, 216);
  records[252] = 1; records.writeUInt32LE(0x60000080, 256); //Pose read despite index3 outside used destination slots.
  part('listener-pose-records', base + 0x449480, records);
  const poseRanges = [], poses = [], poseMap = new Map();
  for (let i = 0; i < 4; i++) {
    const offset = i * 84, active = records[offset] !== 0, dynamic = active && records.readUInt16LE(offset + 2) !== 0, pose = {index: i, active, dynamic};
    for (const [role, n, length] of [['position', 0, 12], ['velocity', 1, 12], ['rotation', 2, 18]]) {
      const address = active ? records.readUInt32LE(offset + (dynamic ? 16 + n * 16 : 4 + n * 4)) : null; let range = null;
      if (address) {const key = `${address}:${length}`; range = poseMap.get(key); if (!range) {range = {index: poseRanges.length, address, rangeId: `parent-final-listener-pose-${poseRanges.length}`, bytes: length, sha256: null, referenceIndices: []}; poseRanges.push(range); poseMap.set(key, range);} range.referenceIndices.push(i * 3 + n);}
      pose[`${role}Address`] = address; pose[`${role}Index`] = range?.index ?? null; pose[`${role}RangeId`] = range?.rangeId ?? null;
    } poses.push(pose);
  }
  for (const r of poseRanges) r.sha256 = part(`listener-pose-${r.index}`, r.address, Buffer.alloc(r.bytes, 0x44), r.index, r.referenceIndices).sha256;
  const listenerWrappers = {headerAddress: base + 0x2f2408, headerBytesHex: header.toString('hex'), begin, end: begin + slotCount * 4,
    capacity: begin + (slotCount + 2) * 4, usedSlots: slotCount, uniqueWrappers: wrappers.length, slots, wrappers,
    poseRecordsAddress: base + 0x449480, poseRecordsHex: records.toString('hex'), poses, poseRanges};
  const managerAddress = 0x70000000, vtableAddress = base + 0x1d9990, vtable = Buffer.alloc(96); vtable.writeUInt32LE(base + 0xa90e0, 0x5c);
  const managerRoot = part('manager-root', base + 0x314b08, word(managerAddress)), vptr = part('manager-vtable-pointer', managerAddress, word(vtableAddress));
  const vtableRow = part('manager-vtable', vtableAddress, vtable), level = part('manager-level', managerAddress + 0x850, word(0x7fc01234));
  const masterLevel = {rootAddress: managerRoot.address, rootBytesHex: managerRoot.bytes.toString('hex'), managerAddress, vtablePointerBytesHex: vptr.bytes.toString('hex'),
    vtableAddress, levelAddress: level.address, levelBytesHex: level.bytes.toString('hex'), methodAddress: base + 0xa90e0,
    methodBytesHex: vtable.subarray(0x5c).toString('hex'), vtableSha256: vtableRow.sha256};
  const additionalBytes = ranges.reduce((n, r) => n + r.length, 0);
  for (const f of nativeParentFinalModuleRegions) {const address = base + f.preferredAddress - 0x400000; if (!ranges.some(r => r.address <= address && address + f.length <= r.address + r.length)) ranges.push({id: `ordinary-${f.id}`, address, bytes: Buffer.alloc(f.length), length: f.length});}
  const snapshot = {ordinal: 4, breakpointId, registers: {eip: base + 0x50e50}, ranges}, proof = {type: 'parent-final-inputs-observed', mainModuleBaseAddress: base,
    snapshotOrdinal: 4, lightBands, listenerWrappers, masterLevel, additionalBytes, sameStoppedDebugEvent: true, afterParentAdmission: true, beforeOriginalInstruction: true, completeInputsObserved: true};
  snapshot.parentFinalInputs = proof;
  return {snapshot, proof, base, policy: nativeParentFinalInputPolicy(), original: () => createCapturedMemory(ranges)};
}
const verify = f => verifyNativeParentFinalInputs(f.snapshot, f.proof, {moduleBaseAddress: f.base, policy: f.policy});
const part = (f, suffix) => f.snapshot.ranges.find(r => r.id === `parent-final-${suffix}`);

test('fixed final policy and source producer evidence cover11points without treating observation bounds as native capacities', async () => {
  assert.equal(nativeParentFinalInputsCapability, 'scoped-parent-final-tick-v1'); assert.equal(nativeParentFinalInputStages.length, 11);
  assert.equal(nativeParentFinalInputStages.at(-1), 'native-parent-return');
  const p = nativeParentFinalInputPolicy(); assert.equal(p.lightBands.maxSectors, 127); assert.equal(p.lightBands.maxBandBytes, 65536); assert.equal(p.listenerWrappers.poseRecordBytes, 84);
  const e = await verifyNativeParentFinalInputsEvidence(); assert.equal(e.targetSha256, 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5'); assert.equal(e.evidenceIds.length, 3);
});

test('exact graphs derive bands, sentinel, listener aliases/pose modes and raw manager field acrossASLR', () => {
  for (const base of [0x400000, 0xea0000, 0x320000]) {
    const f = fixture({base}), r = verify(f); assert.equal(r.lightBands.totalBytes, 384); assert.equal(r.semanticInputsAdmitted, 0);
    assert.deepEqual(r.listenerWrappers.wrappers[0].referenceIndices, [0, 2]);
    assert.deepEqual(r.listenerWrappers.poseRanges[0].referenceIndices, [0, 1]);
    assert.equal(r.listenerWrappers.poses[1].active, false); assert.equal(r.listenerWrappers.poses[1].dynamic, false); assert.equal(r.listenerWrappers.poses[1].positionAddress, null);
    assert.equal(r.listenerWrappers.poses[2].dynamic, true); assert.equal(r.listenerWrappers.poses[2].velocityAddress, 0);
    assert.equal(r.listenerWrappers.poses[3].positionAddress, 0x60000080);
    assert.equal(r.masterLevel.levelBytesHex, '3412c07f'); assert.equal(r.originalInput, true);
  }
});

test('zero sectors and allocated-unused listener vector grant no backing but still capture active pose inputs', () => {
  const f = fixture({rowCounts: [], bandBase: 0, slotCount: 0}), r = verify(f);
  assert.equal(r.lightBands.totalBytes, 0); assert.equal(r.listenerWrappers.uniqueWrappers, 0);
  assert.ok(r.listenerWrappers.poseRanges.length > 0); assert.equal(part(f, 'light-bands'), undefined); assert.equal(part(f, 'listener-slots'), undefined);
  assert.throws(() => f.original().span(0, 4), /Uncaptured/);
});

test('upfront aliases/readonly metadata exclude mutable descendants until genuine source stage', () => {
  const f = fixture(), regions = nativeParentFinalInputRegions(f.snapshot, f.base);
  assert.ok(regions.every(r => r.comparison === 'read-only'));
  for (const address of [0x20000000, 0x50000000, 0x60000000, 0x70000850]) assert.ok(!regions.some(r => address >= r.address && address < r.address + r.length));
  const source = f.original(), before = source.span(0x20000000, 384).toString('hex');
  const lights = nativeParentFinalSourceRegions(f.snapshot, {moduleBaseAddress: f.base, stage: 'lights', memory: source.memory});
  assert.deepEqual(lights.map(r => [r.address, r.length]), [[0x20000000, 384]]);
  const listeners = nativeParentFinalSourceRegions(f.snapshot, {moduleBaseAddress: f.base, stage: 'listeners', memory: source.memory});
  assert.deepEqual(listeners.filter(r => r.id.endsWith('-slot')).map(r => [r.address, r.length]), [[0x40000000, 4], [0x40000008, 4]]);
  assert.equal(listeners.filter(r => r.address === 0x50000000 && r.length === 80).length, 1);
  assert.ok(listeners.some(r => r.address === 0x60000080 && r.length === 12), 'Activepose beyond used destination count is genuinely read.');
  assert.equal(listeners.filter(r => r.address === 0x60000040).length, 2, 'Sameaddress12/18 extents remain distinct.');
  const manager = nativeParentFinalSourceRegions(f.snapshot, {moduleBaseAddress: f.base, stage: 'manager', memory: source.memory});
  assert.deepEqual(manager.map(r => [r.address, r.length]), [[0x70000850, 4]]); assert.equal(source.span(0x20000000, 384).toString('hex'), before);
});

test('light sector and byte observation boundaries reject oversize and native-wrap domains', () => {
  assert.equal(verify(fixture({rowCounts: Array(127).fill(0)})).lightBands.sectorCount, 127);
  assert.throws(() => verify(fixture({rowCounts: Array(128).fill(0)})), /sector observation bound/);
  assert.equal(verify(fixture({rowCounts: [32752]})).lightBands.totalBytes, 65536);
  assert.throws(() => verify(fixture({rowCounts: [32768]})), /band size bound/);
});

test('lazy listeners compare a read NULL destination slot but never admit NULL wrapper memory', () => {
  const f = fixture(), source = f.original(), record = f.base + 0x449480 + 84;
  source.memory[record] = 1; source.memory.writeUInt16LE(0, record + 2); source.memory.writeUInt32LE(0, record + 4);
  const regions = nativeParentFinalSourceRegions(f.snapshot, {moduleBaseAddress: f.base, stage: 'listeners', memory: source.memory});
  assert.ok(regions.some(r => r.id === 'final-source-listener-1-slot' && r.address === 0x40000004 && r.length === 4));
  assert.ok(!regions.some(r => r.id === 'final-source-listener-1-destination'));
});

test('lazy admission follows live source flags/pointers while rejecting unobserved storage and aftersnapshot refresh', () => {
  const f = fixture(), source = f.original(); source.memory[f.base + 0x449480] = 0;
  let listeners = nativeParentFinalSourceRegions(f.snapshot, {moduleBaseAddress: f.base, stage: 'listeners', memory: source.memory});
  assert.ok(!listeners.some(r => r.address === 0x60000000)); assert.ok(listeners.some(r => r.address === 0x50000000)); //Activeindex2 sharesdestination.
  source.memory.writeUInt32LE(0x61000000, f.base + 0x449480 + 168 + 16);
  assert.throws(() => nativeParentFinalSourceRegions(f.snapshot, {moduleBaseAddress: f.base, stage: 'listeners', memory: source.memory}), /Uncaptured/);
  source.memory.writeUInt32LE(0, f.base + 0x449480 + 168 + 16); source.memory.writeUInt32LE(0x71000000, f.base + 0x314b08);
  assert.throws(() => nativeParentFinalSourceRegions(f.snapshot, {moduleBaseAddress: f.base, stage: 'manager', memory: source.memory}), /Uncaptured/);
  assert.throws(() => nativeParentFinalInputRegions({...f.snapshot, breakpointId: 'native-parent-return'}, f.base), /original/);
  assert.throws(() => nativeParentFinalSourceRegions({...f.snapshot, breakpointId: 'native-control-after'}, {moduleBaseAddress: f.base, stage: 'lights', memory: source.memory}), /original/);
});

test('graph proof rejects rehashed pointer/length/sentinel/method/pose tampering, false counts and extra rows', () => {
  const changes = [
    f => {part(f, 'light-root').sha256 = '0'.repeat(64);},
    f => {const r = part(f, 'light-table'); r.bytes.writeUInt32LE(0x20000001, 12); r.sha256 = hash(r.bytes);},
    f => {const r = part(f, 'light-sector-header-0'); r.bytes.writeUInt32LE(0xffffffff, 12); r.sha256 = hash(r.bytes);},
    f => {f.proof.lightBands.totalBytes++;},
    f => {part(f, 'light-bands').length--;},
    f => {const r = part(f, 'listener-pose-records'); r.bytes.writeUInt32LE(0x61000000, 4); r.sha256 = hash(r.bytes);},
    f => {f.proof.listenerWrappers.poses[2].dynamic = false;},
    f => {f.proof.listenerWrappers.poseRanges[0].referenceIndices.pop();},
    f => {part(f, 'listener-wrapper-0').referenceIndices = [0];},
    f => {const r = part(f, 'manager-vtable'); r.bytes.writeUInt32LE(f.base + 0xa90e1, 0x5c); r.sha256 = hash(r.bytes);},
    f => {f.proof.additionalBytes++;},
    f => {f.snapshot.ranges.push({...part(f, 'light-root')});},
    f => {f.snapshot.ranges.push({id: 'parent-final-unobserved', source: 'parent-final-inputs', graphRole: 'guessed', graphIndex: 0, address: 0x72000000, bytes: Buffer.alloc(16), length: 16, sha256: hash(Buffer.alloc(16))});},
    f => {part(f, 'light-root').rangeMode = 'guarded-pointer';},
    f => {f.policy.lightBands.maxBandBytes++;}
  ];
  for (const [index, change] of changes.entries()) {const f = fixture(); change(f); assert.throws(() => verify(f), `Mutation ${index}`);}
});

test('final-return graphs remain comparison-only and ordinary overlapping observations must agree', () => {
  const f = fixture({breakpointId: 'native-parent-return'}); assert.equal(verify(f).originalInput, false);
  const original = part(f, 'listener-wrapper-0'); f.snapshot.ranges.push({id: 'ordinary-wrapper-copy', address: original.address, bytes: Buffer.from(original.bytes), length: 80});
  assert.doesNotThrow(() => verify(f)); f.snapshot.ranges.at(-1).bytes[4] ^= 1;
  assert.throws(() => verify(f), /Overlapping captured bytes disagree/);
});
