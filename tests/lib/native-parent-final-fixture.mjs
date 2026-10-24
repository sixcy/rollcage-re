import {createHash} from 'node:crypto';
import {nativeParentFinalInputPolicy, nativeParentFinalInputStages, nativeParentFinalInputsCapability} from '../../tools/lib/native-parent-final-inputs.mjs';
const sha = b => createHash('sha256').update(b).digest('hex');
const word = n => {const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b;};
const range = (id, address, bytes, extra = {}) => ({id, address, bytes, length: bytes.length, sha256: sha(bytes), ...extra});

//Synthetic transport/lifecycle only. The surrounding RTTI verifier owns full
//startup/CRT/QPC/profile and716-byte context/TLS authentication. These bytes
//are independently constructed and make no original-process return claim.
export function createNativeParentFinalCaptureFixture({base = 0x400000, returnValue = 1, clock = 288, sampleCounter = 123456, U = 0x100000} = {}) {
  const owner = {pid: 100, tid: 101}, total = 1, activationEvent = 110, caller = base + 0x50e38;
  const nv = {edi: 0xaabbccdd, esi: 0x99aabbcc, ebp: 0x55667788, ebx: 0x11223344}, snapshotIds = [
    'launcher-policy', 'graphics-policy', 'before-device-creation', 'native-control-before', 'native-control-after-ai', 'native-control-after',
    'native-control-after-physics', 'native-control-after-attachments', 'native-control-after-recovery', 'native-control-after-drive', 'native-control-after-auxiliary',
    'native-parent-rtti-call', 'native-parent-rtti-return', 'native-control-after-cameras', 'native-parent-rtti-call', 'native-parent-rtti-return',
    'native-parent-rtti-call', 'native-parent-rtti-return', 'native-parent-weather-counter-call', 'native-parent-weather-counter-return', 'native-control-after-world-effects', 'native-parent-return'];
  const snapshots = [], records = [{type: 'capture'}, {type: 'owned-process', ...owner}, {type: 'breakpoint-installation-deferred', id: 'native-parent-return', address: caller,
    originalBytesHex: '8b', activationBreakpointId: 'native-control-before', activationSelection: 'selected-owned-parent-entry', capability: nativeParentFinalInputsCapability, codeModified: false}];
  function graph(s) {
    const rows = [], add = (name, address, bytes, refs) => {const r = range(`parent-final-${name}`, address, bytes, {source: 'parent-final-inputs', graphRole: name.replace(/-\d+$/, ''), graphIndex: 0, ...(refs ? {referenceIndices: refs} : {})}); rows.push(r); return r;};
    const packAddress = 0x30000000, sectorTableAddress = 0x30000100, sectorAddress = 0x30000200, allocationBase = 0x30000300;
    const root = add('light-root', base + 0x40f208, word(allocationBase)), packRoot = add('light-pack-root', base + 0x50b98c, word(packAddress));
    const ph = Buffer.alloc(20); ph.writeUInt32LE(sectorTableAddress); ph.writeUInt32LE(1, 16); add('light-pack-header', packAddress, ph); add('light-sector-pointers', sectorTableAddress, word(sectorAddress));
    const sh = Buffer.alloc(16); sh.write('SEGM'); sh.writeUInt32LE(16, 12); add('light-sector-header-0', sectorAddress, sh);
    const table = Buffer.concat([word(allocationBase), word(allocationBase + 64)]); add('light-table', base + 0x40f220, table); add('light-bands', allocationBase, Buffer.alloc(64, 0x33));
    const lightBands = {allocationRootAddress: root.address, allocationRootBytesHex: root.bytes.toString('hex'), allocationBase, packRootAddress: packRoot.address,
      packRootBytesHex: packRoot.bytes.toString('hex'), packAddress, packHeaderHex: ph.toString('hex'), sectorTableAddress, sectorCount: 1,
      pointerTableAddress: base + 0x40f220, pointerTableHex: table.toString('hex'), sectors: [{index: 0, address: sectorAddress, headerBytesHex: sh.toString('hex'), rows: 16, bytes: 64, begin: allocationBase, end: allocationBase + 64, offset: 0}], totalBytes: 64, endAddress: allocationBase + 64};
    const begin = 0x31000000, wrapperAddress = 0x31000100, poseAddress = 0x31000200, lh = Buffer.concat([word(begin), word(begin + 4), word(begin + 4)]);
    add('listener-header', base + 0x2f2408, lh); add('listener-slots', begin, word(wrapperAddress));
    const wrapper = add('listener-wrapper-0', wrapperAddress, Buffer.alloc(80, 0x44), [0]), poseRecords = Buffer.alloc(336); poseRecords[0] = 1; poseRecords.writeUInt32LE(poseAddress, 4);
    add('listener-pose-records', base + 0x449480, poseRecords); const pose = add('listener-pose-0', poseAddress, Buffer.alloc(12, 0x55), [0]);
    const poses = Array.from({length: 4}, (_, index) => ({index, active: index === 0, dynamic: false, positionAddress: index === 0 ? poseAddress : null,
      positionIndex: index === 0 ? 0 : null, positionRangeId: index === 0 ? pose.id : null, velocityAddress: index === 0 ? 0 : null, velocityIndex: null,
      velocityRangeId: null, rotationAddress: index === 0 ? 0 : null, rotationIndex: null, rotationRangeId: null}));
    const listenerWrappers = {headerAddress: base + 0x2f2408, headerBytesHex: lh.toString('hex'), begin, end: begin + 4, capacity: begin + 4, usedSlots: 1, uniqueWrappers: 1,
      slots: [{index: 0, slotAddress: begin, wrapperAddress, wrapperIndex: 0, wrapperRangeId: wrapper.id}], wrappers: [{index: 0, address: wrapperAddress, rangeId: wrapper.id, bytes: 80, sha256: wrapper.sha256, referenceIndices: [0]}],
      poseRecordsAddress: base + 0x449480, poseRecordsHex: poseRecords.toString('hex'), poses, poseRanges: [{index: 0, address: poseAddress, rangeId: pose.id, bytes: 12, sha256: pose.sha256, referenceIndices: [0]}]};
    const managerAddress = 0x32000000, vtableAddress = base + 0x1d9990, vt = Buffer.alloc(96); vt.writeUInt32LE(base + 0xa90e0, 0x5c);
    const mr = add('manager-root', base + 0x314b08, word(managerAddress)), vp = add('manager-vtable-pointer', managerAddress, word(vtableAddress)), vr = add('manager-vtable', vtableAddress, vt), level = add('manager-level', managerAddress + 0x850, word(0x7fc01234));
    const masterLevel = {rootAddress: mr.address, rootBytesHex: mr.bytes.toString('hex'), managerAddress, vtablePointerBytesHex: vp.bytes.toString('hex'), vtableAddress,
      levelAddress: level.address, levelBytesHex: level.bytes.toString('hex'), methodAddress: base + 0xa90e0, methodBytesHex: vt.subarray(0x5c).toString('hex'), vtableSha256: vr.sha256};
    const p = {...common(s), type: 'parent-final-inputs-observed', mainModuleBaseAddress: base, snapshotOrdinal: s.ordinal, lightBands, listenerWrappers, masterLevel,
      additionalBytes: rows.reduce((n, r) => n + r.length, 0), sameStoppedDebugEvent: true, afterParentAdmission: true, beforeOriginalInstruction: true, completeInputsObserved: true};
    s.ranges.push(...rows); s.parentFinalInputs = p; return p;
  }
  function common(s) {return {pid: owner.pid, tid: owner.tid, ownerMainTid: owner.tid, breakpointId: s.breakpointId, observedDebugEventOrdinal: s.observedDebugEventOrdinal,
    parentEntryDebugEventOrdinal: 40, parentEntryEsp: U, parentClock: clock, parentIteration: 0, parentCaller: caller, parentTotalIterations: total,
    activationDebugEventOrdinal: s.ordinal <= 11 ? 0 : activationEvent};}
  for (const [index, breakpointId] of snapshotIds.entries()) {
    const ordinal = index + 1, context = Buffer.alloc(716), final = ordinal === 22;
    for (const [name, offset] of [['edi', 156], ['esi', 160], ['ebx', 164], ['ebp', 180]]) context.writeUInt32LE(nv[name], offset);
    context.writeUInt32LE(0, 168); context.writeUInt32LE(final ? returnValue : 0x1234, 176);
    context.writeUInt32LE(final ? caller : base + 0x50e50, 184); context.writeUInt32LE(final ? U + 4 : U, 196);
    context.writeUInt32LE(0x7f, 28); context.writeUInt16LE(0x7f, 204); context.writeUInt32LE(0x1f80, 228); context.writeUInt32LE(0x53, 144);
    const stack = Buffer.alloc(96, 0x5a), start = U - 64; stack.writeUInt32LE(caller, 64); stack.writeUInt32LE(total, 68);
    if (ordinal > 4) for (const [n, offset] of [['edi', 48], ['esi', 52], ['ebp', 56], ['ebx', 60]]) stack.writeUInt32LE(nv[n], offset);
    const ranges = [range('frame-stack', start, stack), range('logical-clock', base + 0x50a548, word(clock + (final ? returnValue : 0))),
      range('sample-clock', base + 0x2e675c, word(sampleCounter + (final ? returnValue : 0))),
      range('thread-seh-head', 0x80000000, word(0x12345678), {source: 'stopped-owned-thread-fs-zero'})];
    const s = {type: 'snapshot', ordinal, breakpointId, tid: owner.tid, observedDebugEventOrdinal: ordinal * 10, context, contextSha256: sha(context), ranges,
      threadEnvironment: {sehWord: 0x12345678, fsBase: 0x80000000, fsSelector: 0x53, descriptorHex: 'ffff000000f3cf80', tid: owner.tid, contextSelectorOffset: 144,
        source: 'stopped-owned-thread-selector-query', selectorApi: 'Wow64GetThreadSelectorEntry'}};
    records.push({type: 'debug-event', event: 1, ordinal: s.observedDebugEventOrdinal, pid: owner.pid, tid: owner.tid});
    if (final) {
      const p = {...common(s), type: 'parent-final-return-admitted', snapshotOrdinal: ordinal, mainModuleBaseAddress: base, returnActivationDebugEventOrdinal: 40,
        afterWorldDebugEventOrdinal: 210, entryEsp: U, returnEsp: U + 4, stackAddress: U - 16, stackBytesHex: stack.subarray(48, 76).toString('hex'),
        entryNonvolatile: ['edi', 'esi', 'ebp', 'ebx'].map(n => nv[n]), actualNonvolatile: ['edi', 'esi', 'ebp', 'ebx'].map(n => nv[n]), returnValue,
        returnWordBytesHex: word(caller).toString('hex'), totalWordBytesHex: word(total).toString('hex'), beforeSnapshotRangeResolution: true, beforeOriginalInstruction: true,
        observationPhase: 'native-caller-after-parent-return'}; s.parentFinalReturn = p; records.push(p);
    }
    if (nativeParentFinalInputStages.includes(breakpointId)) records.push(graph(s));
    if (ordinal === 4) {
      const p = {...common(s), type: 'parent-final-return-activated', mainModuleBaseAddress: base, snapshotOrdinal: ordinal, id: 'native-parent-return', address: caller,
        originalBytesHex: '8bd8', patchBytesHex: 'cc', activationSelection: 'selected-owned-parent-entry', afterSnapshotBytesCaptured: true, beforeSnapshotPublication: true, beforeOriginalInstruction: true};
      s.parentFinalReturnActivation = p; records.push(p);
    }
    snapshots.push(s); records.push(s);
  }
  const before = snapshots[3], final = snapshots.at(-1), parent = snapshots.filter(s => nativeParentFinalInputStages.slice(0, -1).includes(s.breakpointId));
  const inputs = {checkpoints: 11, lightBandBytes: 11 * 64, listenerWrappers: 11, listenerBytes: 11 * 80, managerObservations: 11,
    additionalBytes: [...parent, final].reduce((n, s) => n + s.parentFinalInputs.additionalBytes, 0)};
  const complete = {type: 'complete', parentFinalTick: {completed: true, returnSnapshots: 1, returnSnapshotOrdinal: 22, returnDebugEventOrdinal: 220,
    returnValue, activationDebugEventOrdinal: 40, inputs}}; records.push(complete);
  const capture = {header: {helperCapabilities: [nativeParentFinalInputsCapability]}, snapshots, complete};
  return {input: {capture, configuration: {parentRttiObservation: {finalTick: nativeParentFinalInputPolicy()}}, records, before, parent, owner, base, U, clock, activationEvent},
    before, final, parent, records, snapshots, sampleCounter, returnValue, base, U};
}
