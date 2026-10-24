import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createNativeParentRttiCaptureConfig} from '../tools/prepare-native-parent-rtti-capture.mjs';
import {verifyNativeParentRttiCaptureConfiguration} from '../tools/lib/native-parent-rtti-capture.mjs';
import {createNativeFrameSoundBindings} from '../tools/lib/native-frame-sound.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';
import {nativeParentSoundOwnerGraphPolicy, verifyNativeParentSoundOwnerGraph,
  verifyNativeParentSoundOwnerGraphRecords, verifyNativeParentSoundOwnerGraphEvidence} from '../tools/lib/native-parent-sound-owner-graph.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const makeRow = (id, address, bytes, extra = {}) => ({id, address, bytes, length: bytes.length, sha256: sha(bytes), ...extra});

//Synthetic read-only transport. Exact overlap patterns are derived from actual
//addresses solely to make intersection equality independently testable. No
//original-process observation or native playback behavior is asserted here.
function graphFixture({base = 0x400000, pointers = [0x30000000, 0, 0x30000000], extraCapacity = 2, ordinal = 4,
  breakpointId = 'native-control-before', debug = 20} = {}) {
  const policy = nativeParentSoundOwnerGraphPolicy(), headerAddress = base + 0x2f2414;
  const begin = pointers.length || extraCapacity ? 0x20000000 : 0, end = begin + pointers.length * 4, capacity = end + extraCapacity * 4;
  const header = Buffer.alloc(12); header.writeUInt32LE(begin); header.writeUInt32LE(end, 4); header.writeUInt32LE(capacity, 8);
  const storage = Buffer.alloc(capacity - begin, 0xff); pointers.forEach((p, i) => storage.writeUInt32LE(p, i * 4));
  const ranges = [makeRow('sound-owner-vector-roots', headerAddress, header, {moduleBaseAddress: base, rootRva: '0x2f2414'}),
    makeRow('control-sound-bank-storage', begin, storage, {moduleBaseAddress: base, rootRva: '0x2f2414', rangeMode: 'vector-storage', vectorHeaderAddress: headerAddress,
      vectorHeaderHex: header.toString('hex'), vectorBegin: begin, vectorEnd: end, vectorCapacity: capacity, maxVectorBytes: 65536})];
  const owners = [], slots = [], indices = new Map();
  pointers.forEach((address, index) => {
    if (!address) {slots.push({index, slotAddress: begin + index * 4, ownerAddress: 0, ownerIndex: null, rangeId: null}); return;}
    let ownerIndex = indices.get(address);
    if (ownerIndex === undefined) {
      ownerIndex = owners.length; indices.set(address, ownerIndex);
      const bytes = Buffer.alloc(0x490); for (let i = 0; i < bytes.length; i++) bytes[i] = (address + i) & 255;
      const rangeId = `parent-sound-bank-owner-${ownerIndex}`;
      owners.push({index: ownerIndex, address, slotIndices: [], rangeId, bytes: 0x490, sha256: sha(bytes)});
      ranges.push(makeRow(rangeId, address, bytes, {source: 'parent-sound-bank-owner-graph', graphRole: 'owner', ownerIndex, bankSlotIndices: owners[ownerIndex].slotIndices}));
    }
    owners[ownerIndex].slotIndices.push(index);
    slots.push({index, slotAddress: begin + index * 4, ownerAddress: address, ownerIndex, rangeId: owners[ownerIndex].rangeId});
  });
  const context = Buffer.alloc(716), snapshot = {type: 'snapshot', ordinal, breakpointId, observedDebugEventOrdinal: debug, tid: 101, context, ranges};
  const proof = {type: 'parent-sound-bank-owners-observed', pid: 100, tid: 101, ownerMainTid: 101, breakpointId,
    observedDebugEventOrdinal: debug, parentEntryDebugEventOrdinal: 20, parentEntryEsp: 0x100000, parentClock: 288,
    parentIteration: 0, parentCaller: base + 0x60123, parentTotalIterations: 1, activationDebugEventOrdinal: ordinal === 4 ? 0 : 50,
    mainModuleBaseAddress: base, snapshotOrdinal: ordinal, headerAddress, headerBytesHex: header.toString('hex'), headerRangeId: 'sound-owner-vector-roots', headerSha256: sha(header),
    begin, end, capacity, usedSlots: pointers.length, capacitySlots: storage.length / 4,
    storageRangeId: 'control-sound-bank-storage', storageAddress: begin, storageBytes: storage.length, storageSha256: sha(storage),
    maxUsedSlots: 256, ownerBytes: 0x490, uniqueOwners: owners.length, nullSlots: pointers.filter(p => !p).length, slots, owners,
    additionalOwnerBytes: owners.length * 0x490, sameStoppedDebugEvent: true, afterParentAdmission: true, beforeOriginalInstruction: true, completeUsedOwnerObservation: true};
  snapshot.parentSoundBankOwnerGraph = proof;
  return {snapshot, proof, policy, base};
}

