// Declarative coverage for one original 4749e0 call. This never launches or
// initializes a process, relocates pointer bytes, or supplies missing storage.
import {createCapturedMemory} from './captured-memory.mjs';

const preferredBase = 0x400000, addressSpace = 0x100000000, maxBytes = 64 * 1024 * 1024;
const hex = value => `0x${value.toString(16)}`;
const spanValid = (address, length) => Number.isSafeInteger(address) && address >= 0 && Number.isSafeInteger(length) && length > 0 && address + length <= addressSpace;
const bounded = (value, maximum, name, minimum = 1) => {if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw Error(`Invalid ${name} bound.`); return value;};
const globals = [
  ['frame-pools', 0x902b7c, 0x374, 'mutable', '428100/440410; queue, physical/group headers, arena root'],
  ['shape-pools-and-planes', 0x91e780, 0xa20, 'mutable', '428100/424ff0; pool roots and 64 plane records'],
  ['body-arena-allocation', 0x6e6b40, 8, 'mutable', '474160; allocation root and body registry count'],
  ['body-arena-size-input', 0x709808, 4, 'read-only', '474160 allocation size producer'],
  ['body-arena-cursor', 0x70dcf4, 4, 'mutable', '474670 body arena used cursor'],
  ['participant-records', 0x909300, 6 * 0x30c, 'mutable', '41dbb0; six records end exactly at clock90a548'],
  ['session-root', 0x5ecb1c, 4, 'read-only', '46e9b0/47ab30 participant/session root'],
  ['configuration-root', 0x5ecefc, 4, 'read-only', '41c080/vehicle effects configuration root'],
  ['pack-roots', 0x90b970, 0x24, 'read-only', '4287f0/424ff0 geometry/material/pack roots'],
  ['runtime-geometry-roots', 0x909240, 0x84, 'read-only', 'Loaded runtime pack/spatial/material threshold/route-basis globals through9092c3'],
  ['particle-roots', 0x6e65b4, 24, 'mutable', '480900/particle allocation roots and cursors'],
  ['skid-roots', 0x8495d0, 12, 'mutable', '483c80 current/base/end skid record pointers'],
  ['effect-rng', 0x5ec954, 8, 'mutable', 'Recovered emission RNG globals'],
  ['attachment-count', 0x6e6ba0, 4, 'mutable', 'Queued attachment count retained across4749e0'],
  ['attachment-queue', 0x902040, 1024, 'mutable', '479d20/4757a0 writes; declared observation window, not native allocation capacity'],
  ['body-registry', 0x70e200, 512 * 4, 'mutable', '41dbb0/vehicle construction registry cap512; count6e6b44'],
  ['time-state', 0x811180, 16, 'read-only', 'shared active/exempt/scale state consumed by4749e0'],
  ['gravity', 0x5eb5e0, 4, 'read-only', '47a8e0 gravity input'],
  ['clock', 0x90a548, 4, 'read-only', '427bd0 selection counter and wheel effects clock'],
  ['first-effect-and-matrix', 0x91cd60, 0x90, 'mutable', '47b280/413fc0/47a8e0 live damping coefficients, effect state and matrix scratch'],
  ['second-effect', 0x9153cc, 0x30, 'mutable', '47a8e0 secondary effect state'],
  ['vector-scratch', 0x91d360, 0x104, 'mutable', '432e30/432e70/422c70 shared vector/root scratch'],
  ['border-scratch', 0x911c00, 0x28, 'mutable', '424ff0 border diagnostic state'],
  ['wheel-query-scratch', 0x7132e0, 0x1c0, 'mutable', '488910 four72-byte probes/four40-byte outputs'],
  ['world-record-count', 0x9207e4, 4, 'read-only', '413fc0 signed record count'],
  ['world-records', 0x920800, 800, 'mutable', '47eb38 initializes50 pending model rows of16 bytes; preserve inactive tails'],
  ['rotation-scale', 0x5dc5f4, 4, 'read-only', '488910 rotation scale'],
  ['normalization-one', 0x5dc774, 4, 'read-only', '422c70 numerical constant'],
  ['normalization-scale', 0x5dca88, 4, 'read-only', '422c70 numerical constant'],
  ['sqrt-table', 0x5eb290, 384, 'read-only', '432e70 original lookup bytes'],
  ['surface-effect-threshold', 0x5dc97c, 4, 'read-only', '42c590 binary32 effect-level threshold'],
  ['effect-color-scale-first', 0x5ed2b8, 4, 'read-only', '475c30 debris color scale'],
  ['effect-color-scale-second', 0x5ed2c0, 4, 'read-only', '475c30 debris color scale'],
  ['rear-effect-frame', 0x919004, 4, 'mutable', '436630 material/frame byte publication'],
  ['active-effect-lookup-root', 0x713180, 4, 'read-only', '482730 lookup root; backing conditional on reached effect'],
  ['trig-table', 0x575228, 808, 'read-only', 'Recovered202-DWORD fixed cosine table'],
  ['yaw-table', 0x5ed030, 642, 'read-only', '47d900/retirement321-WORD yaw table'],
  ['active-vehicle-owners', 0x8495e0, 6 * 0x8c, 'mutable', 'Six native owner records; body+6bc may point outside body arena'],
  ['particle-quality-count', 0x5eb500, 8, 'read-only', 'Particle quality/count globals5eb500/5eb504; particle-pools producer'],
  ['particle-allocation-root', 0x9153c4, 4, 'read-only', 'Particle arena start; cursor9153d4 already in secondary effect span'],
  ['particle-allocation-end', 0x91900c, 4, 'read-only', 'Particle arena end consumed by periodic spawn/lifetime'],
  ['contact-thresholds', 0x570580, 16, 'read-only', 'Vehicle contact-state8-WORD profile thresholds'],
  ['sound-owner-vector-roots', 0x6f2414, 12, 'mutable', 'Sound dispatch vector begin/end/capacity; reached backing remains required'],
  ['recovery-rng-difficulty', 0x5ea4d4, 8, 'mutable', '41f380 recovery RNG/difficulty inputs'],
  ['recovery-profile-root', 0x91f6a0, 4, 'read-only', '41f380 profile lookup root; reached8-byte backing must be captured'],
  ['sound-bank-roots', 0x6e6bd4, 4, 'read-only', 'Sound sample bank root; reached handles/services remain explicit dependencies'],
  ['sound-manager-root', 0x714b08, 4, 'read-only', 'Sound dispatch manager root'],
  ['sound-scale-first', 0x5dc5b8, 4, 'read-only', 'Sound dispatch binary32 input'],
  ['sound-scale-second', 0x5dc5d0, 4, 'read-only', 'Sound dispatch binary32 input'],
  ['sound-scale-third', 0x5dc5dc, 4, 'read-only', 'Sound dispatch binary32 input'],
  ['sound-scale-fourth', 0x5dc5e8, 4, 'read-only', 'Sound dispatch binary32 input'],
  ['sound-scale-fifth', 0x5dc8e0, 4, 'read-only', 'Sound dispatch binary32 input'],
  ['sound-scale-sixth', 0x5dc920, 4, 'read-only', 'Sound dispatch binary32 input'],
  ['sound-volume-inputs', 0x5ecdb0, 8, 'read-only', 'Sound dispatch volume inputs5ecdb0/5ecdb4'],
  ['retirement-terrain-flag', 0x5ed2b4, 4, 'mutable', 'Body retirement terrain-effect flag'],
  ['retirement-particle-input', 0x9153c0, 4, 'read-only', 'Body retirement particle input'],
  ['retirement-effect-input', 0x919008, 4, 'read-only', 'Body retirement effect input'],
  ['light-registry-first', 0x80f210, 4, 'mutable', 'Reached retirement light-registry root'],
  ['light-registry-second', 0x80f41c, 4, 'mutable', 'Reached retirement light-registry root'],
  ['retirement-light-records', 0x8106e0, 16 * 36 + 4, 'mutable', 'Retirement16 light records and810920 cursor'],
];
export const nativeFrameGlobalRegions = Object.freeze(globals.map(([id, preferredAddress, length, comparison, evidence]) => Object.freeze({id, preferredAddress, length, comparison, evidence, ...(id === 'attachment-queue' ? {observationBound: true} : {})})));
function regionsFor(attachmentWindowBytes) {
  bounded(attachmentWindowBytes, 65536, 'attachmentWindowBytes');
  if (attachmentWindowBytes % 4) throw Error('Attachment observation window must align to four bytes.');
  const start = 0x902040;
  if (nativeFrameGlobalRegions.some(row => row.id !== 'attachment-queue' && start < row.preferredAddress + row.length && row.preferredAddress < start + attachmentWindowBytes)) throw Error('Attachment observation window overlaps another declared global span.');
  return nativeFrameGlobalRegions.map(row => row.id === 'attachment-queue' ? {...row, length: attachmentWindowBytes} : row);
}

