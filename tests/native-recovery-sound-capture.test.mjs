import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeRecoverySoundCaptureConfig, verifyNativeRecoverySoundGraphEvidence, verifyNativeRecoverySoundServiceEvidence} from '../tools/prepare-native-recovery-sound-capture.mjs';
import {createControlledNativeRecoveryCaptureConfig, controlledNativeRecoveryAction, controlledNativeRecoveryCallerRanges} from '../tools/prepare-controlled-native-recovery-capture.mjs';
import {nativeRecoverySoundGraphRanges, nativeRecoverySoundGenericBreakpoints, nativeRecoverySoundAllocationRanges, nativeRecoverySoundLineageLayout,
  verifyNativeRecoverySoundCaptureConfiguration, selectNativeRecoverySoundSnapshots} from '../tools/lib/native-recovery-sound-selection.mjs';

test('sound composition preserves controlled input/actions/pending selection and hard350 budget', async () => {
  const baseline = await createControlledNativeRecoveryCaptureConfig('synthetic', 'never-launched', {stackBytesBefore: 8192});
  const result = await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched'), config = result.configuration;
  assert.deepEqual(config.phaseActions, baseline.configuration.phaseActions);
  const {nestedBreakpointIds, maxNestedSnapshots, ...parentPolicy} = config.pendingFrameObserver;
  assert.deepEqual(parentPolicy, baseline.configuration.pendingFrameObserver);
  assert.deepEqual(nestedBreakpointIds, config.breakpoints.slice(-10).map(row => row.id));
  assert.equal(maxNestedSnapshots, 115);
  assert.equal(config.maxSnapshots, 350); assert.equal(config.captureThreadEnvironment, true);
  assert.equal(result.soundSelection.genericSnapshotBudget, 115);
  for (const key of ['maxDurationMs', 'maxEvents', 'hideOwnedWindows', 'foregroundWindowSource']) assert.deepEqual(config[key], baseline.configuration[key]);
  for (const bp of baseline.configuration.breakpoints) {
    const actual = config.breakpoints.find(row => row.id === bp.id), expected = structuredClone(bp);
    if (['native-recovery-before', 'native-recovery-after'].includes(bp.id)) expected.ranges.push(...nativeRecoverySoundGraphRanges());
    assert.deepEqual(actual, expected);
  }
  assert.deepEqual(config.breakpoints.slice(-10), nativeRecoverySoundGenericBreakpoints());
  for (const bp of config.breakpoints.slice(-10)) {
    assert.equal(bp.stopAfterHits, undefined); assert.equal(bp.skipMatchingHits, undefined);
    assert.deepEqual(bp.ranges[0], {id: 'recovery-audio-stack', baseRegister: 'esp', offset: -32, length: 64});
    assert.equal(bp.captureWhen.equalsBytesHex, '04000000');
  }
  assert.equal(verifyNativeRecoverySoundCaptureConfiguration(config).authority, 'controlled-native-recovery-input');
});

test('retained target instructions prove allocation sizes, manager outer call and vector-object producers', async () => {
  const proof = await verifyNativeRecoverySoundGraphEvidence(); assert.equal(proof.evidenceIds.length, 5);
  const headers = nativeRecoverySoundGraphRanges().filter(row => row.id.endsWith('vector-object'));
  assert.equal(headers.length, 6); assert.ok(headers.every(row => row.length === 12 && row.dereferenceOffsets.length === 2));
  assert.deepEqual(headers.find(row => row.id.includes('mixer')).dereferenceOffsets, ['0', '0x84c']);
  assert.ok(!nativeRecoverySoundGraphRanges().some(row => row.dereferenceOffsets?.length > 2));
  assert.throws(() => nativeRecoverySoundGraphRanges({maxRegionBytes: 0}), /observation bound/);
});

