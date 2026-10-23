import {createCapturedMemory} from './captured-memory.mjs';
import {verifyControlledNativeRecoveryConfiguration, verifyControlledNativeRecoveryEvidence} from './native-controlled-recovery.mjs';
import {nativeEffectStackLayout} from '../../src/native-effect-emitter.mjs';
import audioPathConstants from '../../src/game-audio-file-path-constants.json' with {type: 'json'};
import {verifyNativeObservationActivation} from './native-observation-activation.mjs';
import {nativeRecoverySoundBindingSites, nativeRecoverySoundBindingRanges, selectNativeRecoverySoundBindingSnapshots, isNativeRecoveryPlaybackAllocationSite, nativeRecoveryPlaybackAllocationCondition,
  nativeRecoverySoundChannelSites, nativeRecoverySoundChannelRanges, selectNativeRecoverySoundChannelSnapshots} from './native-recovery-sound-bindings.mjs';
import {nativeRecoverySoundPlaybackCopySites, nativeRecoverySoundPlaybackCopyRanges, nativeRecoveryPlaybackCopyCondition, isNativeRecoveryPlaybackCopySite,
  selectNativeRecoverySoundPlaybackCopySnapshots} from './native-recovery-playback-copy.mjs';

const rva = address => `0x${(address - 0x400000).toString(16)}`;
export const nativeRecoverySoundSites = Object.freeze([
  ['recovery-sound-call', 0x47cf69], ['recovery-sound-return', 0x47cf6e],
  ['recovery-sound-new-wrapper-call', 0x40dc50], ['recovery-sound-new-wrapper-return', 0x40dc56],
  ['recovery-sound-manager-call', 0x40dc8a], ['recovery-sound-manager-return', 0x40dc8d],
  ['recovery-sound-new-source-call', 0x4a7493], ['recovery-sound-new-source-return', 0x4a7499],
  ['recovery-sound-append-call', 0x40dcb5], ['recovery-sound-append-return', 0x40dcba],
].map(row => Object.freeze(row)));
export const nativeRecoverySoundServiceSites = Object.freeze([
  ['recovery-sound-constructor-entry', 0x4ad7e0], ['recovery-sound-constructor-exit', 0x4ad8de],
  ['recovery-sound-com-call', 0x4b1daf], ['recovery-sound-com-return', 0x4b1db2],
  ['recovery-sound-cache-entry', 0x4a7b56],
  ['recovery-sound-mixer-enter-return', 0x4a7a05], ['recovery-sound-mixer-thread-return', 0x4a7a0b], ['recovery-sound-mixer-leave-return', 0x4a7a53],
  ['recovery-sound-factory-enter-return', 0x4a7691], ['recovery-sound-factory-thread-return', 0x4a7697], ['recovery-sound-factory-leave-return', 0x4a76c0],
  ['recovery-sound-play-enter-return', 0x4adaaa], ['recovery-sound-play-thread-return', 0x4adab0], ['recovery-sound-play-leave-return', 0x4adad9],
].map(row => Object.freeze(row)));
export const nativeRecoverySoundSitesFor = options => [...nativeRecoverySoundSites, ...(options?.includeServiceSites ? nativeRecoverySoundServiceSites : []), ...(options?.includeBindingSites ? nativeRecoverySoundBindingSites : []), ...(options?.includeChannelSites ? nativeRecoverySoundChannelSites : []), ...(options?.includePlaybackSites ? nativeRecoverySoundPlaybackCopySites : [])];