// Bootstrap capture descriptors accepted unchanged by native-physics-capture.
// Dynamic coverage is subsequently checked against actual headers. Readable
// regions are one VirtualQueryEx region, never a logical-allocation guarantee.
export function nativeFrameRootRanges({stackBytesBefore, stackBytesAfter = 4, maxRegionBytes = maxBytes, attachmentWindowBytes = 1024} = {}) {
  bounded(stackBytesBefore, 65536, 'stackBytesBefore', 0); bounded(stackBytesAfter, 65536, 'stackBytesAfter'); bounded(maxRegionBytes, maxBytes, 'maxRegionBytes');
  const root = (id, address, length) => ({id, rva: hex(address - preferredBase), dereferenceOffsets: ['0'], length});
  return [
    ...regionsFor(attachmentWindowBytes).map(({id, preferredAddress, length}) => ({id, rva: hex(preferredAddress - preferredBase), length})),
    root('shape-records', 0x91e79c, 0x4800), root('shape-indices', 0x91e780, 0x300), root('candidate-arena', 0x91e788, 0x8000),
    root('physical-body-list', 0x902bc0, 0x180), root('candidate-group-lists', 0x902be0, 0x2108),
    root('collision-events', 0x902ba8, 0x28a0), root('collision-heap', 0x902bac, 0x194), root('collision-free', 0x902bb0, 0x190),
    root('session', 0x5ecb1c, 0x590), root('configuration', 0x5ecefc, 0x70), root('terrain-pack-header', 0x90b98c, 0xa0),
    {id: 'body-arena-region', rva: hex(0x6e6b40 - preferredBase), dereferenceOffsets: ['0'], readableRegion: true, maxRegionBytes},
    {id: 'frame-stack', baseRegister: 'esp', offset: String(-stackBytesBefore), length: stackBytesBefore + stackBytesAfter},
  ];
}

