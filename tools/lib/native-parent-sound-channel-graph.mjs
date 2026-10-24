import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createCapturedMemory} from './captured-memory.mjs';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {REDUX_SHA256} from './retained-native-program.mjs';

export const nativeParentSoundChannelGraphCapability = 'scoped-parent-sound-bank-channel-graph-v1';
export function nativeParentSoundChannelGraphPolicy() {
  return {maxUsedChannelSlots: 256, wrapperBytes: 12, sourceBytes: 2472, sourceVtableRva: '0x1d3f60', vtableBytes: 136};
}

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const uint = (value, label) => {
  const number = Number(value);
  assert.ok((typeof value === 'number' || typeof value === 'string' && /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value))
    && Number.isSafeInteger(number) && number >= 0 && number <= 0xffffffff, `Channel graph uint32 ${label}`);
  return number;
};
const isChannelRow = row => row.source === 'parent-sound-bank-channel-graph' || row.id?.startsWith('parent-sound-channel-');

//The outer owner verifier authenticates the stopped parent event and its490h
//owners. Reconstruct every nested link from that snapshot's actual bytes; no
//later observation, default object, channel selection or API result is used.
export function verifyNativeParentSoundChannelGraph(snapshot, proof, {moduleBaseAddress, ownerProof} = {}) {
  const policy = nativeParentSoundChannelGraphPolicy(), base = uint(moduleBaseAddress, 'module base');
  assert.ok(base > 0 && base + 0x1d3f60 + 136 <= 0x100000000, 'Channel graph bounded module class');
  assert.ok(proof && ownerProof && Array.isArray(ownerProof.owners), 'Verified outer owner inventory required');
  const rows = snapshot.ranges instanceof Map ? [...snapshot.ranges.values()] : snapshot.ranges;
  assert.ok(Array.isArray(rows)); assert.equal(new Set(rows.map(r => r.id)).size, rows.length, 'Unique channel snapshot rows');
  const expectedRows = [], owners = [], slots = [], storages = [], wrappers = [], sources = [], vtables = [];
  const maps = {storage: new Map(), wrapper: new Map(), source: new Map(), vtable: new Map()};
  const inventories = {storage: storages, wrapper: wrappers, source: sources, vtable: vtables};
  let usedChannelSlots = 0;
  function exactRow(id, address, length) {
    assert.ok(address > 0 && address + length <= 0x100000000, `Channel graph bounded ${id}`);
    const matches = rows.filter(r => r.id === id); assert.equal(matches.length, 1, `Channel graph exact ${id}`);
    const row = matches[0]; assert.equal(uint(row.address, id), address); assert.equal(row.length, length);
    assert.ok(Buffer.isBuffer(row.bytes) && row.bytes.length === length, `Channel graph complete ${id}`);
    assert.equal(row.sha256, hash(row.bytes), `Channel graph ${id} hash`);
    return row;
  }
  function inventory(role, address, length, referenceIndex) {
    const map = maps[role], list = inventories[role], key = role === 'storage' ? `${address}:${length}` : address;
    let item = map.get(key);
    if (item) {item.referenceIndices.push(referenceIndex); return {item, fresh: false};}
    const index = list.length, rangeId = `parent-sound-channel-${role}-${index}`, row = exactRow(rangeId, address, length);
    item = {index, address, rangeId, bytes: length, sha256: row.sha256, referenceIndices: [referenceIndex]};
    map.set(key, item); list.push(item); expectedRows.push({row, role, item});
    assert.ok(!row.rangeMode && !row.dereferenceOffsets && !row.dereferenceMinimumValues && !row.vectorStorage && !row.readableRegion,
      'Channel graph grants plain exact extents, never new pointer/range modes');
    return {item, fresh: true};
  }
  for (const [ownerIndex, outer] of ownerProof.owners.entries()) {
    assert.equal(outer.index, ownerIndex, 'Outer owners retain first-occurrence order');
    const ownerAddress = uint(outer.address, 'owner address');
    const owner = exactRow(outer.rangeId, ownerAddress, 0x490).bytes;
    const begin = owner.readUInt32LE(4), end = owner.readUInt32LE(8), capacity = owner.readUInt32LE(12);
    assert.ok(begin <= end && end <= capacity && (end - begin) % 4 === 0 && (capacity - begin) % 4 === 0,
      'Channel graph actual native vector bounds');
    assert.ok(begin !== 0 || end === 0 && capacity === 0, 'NULL channel vector grants no storage');
    const usedSlots = (end - begin) / 4; usedChannelSlots += usedSlots;
    assert.ok(usedChannelSlots <= policy.maxUsedChannelSlots, 'Aggregate used channel slots exceed observation bound');
    let storageIndex = null, storageRangeId = null, storage;
    if (usedSlots) {
      storage = inventory('storage', begin, usedSlots * 4, ownerIndex).item;
      storageIndex = storage.index; storageRangeId = storage.rangeId;
    }
    owners.push({ownerIndex, ownerAddress, begin, end, capacity, usedSlots, storageIndex, storageRangeId});
    const pointerBytes = storage ? rows.find(r => r.id === storage.rangeId).bytes : null;
    for (let index = 0; index < usedSlots; index++) {
      const wrapperAddress = pointerBytes.readUInt32LE(index * 4), slotOrdinal = slots.length;
      let wrapperIndex = null, wrapperRangeId = null, sourceAddress = null, sourceIndex = null, sourceRangeId = null;
      if (wrapperAddress) {
        const got = inventory('wrapper', wrapperAddress, policy.wrapperBytes, slotOrdinal), wrapper = got.item;
        if (got.fresh) {
          sourceAddress = rows.find(r => r.id === wrapper.rangeId).bytes.readUInt32LE();
          if (sourceAddress) {
            if (!maps.source.has(sourceAddress)) {
              //Authenticate the captured four-byte class probe before accepting
              //the larger constructor-specific extent. The actual stopped-host
              //read order is additionally bound by beforeSourceRangeRead below.
              const probes = rows.filter(r => r.id === `parent-sound-channel-source-${sources.length}`);
              assert.equal(probes.length, 1, 'Channel source requires its exact class probe row');
              const probe = probes[0]; assert.equal(uint(probe.address, 'source probe'), sourceAddress);
              assert.ok(Buffer.isBuffer(probe.bytes) && probe.bytes.length >= 4, 'Channel source class probe is complete');
              assert.equal(probe.bytes.readUInt32LE(), base + 0x1d3f60, 'Only constructor-proven9a8 source class may supply source storage');
            }
            const sourceGot = inventory('source', sourceAddress, policy.sourceBytes, wrapper.index), source = sourceGot.item;
            if (sourceGot.fresh) {
              const bytes = rows.find(r => r.id === source.rangeId).bytes, vtableAddress = bytes.readUInt32LE();
              assert.equal(vtableAddress, base + 0x1d3f60, 'Only constructor-proven9a8 source class may supply source storage');
              const vtable = inventory('vtable', vtableAddress, policy.vtableBytes, source.index).item;
              Object.assign(source, {vtableAddress, vtableIndex: vtable.index, vtableRangeId: vtable.rangeId,
                probeBytesHex: bytes.subarray(0, 4).toString('hex'), beforeSourceRangeRead: true});
            }
            sourceIndex = source.index; sourceRangeId = source.rangeId;
          }
          Object.assign(wrapper, {sourceAddress, sourceIndex, sourceRangeId});
        }
        wrapperIndex = wrapper.index; wrapperRangeId = wrapper.rangeId;
        ({sourceAddress, sourceIndex, sourceRangeId} = wrapper);
      }
      slots.push({ownerIndex, index, slotAddress: begin + index * 4, wrapperAddress, wrapperIndex, wrapperRangeId, sourceAddress, sourceIndex, sourceRangeId});
    }
  }
  assert.equal(rows.filter(isChannelRow).length, expectedRows.length, 'Only derived used channel rows, no capacity-only or deeper descendants');
  for (const {row, role, item} of expectedRows) {
    assert.deepEqual([row.source, row.graphRole, row.graphIndex, row.referenceIndices],
      ['parent-sound-bank-channel-graph', role, item.index, item.referenceIndices], 'Exact channel row role/index/references');
  }
  //Duplicate extents, distinct partial overlaps and ordinary/graph observations
  //must describe the same real bytes. This admits no otherwise unreadable tail.
  createCapturedMemory(rows);
  const normalize = (entries, expected, addresses) => {
    assert.ok(Array.isArray(entries)); assert.equal(entries.length, expected.length);
    return entries.map((entry, index) => {
      assert.deepEqual(Object.keys(entry).sort(), Object.keys(expected[index]).sort(), 'Exact channel inventory fields');
      return Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, addresses.includes(key) && value !== null ? uint(value, key) : value]));
    });
  };
  const expected = {maxUsedChannelSlots: 256, usedChannelSlots, storageRows: storages.length, wrapperRows: wrappers.length,
    sourceRows: sources.length, vtableRows: vtables.length, additionalBytes: expectedRows.reduce((n, r) => n + r.row.bytes.length, 0),
    owners, slots, storages, wrappers, sources, vtables};
  assert.deepEqual(Object.keys(proof).sort(), Object.keys(expected).sort(), 'Exact channel graph proof fields');
  for (const [key, addresses] of [['owners', ['ownerAddress', 'begin', 'end', 'capacity']], ['slots', ['slotAddress', 'wrapperAddress', 'sourceAddress']],
    ['storages', ['address']], ['wrappers', ['address', 'sourceAddress']], ['sources', ['address', 'vtableAddress']], ['vtables', ['address']]]) {
    assert.deepEqual(normalize(proof[key], expected[key], addresses), expected[key], `Channel graph independently derived ${key}`);
  }
  for (const key of ['maxUsedChannelSlots', 'usedChannelSlots', 'storageRows', 'wrapperRows', 'sourceRows', 'vtableRows', 'additionalBytes']) {
    assert.equal(proof[key], expected[key], `Channel graph exact ${key}`);
  }
  return {verified: true, snapshotOrdinal: snapshot.ordinal, ...expected, semanticDescendantsAdmitted: 0,
    originalInput: snapshot.breakpointId === 'native-control-before'};
}