const vectorFields = [[0x830, 'cache'], [0x834, 'active'], [0x838, 'vector-838'], [0x83c, 'pending'], [0x840, 'retired'], [0x84c, 'mixer']];
export function nativeRecoverySoundGraphRanges({maxRegionBytes = 64 * 1024 * 1024, includeVectorStorage = false, maxVectorBytes = 65536, includeServiceSites = false, includeBindingSites = false} = {}) {
  if (!Number.isInteger(maxRegionBytes) || maxRegionBytes < 1 || maxRegionBytes > 64 * 1024 * 1024) throw Error('Invalid recovery audio graph observation bound.');
  if (typeof includeVectorStorage !== 'boolean' || !Number.isSafeInteger(maxVectorBytes) || maxVectorBytes < 1 || maxVectorBytes > 64 * 1024 * 1024) throw Error('Invalid recovery audio vector observation bound.');
  return [
    {id: 'recovery-audio-manager-root', rva: '0x314b08', length: 4},
    //4b0eb0 writes through+d70. Observe the proven object extent for the
    //frequent rich sites rather than duplicating its entire containing heap
    //region on every cache iteration. Existing capture profiles stay exact.
    {id: 'recovery-audio-manager-region', rva: '0x314b08', dereferenceOffsets: ['0'], ...(includeServiceSites ? {length: 0xd74} : {readableRegion: true, maxRegionBytes})},
    {id: 'recovery-audio-manager-vtable', rva: '0x314b08', dereferenceOffsets: ['0', '0'], length: 0x4c},
    ...(includeBindingSites ? [{id: 'recovery-audio-backend-vtable', rva: '0x314b08', dereferenceOffsets: ['0', '0x81c'], length: 4}] : []),
    {id: 'recovery-audio-source-vtable', rva: '0x1d3f60', length: 0x88},
    {id: 'recovery-audio-debugger-state', rva: '0x314b18', length: 8},
    //9122 publishes separately allocated12-byte vector OBJECTS. Their begin
    //words may be zero: never dereference or invent their storage/capacity.
    ...vectorFields.map(([offset, name]) =>
      ({id: `recovery-audio-${name}-vector-object`, rva: '0x314b08', dereferenceOffsets: ['0', `0x${offset.toString(16)}`], length: 12})),
    ...(includeVectorStorage ? vectorFields.map(([offset, name]) =>
      ({id: `recovery-audio-${name}-vector-storage`, rva: '0x314b08', dereferenceOffsets: ['0', `0x${offset.toString(16)}`], vectorStorage: true, maxVectorBytes})) : []),
    ...(includeServiceSites ? [
      {id: 'recovery-audio-application-path-globals', rva: '0x314afc', length: 0x210c},
      ...audioPathConstants.tables.map((row, index) => ({id: `recovery-audio-path-literal-${index}`, rva: rva(Number(row.address)), length: row.bytes_hex.length / 2})),
      ...[[0x56e47c, 4, 'resolver-crt-import'], [0x5ed314, 4, 'installed-path-callback'], [0x5e8890, 4, 'cookie'],
        [0x5d3f00, 32, 'play-format'], [0x5d3b98, 16, 'debug-category-name'], [0x5dc5dc, 4, 'gain'], [0x6e6bd4, 4, 'reverb-guard']]
        .map(([address, length, name]) => ({id: `recovery-audio-${name}`, rva: rva(address), length})),
    ] : []),
  ];
}

export function nativeRecoverySoundAllocationRanges(id) {
  if (id === 'recovery-sound-new-wrapper-return') return [{id: 'recovery-audio-wrapper-allocation', baseRegister: 'eax', length: 12}];
  if (id === 'recovery-sound-new-source-return') return [{id: 'recovery-audio-source-allocation', baseRegister: 'eax', length: 0x9a8}];
  if (id === 'recovery-sound-manager-return') return [
    {id: 'recovery-audio-created-source', baseRegister: 'eax', length: 0x9a8},
    {id: 'recovery-audio-created-source-vtable', baseRegister: 'eax', dereferenceOffsets: ['0'], length: 0x88},
    {id: 'recovery-audio-created-waveform', baseRegister: 'eax', dereferenceOffsets: ['0x964'], length: 0x440},
  ];
  return [];
}

