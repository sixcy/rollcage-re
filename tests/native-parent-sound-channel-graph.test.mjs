import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {nativeParentSoundChannelGraphPolicy, verifyNativeParentSoundChannelGraph,
  verifyNativeParentSoundChannelGraphEvidence} from '../tools/lib/native-parent-sound-channel-graph.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const row = (id, address, bytes, extra = {}) => ({id, address, bytes, length: bytes.length, sha256: sha(bytes), ...extra});

//Independent synthetic transport builder. Temporary backing arrays arrange
//consistent overlaps; only exact emitted rows enter snapshot memory. No native
//source objects are initialized or claimed by these constructed fixtures.
function fixture({base = 0x400000, vectors, wrapperSources, sourceAddresses, breakpointId = 'native-control-before'} = {}) {
  vectors ??= [
    {begin: 0x20000000, pointers: [0x30000000, 0, 0x30000010], spare: 2},
    {begin: 0x20000000, pointers: [0x30000000, 0, 0x30000010], spare: 2},
    {begin: 0x20000020, pointers: [0x30000020], spare: 0},
    {begin: 0x20000030, pointers: [], spare: 5},
    {begin: 0, pointers: [], spare: 0}
  ];
  wrapperSources ??= [[0x30000000, 0x40000000], [0x30000010, 0x40000000], [0x30000020, 0]];
  sourceAddresses ??= [...new Set(wrapperSources.map(([, p]) => p).filter(Boolean))];
  const allocations = [{address: 0x20000000, bytes: Buffer.alloc(0x10000, 0xff)}, {address: 0x30000000, bytes: Buffer.alloc(0x10000)},
    {address: 0x40000000, bytes: Buffer.alloc(0x100000)}, {address: base + 0x1d3f60, bytes: Buffer.alloc(136, 0x77)}];
  const slice = (address, length) => {const a = allocations.find(r => address >= r.address && address + length <= r.address + r.bytes.length); assert.ok(a); return a.bytes.subarray(address - a.address, address - a.address + length);};
  for (const v of vectors) v.pointers.forEach((p, i) => slice(v.begin + i * 4, 4).writeUInt32LE(p));
  for (const [address, source] of wrapperSources) slice(address, 4).writeUInt32LE(source);
  for (const address of sourceAddresses) slice(address, 4).writeUInt32LE(base + 0x1d3f60);
  const ranges = [row('ordinary-bank-header', base + 0x2f2414, Buffer.alloc(12))], outerOwners = [];
  vectors.forEach((v, index) => {
    const address = 0x50000000 + index * 0x500, bytes = Buffer.alloc(0x490), rangeId = `parent-sound-bank-owner-${index}`;
    bytes.writeUInt32LE(v.begin, 4); bytes.writeUInt32LE(v.begin + v.pointers.length * 4, 8); bytes.writeUInt32LE(v.begin + (v.pointers.length + v.spare) * 4, 12);
    const r = row(rangeId, address, bytes); ranges.push(r); outerOwners.push({index, address, rangeId, bytes: 0x490, sha256: r.sha256});
  });
  const inventories = {storage: [], wrapper: [], source: [], vtable: []}, maps = {storage: new Map(), wrapper: new Map(), source: new Map(), vtable: new Map()};
  function add(kind, address, length, reference) {
    const key = kind === 'storage' ? `${address}:${length}` : address, map = maps[kind], list = inventories[kind];
    if (map.has(key)) {const entry = map.get(key); entry.referenceIndices.push(reference); return {entry, fresh: false};}
    const index = list.length, rangeId = `parent-sound-channel-${kind}-${index}`, bytes = Buffer.from(slice(address, length));
    const entry = {index, address, rangeId, bytes: length, sha256: sha(bytes), referenceIndices: [reference]};
    list.push(entry); map.set(key, entry);
    ranges.push(row(rangeId, address, bytes, {source: 'parent-sound-bank-channel-graph', graphRole: kind, graphIndex: index, referenceIndices: entry.referenceIndices}));
    return {entry, fresh: true};
  }
  const owners = [], slots = [];
  vectors.forEach((v, ownerIndex) => {
    const usedSlots = v.pointers.length, storage = usedSlots ? add('storage', v.begin, usedSlots * 4, ownerIndex).entry : null;
    owners.push({ownerIndex, ownerAddress: outerOwners[ownerIndex].address, begin: v.begin, end: v.begin + usedSlots * 4,
      capacity: v.begin + (usedSlots + v.spare) * 4, usedSlots, storageIndex: storage?.index ?? null, storageRangeId: storage?.rangeId ?? null});
    v.pointers.forEach((wrapperAddress, index) => {
      let wrapper = null;
      if (wrapperAddress) {
        const item = add('wrapper', wrapperAddress, 12, slots.length); wrapper = item.entry;
        if (item.fresh) {
          const sourceAddress = slice(wrapperAddress, 4).readUInt32LE(); let source = null;
          if (sourceAddress) {
            const item = add('source', sourceAddress, 2472, wrapper.index); source = item.entry;
            if (item.fresh) {
              const vtable = add('vtable', base + 0x1d3f60, 136, source.index).entry;
              Object.assign(source, {vtableAddress: base + 0x1d3f60, vtableIndex: vtable.index, vtableRangeId: vtable.rangeId,
                probeBytesHex: slice(sourceAddress, 4).toString('hex'), beforeSourceRangeRead: true});
            }
          }
          Object.assign(wrapper, {sourceAddress, sourceIndex: source?.index ?? null, sourceRangeId: source?.rangeId ?? null});
        }
      }
      slots.push({ownerIndex, index, slotAddress: v.begin + index * 4, wrapperAddress, wrapperIndex: wrapper?.index ?? null,
        wrapperRangeId: wrapper?.rangeId ?? null, sourceAddress: wrapper?.sourceAddress ?? null, sourceIndex: wrapper?.sourceIndex ?? null, sourceRangeId: wrapper?.sourceRangeId ?? null});
    });
  });
  const proof = {maxUsedChannelSlots: 256, usedChannelSlots: slots.length, storageRows: inventories.storage.length,
    wrapperRows: inventories.wrapper.length, sourceRows: inventories.source.length, vtableRows: inventories.vtable.length,
    additionalBytes: ranges.filter(r => r.source === 'parent-sound-bank-channel-graph').reduce((n, r) => n + r.length, 0),
    owners, slots, storages: inventories.storage, wrappers: inventories.wrapper, sources: inventories.source, vtables: inventories.vtable};
  const snapshot = {ordinal: 4, breakpointId, ranges};
  return {snapshot, proof, options: {moduleBaseAddress: base, ownerProof: {owners: outerOwners}}, base};
}
const verify = f => verifyNativeParentSoundChannelGraph(f.snapshot, f.proof, f.options);
const find = (f, role, index = 0) => f.snapshot.ranges.find(r => r.graphRole === role && r.graphIndex === index);