export async function verifyNativeParentSoundChannelGraphEvidence() {
  const proof = await readInstructionEvidence(['11601-audio-sample-factory-4a7460.json', '11619-audio-sample-graph-4ad7e0.json'], {directory: 'analysis/native-simulation/results'});
  const reply = JSON.parse(await readFile('analysis/native-simulation/results/11714-audio-factory-constants.json', 'utf8'));
  const constants = reply.structuredContent ?? JSON.parse(reply.content.find(c => c.type === 'text').text);
  assert.ok([...proof.evidence, constants].every(e => e.subject?.digest?.sha256 === REDUX_SHA256), 'Channel class target identity');
  const listing = new Map(proof.instructions.map(i => [i.address, i]));
  for (const [address, op, args] of [[0x4a7483, 'PUSH', ['0x9a8']], [0x4a7493, 'CALL', ['dword ptr [0x0056e220]']],
    [0x4ad84a, 'MOV', ['dword ptr [ESI]', '0x5d3f60']], [0x4ad8a4, 'MOV', ['dword ptr [ESI + 0x9a4]', '0x0']]]) {
    const row = listing.get(address); assert.ok(row?.op === op && JSON.stringify(row.args) === JSON.stringify(args), `Channel class instruction0x${address.toString(16)}`);
  }
  const raw = constants.raw_result;
  assert.equal(constants.operation, 'read_bytes'); assert.equal(Number(raw.address), 0x5d3f60);
  assert.equal(raw.returned_bytes, 136); assert.equal(raw.requested_bytes, 136); assert.equal(raw.complete, true);
  assert.ok(typeof raw.bytes_hex === 'string' && /^[0-9a-f]{272}$/i.test(raw.bytes_hex), 'Complete original34-entry source vtable');
  const table = Buffer.from(raw.bytes_hex, 'hex'); assert.equal(table.readUInt32LE(0x38), 0x4ad580);
  assert.equal(hash(table), '0940f556e713d2b0673d876a540f425bf97d606b90b00ea9300b475bbfcf336a', 'Retained11714 complete immutable vtable bytes');
  return {targetSha256: REDUX_SHA256, evidenceIds: [...proof.evidence, constants].map(e => e.evidence_id),
    sourceBytes: 2472, sourceVtablePreferredAddress: 0x5d3f60, vtableBytes: 136, vtableSha256: hash(table),
    scope: 'Constructor9a8 allocation, canonical source vtable and exact136-byte type table; observations supply pointers/bytes, never constructed objects or child outcomes.'};
}