export function nativeRecoverySoundServiceRanges(id) {
  if (['recovery-sound-constructor-entry', 'recovery-sound-constructor-exit'].includes(id)) return [
    {id: 'recovery-audio-constructor-stack', baseRegister: 'esp', offset: -512, length: 544},
    {id: 'recovery-audio-constructor-source', baseRegister: id.endsWith('entry') ? 'ecx' : 'eax', length: 0x9a8},
    {id: 'recovery-audio-constructor-descriptor', baseRegister: 'esp', dereferenceOffsets: ['4'], length: 0x460},
    {id: 'recovery-audio-constructor-empty-strings', rva: '0x16fe60', length: 96},
    {id: 'recovery-audio-constructor-fallback-name', rva: '0x1d0320', length: 24},
    {id: 'recovery-audio-constructor-one', rva: '0x1dc774', length: 4},
  ];
  if (id === 'recovery-sound-cache-entry') return [
    {id: 'recovery-audio-cache-slot', baseRegister: 'eax', length: 4},
    {id: 'recovery-audio-cache-waveform', baseRegister: 'eax', dereferenceOffsets: ['0'], length: 0x440},
    {id: 'recovery-audio-cache-requested-path', baseRegister: 'ebx', length: 1024},
  ];
  if (id === 'recovery-sound-com-call') return [
    {id: 'recovery-audio-com-arguments', baseRegister: 'esp', length: 32},
    {id: 'recovery-audio-com-engine', baseRegister: 'esp', dereferenceOffsets: ['0'], length: 4},
    {id: 'recovery-audio-com-vtable', baseRegister: 'esp', dereferenceOffsets: ['0', '0'], length: 0x24},
    {id: 'recovery-audio-com-output', baseRegister: 'esp', dereferenceOffsets: ['4'], length: 4},
    {id: 'recovery-audio-com-format', baseRegister: 'esp', dereferenceOffsets: ['8'], length: 18},
    {id: 'recovery-audio-com-send-list', baseRegister: 'esp', dereferenceOffsets: ['24'], length: 8},
    {id: 'recovery-audio-com-send-descriptor', baseRegister: 'esp', dereferenceOffsets: ['24', '4'], length: 8},
  ];
  if (id === 'recovery-sound-com-return') return [{id: 'recovery-audio-com-output', baseRegister: 'ebp', dereferenceOffsets: ['0x18'], length: 4}];
  return [];
}

export function nativeRecoverySoundGenericRanges(options) {
  return [{id: 'recovery-audio-stack', baseRegister: 'esp', offset: -32, length: 64},
    {id: 'recovery-audio-clock', rva: '0x50a548', length: 4}, ...nativeRecoverySoundGraphRanges(options)];
}
export function nativeRecoverySoundGenericBreakpoints(options) {
  return nativeRecoverySoundSitesFor(options).map(([id, address]) => ({id, rva: rva(address), ranges: [...nativeRecoverySoundGenericRanges(options), ...(options?.includeAllocations ? nativeRecoverySoundAllocationRanges(id) : []), ...(options?.includeServiceSites ? nativeRecoverySoundServiceRanges(id) : []), ...(options?.includeBindingSites ? nativeRecoverySoundBindingRanges(id) : []), ...(options?.includeChannelSites ? nativeRecoverySoundChannelRanges(id) : []), ...(options?.includePlaybackSites ? nativeRecoverySoundPlaybackCopyRanges(id) : [])],
    captureWhen: options?.includePlaybackSites && isNativeRecoveryPlaybackCopySite(id) ? nativeRecoveryPlaybackCopyCondition() : options?.includeBindingSites && isNativeRecoveryPlaybackAllocationSite(id) ? nativeRecoveryPlaybackAllocationCondition() : {range: {id: 'active-race-phase', rva: '0x1ecb1c', dereferenceOffsets: ['0'], offset: '0x57c', length: 4}, equalsBytesHex: '04000000'}}));
}

export function verifyNativeRecoverySoundObservationPredicate(row, {sessionAddress, clock, tid}, includeBindingSites = false) {
  if (includeBindingSites && isNativeRecoveryPlaybackCopySite(row.breakpointId)) {
    const phase = row.ranges.get('recovery-audio-playback-copy-phase'), observedClock = row.ranges.get('recovery-audio-clock');
    const source = row.ranges.get('recovery-audio-playback-copy-source'), args = row.ranges.get('recovery-audio-playback-copy-arguments');
    if (!source || source.bytes.length !== 21 || source.bytes.subarray(0, 8).toString('hex') !== '506c6179696e6720' || !args || Number(args.address) !== number(row.registers.esp) || args.bytes.length !== 12 || args.bytes.readUInt32LE(4) !== Number(source.address) || number(row.captureWhen?.address) !== Number(source.address) || row.captureWhen?.actualBytesHex !== '506c6179696e6720' || row.captureWhen?.equalsBytesHex !== '506c6179696e6720' || !phase || number(phase.address) !== sessionAddress + 0x57c || phase.bytes.length !== 4 || phase.bytes.readUInt32LE() !== 4 || !observedClock || observedClock.bytes.length !== 4 || observedClock.bytes.readUInt32LE() !== clock || row.tid !== tid) throw Error('Recovery playback copy observation prefix/phase/clock/thread proof differs.');
  } else if (includeBindingSites && isNativeRecoveryPlaybackAllocationSite(row.breakpointId)) {
    const phase = row.ranges.get('recovery-audio-playback-phase'), observedClock = row.ranges.get('recovery-audio-clock');
    const chain = row.ranges.get('recovery-audio-playback-chain');
    if (number(row.captureWhen?.address) !== number(row.registers.esp) + 0x54 || row.captureWhen?.actualBytesHex !== '506c6179696e6720' || row.captureWhen?.equalsBytesHex !== '506c6179696e6720' || !chain || number(chain.address) !== number(row.registers.esp) - 4 || chain.bytes.length !== 4200 || chain.bytes.subarray(0x58, 0x60).toString('hex') !== '506c6179696e6720' || !phase || number(phase.address) !== sessionAddress + 0x57c || phase.bytes.length !== 4 || phase.bytes.readUInt32LE() !== 4 || !observedClock || observedClock.bytes.length !== 4 || observedClock.bytes.readUInt32LE() !== clock || row.tid !== tid) throw Error('Recovery playback observation prefix/phase/clock/thread proof differs.');
  } else if (number(row.captureWhen?.address) !== sessionAddress + 0x57c || row.captureWhen?.actualBytesHex !== '04000000' || row.captureWhen?.equalsBytesHex !== '04000000') throw Error('Recovery audio generic phase proof differs.');
}