test('constructed owner graphs derive used pointers, NULLs and aliases without reading capacity-only poison', () => {
  for (const base of [0x400000, 0x5f0000]) {
    const f = graphFixture({base});
    const result = verifyNativeParentSoundOwnerGraph(f.snapshot, f.proof, {moduleBaseAddress: base, policy: f.policy});
    assert.equal(result.semanticOwnersAdmitted, 0); assert.equal(result.originalInput, true);
    assert.equal(f.proof.uniqueOwners, 1); assert.deepEqual(f.proof.owners[0].slotIndices, [0, 2]);
    assert.equal(f.snapshot.ranges.filter(r => r.source === 'parent-sound-bank-owner-graph').length, 1);
  }
});

function recordFixture(base = 0x400000, channelGraph = false) {
  const policy = nativeParentSoundOwnerGraphPolicy({channelGraph}), U = 0x100000, clock = 288, activationEvent = 90, owner = {pid: 100, tid: 101};
  const ordinals = [4, 5, 6, 7, 8, 9, 10, 11, 14, 21], records = [], parent = [];
  for (const [index, breakpointId] of policy.breakpointIds.entries()) {
    const f = graphFixture({base, breakpointId, ordinal: ordinals[index], debug: 20 + index * 10});
    if(channelGraph){
      const allocation=f.snapshot.ranges.find(r=>r.id==='parent-sound-bank-owner-0');
      allocation.bytes.fill(0,4,16);allocation.sha256=sha(allocation.bytes);f.proof.owners[0].sha256=allocation.sha256;
      f.proof.channelGraph={maxUsedChannelSlots:256,usedChannelSlots:0,storageRows:0,wrapperRows:0,sourceRows:0,vtableRows:0,additionalBytes:0,
        owners:[{ownerIndex:0,ownerAddress:0x30000000,begin:0,end:0,capacity:0,usedSlots:0,storageIndex:null,storageRangeId:null}],
        slots:[],storages:[],wrappers:[],sources:[],vtables:[]};
    }
    f.snapshot.context.writeUInt32LE(2, 168);
    f.proof.parentIteration = 2; f.proof.parentTotalIterations = 4;
    //At auxiliary, graph proof is emitted before deferred CRT activation.
    f.proof.activationDebugEventOrdinal = index <= 7 ? 0 : activationEvent;
    if (index === 0) {
      const args = Buffer.alloc(8); args.writeUInt32LE(base + 0x60123); args.writeUInt32LE(4, 4);
      f.snapshot.ranges.push(makeRow('frame-stack', U, args));
    }
    parent.push(f.snapshot);
    records.push({type: 'debug-event', event: 1, ordinal: f.snapshot.observedDebugEventOrdinal, pid: owner.pid, tid: owner.tid}, f.proof, f.snapshot);
  }
  const complete = {soundBankOwnerGraph: {checkpoints: 10, ownerRows: 10, ownerBytes: 10 * 0x490}};
  const capture = {header: {helperCapabilities: ['scoped-parent-sound-bank-owner-graph-v1']}, snapshots: parent, complete};
  if(channelGraph){capture.header.helperCapabilities.push('scoped-parent-sound-bank-channel-graph-v1');complete.soundBankOwnerGraph.channelGraph={checkpoints:10,usedChannelSlots:0,storageRows:0,wrapperRows:0,sourceRows:0,vtableRows:0,additionalBytes:0};}
  return {capture, configuration: {parentRttiObservation: {soundBankOwnerGraph: policy}}, records, before: parent[0], parent, owner, base, U, clock, activationEvent};
}