test('service profile keeps the original action and snapshot budgets while declaring independently verified constructor, COM and cache sites', async () => {
  const {configuration} = await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', {includeAllocations: true, includeVectorStorage: true, includeServiceSites: true});
  assert.equal(configuration.pendingFrameObserver.nestedBreakpointIds.length, 24);
  assert.equal(configuration.maxSnapshots, 350); assert.equal(configuration.pendingFrameObserver.maxNestedSnapshots, 115);
  assert.equal(verifyNativeRecoverySoundCaptureConfiguration(configuration).serviceSitesDeclared, true);
  assert.equal((await verifyNativeRecoverySoundServiceEvidence()).evidenceIds.length, 11);
  assert.equal(configuration.breakpoints.find(row => row.id === 'recovery-sound-cache-entry').ranges.find(row => row.id === 'recovery-audio-manager-region').length, 0xd74);
  assert.equal(configuration.breakpoints.find(row => row.id === 'native-recovery-before').ranges.find(row => row.id === 'frame-stack').length, 24580);
  assert.throws(() => verifyNativeRecoverySoundCaptureConfiguration({...configuration, breakpoints: configuration.breakpoints.map(row => row.id === 'native-recovery-before'
    ? {...row, ranges: row.ranges.map(part => part.id === 'frame-stack' ? {...part, offset: -8192, length: 8196} : part)} : row)}), /24576-byte/);
  const entry = configuration.breakpoints.find(row => row.id === 'recovery-sound-constructor-entry');
  assert.deepEqual(entry.ranges.find(row => row.id === 'recovery-audio-constructor-source'), {id: 'recovery-audio-constructor-source', baseRegister: 'ecx', length: 0x9a8});
  assert.equal(configuration.breakpoints.find(row => row.id === 'recovery-sound-cache-entry').ranges.find(row => row.id === 'recovery-audio-cache-waveform').length, 0x440);
  assert.equal(configuration.breakpoints.find(row => row.id === 'recovery-sound-com-call').ranges.find(row => row.id === 'recovery-audio-com-send-descriptor').length, 8);
});