export function verifyNativeRecoverySoundCaptureConfiguration(configuration) {
  if (!verifyControlledNativeRecoveryConfiguration(configuration)) throw Error('Recovery audio requires the explicit controlled parent input.');
  const includeServiceSites = configuration.breakpoints.some(row => nativeRecoverySoundServiceSites.some(([id]) => row.id === id));
  const includeBindingSites = configuration.breakpoints.some(row => nativeRecoverySoundBindingSites.some(([id]) => row.id === id));
  const includeChannelSites = configuration.breakpoints.some(row => nativeRecoverySoundChannelSites.some(([id]) => row.id === id));
  const includePlaybackSites = configuration.breakpoints.some(row => nativeRecoverySoundPlaybackCopySites.some(([id]) => row.id === id));
  const sites = nativeRecoverySoundSitesFor({includeServiceSites, includeBindingSites, includeChannelSites, includePlaybackSites});
  const sound = configuration.breakpoints.filter(row => sites.some(([id]) => row.id === id));
  const bound = sound[0]?.ranges?.find(row => row.id === 'recovery-audio-manager-region')?.maxRegionBytes;
  const includeVectorStorage = sound[0]?.ranges?.some(row => row.vectorStorage === true) ?? false;
  const includeAllocations = sound.some(row => row.ranges?.some(part => part.id === 'recovery-audio-source-allocation'));
  const maxVectorBytes = sound[0]?.ranges?.find(row => row.vectorStorage)?.maxVectorBytes;
  const graphOptions = {maxRegionBytes: bound, includeVectorStorage, includeAllocations, includeServiceSites, includeBindingSites, includeChannelSites, includePlaybackSites, ...(maxVectorBytes === undefined ? {} : {maxVectorBytes})};
  if (sound.length !== sites.length || JSON.stringify(sound) !== JSON.stringify(nativeRecoverySoundGenericBreakpoints(graphOptions))) throw Error('Recovery audio generic call/return policy differs.');
  if (includeAllocations && !includeVectorStorage) throw Error('Recovery audio allocation capture requires its vector storage.');
  if (includeServiceSites && !includeAllocations) throw Error('Recovery audio service capture requires its allocation memory.');
  if (includeVectorStorage) {
    const graph = nativeRecoverySoundGraphRanges(graphOptions);
    const parents = configuration.breakpoints.filter(row => ['native-recovery-before', 'native-recovery-after'].includes(row.id));
    if (parents.length !== 2 || parents.some(row => JSON.stringify(row.ranges.slice(-graph.length)) !== JSON.stringify(graph))) throw Error('Recovery audio parent graph observation policy differs.');
    if (includeServiceSites && parents.some(row => {
      const stack = row.ranges.find(part => part.id === 'frame-stack');
      return Number(stack?.offset) !== -24576 || stack.length !== 24580;
    })) throw Error('Recovery audio full factory requires its declared24576-byte parent stack.');
  }
  if (configuration.maxSnapshots !== 350 || configuration.maxDurationMs !== 90000 || configuration.maxEvents !== 1000000 || configuration.captureThreadEnvironment !== true) throw Error('Recovery audio observation bounds differ.');
  if (JSON.stringify(configuration.pendingFrameObserver?.nestedBreakpointIds) !== JSON.stringify(sites.map(([id]) => id)) || configuration.pendingFrameObserver.maxNestedSnapshots !== 115) throw Error('Recovery audio requires its declared bounded nested observations.');
  const deferredObservationActivation = configuration.observationActivation !== undefined;
  if (includeBindingSites && (!includeServiceSites || !deferredObservationActivation)) throw Error('Recovery binding capture requires rich services and guarded activation.');
  if (includeChannelSites && !includeBindingSites) throw Error('Recovery channel capture requires its complete binding profile.');
  if (includePlaybackSites && !includeChannelSites) throw Error('Recovery playback copy capture requires its complete channel profile.');
  if (deferredObservationActivation) {
    const expected = {breakpointId: 'controlled-recovery-caller', rawHit: 229, observationBreakpointIds: sites.map(([id]) => id)};
    if (!includeServiceSites || JSON.stringify(configuration.observationActivation) !== JSON.stringify(expected) || configuration.pendingFrameObserver.nestedCaptureScope !== 'frame-thread') throw Error('Recovery audio deferred observer policy differs.');
  } else if (configuration.pendingFrameObserver.nestedCaptureScope !== undefined) throw Error('Recovery audio thread scope requires its explicit guarded observer activation.');
  return {authority: 'controlled-native-recovery-input', genericSnapshotBudget: 115, maxSnapshots: 350, regionObservationBound: bound,
    deferredObservationActivation,
    ...(includeBindingSites ? {bindingSitesDeclared: true} : {}),
    ...(includeChannelSites ? {channelSitesDeclared: true} : {}),
    ...(includePlaybackSites ? {playbackSitesDeclared: true} : {}),
    allocationMemoryDeclared: includeAllocations, vectorStorageDeclared: includeVectorStorage, serviceSitesDeclared: includeServiceSites,
    ...(includeServiceSites ? {managerObjectBytes: 0xd74} : {}), ...(includeVectorStorage ? {maxVectorBytes} : {})};
}