test('nested channel observations require the same ten owned events, capability and exact completion totals',()=>{
  const f=recordFixture(0x320000,true),result=verifyNativeParentSoundOwnerGraphRecords(f);
  assert.equal(result.channelGraph.checkpoints,10);assert.equal(result.channelGraph.additionalBytes,0);
  assert.ok(result.observations.every(r=>r.channelGraph.semanticDescendantsAdmitted===0));
  assert.equal(result.observations.filter(r=>r.channelGraph.originalInput).length,1);
  f.capture.complete.soundBankOwnerGraph.channelGraph.usedChannelSlots++;
  assert.throws(()=>verifyNativeParentSoundOwnerGraphRecords(f),/lifecycle/);
  const missing=recordFixture(0x400000,true);missing.capture.header.helperCapabilities.pop();
  assert.throws(()=>verifyNativeParentSoundOwnerGraphRecords(missing),/channel graph native capability/);
  const unconfigured=recordFixture(0x400000,true);delete unconfigured.configuration.parentRttiObservation.soundBankOwnerGraph.channelGraph;
  assert.throws(()=>verifyNativeParentSoundOwnerGraphRecords(unconfigured),/unconfigured channel proof/);
});

test('ten owned stopped checkpoint records preserve preactivation auxiliary order and authenticate comparison-only later transport', () => {
  for (const base of [0x400000, 0x5f0000]) {
    const f = recordFixture(base), result = verifyNativeParentSoundOwnerGraphRecords(f);
    assert.equal(result.verified, true); assert.equal(result.checkpoints, 10);
    assert.equal(result.ownerRows, 10); assert.equal(result.ownerBytes, 10 * 0x490);
    assert.ok(result.observations.every(r => r.semanticOwnersAdmitted === 0));
    assert.deepEqual(result.observations.map(r => r.originalInput), [true, false, false, false, false, false, false, false, false, false]);
    assert.equal(f.parent[7].parentSoundBankOwnerGraph.activationDebugEventOrdinal, 0);
    assert.equal(f.parent[8].parentSoundBankOwnerGraph.activationDebugEventOrdinal, f.activationEvent);
  }
});

test('graph transport never supplies channel storage or source descendants pointed to by owner bytes', () => {
  const f = graphFixture(), owner = f.snapshot.ranges.find(r => r.graphRole === 'owner');
  owner.bytes.writeUInt32LE(0x60000000, 4); owner.bytes.writeUInt32LE(0x60000004, 8); owner.bytes.writeUInt32LE(0x60000010, 12);
  owner.sha256 = sha(owner.bytes); f.proof.owners[0].sha256 = owner.sha256;
  const result = verifyNativeParentSoundOwnerGraph(f.snapshot, f.proof, {moduleBaseAddress: f.base, policy: f.policy});
  assert.equal(result.semanticOwnersAdmitted, 0);
  const observed = createCapturedMemory(f.snapshot.ranges);
  assert.throws(() => observed.span(0x60000000, 4), /Uncaptured/);
  assert.equal(result.owners.length, 1);
});