function rowsOf(ranges) {
  const rows = ranges instanceof Map ? [...ranges.values()] : ranges;
  if (!Array.isArray(rows) || !rows.length) throw Error('Frame manifest requires captured range rows.');
  return rows.map(row => {
    const address = Number(row.address);
    if (!Buffer.isBuffer(row.bytes) || !spanValid(address, row.bytes.length) || (row.length !== undefined && row.length !== row.bytes.length)) throw Error('Invalid or truncated captured frame range.');
    return {...row, address};
  });
}
function moduleBaseOf(snapshot, rows, requested) {
  const values = new Set([requested, snapshot.moduleBaseAddress, ...rows.map(row => row.moduleBaseAddress)].filter(value => value !== undefined && value !== null).map(Number));
  if (values.size !== 1) throw Error('Frame manifest requires one unambiguous observed main-module base.');
  const base = [...values][0];
  const globalEndRva = Math.max(...nativeFrameGlobalRegions.map(row => row.preferredAddress + row.length - preferredBase));
  if (!spanValid(base, globalEndRva)) throw Error('Invalid main-module base for frame globals.');
  return base;
}

export function buildNativeFrameManifest(snapshot, {moduleBaseAddress, stackBytesBefore, stackBytesAfter = 4, maxBodyArenaBytes = maxBytes, maxWorldRecords = 50, attachmentWindowBytes = 1024, additionalRegions = []} = {}) {
  bounded(stackBytesBefore, 65536, 'stackBytesBefore', 0); bounded(stackBytesAfter, 65536, 'stackBytesAfter'); bounded(maxBodyArenaBytes, maxBytes, 'maxBodyArenaBytes'); bounded(maxWorldRecords, 50, 'maxWorldRecords', 0);
  if (!Array.isArray(additionalRegions)) throw Error('additionalRegions must be explicit descriptors.');
  const rows = rowsOf(snapshot.ranges), mainBase = moduleBaseOf(snapshot, rows, moduleBaseAddress);
  const actual = address => mainBase + address - preferredBase;
  const frameGlobals = regionsFor(attachmentWindowBytes);
  const aliases = frameGlobals.map(({preferredAddress, length}) => ({address: preferredAddress, targetAddress: actual(preferredAddress), length}));
  // Alias admission itself verifies complete global coverage and rejects any
  // canonical range that would shadow actual captured heap bytes.
  const captured = createCapturedMemory(rows, {aliases}), {memory, span} = captured;
  const requiredRegions = [], ids = new Set();
  function requireRegion(id, address, length, comparison, evidence, extra = {}) {
    if (!id || ids.has(id) || !spanValid(address, length) || length > maxBytes || !['mutable', 'read-only', 'abi-input'].includes(comparison) || typeof evidence !== 'string' || !evidence) throw Error(`Invalid frame region descriptor: ${id}.`);
    try {span(address, length);} catch (error) {throw Error(`Missing frame region ${id} at ${hex(address)} (${length} bytes): ${error.message}`);}
    ids.add(id); const region = {id, address, length, comparison, evidence, ...extra}; requiredRegions.push(region); return region;
  }
  for (const region of frameGlobals) requireRegion(region.id, actual(region.preferredAddress), region.length, region.comparison, region.evidence, {preferredAddress: region.preferredAddress, ...(region.observationBound ? {observationBound: true} : {})});
  const attachmentCount = memory.readInt32LE(0x6e6ba0);
  if (attachmentCount < 0 || attachmentCount * 4 > attachmentWindowBytes) throw Error('Attachment count exceeds the declared observation window.');
  const ptr = address => memory.readUInt32LE(address), word = address => memory.readUInt16LE(address);
  function pointee(id, root, length, comparison, evidence) {
    const pointer = ptr(root); if (!pointer) throw Error(`Null frame root ${id} at ${hex(root)}.`);
    return requireRegion(id, pointer, length, comparison, evidence, {rootPreferredAddress: root});
  }
  const queueCapacity = bounded(ptr(0x902ba4), 4096, 'collision event capacity');
  if (ptr(0x902ba0) > queueCapacity || memory.readInt32LE(0x902bb4) < -1 || memory.readInt32LE(0x902bb4) >= queueCapacity) throw Error('Invalid captured collision queue cursors.');
  pointee('collision-events', 0x902ba8, queueCapacity * 0x68, 'mutable', '440410; observed902ba4 capacity');
  pointee('collision-heap', 0x902bac, (queueCapacity + 1) * 4, 'mutable', '440410; one-based heap');
  pointee('collision-free', 0x902bb0, queueCapacity * 4, 'mutable', '440410 free-slot array');
  pointee('shape-records', 0x91e79c, 256 * 72, 'mutable', '428100 fixed shape pool');
  const shapeIndices = pointee('shape-indices', 0x91e780, 0x300, 'mutable', '428100 shared free/active/reverse allocation');
  if (ptr(0x91e78c) !== shapeIndices.address + 0x100 || ptr(0x91e790) !== shapeIndices.address + 0x200) throw Error('Shape index roots disagree with428100 allocation layout.');
  for (const root of [0x91e784, 0x91e794]) if (memory.readInt32LE(root) < -1 || memory.readInt32LE(root) > 255) throw Error('Shape index cursor exceeds its fixed256-byte array.');
  if (ptr(0x91e798) > 256) throw Error('Allocated shape count exceeds256 records.');
  pointee('candidate-arena', 0x91e788, 2048 * 16, 'mutable', '428100 fixed candidate pool');
  const physicalList = pointee('physical-body-list', 0x902bc0, 0x180, 'mutable', '428100 fixed96-pointer physical list');
  const physicalCount = word(0x902bc4);
  if (physicalCount >= 96 || ptr(physicalList.address + physicalCount * 4) !== 0) throw Error('Physical list lacks its bounded trailing null.');
  const groupLists = pointee('candidate-group-lists', 0x902be0, 0x2108, 'mutable', '428100:64 ordinary33-pointer lists plus two-pointer refresh list');
  const groupCount = memory.readInt32LE(0x902bcc);
  if (groupCount < 0 || groupCount > 64) throw Error('Candidate group count exceeds64 ordinary groups.');
  const bodyLists = [{address: physicalList.address, capacity: 96}];
  for (let index = 0; index < 65; index++) {
    const header = 0x902be0 + index * 12, pointer = ptr(header), capacity = index === 64 ? 2 : 33;
    if (pointer !== groupLists.address + index * 132 || word(header + 4) > capacity) throw Error(`Invalid candidate group${index} list root/count.`);
    bodyLists.push({address: pointer, capacity});
  }
  // 474160 adds decimal140000 then SHL5 in32 bits. Validate the actual
  // wrapped unsigned allocation request, not an unbounded host multiplication.
  const arenaSizeInput = memory.readInt32LE(0x709808), arenaSize = ((arenaSizeInput + 140000) << 5) >>> 0;
  bounded(arenaSize, maxBodyArenaBytes, 'body arena allocation size');
  const arena = pointee('body-arena-allocation-bytes', 0x6e6b40, arenaSize, 'mutable', '474160 observed allocation-size producer');
  const arenaBase = ptr(0x902eec), cursor = ptr(0x70dcf4);
  if (arenaBase !== Math.ceil(arena.address / 128) * 128 || arenaBase + cursor > arena.address + arena.length) throw Error('Body arena alignment/used cursor exceeds its captured allocation.');
  const session = pointee('session', 0x5ecb1c, 0x590, 'mutable', 'participant/effect inputs consumed by4749e0');
  pointee('configuration', 0x5ecefc, 0x70, 'read-only', '41c080/effect configuration input');
  pointee('terrain-pack-header', 0x90b98c, 0xa0, 'read-only', '4287f0/424ff0 runtime pack roots; descendants require explicit mappings');
  const participantCount = memory[session.address + 0x54d];
  if (participantCount > 6) throw Error('Participant count exceeds six records before clock90a548.');
  if (memory.readInt32LE(session.address + 0x57c) !== 4) throw Error('Whole-frame manifest requires captured active phase4.');
  const bodyStorage = new Map();
  function body(pointer, length, label) {
    if (!pointer || pointer < arenaBase || pointer + length > arenaBase + cursor || (pointer - arenaBase) % 128) throw Error(`Invalid arena body pointer: ${label}.`);
    span(pointer, length); bodyStorage.set(pointer, Math.max(length, bodyStorage.get(pointer) ?? 0));
  }
  for (let index = 0; index < physicalCount; index++) body(ptr(physicalList.address + index * 4), 0x180, `physical${index}`);
  for (let index = 0; index < participantCount; index++) body(ptr(actual(0x909300 + index * 0x30c)), 0x3e78, `participant${index}`);
  const worldCount = memory.readInt32LE(0x9207e4);
  bounded(worldCount, maxWorldRecords, 'world record count', 0);
  const esp = Number(snapshot.registers?.esp);
  if (!Number.isSafeInteger(esp)) throw Error('Captured entry ESP is required.');
  requireRegion('frame-stack', esp - stackBytesBefore, stackBytesBefore + stackBytesAfter, 'abi-input', 'Explicit caller-declared reached scratch bound; depth proof remains required');
  for (const region of additionalRegions) {
    const {id, address, length, comparison, evidence, preferredAddress} = region;
    requireRegion(id, Number(address), length, comparison, evidence, preferredAddress === undefined ? {} : {preferredAddress});
    if (preferredAddress !== undefined) {
      if (!Number.isSafeInteger(preferredAddress) || Number(address) !== actual(preferredAddress)) throw Error('Additional module alias disagrees with the observed module base.');
      aliases.push({address: preferredAddress, targetAddress: Number(address), length});
    }
  }
  // Dynamic explicit module spans receive the same overlap/coverage checks.
  createCapturedMemory(rows, {aliases});
  return {
    schemaVersion: 1, boundary: '0x4749e0', moduleBaseAddress: mainBase, preferredBaseAddress: preferredBase,
    aliases, requiredRegions, bodyLists, bodyStorage: [...bodyStorage].map(([address, length]) => ({address, length})), entryRegisters: {...snapshot.registers},
    observed: {queueCapacity, physicalCount, participantCount, groupCount, arenaBaseAddress: arenaBase, arenaAllocationBytes: arenaSize, arenaUsedBytes: cursor, worldCount, attachmentCount, attachmentWindowBytes, entryEsp: esp},
    status: 'core-coverage-validated-reached-dependencies-unresolved',
    unresolvedDependencies: ['terrain-spatial-region-and-model-runtime-mappings', 'all-reached-spatial-neighbor-identities', 'scripted-body-and-active-effect-producers', 'reached-filter-emission-particle-debris-skid-and-sound-state', 'retained-callgraph-stack-depth-and-ABI-alias-proof', 'captured-numerical-context-and-supported-PC24-operations'],
  };
}

// No pose-only/excluded-byte comparison: all declared semantic bytes are
// compared. ABI input/scratch is separate by default and may be requested.
export function compareNativeFrameRegions(manifest, expectedRanges, actualRanges, {includeAbi = false} = {}) {
  const expected = createCapturedMemory(rowsOf(expectedRanges)), actual = createCapturedMemory(rowsOf(actualRanges));
  let comparedBytes = 0;
  for (const region of manifest.requiredRegions) {
    if (region.comparison === 'abi-input' && !includeAbi) continue;
    const left = expected.span(region.address, region.length), right = actual.span(region.address, region.length);
    for (let offset = 0; offset < region.length; offset++) if (left[offset] !== right[offset]) return {matched: false, comparedBytes, divergence: {regionId: region.id, comparison: region.comparison, address: region.address + offset, offset, expectedByte: left[offset], actualByte: right[offset]}};
    comparedBytes += region.length;
  }
  return {matched: true, comparedBytes};
}
