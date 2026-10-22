import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFrameGlobalRegions, nativeFrameRootRanges, buildNativeFrameManifest, compareNativeFrameRegions} from '../tools/lib/native-frame-manifest.mjs';

// Synthetic storage only: these addresses and bytes were never captured from
// the original process. Header/pool layouts follow428100/440410/474160.
function fixture({worldCount = 0} = {}) {
  const moduleBaseAddress = 0x6e0000, actual = va => moduleBaseAddress + va - 0x400000;
  const rows = nativeFrameGlobalRegions.map(({id, preferredAddress, length}) => ({id, address: actual(preferredAddress), bytes: Buffer.alloc(length)}));
  function add(id, address, length) {const row = {id, address, bytes: Buffer.alloc(length)}; rows.push(row); return row;}
  function at(address, width = 4) {const row = rows.find(row => address >= row.address && address + width <= row.address + row.bytes.length); assert.ok(row, address.toString(16)); return {bytes: row.bytes, offset: address - row.address};}
  const put = (va, value) => {const {bytes, offset} = at(actual(va)); bytes.writeInt32LE(value | 0, offset);};
  const word = (va, value) => {const {bytes, offset} = at(actual(va), 2); bytes.writeUInt16LE(value, offset);};
  const set = (address, value) => {const {bytes, offset} = at(address); bytes.writeInt32LE(value | 0, offset);};
  put(0x902ba4, 3); put(0x902ba0, 0); put(0x902bb4, 2);
  for (const [id, root, pointer, length] of [
    ['shapes', 0x91e79c, 0x20000000, 0x4800], ['indices', 0x91e780, 0x20010000, 0x300],
    ['candidates', 0x91e788, 0x20020000, 0x8000], ['events', 0x902ba8, 0x20030000, 3 * 104],
    ['heap', 0x902bac, 0x20040000, 4 * 4], ['free', 0x902bb0, 0x20050000, 3 * 4],
    ['physical', 0x902bc0, 0x20060000, 0x180], ['groups', 0x902be0, 0x20070000, 0x2108],
    ['session', 0x5ecb1c, 0x28000000, 0x590], ['config', 0x5ecefc, 0x28001000, 0x70],
    ['pack', 0x90b98c, 0x28002000, 0xa0],
  ]) {put(root, pointer); add(id, pointer, length);}
  put(0x91e78c, 0x20010100); put(0x91e790, 0x20010200);
  for (let index = 0; index < 65; index++) put(0x902be0 + index * 12, 0x20070000 + index * 132);
  word(0x902bc4, 1); put(0x902bcc, 1);
  const arenaAllocation = 0x22000003, body = 0x22000080, arenaSize = 32000;
  put(0x6e6b40, arenaAllocation); put(0x709808, -139000); put(0x902eec, body); put(0x70dcf4, 0x3e80);
  add('arena', arenaAllocation, arenaSize); set(body, 0x1c03); set(0x20060000, body); put(0x909300, body);
  const session = at(0x28000000); session.bytes[0x54d] = 1; set(0x2800057c, 4);
  put(0x9207e4, worldCount);
  const esp = 0x30000100; add('stack', esp - 256, 260);
  return {snapshot: {moduleBaseAddress, registers: {esp: `0x${esp.toString(16)}`}, ranges: rows}, actual, put, word, set, body, rows};
}
const build = f => buildNativeFrameManifest(f.snapshot, {stackBytesBefore: 256});

test('bootstrap descriptors use explicit roots and supported fixed/region helper modes', () => {
  const ranges = nativeFrameRootRanges({stackBytesBefore: 512});
  assert.equal(new Set(ranges.map(row => row.id)).size, ranges.length);
  for (const range of ranges) {
    assert.equal(Number(Boolean(range.rva)) + Number(Boolean(range.baseRegister)), 1);
    if (range.readableRegion) {assert.equal(range.length, undefined); assert.equal(range.maxRegionBytes, 64 * 1024 * 1024);}
    else assert.ok(range.length > 0);
    assert.equal('evidence' in range, false, 'Helper rejects undeclared fields.');
  }
  assert.deepEqual(ranges.find(row => row.id === 'candidate-group-lists'), {id: 'candidate-group-lists', rva: '0x502be0', dereferenceOffsets: ['0'], length: 0x2108});
  assert.deepEqual(ranges.at(-1), {id: 'frame-stack', baseRegister: 'esp', offset: '-512', length: 516});
  assert.throws(() => nativeFrameRootRanges(), /stackBytesBefore/);
  assert.throws(() => nativeFrameRootRanges({stackBytesBefore: 0, maxRegionBytes: 0x4000001}), /maxRegionBytes/);
});