test('synthetic populated-child boundary preserves genuine dispatcher lazy admission of only the selected owner', () => {
  const base = 0x5f0000, selected = 0x30000000, idle = 0x30001000;
  const f = graphFixture({base, pointers: [selected, idle, selected]}), stack = 0x10000, S = stack + 0x100;
  const captured = createCapturedMemory([...f.snapshot.ranges, makeRow('cookie', base + 0x1e8890, Buffer.alloc(4)), makeRow('stack', stack, Buffer.alloc(0x200))], {
    aliases: [{address: 0x6f2414, targetAddress: base + 0x2f2414, length: 12}, {address: 0x5e8890, targetAddress: base + 0x1e8890, length: 4}]
  });
  const {memory: m} = captured, childCalls = [];
  //Policy test only: real40ea40 wrapper/bank/stack execute, populated game
  //child is an explicit synthetic boundary. This proves no playback parity.
  const binding = createNativeFrameSoundBindings({memory: m, moduleBaseAddress: base,
    numericalContext: decodePhysicsNumericalContext({x87ControlWord: 0x7f, mxcsr: 0x1f80}),
    dispatchPopulated40ea40(request, runtime) {childCalls.push({code: request.code, owner: runtime.soundAddress}); return -1;}
  });
  const ownerRegions = () => binding.comparisonRegions.filter(r => r.length === 0x490);
  assert.deepEqual(ownerRegions(), [], 'Capturing every owner does not automatically compare them.');
  m.writeUInt32LE(0xdeadbeef, idle + 0x464);
  assert.deepEqual(ownerRegions(), [], 'An idle owner change alone never creates a source-read admission.');
  const parameterAddress = S + 0x40;
  for (const [offset, value] of [[0, base + 0x84c5d], [4, 0], [8, 0], [12, 0], [16, parameterAddress]]) m.writeUInt32LE(value, S + offset);
  for (const code of [0, 0, 2]) {
    assert.equal(binding.dispatch40ea40({memory: m, scratchBase: S, code, registerEdx: 0, first: 0, modeIs9: 0, sixth: 0,
      parameterAddress, parameters: captured.span(parameterAddress, 16), nativeStack: {entryRegisters: {ebx: 1, ebp: 2, esi: 3, edi: 4}}}), -1);
  }
  assert.deepEqual(childCalls, [{code: 0, owner: selected}, {code: 0, owner: selected}, {code: 2, owner: selected}]);
  assert.deepEqual(ownerRegions().map(r => [r.address, r.length, r.comparison]), [[selected, 0x490, 'mutable']], 'Aliases and repeated reads admit exactly one live owner extent.');
  assert.ok(!binding.comparisonRegions.some(r => r.address >= idle && r.address < idle + 0x490));
  const channelPointer = m.readUInt32LE(selected + 4);
  assert.throws(() => captured.span(channelPointer, 4), /Uncaptured/);
});

test('record authentication rejects foreign identities, stage/event movement, substituted annotations and false totals', () => {
  const changes = [
    f => {f.capture.header.helperCapabilities = [];},
    f => {f.parent.pop();},
    f => {f.records.splice(1, 1);},
    f => {f.records[1].tid++;},
    f => {f.parent[1].tid++;},
    f => {const at = f.records.findIndex(r => r.type === 'snapshot' && r.ordinal === 5); f.records[at] = {...f.records[at], tid: 999};},
    f => {f.records[0].tid++;},
    f => {f.records[0].event = 2;},
    f => {f.records[1].parentEntryEsp += 4;},
    f => {f.parent[7].parentSoundBankOwnerGraph.activationDebugEventOrdinal = f.activationEvent;},
    f => {f.parent[8].parentSoundBankOwnerGraph.activationDebugEventOrdinal = 0;},
    f => {f.parent[1].parentSoundBankOwnerGraph = {...f.parent[1].parentSoundBankOwnerGraph, parentClock: 289};},
    f => {f.records.splice(2, 0, {type: 'debug-event', ordinal: 21});},
    f => {const marker = f.records.splice(1, 1)[0]; f.records.splice(3, 0, marker);},
    f => {f.capture.complete.soundBankOwnerGraph.ownerRows++;},
    f => {f.capture.complete.soundBankOwnerGraph.ownerBytes++;},
    f => {f.records.push({type: 'parent-sound-bank-unknown'});},
    f => {const s = graphFixture({ordinal: 22, breakpointId: 'native-parent-rtti-call'}).snapshot; f.capture.snapshots.push(s);},
    f => {f.configuration.parentRttiObservation.soundBankOwnerGraph.ownerBytes = 8;}
  ];
  for (const change of changes) {const f = recordFixture(); change(f); assert.throws(() => verifyNativeParentSoundOwnerGraphRecords(f));}
});