async function fixture(allocations = false) {
  const {configuration} = await createNativeRecoverySoundCaptureConfig('synthetic', 'never-launched', allocations ? {includeAllocations: true, includeVectorStorage: true} : {});
  const base = 0x720000, actual = preferred => base + preferred - 0x400000, U = 0x32002000;
  const layout = nativeRecoverySoundLineageLayout(U), owner = 0x47000000, manager = 0x46000000;
  const wrapper = 0x44000000, source = 0x45000000, session = 0x49000000, body = 0x4a000100, bank = 0x48000000;
  const word = value => {const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value >>> 0); return bytes;};
  const range = (id, address, bytes) => ({id, address, bytes, length: bytes.length, moduleBaseAddress: base});
  const callers = Array.from({length: 229}, (_, index) => ({ordinal: index + 1, breakpointId: 'controlled-recovery-caller', hit: index + 1,
    tid: 321, registers: {eip: actual(0x45101c), esp: U + 4}, capturePhase: 'before-declared-writes-before-original-instruction',
    ranges: new Map(controlledNativeRecoveryCallerRanges().map((row, i) => [row.id, range(row.id, base + Number(row.rva), word([228, session, body][i]))]))}));
  const bodyBytes = Buffer.alloc(0x180); bodyBytes.writeUInt32LE(0x1c03); bodyBytes.writeInt32LE(32, 0x128);
  const sessionBytes = Buffer.alloc(0x590); sessionBytes.writeUInt32LE(4, 0x57c); sessionBytes[0x54d] = 6;
  const bankBytes = Buffer.alloc(256); bankBytes.writeUInt32LE(owner, 43 * 4);
  const before = {ordinal: 230, rawHit: 229, tid: 321, pendingFrame: {candidateIndex: 1}, observedDebugEventOrdinal: 1000,
    registers: {eip: actual(0x47ccc0), esp: U}, ranges: new Map([
      ['session-root', range('session-root', actual(0x5ecb1c), word(session))], ['first-body', range('first-body', actual(0x909300), word(body))],
      ['clock', range('clock', actual(0x90a548), word(228))], ['session', range('session', session, sessionBytes)],
      ['body', range('body', body, bodyBytes)], ['bank-root', range('bank-root', actual(0x6f2414), Buffer.concat([word(bank), word(bank + 256)]))], ['bank', range('bank', bank, bankBytes)],
    ])};
  const after = {...before, ordinal: 241, observedDebugEventOrdinal: 1100, registers: {...before.registers, eip: actual(0x47d02d)}};
  const sequence = [
    ['recovery-sound-call', 0x47cf69, U - 128], ['recovery-sound-new-wrapper-call', 0x40dc50, layout.selectorFrame - 4],
    ['recovery-sound-new-wrapper-return', 0x40dc56, layout.selectorFrame - 4], ['recovery-sound-manager-call', 0x40dc8a, layout.selectorFrame - 28],
    ['recovery-sound-new-source-call', 0x4a7493, layout.sourceAllocationEsp], ['recovery-sound-new-source-return', 0x4a7499, layout.sourceAllocationEsp],
    ['recovery-sound-manager-return', 0x40dc8d, layout.selectorFrame], ['recovery-sound-append-call', 0x40dcb5, layout.selectorFrame - 4],
    ['recovery-sound-append-return', 0x40dcba, layout.selectorFrame], ['recovery-sound-return', 0x47cf6e, U - 128],
  ];
  function put(row, address, value) {
    const found = [...row.ranges.values()].filter(part => address >= part.address && address + 4 <= part.address + part.bytes.length);
    assert.ok(found.length, `Fixture store0x${address.toString(16)} must have explicit bytes.`);
    for (const part of found) part.bytes.writeUInt32LE(value >>> 0, address - part.address);
  }
  const args = [0, 0xffffffff, 9000, 6, 0xf1234567, 0, 0];
  const rows = sequence.map(([id, address, esp], index) => {
    const parts = [range('recovery-audio-stack', esp - 32, Buffer.alloc(64, 0xa5)), range('recovery-audio-clock', actual(0x90a548), word(228)),
      range('recovery-audio-manager-root', actual(0x714b08), word(manager)), range('recovery-audio-manager-region', manager, Buffer.alloc(0x900)),
      range('recovery-audio-manager-vtable', actual(0x5d4190), Buffer.alloc(0x4c)), range('recovery-audio-source-vtable', actual(0x5d3f60), Buffer.alloc(0x88)),
      range('recovery-audio-debugger-state', actual(0x714b18), Buffer.alloc(8)),
      ...[[0x830, 'cache'], [0x834, 'active'], [0x838, 'vector-838'], [0x83c, 'pending'], [0x840, 'retired'], [0x84c, 'mixer']].map(([offset, name]) => range(`recovery-audio-${name}-vector-object`, 0x4b000000 + offset * 16, Buffer.alloc(12)))];
    const row = {ordinal: index + 231, breakpointId: id, hit: 1, matchingHit: 1, rawHit: 4, tid: 321, observedDebugEventOrdinal: 1001 + index,
      registers: {eip: actual(address), esp, eax: 0, ebx: owner, ebp: 0x11667788, ecx: 0, edx: 0, esi: 0, edi: 0},
      captureWhen: {address: session + 0x57c, actualBytesHex: '04000000', equalsBytesHex: '04000000'}, ranges: new Map(parts.map(part => [part.id, part]))};
    put(row, manager, actual(0x5d4190)); put(row, actual(0x5d4190) + 0x14, actual(0x4a7710));
    for (const offset of [0x830, 0x834, 0x838, 0x83c, 0x840, 0x84c]) put(row, manager + offset, 0x4b000000 + offset * 16);
    if (id === 'recovery-sound-call' || id === 'recovery-sound-return') {args.forEach((value, i) => put(row, U - 128 + i * 4, value)); row.registers.ecx = 43; row.registers.edi = body;}
    if (id === 'recovery-sound-return') put(row, layout.emitterEntry, actual(0x47cf6e));
    if (id === 'recovery-sound-new-wrapper-call') put(row, esp, 12);
    if (id === 'recovery-sound-new-wrapper-return') {row.registers.eax = wrapper; put(row, esp - 4, actual(0x40dc56));}
    if (id === 'recovery-sound-manager-call') {Object.assign(row.registers, {ecx: manager, edx: actual(0x5d4190), edi: wrapper}); put(row, esp, owner + 0x10);}
    if (id === 'recovery-sound-new-source-call') {Object.assign(row.registers, {ecx: manager, edi: owner + 0x10}); put(row, esp, 0x9a8);}
    if (id === 'recovery-sound-new-source-return') {row.registers.eax = source; put(row, esp - 4, actual(0x4a7499));}
    if (id === 'recovery-sound-manager-return') {Object.assign(row.registers, {eax: source, edi: wrapper}); put(row, layout.managerEntry, actual(0x40dc8d));}
    if (id === 'recovery-sound-append-call') {Object.assign(row.registers, {ecx: owner + 4, edi: wrapper}); put(row, esp, layout.selectorFrame + 0x18); put(row, layout.selectorFrame + 0x18, wrapper);}
    if (id === 'recovery-sound-append-return') put(row, layout.selectorFrame - 8, actual(0x40dcba));
    if (allocations) {
      for (const [offset, name] of [[0x830, 'cache'], [0x834, 'active'], [0x838, 'vector-838'], [0x83c, 'pending'], [0x840, 'retired'], [0x84c, 'mixer']]) {
        const part = {...range(`recovery-audio-${name}-vector-storage`, 0, Buffer.alloc(0)), rangeMode: 'vector-storage', vectorHeaderAddress: 0x4b000000 + offset * 16,
          vectorHeaderHex: '000000000000000000000000', vectorBegin: 0, vectorEnd: 0, vectorCapacity: 0, maxVectorBytes: 65536};
        row.ranges.set(part.id, part);
      }
      for (const descriptor of nativeRecoverySoundAllocationRanges(id)) {
        const address = descriptor.id === 'recovery-audio-created-source-vtable' ? actual(0x5d3f60)
          : descriptor.id === 'recovery-audio-created-waveform' ? 0x4c000000 : row.registers.eax;
        const part = range(descriptor.id, address, Buffer.alloc(descriptor.length, descriptor.id.includes('allocation') ? 0xa5 : 0));
        row.ranges.set(part.id, part);
        if (descriptor.id === 'recovery-audio-created-source') {part.bytes.writeUInt32LE(actual(0x5d3f60)); part.bytes.writeUInt32LE(0x4c000000, 0x964);}
      }
    }
    return row;
  });
  const addresses = [actual(0x90a548), session + 0x57c, body, body + 0x128];
  const capture = {snapshots: [...callers, before, ...rows, after], interventions: controlledNativeRecoveryAction().writes.map((write, i) => ({type: 'intervention', breakpointId: 'controlled-recovery-caller', hit: 229,
    address: addresses[i], originalBytesHex: write.expectedBytesHex, replacementBytesHex: write.bytesHex, acceptedOriginalBytesHex: [write.expectedBytesHex]}))};
  return {configuration, capture, pair: {before, after, moduleBaseAddress: base, nativeApplications: [{bodyAddress: body}]}, rows, put, layout, source, wrapper, manager, owner, args};
}