test('observed headers derive exact bounded pools, refresh capacity and high-pointer bodies without relocation', () => {
  const f = fixture(), manifest = build(f), region = id => manifest.requiredRegions.find(row => row.id === id);
  assert.equal(manifest.observed.queueCapacity, 3);
  assert.equal(region('collision-events').length, 312);
  assert.equal(region('collision-heap').length, 16);
  assert.equal(region('candidate-group-lists').length, 0x2108);
  assert.equal(manifest.bodyLists.length, 66);
  assert.equal(manifest.bodyLists.at(-1).capacity, 2);
  assert.equal(manifest.bodyLists.at(-2).capacity, 33);
  assert.deepEqual(manifest.bodyStorage, [{address: f.body, length: 0x3e78}]);
  assert.equal(region('body-arena-allocation-bytes').address, 0x22000003);
  assert.equal(region('body-arena-allocation-bytes').length, 32000);
  assert.equal(region('frame-stack').comparison, 'abi-input');
  assert.equal(region('clock').comparison, 'read-only');
  assert.equal(manifest.aliases.find(row => row.address === 0x902ba0 - 0x24).targetAddress, f.actual(0x902b7c));
  assert.match(manifest.status, /dependencies-unresolved/);
  assert.ok(manifest.unresolvedDependencies.length > 0);
  assert.equal(f.rows.find(row => row.id === 'physical').bytes.readUInt32LE(), f.body, 'Evidence pointer bytes remain unchanged.');
});

test('missing, truncated, contradictory and out-of-bound captured state fail coverage', () => {
  const cases = [
    [f => {f.rows.splice(f.rows.findIndex(row => row.id === 'events'), 1);}, /Missing frame region collision-events/],
    [f => {const row = f.rows.find(row => row.id === 'heap'); row.bytes = row.bytes.subarray(0, -1);}, /Missing frame region collision-heap/],
    [f => {f.rows[0].length = f.rows[0].bytes.length + 1;}, /truncated/],
    [f => {f.put(0x902ba4, 4097);}, /collision event capacity/],
    [f => {f.put(0x902bb4, 3);}, /queue cursors/],
    [f => {f.put(0x91e78c, 0x20010101);}, /Shape index roots disagree/],
    [f => {f.put(0x91e794, 256);}, /Shape index cursor/],
    [f => {f.put(0x91e798, 257);}, /Allocated shape count/],
    [f => {f.word(0x902bc4, 96);}, /trailing null/],
    [f => {f.set(0x20060004, f.body);}, /trailing null/],
    [f => {f.put(0x902be0 + 64 * 12, 0x20070000);}, /group64 list root/],
    [f => {f.word(0x902be0 + 64 * 12 + 4, 3);}, /group64 list root\/count/],
    [f => {f.put(0x709808, 0x01000000);}, /body arena allocation size/],
    [f => {f.put(0x70dcf4, 32000);}, /alignment\/used cursor/],
    [f => {f.put(0x909300, f.body + 4);}, /Invalid arena body pointer/],
    [f => {f.rows.find(row => row.id === 'session').bytes[0x54d] = 7;}, /six records/],
    [f => {f.set(0x2800057c, 1);}, /phase4/],
    [f => {f.put(0x9207e4, -1);}, /world record count/],
    [f => {f.put(0x9207e4, 51);}, /world record count/],
    [f => {f.put(0x6e6ba0, 257);}, /Attachment count/],
    [f => {delete f.snapshot.registers.esp;}, /entry ESP/],
  ];
  for (const [edit, message] of cases) {const f = fixture(); edit(f); assert.throws(() => build(f), message);}
});

test('module bases must agree and aliases cannot shadow native heap addresses', () => {
  const f = fixture(); f.rows[0].moduleBaseAddress = '0x400000';
  assert.throws(() => build(f), /unambiguous/);
  delete f.rows[0].moduleBaseAddress;
  f.rows.push({address: 0x5eb5e0, bytes: Buffer.alloc(4)});
  assert.throws(() => build(f), /shadows actual captured/);
});