test('sound graph profile adds only its fixed policy and keeps sites, bounds and original ranges unchanged', async () => {
  const options = {viewportMapGraph: true, weatherScreenQueries: true, weatherCounterObservation: true, tyreSound2: true, surfaceSound7: true, stackBytesBefore: 64, skipFrames: 60};
  const baseline = await createNativeParentRttiCaptureConfig('synthetic', 'never-launched-sound-graph', options);
  const disabled = await createNativeParentRttiCaptureConfig('synthetic', 'never-launched-sound-graph', {...options, soundBankOwners: false});
  assert.deepEqual(disabled.configuration, baseline.configuration);
  const enabled = await createNativeParentRttiCaptureConfig('synthetic', 'never-launched-sound-graph', {...options, soundBankOwners: true});
  const c = enabled.configuration, restored = structuredClone(c); delete restored.parentRttiObservation.soundBankOwnerGraph;
  assert.deepEqual(restored, baseline.configuration);
  assert.deepEqual(c.parentRttiObservation.soundBankOwnerGraph, nativeParentSoundOwnerGraphPolicy());
  assert.equal(c.breakpoints.length, 17); assert.equal(c.maxSnapshots, 21); assert.equal(c.maxDurationMs, 90000);
  assert.equal(verifyNativeParentRttiCaptureConfiguration(c).soundBankOwners, true);
  const changes = [
    value => {value.parentRttiObservation.soundBankOwnerGraph.rootRva = '0x2f2418';},
    value => {value.parentRttiObservation.soundBankOwnerGraph.maxUsedSlots = 257;},
    value => {value.parentRttiObservation.soundBankOwnerGraph.ownerBytes = 0x494;},
    value => {value.parentRttiObservation.soundBankOwnerGraph.breakpointIds.pop();},
    value => {value.parentRttiObservation.soundBankOwnerGraph.breakpointIds[0] = 'launcher-policy';},
    value => {value.breakpoints.find(p => p.id === 'native-control-before').ranges = value.breakpoints.find(p => p.id === 'native-control-before').ranges.filter(r => r.id !== 'control-sound-bank-storage');},
    value => {value.breakpoints.find(p => p.id === 'native-control-after').ranges.find(r => r.id === 'sound-owner-vector-roots').length = 16;},
    value => {value.breakpoints.find(p => p.id === 'native-control-before').ranges.push({id: 'parent-sound-bank-owner-0', rva: '0x2f2414', length: 0x490});}
  ];
  for (const [index, change] of changes.entries()) {const bad = structuredClone(c); change(bad); assert.throws(() => verifyNativeParentRttiCaptureConfiguration(bad), `Profile mutation ${index}`);}
});

test('absent graph policy retains old snapshots and rejects unconfigured graph data or claims', () => {
  const f = recordFixture(); delete f.configuration.parentRttiObservation.soundBankOwnerGraph;
  assert.throws(() => verifyNativeParentSoundOwnerGraphRecords(f));
  f.records = f.records.filter(r => r.type !== 'parent-sound-bank-owners-observed');
  for (const s of f.capture.snapshots) {delete s.parentSoundBankOwnerGraph; s.ranges = s.ranges.filter(r => r.source !== 'parent-sound-bank-owner-graph');}
  delete f.capture.complete.soundBankOwnerGraph;
  assert.equal(verifyNativeParentSoundOwnerGraphRecords(f), undefined);
  f.capture.complete.soundBankOwnerGraph = {checkpoints: 0, ownerRows: 0, ownerBytes: 0};
  assert.throws(() => verifyNativeParentSoundOwnerGraphRecords(f));
});

test('empty and allocated-unused vectors grant no owner rows while distinct partial overlaps retain exact extents', () => {
  for (const settings of [{pointers: [], extraCapacity: 0}, {pointers: [], extraCapacity: 3}, {pointers: [0, 0]},
    {pointers: [0x30000000, 0x30000010]}]) {
    const f = graphFixture(settings);
    assert.doesNotThrow(() => verifyNativeParentSoundOwnerGraph(f.snapshot, f.proof, {moduleBaseAddress: f.base, policy: f.policy}));
  }
});