test('posthoc proof derives nested frame addresses from actual parent ESP and observed ASLR with genuine caller schema', async () => {
  const f = await fixture(), proof = selectNativeRecoverySoundSnapshots(f.capture, f.pair, f.configuration);
  assert.equal(proof.selectedCount, 10); assert.equal(proof.unrelatedGenericSnapshots, 0); assert.equal(proof.sourceAddress, f.source);
  assert.equal(proof.wrapperAddress, f.wrapper); assert.deepEqual(proof.emitterArguments, f.args);
  assert.equal(proof.layout.factoryEntry, proof.layout.managerEntry - 0x464);
  assert.equal(proof.layout.sourceAllocationEsp, proof.layout.factoryEntry - 0x834);
  assert.equal(f.capture.snapshots[228].rawHit, undefined); assert.equal(f.capture.snapshots[228].moduleBaseAddress, undefined);
});

test('unrelated generic thread/earlier observations are reported without being assigned to the recovery', async () => {
  const f = await fixture(), unrelated = structuredClone(f.rows[0]);
  unrelated.tid++; unrelated.observedDebugEventOrdinal = 900; unrelated.ordinal = 229;
  f.rows[0].hit = f.rows[0].matchingHit = 2;
  f.rows[0].rawHit++;
  f.capture.snapshots.splice(229, 0, unrelated);
  const proof = selectNativeRecoverySoundSnapshots(f.capture, f.pair, f.configuration);
  assert.equal(proof.genericSnapshots, 11); assert.equal(proof.unrelatedGenericSnapshots, 1); assert.equal(proof.selectedCount, 10);
});