//Actual shared stack, derived from098/149/151/153/9126/11601, not a previous
//capture's EBP/ASLR base. Manager virtual14 enters4a7710; its CALL4a7902
//reaches4a7460 at managerEntry−464, then CALL4a7493 runs at entry−834.
export function nativeRecoverySoundLineageLayout(parentEntryEsp) {
  const emitterEntry = parentEntryEsp - 132, dispatchEntry = nativeEffectStackLayout(emitterEntry).dispatchEntry;
  const selectorEntry = dispatchEntry - 24, selectorFrame = selectorEntry - 44, managerEntry = selectorFrame - 32;
  return {parentEntryEsp, emitterEntry, dispatchEntry, selectorEntry, selectorFrame, managerEntry,
    factoryEntry: managerEntry - 0x464, sourceAllocationEsp: managerEntry - 0xc98};
}

function snapshotMemory(snapshot) {return createCapturedMemory([...snapshot.ranges.values()]).memory;}
function number(value) {return Number(value);}
function observedOrder(snapshot) {
  if (!Number.isSafeInteger(snapshot.observedDebugEventOrdinal) || snapshot.observedDebugEventOrdinal < 1) throw Error('Recovery audio requires actual observed debug-event order.');
  return snapshot.observedDebugEventOrdinal;
}