test('body arena request preserves native ADD/SHL wrapping before enforcing the bound', () => {
  const f = fixture();
  f.put(0x709808, -139000 + 134217728);
  assert.equal(build(f).observed.arenaAllocationBytes, 32000, 'Adding2^27 size-input units wraps the32-bit SHL5 request.');
  f.put(0x709808, -140000);
  assert.throws(() => build(f), /body arena allocation size/, 'Zero allocation request is not usable captured storage.');
  f.put(0x709808, 0x01000000);
  assert.throws(() => build(f), /body arena allocation size/, 'A large wrapped request still exceeds the declared64MiB capture bound.');
});

test('attachment observation bounds preserve tails without claiming allocation capacity', () => {
  const f = fixture(), manifest = buildNativeFrameManifest(f.snapshot, {stackBytesBefore: 256, attachmentWindowBytes: 512});
  const region = manifest.requiredRegions.find(row => row.id === 'attachment-queue');
  assert.equal(region.length, 512); assert.equal(region.observationBound, true);
  assert.equal(manifest.observed.attachmentWindowBytes, 512);
  assert.throws(() => nativeFrameRootRanges({stackBytesBefore: 256, attachmentWindowBytes: 513}), /align to four/);
  assert.throws(() => nativeFrameRootRanges({stackBytesBefore: 256, attachmentWindowBytes: 65536}), /overlaps another/);
  f.put(0x6e6ba0, 129);
  assert.throws(() => buildNativeFrameManifest(f.snapshot, {stackBytesBefore: 256, attachmentWindowBytes: 512}), /Attachment count/);
});

test('complete50-row world table and additional reached regions require exact coverage and evidence', () => {
  const f = fixture({worldCount: 2}), manifest = build(f);
  assert.equal(manifest.observed.worldCount * 16, 32);
  assert.equal(manifest.requiredRegions.find(row => row.id === 'world-records').length, 800);
  assert.deepEqual(manifest.aliases.find(row => row.address === 0x920800), {address: 0x920800, targetAddress: f.actual(0x920800), length: 800});
  f.rows.find(row => row.id === 'world-records').bytes = Buffer.alloc(799);
  assert.throws(() => build(f), /not completely captured/);
  const g = fixture();
  assert.equal(build(g).requiredRegions.find(row => row.id === 'world-records').length, 800, 'Zero active count still captures the actual table and unused tails.');
  assert.throws(() => buildNativeFrameManifest(g.snapshot, {stackBytesBefore: 256, maxWorldRecords: 51}), /maxWorldRecords/);
  assert.throws(() => buildNativeFrameManifest(g.snapshot, {stackBytesBefore: 256, additionalRegions: [{id: 'missing-effect', address: 0x37000000, length: 8, comparison: 'mutable', evidence: 'declared actual effect root'}]}), /Missing frame region missing-effect/);
  assert.throws(() => buildNativeFrameManifest(g.snapshot, {stackBytesBefore: 256, additionalRegions: [{id: 'unproven', address: g.body, length: 8, comparison: 'mutable'}]}), /Invalid frame region descriptor/);
});

test('comparison covers every declared semantic byte, reports first divergence, and keeps ABI optional', () => {
  const f = fixture(), manifest = build(f), copies = f.rows.map(row => ({...row, bytes: Buffer.from(row.bytes)}));
  const compared = compareNativeFrameRegions(manifest, f.rows, copies);
  assert.equal(compared.matched, true); assert.ok(compared.comparedBytes > 32000);
  copies.find(row => row.id === 'stack').bytes[0] = 99;
  assert.equal(compareNativeFrameRegions(manifest, f.rows, copies).matched, true);
  assert.equal(compareNativeFrameRegions(manifest, f.rows, copies, {includeAbi: true}).divergence.regionId, 'frame-stack');
  copies.find(row => row.id === 'arena').bytes[f.body - 0x22000003 + 0x74] = 7;
  const result = compareNativeFrameRegions(manifest, f.rows, copies);
  assert.equal(result.matched, false); assert.equal(result.divergence.regionId, 'body-arena-allocation-bytes');
  assert.equal(result.divergence.address, f.body + 0x74); assert.equal(result.divergence.actualByte, 7);
  assert.throws(() => compareNativeFrameRegions(manifest, f.rows, copies.filter(row => row.id !== 'arena')), /Uncaptured native memory/);
});