test('policy and retained constructor/type evidence establish only exact9a8 source class and136-byte vtable', async () => {
  assert.deepEqual(nativeParentSoundChannelGraphPolicy(), {maxUsedChannelSlots: 256, wrapperBytes: 12, sourceBytes: 2472, sourceVtableRva: '0x1d3f60', vtableBytes: 136});
  const proof = await verifyNativeParentSoundChannelGraphEvidence();
  assert.equal(proof.targetSha256, 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');
  assert.equal(proof.evidenceIds.length, 3); assert.equal(proof.sourceBytes, 2472); assert.equal(proof.vtableBytes, 136);
});

test('actual links derive deterministic storage/pointer dedupe and NULLs at preferred, upward and downward ASLR bases', () => {
  for (const base of [0x400000, 0x5f0000, 0x320000]) {
    const f = fixture({base}), result = verify(f);
    assert.equal(result.usedChannelSlots, 7); assert.equal(result.storageRows, 2); assert.equal(result.wrapperRows, 3);
    assert.equal(result.sourceRows, 1); assert.equal(result.vtableRows, 1); assert.equal(result.additionalBytes, 2660);
    assert.deepEqual(result.storages[0].referenceIndices, [0, 1]); assert.deepEqual(result.wrappers[0].referenceIndices, [0, 3]);
    assert.deepEqual(result.sources[0].referenceIndices, [0, 1]); assert.deepEqual(result.vtables[0].referenceIndices, [0]);
    assert.equal(result.slots[1].wrapperIndex, null); assert.equal(result.slots[1].sourceAddress, null);
    assert.equal(result.slots[6].sourceAddress, 0); assert.equal(result.slots[6].sourceIndex, null);
    assert.equal(result.owners[3].storageIndex, null); assert.equal(result.semanticDescendantsAdmitted, 0); assert.equal(result.originalInput, true);
  }
});

test('empty/unused vectors do not capture storage or follow capacity-only pointers', () => {
  for (const vectors of [[], [{begin: 0, pointers: [], spare: 0}], [{begin: 0x20000000, pointers: [], spare: 100}], [{begin: 0x20000000, pointers: [0], spare: 100}]]) {
    const f = fixture({vectors}), result = verify(f);
    assert.equal(result.wrapperRows, 0); assert.equal(result.sourceRows, 0); assert.equal(result.vtableRows, 0);
    assert.equal(result.storageRows, vectors.some(v => v.pointers.length) ? 1 : 0);
  }
});

test('used aggregate256 is allowed but257 is refused even when vector storage aliases', () => {
  for (const count of [256, 257]) {
    const f = fixture({vectors: [{begin: 0x20000000, pointers: Array(count).fill(0), spare: 10}]});
    if (count === 256) assert.equal(verify(f).additionalBytes, 1024); else assert.throws(() => verify(f), /Aggregate used/);
  }
  const f = fixture({vectors: [{begin: 0x20000000, pointers: Array(129).fill(0), spare: 0}, {begin: 0x20000000, pointers: Array(129).fill(0), spare: 0}]});
  assert.throws(() => verify(f), /Aggregate used/);
});

test('storage dedup includes exact length, while distinct partial storage/source/wrapper overlaps remain observable', () => {
  const f = fixture({vectors: [{begin: 0x20000000, pointers: [0x30000000, 0x30000004], spare: 1}, {begin: 0x20000000, pointers: [0x30000000], spare: 2}],
    wrapperSources: [[0x30000000, 0x40000000], [0x30000004, 0x40000010]], sourceAddresses: [0x40000000, 0x40000010]});
  const result = verify(f); assert.equal(result.storageRows, 2); assert.equal(result.sourceRows, 2); assert.equal(result.vtableRows, 1);
  const conflicting = find(f, 'source', 1); conflicting.bytes[4] ^= 1; conflicting.sha256 = sha(conflicting.bytes); f.proof.sources[1].sha256 = conflicting.sha256;
  assert.throws(() => verify(f), /Overlapping captured bytes disagree/);
});

test('raw class guard and probe equality reject unknown sources even with self-consistent updated hashes/claims', () => {
  for (const type of ['unknown-class', 'probe', 'ordering']) {
    const f = fixture(), source = find(f, 'source');
    if (type === 'unknown-class') {source.bytes.writeUInt32LE(f.base + 0x1d3f64); source.sha256 = sha(source.bytes); f.proof.sources[0].sha256 = source.sha256; f.proof.sources[0].vtableAddress += 4; f.proof.sources[0].probeBytesHex = source.bytes.subarray(0, 4).toString('hex');}
    else if (type === 'probe') f.proof.sources[0].probeBytesHex = '00000000';
    else f.proof.sources[0].beforeSourceRangeRead = false;
    assert.throws(() => verify(f));
  }
});

test('rows, metadata, aliases, counts and owner/header pointers cannot substitute or broaden exact descendants', () => {
  const changes = [
    f => {find(f, 'storage').sha256 = '0'.repeat(64);},
    f => {find(f, 'wrapper').address++;},
    f => {find(f, 'source').length--;},
    f => {find(f, 'vtable').bytes = Buffer.alloc(4);},
    f => {find(f, 'source').graphRole = 'waveform';},
    f => {find(f, 'wrapper').referenceIndices = [0];},
    f => {find(f, 'storage').rangeMode = 'guarded-pointer';},
    f => {f.proof.slots[1].wrapperAddress = 0x30000000;},
    f => {f.proof.owners[0].capacity += 4;},
    f => {f.proof.sources[0].referenceIndices = [0];},
    f => {f.proof.storageRows++;},
    f => {f.proof.additionalBytes++;},
    f => {f.proof.sources[0].unknownInput = 1;},
    f => {f.snapshot.ranges.push({...find(f, 'wrapper')});},
    f => {f.snapshot.ranges.push(row('parent-sound-channel-waveform-0', 0x60000000, Buffer.alloc(0x440), {source: 'parent-sound-bank-channel-graph', graphRole: 'waveform'}));},
    f => {const r = f.snapshot.ranges.find(r => r.id === 'parent-sound-bank-owner-0'); r.bytes.writeUInt32LE(0, 4); r.sha256 = sha(r.bytes);},
    f => {f.options.ownerProof.owners[0].address++;}
  ];
  for (const [index, change] of changes.entries()) {const f = fixture(); change(f); assert.throws(() => verify(f), `Mutation ${index}`);}
});

test('nonempty wrapper with NULL source grants no9a8 object and later transport never becomes original input', () => {
  const f = fixture({vectors: [{begin: 0x20000000, pointers: [0x30000020], spare: 1}], breakpointId: 'native-control-after'}), result = verify(f);
  assert.equal(result.wrapperRows, 1); assert.equal(result.sourceRows, 0); assert.equal(result.vtableRows, 0);
  assert.equal(result.originalInput, false); assert.equal(result.semanticDescendantsAdmitted, 0);
  const captured = createCapturedMemory(f.snapshot.ranges); assert.throws(() => captured.span(0, 2472), /Uncaptured/);
});

test('channel graph captures source extent only and does not grant waveform/effect/position pointees', () => {
  const f = fixture(), source = find(f, 'source');
  source.bytes.writeUInt32LE(0x60000000, 0x964); source.sha256 = sha(source.bytes); f.proof.sources[0].sha256 = source.sha256;
  const result = verify(f), observed = createCapturedMemory(f.snapshot.ranges);
  assert.equal(result.semanticDescendantsAdmitted, 0); assert.throws(() => observed.span(0x60000000, 0x440), /Uncaptured/);
});