//Generic observations are deliberately unselected at capture time. Only this
//strict posthoc proof associates them with the supplied first-body recovery.
//The result is call/return lineage, not complete source/CRT/audio replay.
export function selectNativeRecoverySoundSnapshots(capture, pair, configuration) {
  const policy = verifyNativeRecoverySoundCaptureConfiguration(configuration);
  const controlledInput = verifyControlledNativeRecoveryEvidence(capture, pair, configuration);
  const observationActivation = verifyNativeObservationActivation(capture, pair, configuration);
  const base = pair.moduleBaseAddress, actual = address => base + address - 0x400000;
  const parentEsp = number(pair.before.registers.esp), layout = nativeRecoverySoundLineageLayout(parentEsp);
  const start = observedOrder(pair.before), end = observedOrder(pair.after);
  if (end <= start) throw Error('Recovery audio parent order differs.');
  const before = snapshotMemory(pair.before), bank = before.readUInt32LE(actual(0x6f2414)), bankEnd = before.readUInt32LE(actual(0x6f2418));
  if (!bank || bankEnd < bank || (bankEnd - bank) % 4 || (bankEnd - bank) / 4 <= 43) throw Error('Recovery audio sound43 bank bounds differ.');
  const owner = before.readUInt32LE(bank + 43 * 4);
  if (!owner) throw Error('Recovery audio requires its real populated sound43 owner.');
  const sites = nativeRecoverySoundSitesFor({includeServiceSites: policy.serviceSitesDeclared, includeBindingSites: policy.bindingSitesDeclared, includeChannelSites: policy.channelSitesDeclared, includePlaybackSites: policy.playbackSitesDeclared});
  const rows = capture.snapshots.filter(row => sites.some(([id]) => id === row.breakpointId));
  for (const [id, address] of sites) {
    const hits = rows.filter(row => row.breakpointId === id);
    for (const [index, row] of hits.entries()) {
      const bases = [row.moduleBaseAddress, ...[...row.ranges.values()].map(value => value.moduleBaseAddress)].filter(value => value !== undefined && value !== null);
      if (row.hit !== index + 1 || !Number.isSafeInteger(row.matchingHit) || row.matchingHit < row.hit || !Number.isSafeInteger(row.rawHit) || row.rawHit < row.matchingHit || index > 0 && (row.matchingHit <= hits[index - 1].matchingHit || row.rawHit <= hits[index - 1].rawHit) || !bases.length || bases.some(value => number(value) !== base) || number(row.registers?.eip) !== actual(address)) throw Error('Recovery audio generic snapshot address/hit/phase proof differs.');
      verifyNativeRecoverySoundObservationPredicate(row, {...controlledInput, tid: pair.before.tid}, policy.bindingSitesDeclared);
      observedOrder(row);
      const stack = row.ranges.get('recovery-audio-stack'), clock = row.ranges.get('recovery-audio-clock');
      if (!stack || number(stack.address) !== number(row.registers.esp) - 32 || stack.bytes.length !== 64 || !clock || number(clock.address) !== actual(0x90a548) || clock.bytes.length !== 4) throw Error('Recovery audio generic stack/clock ranges differ.');
    }
  }
  const candidates = rows.filter(row => row.tid === pair.before.tid && observedOrder(row) > start && observedOrder(row) < end && row.ranges.get('recovery-audio-clock').bytes.readUInt32LE() === controlledInput.clock);
  const expected = [
    ['recovery-sound-call', parentEsp - 128], ['recovery-sound-new-wrapper-call', layout.selectorFrame - 4],
    ['recovery-sound-new-wrapper-return', layout.selectorFrame - 4], ['recovery-sound-manager-call', layout.selectorFrame - 28],
    ['recovery-sound-new-source-call', layout.sourceAllocationEsp], ['recovery-sound-new-source-return', layout.sourceAllocationEsp],
    ['recovery-sound-manager-return', layout.selectorFrame], ['recovery-sound-append-call', layout.selectorFrame - 4],
    ['recovery-sound-append-return', layout.selectorFrame], ['recovery-sound-return', parentEsp - 128],
  ];
  const selected = expected.map(([id, esp]) => {
    const matching = candidates.filter(row => row.breakpointId === id && number(row.registers.esp) === esp);
    if (matching.length !== 1) throw Error(`Recovery audio requires exactly one proved ${id} at its native ESP.`);
    return matching[0];
  });
  for (let index = 1; index < selected.length; index++) if (observedOrder(selected[index]) <= observedOrder(selected[index - 1])) throw Error('Recovery audio nested call/return order differs.');
  const [call, wrapperCall, wrapperReturn, managerCall, sourceCall, sourceReturn, managerReturn, appendCall, appendReturn, returned] = selected;
  const memories = new Map(), m = row => {
    if (!memories.has(row)) memories.set(row, snapshotMemory(row));
    return memories.get(row);
  }, reg = (row, name) => {
    const value = number(row.registers[name]);
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw Error(`Recovery audio requires actual ${name} register bytes.`);
    return value;
  };
  for (const row of selected) {
    const memory = m(row), manager = memory.readUInt32LE(actual(0x714b08)), table = memory.readUInt32LE(manager);
    const span = (id, address, length) => {
      const part = row.ranges.get(id);
      if (!part || number(part.address) !== address || part.bytes.length !== length) throw Error(`Recovery audio graph ${id} address/length proof differs.`);
    };
    span('recovery-audio-manager-root', actual(0x714b08), 4);
    span('recovery-audio-manager-vtable', table, 0x4c);
    span('recovery-audio-source-vtable', actual(0x5d3f60), 0x88);
    span('recovery-audio-debugger-state', actual(0x714b18), 8);
    const observed = row.ranges.get('recovery-audio-manager-region');
    if (!observed || number(observed.address) > manager || number(observed.address) + observed.bytes.length <= manager) throw Error('Recovery audio observed manager region does not contain its actual root.');
    for (const [offset, name] of vectorFields) {
      const header = memory.readUInt32LE(manager + offset);
      span(`recovery-audio-${name}-vector-object`, header, 12);
      if (policy.vectorStorageDeclared) {
        const storage = row.ranges.get(`recovery-audio-${name}-vector-storage`);
        const begin = memory.readUInt32LE(header), end = memory.readUInt32LE(header + 4), capacity = memory.readUInt32LE(header + 8);
        if (!storage || storage.rangeMode !== 'vector-storage' || number(storage.vectorHeaderAddress) !== header || storage.vectorHeaderHex !== memory.subarray(header, header + 12).toString('hex') || number(storage.vectorBegin) !== begin || number(storage.vectorEnd) !== end || number(storage.vectorCapacity) !== capacity || number(storage.address) !== begin || end < begin || capacity < end || !begin && (end || capacity) || capacity - begin !== storage.bytes.length || storage.length !== storage.bytes.length || storage.maxVectorBytes !== policy.maxVectorBytes || storage.bytes.length > policy.maxVectorBytes) throw Error('Recovery audio captured vector storage proof differs.');
      }
    }
  }
  const words = Array.from({length: 7}, (_, index) => m(call).readUInt32LE(parentEsp - 128 + index * 4));
  if (reg(call, 'ecx') !== 43 || reg(call, 'edx') !== 0 || reg(call, 'edi') !== controlledInput.bodyAddress || words.some((value, index) => index !== 4 && value !== [0, 0xffffffff, 9000, 6, 0, 0, 0][index])) throw Error('Recovery audio emitter43 seven-argument publication differs.');
  const outputStack = m(returned);
  if (outputStack.readUInt32LE(layout.emitterEntry) !== actual(0x47cf6e) || words.some((value, index) => outputStack.readUInt32LE(parentEsp - 128 + index * 4) !== value)) throw Error('Recovery audio actual emitter return/argument words differ.');
  if (reg(wrapperCall, 'ebx') !== owner || reg(wrapperReturn, 'ebx') !== owner || m(wrapperCall).readUInt32LE(layout.selectorFrame - 4) !== 12 || m(wrapperReturn).readUInt32LE(layout.selectorFrame - 8) !== actual(0x40dc56)) throw Error('Recovery audio12-byte wrapper allocation ABI differs.');
  const wrapper = reg(wrapperReturn, 'eax'), managerMemory = m(managerCall), manager = managerMemory.readUInt32LE(actual(0x714b08));
  const table = managerMemory.readUInt32LE(manager);
  if (!wrapper || reg(managerCall, 'edi') !== wrapper || reg(managerCall, 'ebx') !== owner || reg(managerCall, 'ecx') !== manager || reg(managerCall, 'edx') !== table || managerMemory.readUInt32LE(table + 0x14) !== actual(0x4a7710) || managerMemory.readUInt32LE(layout.selectorFrame - 28) !== owner + 0x10) throw Error('Recovery audio actual manager virtual14/source descriptor ABI differs.');
  if (m(sourceCall).readUInt32LE(layout.sourceAllocationEsp) !== 0x9a8 || reg(sourceCall, 'ecx') !== manager || reg(sourceCall, 'edi') !== owner + 0x10 || m(sourceReturn).readUInt32LE(layout.sourceAllocationEsp - 4) !== actual(0x4a7499)) throw Error('Recovery audio9a8 allocation/outer factory ABI differs.');
  const source = reg(sourceReturn, 'eax');
  if (!source || reg(managerReturn, 'eax') !== source || reg(managerReturn, 'edi') !== wrapper || m(managerReturn).readUInt32LE(layout.managerEntry) !== actual(0x40dc8d)) throw Error('Recovery audio real source return lineage differs.');
  const appendMemory = m(appendCall);
  if (reg(appendCall, 'ecx') !== owner + 4 || reg(appendCall, 'edi') !== wrapper || appendMemory.readUInt32LE(layout.selectorFrame - 4) !== layout.selectorFrame + 0x18 || appendMemory.readUInt32LE(layout.selectorFrame + 0x18) !== wrapper || reg(appendReturn, 'ebx') !== owner || m(appendReturn).readUInt32LE(layout.selectorFrame - 8) !== actual(0x40dcba)) throw Error('Recovery audio wrapper append pointer/return ABI differs.');
  let allocationMemory;
  if (policy.allocationMemoryDeclared) {
    const requireSpan = (row, id, address, length) => {
      const part = row.ranges.get(id);
      if (!part || number(part.address) !== address || part.bytes.length !== length) throw Error(`Recovery audio allocation memory ${id} proof differs.`);
      return part;
    };
    const wrapperInput = requireSpan(wrapperReturn, 'recovery-audio-wrapper-allocation', wrapper, 12);
    const sourceInput = requireSpan(sourceReturn, 'recovery-audio-source-allocation', source, 0x9a8);
    const sourceOutput = requireSpan(managerReturn, 'recovery-audio-created-source', source, 0x9a8);
    if (sourceOutput.bytes.readUInt32LE() !== actual(0x5d3f60)) throw Error('Recovery audio created source class differs.');
    requireSpan(managerReturn, 'recovery-audio-created-source-vtable', actual(0x5d3f60), 0x88);
    const waveform = sourceOutput.bytes.readUInt32LE(0x964);
    if (!waveform) throw Error('Recovery audio created source has no observed waveform.');
    requireSpan(managerReturn, 'recovery-audio-created-waveform', waveform, 0x440);
    allocationMemory = {verified: true, wrapper: {address: wrapper, length: 12, inputOrdinal: wrapperReturn.ordinal, inputHex: wrapperInput.bytes.toString('hex')},
      source: {address: source, length: 0x9a8, inputOrdinal: sourceReturn.ordinal, outputOrdinal: managerReturn.ordinal,
        inputSha256: sourceInput.sha256 ?? null, outputSha256: sourceOutput.sha256 ?? null, waveformAddress: waveform,
        voiceAddress: sourceOutput.bytes.readUInt32LE(0x97c), currentState: sourceOutput.bytes.readInt32LE(0x948), pendingState: sourceOutput.bytes.readInt32LE(0x94c)}};
  }
  const bindingObservations = policy.bindingSitesDeclared ? selectNativeRecoverySoundBindingSnapshots(candidates, {...layout, managerAddress: manager, actual, sourceAddress: source}) : null;
  return {...policy, controlledInput, layout, ownerAddress: owner, managerAddress: manager, wrapperAddress: wrapper, sourceAddress: source,
    ...(bindingObservations ? {bindingObservations} : {}),
    ...(policy.channelSitesDeclared ? {channelVectorObservations: selectNativeRecoverySoundChannelSnapshots(candidates, {...layout, ownerAddress: owner, wrapperAddress: wrapper, appendCall, appendReturn, actual})} : {}),
    ...(policy.playbackSitesDeclared ? {playbackCopyObservations: selectNativeRecoverySoundPlaybackCopySnapshots(candidates, {...layout, actual, sourceAddress: source, bindingObservations})} : {}),
    ...(observationActivation ? {observationActivation} : {}),
    ...(allocationMemory ? {allocationMemory} : {}),
    emitterArguments: words, selectedSnapshots: selected.map(row => ({id: row.breakpointId, observedDebugEventOrdinal: observedOrder(row), tid: row.tid, esp: reg(row, 'esp'), eip: reg(row, 'eip')})),
    genericSnapshots: rows.length, selectedCount: selected.length, unrelatedGenericSnapshots: rows.length - candidates.length,
    additionalGenericSnapshots: candidates.length - selected.length,
    serviceObservations: candidates.filter(row => !nativeRecoverySoundSites.some(([id]) => id === row.breakpointId)).map(row => ({id: row.breakpointId, ordinal: row.ordinal, observedDebugEventOrdinal: observedOrder(row), tid: row.tid, esp: reg(row, 'esp'), eip: reg(row, 'eip')})),
    limitations: ['Call/return lineage proves original allocation outputs and arguments, not allocator/constructor/playback replay.', 'State32 is declared controlled input; no naturally produced rejection is claimed.', 'Only manager/vector objects and explicitly observed readable regions are captured; absent descendant bytes remain unavailable.']};
}