test('discarded pending observations leave actual raw and matching counters distinct from committed hits', async () => {
  const f = await fixture();
  for (const row of f.rows) {row.matchingHit += 3; row.rawHit += 3;}
  assert.equal(selectNativeRecoverySoundSnapshots(f.capture, f.pair, f.configuration).selectedCount, 10);
  f.rows[0].rawHit = f.rows[0].matchingHit - 1;
  assert.throws(() => selectNativeRecoverySoundSnapshots(f.capture, f.pair, f.configuration), /hit\/phase proof/);
});

test('allocation profile retains real allocator preimages separately from constructor output and admits observed empty vectors', async () => {
  const f = await fixture(true), proof = selectNativeRecoverySoundSnapshots(f.capture, f.pair, f.configuration);
  assert.equal(proof.allocationMemory.verified, true);
  assert.equal(proof.allocationMemory.source.inputOrdinal < proof.allocationMemory.source.outputOrdinal, true);
  assert.equal(proof.allocationMemory.source.waveformAddress, 0x4c000000);
  assert.notDeepEqual(f.rows[5].ranges.get('recovery-audio-source-allocation').bytes, f.rows[6].ranges.get('recovery-audio-created-source').bytes);
  for (const mutate of [
    value => {value.rows[5].ranges.get('recovery-audio-source-allocation').address += 4;},
    value => {value.rows[6].ranges.delete('recovery-audio-created-waveform');},
    value => {value.rows[0].ranges.get('recovery-audio-cache-vector-storage').vectorHeaderAddress += 4;},
    value => {value.configuration.breakpoints.find(row => row.id === 'native-recovery-before').ranges.pop();},
  ]) {const value = await fixture(true); mutate(value); assert.throws(() => selectNativeRecoverySoundSnapshots(value.capture, value.pair, value.configuration), /proof|policy|actual matching header/);}
});

test('strict lineage rejects missing calls, wrong thread/ESP/order/virtual target and substituted allocations or fifth word', async () => {
  for (const mutate of [
    f => {f.capture.snapshots.splice(f.capture.snapshots.indexOf(f.rows[4]), 1);},
    f => {f.rows[4].tid++;}, f => {f.rows[4].registers.esp += 4;}, f => {f.rows[4].observedDebugEventOrdinal = 1099;},
    f => {f.rows[3].registers.ebp = 1; f.put(f.rows[3], Number(f.rows[3].registers.edx) + 0x14, 0x7c7460);},
    f => {f.rows[3].registers.edi += 128;}, f => {f.rows[6].registers.eax += 128;},
    f => {f.put(f.rows[9], f.layout.parentEntryEsp - 128 + 20, 1);},
    f => {f.put(f.rows[9], f.layout.parentEntryEsp - 128 + 16, 0);},
    f => {f.rows[8].ranges.get('recovery-audio-clock').bytes.writeUInt32LE(229);},
    f => {f.rows[4].ranges.get('recovery-audio-stack').moduleBaseAddress += 0x10000;},
    f => {f.rows[4].matchingHit = 0;}, f => {f.rows[4].captureWhen.actualBytesHex = '01000000';},
    f => {delete f.rows[0].registers.edx;}, f => {f.rows[3].ranges.get('recovery-audio-active-vector-object').address += 4;},
    f => {f.configuration.breakpoints.at(-1).stopAfterHits = 1;}, f => {f.configuration.phaseActions.at(-1).writes[3].bytesHex = '00000000';},
    f => {f.configuration.pendingFrameObserver.nestedBreakpointIds.pop();}, f => {f.configuration.pendingFrameObserver.maxNestedSnapshots = 116;},
  ]) {const f = await fixture(); mutate(f); assert.throws(() => selectNativeRecoverySoundSnapshots(f.capture, f.pair, f.configuration), /proof|differ|requires|policy|order|ABI/);}
});