test('sound graph instructions establish owner extent and actual bank consumer against the exact target', async () => {
  const proof = await verifyNativeParentSoundOwnerGraphEvidence();
  assert.equal(proof.targetSha256, 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');
  assert.ok(proof.evidenceIds.length > 0);
});

test('graph observation bound accepts256 used owners and rejects257 rather than interpreting capacity as owner count', () => {
  const f = graphFixture({pointers: Array.from({length: 256}, (_, i) => 0x30000000 + i * 0x500), extraCapacity: 4});
  assert.doesNotThrow(() => verifyNativeParentSoundOwnerGraph(f.snapshot, f.proof, {moduleBaseAddress: f.base, policy: f.policy}));
  assert.equal(f.proof.additionalOwnerBytes, 256 * 0x490);
  const excessive = graphFixture({pointers: Array.from({length: 257}, (_, i) => 0x30000000 + i * 0x500)});
  assert.throws(() => verifyNativeParentSoundOwnerGraph(excessive.snapshot, excessive.proof, {moduleBaseAddress: excessive.base, policy: excessive.policy}));
});

test('graph bytes independently reject slot/alias/count/row/hash tampering and descendant grants', () => {
  const changes = [
    f => {f.snapshot.ranges[0].sha256 = '0'.repeat(64);},
    f => {f.snapshot.ranges[1].rootRva = '0x2f2418';},
    f => {f.snapshot.ranges[1].vectorEnd -= 4;},
    f => {f.snapshot.ranges[1].bytes.writeUInt32LE(0x30000010); f.snapshot.ranges[1].sha256 = sha(f.snapshot.ranges[1].bytes); f.proof.storageSha256 = f.snapshot.ranges[1].sha256;},
    f => {f.proof.usedSlots++;},
    f => {f.proof.additionalOwnerBytes++;},
    f => {f.proof.slots[1].ownerIndex = 0;},
    f => {f.proof.slots[2].ownerIndex = 1;},
    f => {f.proof.owners[0].slotIndices.pop();},
    f => {f.snapshot.ranges.find(r => r.graphRole === 'owner').bankSlotIndices = [0];},
    f => {f.snapshot.ranges.find(r => r.graphRole === 'owner').address += 4;},
    f => {f.snapshot.ranges.find(r => r.graphRole === 'owner').length--;},
    f => {f.snapshot.ranges.find(r => r.graphRole === 'owner').bytes = Buffer.alloc(4);},
    f => {f.snapshot.ranges.find(r => r.graphRole === 'owner').sha256 = '0'.repeat(64);},
    f => {f.snapshot.ranges.find(r => r.graphRole === 'owner').source = 'replaced-observation';},
    f => {const r = f.snapshot.ranges.find(r => r.graphRole === 'owner'); r.rangeMode = 'guarded-pointer'; r.guardedStopIndex = 0;},
    f => {f.snapshot.ranges.find(r => r.graphRole === 'owner').readableRegion = true;},
    f => {f.snapshot.ranges.push({...f.snapshot.ranges.find(r => r.graphRole === 'owner')});},
    f => {f.snapshot.ranges.push(makeRow('parent-sound-bank-owner-1', 0x30001000, Buffer.alloc(0x490), {source: 'parent-sound-bank-owner-graph', graphRole: 'owner', ownerIndex: 1, bankSlotIndices: []}));},
    f => {f.snapshot.ranges.push(makeRow('owner-source-descendant', 0x40000000, Buffer.alloc(0x9a8), {source: 'parent-sound-bank-owner-graph', graphRole: 'source'}));}
  ];
  for (const change of changes) {const f = graphFixture(); change(f); assert.throws(() => verifyNativeParentSoundOwnerGraph(f.snapshot, f.proof, {moduleBaseAddress: f.base, policy: f.policy}));}
});

test('distinct partial owner overlaps and existing ordinary rows must agree byte for byte', () => {
  for (const existing of [false, true]) {
    const f = graphFixture({pointers: [0x30000000, 0x30000010]}), second = f.snapshot.ranges.find(r => r.ownerIndex === 1);
    if (existing) {
      f.snapshot.ranges.push(makeRow('control-tyre-sound2-owner', second.address, Buffer.from(second.bytes)));
      assert.doesNotThrow(() => verifyNativeParentSoundOwnerGraph(f.snapshot, f.proof, {moduleBaseAddress: f.base, policy: f.policy}));
      f.snapshot.ranges.at(-1).bytes[0] ^= 1; f.snapshot.ranges.at(-1).sha256 = sha(f.snapshot.ranges.at(-1).bytes);
    } else {second.bytes[0] ^= 1; second.sha256 = sha(second.bytes); f.proof.owners[1].sha256 = second.sha256;}
    assert.throws(() => verifyNativeParentSoundOwnerGraph(f.snapshot, f.proof, {moduleBaseAddress: f.base, policy: f.policy}));
  }
});
