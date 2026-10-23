import {lstat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createControlledNativeRecoveryCaptureConfig} from './prepare-controlled-native-recovery-capture.mjs';
import {nativeRecoverySoundGraphRanges, nativeRecoverySoundGenericBreakpoints, nativeRecoverySoundSitesFor, verifyNativeRecoverySoundCaptureConfiguration} from './lib/native-recovery-sound-selection.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export async function verifyNativeRecoverySoundGraphEvidence() {
  const {evidence, instructions} = await readInstructionEvidence(['098-post-frame-body-states-assembly.json', '153-sound-channel-selection-assembly.json',
    '9122-audio-manager-base-assembly.json', '9126-audio-virtual-4a7710-procedure_assembly.json', '11601-audio-sample-factory-4a7460.json'], {directory: 'analysis/native-simulation/results'});
  if (evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Recovery audio graph target SHA differs.');
  const listing = new Map(instructions.map(row => [row.address, row]));
  for (const [address, op, args] of [
    [0x47cf58, 'PUSH', ['ECX']], [0x47cf69, 'CALL', ['0x00484bb0']], [0x47cf6e, 'MOV', ['EBX', 'dword ptr [ESP + 0x40]']],
    [0x40dc4e, 'PUSH', ['0xc']], [0x40dc50, 'CALL', ['dword ptr [0x0056e220]']], [0x40dc56, 'MOV', ['EDI', 'EAX']],
    [0x40dc8a, 'CALL', ['dword ptr [EDX + 0x14]']], [0x40dc8d, 'MOV', ['dword ptr [EDI]', 'EAX']],
    [0x40dcb5, 'CALL', ['0x0040ebc0']], [0x40dcba, 'MOV', ['EDI', 'dword ptr [ESP + 0x18]']],
    [0x4a7725, 'SUB', ['ESP', '0x430']], [0x4a78ae, 'SUB', ['ESP', '0x18']], [0x4a7902, 'CALL', ['0x004a7460']],
    [0x4a7475, 'SUB', ['ESP', '0x814']], [0x4a7483, 'PUSH', ['0x9a8']], [0x4a7493, 'CALL', ['dword ptr [0x0056e220]']], [0x4a7499, 'MOV', ['EBX', 'EAX']], [0x4a7514, 'SUB', ['ESP', '0x400']],
    ...[[0x4a586d, 0x830], [0x4a5896, 0x834], [0x4a58bf, 0x838], [0x4a58e8, 0x83c], [0x4a5911, 0x840], [0x4a5990, 0x84c]].map(([address, offset]) => [address, 'MOV', [`dword ptr [EDI + 0x${offset.toString(16)}]`, 'EAX']]),
  ]) {
    const row = listing.get(address);
    if (row?.op !== op || JSON.stringify(row.args) !== JSON.stringify(args)) throw Error(`Recovery audio retained boundary differs at0x${address.toString(16)}.`);
  }
  return {evidenceIds: evidence.map(row => row.evidence_id)};
}

export async function verifyNativeRecoverySoundServiceEvidence() {
  const {evidence, instructions} = await readInstructionEvidence(['11619-audio-sample-graph-4ad7e0.json', '11727-audio-sample-backend-4b1d30.json',
    '11622-audio-sample-graph-4a7b40.json', '11733-audio-sample-backend-4a79f0.json', '11601-audio-sample-factory-4a7460.json',
    '9295-audio-control-4ad9e0-procedure_assembly.json', '9113-audio-chain-4b0eb0-procedure_assembly.json',
    '11613-audio-sample-graph-4a4460.json', '11592-audio-sample-factory-4a7fc0.json', '11607-audio-sample-graph-4a3ac0.json',
    '11663-audio-path-runtime-lookup.json'], {directory: 'analysis/native-simulation/results'});
  if (evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Recovery audio service target SHA differs.');
  const listing = new Map(instructions.map(row => [row.address, row]));
  for (const [address, op, args] of [
    [0x4ad7e0, 'PUSH', ['-0x1']], [0x4ad8de, 'RET', ['0x1c']],
    [0x4b1daf, 'CALL', ['dword ptr [EDX + 0x20]']], [0x4b1db2, 'TEST', ['EAX', 'EAX']],
    [0x4a7b56, 'MOV', ['ECX', 'dword ptr [EAX]']],
    [0x4a7a05, 'CALL', ['dword ptr [0x0056e09c]']], [0x4a7a0b, 'INC', ['dword ptr [EDI + 0x18]']], [0x4a7a53, 'POP', ['EDI']],
    [0x4a7691, 'CALL', ['dword ptr [0x0056e09c]']], [0x4a7697, 'INC', ['dword ptr [ESI + 0x18]']], [0x4a76c0, 'MOV', ['dword ptr [ESP + 0x82c]', '0xffffffff']],
    [0x4adaaa, 'CALL', ['dword ptr [0x0056e09c]']], [0x4adab0, 'INC', ['dword ptr [EDI + 0x18]']], [0x4adad9, 'MOV', ['EAX', 'dword ptr [ESP + 0x24]']],
    [0x4b0f4e, 'MOV', ['dword ptr [EDI + 0xd70]', '0x0']],
    [0x4a4466, 'MOV', ['EAX', '0x241c']], [0x4a446b, 'CALL', ['0x00568980']],
    [0x4a7fc6, 'SUB', ['ESP', '0xc00']], [0x4a3ac6, 'SUB', ['ESP', '0xa50']], [0x4030c6, 'SUB', ['ESP', '0x60c']],
  ]) {
    const row = listing.get(address);
    if (row?.op !== op || JSON.stringify(row.args) !== JSON.stringify(args)) throw Error(`Recovery audio service boundary differs at0x${address.toString(16)}.`);
  }
  return {evidenceIds: evidence.map(row => row.evidence_id)};
}

export async function createNativeRecoverySoundCaptureConfig(directory, output, options = {}) {
  if (options.includeBindingSites !== undefined && typeof options.includeBindingSites !== 'boolean') throw Error('Sound binding option must be boolean.');
  if (options.includeChannelSites !== undefined && typeof options.includeChannelSites !== 'boolean') throw Error('Sound channel option must be boolean.');
  if (options.includePlaybackSites !== undefined && typeof options.includePlaybackSites !== 'boolean') throw Error('Sound playback option must be boolean.');
  if (options.includePlaybackSites && !options.includeChannelSites) throw Error('Sound playback observations require the complete channel profile.');
  if (options.includeChannelSites && !options.includeBindingSites) throw Error('Sound channel observations require the complete binding profile.');
  if (options.includeBindingSites && (!options.includeServiceSites || !options.includeAllocations || !options.includeVectorStorage || options.deferObservationsUntilControlledCaller !== true)) throw Error('Sound bindings require services, allocations, vector storage and deferred observations.');
  const stackBytesBefore = options.includeServiceSites ? 24576 : 8192;
  const evidence = await verifyNativeRecoverySoundGraphEvidence(), result = await createControlledNativeRecoveryCaptureConfig(directory, output, {stackBytesBefore, ...options});
  const graph = nativeRecoverySoundGraphRanges(options), config = result.configuration;
  for (const bp of config.breakpoints.filter(row => ['native-recovery-before', 'native-recovery-after'].includes(row.id))) bp.ranges.push(...structuredClone(graph));
  config.breakpoints.push(...nativeRecoverySoundGenericBreakpoints(options));
  config.pendingFrameObserver.nestedBreakpointIds = nativeRecoverySoundSitesFor(options).map(([id]) => id);
  config.pendingFrameObserver.maxNestedSnapshots = 115;
  if (options.deferObservationsUntilControlledCaller === true) {
    if (!options.includeServiceSites) throw Error('Deferred sound observations require the explicit rich services profile.');
    config.pendingFrameObserver.nestedCaptureScope = 'frame-thread';
    config.observationActivation = {breakpointId: 'controlled-recovery-caller', rawHit: 229, observationBreakpointIds: config.pendingFrameObserver.nestedBreakpointIds.slice()};
  } else if (options.deferObservationsUntilControlledCaller !== undefined && options.deferObservationsUntilControlledCaller !== false) throw Error('Deferred sound observation option must be boolean.');
  const policy = verifyNativeRecoverySoundCaptureConfiguration(config);
  const services = options.includeServiceSites ? await verifyNativeRecoverySoundServiceEvidence() : {evidenceIds: []};
  const bindings = options.includeBindingSites ? await verifyNativeRecoverySoundBindingEvidence() : {evidenceIds: []};
  const channel = options.includeChannelSites ? await verifyNativeRecoverySoundChannelEvidence() : {evidenceIds: []};
  const playback = options.includePlaybackSites ? await verifyNativeRecoverySoundPlaybackEvidence() : {evidenceIds: []};
  return {...result, soundSelection: policy, evidenceIds: [...new Set([...result.evidenceIds, ...evidence.evidenceIds, ...services.evidenceIds, ...bindings.evidenceIds, ...channel.evidenceIds, ...playback.evidenceIds])], limitations: [
    `${nativeRecoverySoundSitesFor(options).length} generic phase4 sites share the unchanged350-snapshot cap; at most115 generic observations fit after startup/caller/selected-parent evidence.`,
    options.includeServiceSites
      ? 'The rich parent observes24576 declared stack bytes: the proven manager/factory/path chain includes frames588h+830h+400h+c08h+a50h+2428h+618h (21072 bytes), plus bounded caller/service arguments. The128MiB pending byte bound is unchanged.'
      : 'The parent stack observation defaults to8192 declared bytes for the recovered outer factory, inner830h frame and additional400h path frame; deeper services may still require unavailable bytes.',
    'Generic observations are not assigned to recovery until strict posthoc same-thread, actual-ESP, clock and relocated call/return lineage proof.',
    ...(options.deferObservationsUntilControlledCaller ? ['Rich observer sites remain unpatched until all controlled caller229 guards complete; nested snapshots then require the active parent thread. Background original instructions still execute.'] : []),
    'Only separately allocated12-byte manager vector objects are chased; empty vector storage is never dereferenced.',
    ...(options.includeVectorStorage ? ['Actual vector capacity storage is bounded at65536 bytes per vector by default; empty headers publish no storage bytes.'] : []),
    ...(options.includeAllocations ? ['Allocator-return memory precedes game construction; initialized source/waveform observations are outputs, never replacement constructor inputs.'] : []),
    ...(options.includeServiceSites ? ['Rich sites observe the actual manager object through+d70 (0xd74 bytes), preserving the128MiB pending-buffer bound rather than repeatedly reading its containing heap region.'] : []),
    ...(options.includeBindingSites ? ['Binding sites preserve real file-service preimages/results and playback allocation inputs; the exact requested allocation slice must fit its bounded observed readable region. No service result, logger ECX or initialized output is invented. Conditional retries consume observations only when reached; unchanged115/350 caps may fail closed.'] : []),
    ...(options.includeChannelSites ? ['Channel sites observe actual four-byte vector allocation before append and zero-length memmove destination before/after; selection requires the original empty owner-vector growth chain. All new sites retain phase4 predicates and the unchanged frame-thread/budget policy.'] : []),
    ...(options.includePlaybackSites ? ['Two final memcpy sites observe real args,32-byte destination preimage/output,21-byte source and returned raw CPU context. Source Playing-prefix filtering has separate actual phase4/clock/frame-thread proof. Only the native fresh len20/request32 branch is supported; logger ECX must equal the observed final memcpy return across the proved game no-writer tail.'] : []),
    'A null/unreadable manager or vector object is an explicit missing dependency; no fallback object is supplied.', ...result.limitations]};
}
async function requireNew(filename) {try {await lstat(filename);} catch (error) {if (error.code === 'ENOENT') return; throw error;} throw Error(`Refusing existing recovery sound output: ${filename}`);}
export async function prepareNativeRecoverySoundCapture(directory, output, filename, options = {}) {
  const result = await createNativeRecoverySoundCaptureConfig(directory, output, options);
  await requireNew(result.configuration.outputDirectory); await requireNew(filename);
  await writeFile(filename, `${JSON.stringify(result.configuration, null, 2)}\n`, {flag: 'wx'});
  return {configuration: path.resolve(filename), output: result.configuration.outputDirectory, authority: result.authority, soundSelection: result.soundSelection,
    evidence: result.evidenceIds, method: 'Prepared only: controlled recovery input with bounded generic sound call/return observations; no process launched.', limits: result.limitations};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, output, filename, mode] = process.argv.slice(2);
  if (!directory || !output || !filename || process.argv.length > 6 || mode !== undefined && !['allocations', 'services', 'services-deferred', 'services-bindings', 'services-channel', 'services-playback'].includes(mode)) throw Error('Usage: node tools/prepare-native-recovery-sound-capture.mjs ISOLATED_ROOT NEW_CAPTURE_DIRECTORY NEW_CONFIG_FILE [allocations|services|services-deferred|services-bindings|services-channel|services-playback]');
  console.log(JSON.stringify(await prepareNativeRecoverySoundCapture(directory, output, filename, mode ? {includeAllocations: true, includeVectorStorage: true, includeServiceSites: mode !== 'allocations', ...(['services-deferred', 'services-bindings', 'services-channel', 'services-playback'].includes(mode) ? {deferObservationsUntilControlledCaller: true} : {}), ...(['services-bindings', 'services-channel', 'services-playback'].includes(mode) ? {includeBindingSites: true} : {}), ...(['services-channel', 'services-playback'].includes(mode) ? {includeChannelSites: true} : {}), ...(mode === 'services-playback' ? {includePlaybackSites: true} : {})} : {})));
}

export async function verifyNativeRecoverySoundPlaybackEvidence() {
  const {evidence, instructions} = await readInstructionEvidence(['3663-weather-405310-procedure_assembly.json', '3703-weather-405860-procedure_assembly.json', '9311-audio-control-4a2b40-procedure_assembly.json', '9295-audio-control-4ad9e0-procedure_assembly.json'], {directory: 'analysis/native-simulation/results'});
  if (evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Recovery playback copy target SHA differs.');
  const listing = new Map(instructions.map(row => [row.address, row]));
  for (const [address, op, args] of [
    [0x4053a4, 'MOV', ['EAX', 'dword ptr [ESI]']], [0x4053d2, 'PUSH', ['EDI']], [0x4053d3, 'PUSH', ['EBX']], [0x4053d4, 'PUSH', ['EAX']], [0x4053d5, 'CALL', ['0x00568a48']],
    [0x405926, 'TEST', ['EBX', 'EBX']], [0x405928, 'JZ', ['0x00405973']], [0x405977, 'JC', ['0x00405984']],
    [0x40598a, 'MOV', ['dword ptr [ESI]', 'EAX']], [0x40598c, 'MOV', ['dword ptr [ESI + 0x14]', 'EDI']], [0x40598f, 'MOV', ['dword ptr [ESI + 0x10]', 'EBX']], [0x405999, 'MOV', ['byte ptr [ESI + EBX*0x1]', '0x0']],
  ]) {const row = listing.get(address); if (row?.op !== op || JSON.stringify(row.args) !== JSON.stringify(args)) throw Error(`Recovery playback copy boundary differs at0x${address.toString(16)}.`);}
  // Exact reached sequences, including every instruction, establish the
  // absence of ECX writers or further external calls between CRT and logger.
  const ranges = [[0x4053da, 0x4053f1], [0x4a2b9b, 0x4a2ba8], [0x4ada5a, 0x4ada5d]];
  const tail = ranges.flatMap(([start, end]) => instructions.filter(row => row.address >= start && row.address <= end));
  const expected = [
    [0x4053da, 'ADD', ['ESP', '0xc']], [0x4053dd, 'CMP', ['dword ptr [ESI + 0x14]', '0x10']], [0x4053e1, 'MOV', ['dword ptr [ESI + 0x10]', 'EDI']], [0x4053e4, 'JC', ['0x004053f4']],
    [0x4053e6, 'MOV', ['EAX', 'dword ptr [ESI]']], [0x4053e8, 'MOV', ['byte ptr [EAX + EDI*0x1]', '0x0']], [0x4053ec, 'MOV', ['EAX', 'ESI']],
    [0x4053ee, 'POP', ['EDI']], [0x4053ef, 'POP', ['ESI']], [0x4053f0, 'POP', ['EBX']], [0x4053f1, 'RET', ['0x8']],
    [0x4a2b9b, 'MOV', ['EAX', 'dword ptr [ESP + 0x1004]']], [0x4a2ba2, 'ADD', ['ESP', '0x1000']], [0x4a2ba8, 'RET', []],
    [0x4ada5a, 'ADD', ['ESP', '0xc']], [0x4ada5d, 'CALL', ['0x004a2290']],
  ].map(([address, op, args]) => ({address, op, args}));
  if (JSON.stringify(tail) !== JSON.stringify(expected)) throw Error('Recovery playback memcpy-to-logger no-ECX-writer sequence differs.');
  return {evidenceIds: evidence.map(row => row.evidence_id), noEcxWriterAfterMemcpy: true, reachedTailInstructionCount: tail.length};
}

export async function verifyNativeRecoverySoundChannelEvidence() {
  const {evidence, instructions} = await readInstructionEvidence(['11109-renderer-producer-40ebc0-assembly.json', '3852-image-pointer-growth-assembly.json', '3874-image-pointer-reserve-assembly.json'], {directory: 'analysis/native-simulation/results'});
  if (evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Recovery channel target SHA differs.');
  const listing = new Map(instructions.map(row => [row.address, row]));
  for (const [address, op, args] of [
    [0x40ebc0, 'PUSH', ['ESI']], [0x40ebc3, 'PUSH', ['EDI']], [0x40ec03, 'PUSH', ['ECX']], [0x40ec06, 'CALL', ['0x0040edc0']], [0x40ec0b, 'MOV', ['ECX', 'dword ptr [ESI + 0x4]']],
    [0x40ee1d, 'MOV', ['dword ptr [ESP + 0x4]', 'EDX']], [0x40ee21, 'JMP', ['0x0040f060']],
    [0x40f060, 'PUSH', ['EBX']], [0x40f065, 'PUSH', ['ESI']], [0x40f068, 'PUSH', ['EDI']],
    [0x40f077, 'LEA', ['EAX', '[EBX*0x4 + 0x0]']], [0x40f07e, 'PUSH', ['EAX']], [0x40f07f, 'CALL', ['dword ptr [0x0056e220]']], [0x40f085, 'MOV', ['ESI', 'EAX']],
    [0x40f09b, 'PUSH', ['EBP']], [0x40f09f, 'PUSH', ['EAX']], [0x40f0a0, 'PUSH', ['ECX']], [0x40f0a1, 'PUSH', ['ESI']],
    [0x40f0a2, 'CALL', ['dword ptr [0x0056e478]']], [0x40f0a8, 'MOV', ['EAX', 'dword ptr [EDI]']],
    [0x40f0b7, 'JZ', ['0x0040f0c3']], [0x40f0c6, 'MOV', ['dword ptr [EDI]', 'ESI']], [0x40f0d5, 'RET', ['0x4']],
  ]) {const row = listing.get(address); if (row?.op !== op || JSON.stringify(row.args) !== JSON.stringify(args)) throw Error(`Recovery channel boundary differs at0x${address.toString(16)}.`);}
  return {evidenceIds: evidence.map(row => row.evidence_id)};
}

export async function verifyNativeRecoverySoundBindingEvidence() {
  const {evidence, instructions} = await readInstructionEvidence([
    '3703-weather-405860-procedure_assembly.json', '3663-weather-405310-procedure_assembly.json',
    '9311-audio-control-4a2b40-procedure_assembly.json', '9295-audio-control-4ad9e0-procedure_assembly.json',
    '12172-sound-record-0x4a2290-procedure_assembly.json', '11607-audio-sample-graph-4a3ac0.json',
    '11595-audio-sample-factory-4a3b40.json', '11598-audio-sample-factory-4a2af0.json',
    '9126-audio-virtual-4a7710-procedure_assembly.json', '11733-audio-sample-backend-4a79f0.json',
    '9128-audio-virtual-4b1dd0-procedure_assembly.json', '12185-audio-polling-0x4b2360-procedure_assembly.json',
    '12250-audio-mixer-id-procedure_assembly.json',
    '11592-audio-sample-factory-4a7fc0.json', '11601-audio-sample-factory-4a7460.json',
  ], {directory: 'analysis/native-simulation/results'});
  if (evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Recovery binding target SHA differs.');
  const listing = new Map(instructions.map(row => [row.address, row]));
  const expected = [
    [0x4a77b6, 'CALL', ['0x004a7fc0']], [0x4a7554, 'CALL', ['0x004a7fc0']], [0x4a7fd1, 'CALL', ['0x004a3ac0']],
    [0x4a7fc0, 'PUSH', ['EBP']], [0x4a7fc3, 'AND', ['ESP', '0xfffffff8']], [0x4a7fc6, 'SUB', ['ESP', '0xc00']],
    [0x4a3ac0, 'PUSH', ['EBP']], [0x4a3ac3, 'AND', ['ESP', '0xfffffff8']], [0x4a3ac6, 'SUB', ['ESP', '0xa50']],
    [0x4ad9e0, 'PUSH', ['EBP']], [0x4ad9e3, 'AND', ['ESP', '0xfffffff8']], [0x4ad9fb, 'SUB', ['ESP', '0x24']], [0x4ad9fe, 'PUSH', ['ESI']], [0x4ada01, 'PUSH', ['EDI']],
    [0x4ada4a, 'PUSH', ['EAX']], [0x4ada4f, 'PUSH', ['0x5d3f00']], [0x4ada54, 'PUSH', ['EAX']],
    [0x4a2b40, 'MOV', ['EAX', '0x1000']], [0x4a2b45, 'CALL', ['0x00568980']], [0x4a2b89, 'PUSH', ['ECX']], [0x4a2b95, 'PUSH', ['EAX']],
    [0x405310, 'PUSH', ['EBX']], [0x405315, 'PUSH', ['ESI']], [0x405373, 'PUSH', ['EDI']], [0x40538f, 'PUSH', ['dword ptr [ESI + 0x10]']], [0x405394, 'PUSH', ['EDI']],
    [0x405860, 'PUSH', ['EBP']], [0x405871, 'SUB', ['ESP', '0xc']], [0x405874, 'PUSH', ['EBX']], [0x405875, 'PUSH', ['ESI']], [0x405876, 'PUSH', ['EDI']], [0x40587e, 'PUSH', ['EAX']], [0x4058e0, 'PUSH', ['ECX']],
    [0x4058e1, 'CALL', ['dword ptr [0x0056e220]']], [0x4058e7, 'ADD', ['ESP', '0x4']], [0x4a2290, 'PUSH', ['ECX']],
    [0x405395, 'CALL', ['0x00405860']], [0x40539a, 'TEST', ['EDI', 'EDI']],
    [0x4a2b96, 'CALL', ['0x00405310']], [0x4a2b9b, 'MOV', ['EAX', 'dword ptr [ESP + 0x1004]']],
    [0x4ada55, 'CALL', ['0x004a2b40']], [0x4ada5a, 'ADD', ['ESP', '0xc']], [0x4ada5d, 'CALL', ['0x004a2290']], [0x4ada62, 'MOV', ['EAX', '[0x00714b18]']],
    [0x4a3b1e, 'CALL', ['dword ptr [0x0056e084]']], [0x4a3b24, 'CMP', ['EAX', '-0x1']], [0x4a3b2a, 'CALL', ['dword ptr [0x0056e110]']], [0x4a3b30, 'MOV', ['EAX', 'dword ptr [ESP]']],
    [0x4a3c06, 'CALL', ['dword ptr [0x0056e07c]']], [0x4a3c0c, 'MOV', ['EBX', 'dword ptr [EBP + 0x8]']],
    [0x4a3c16, 'CALL', ['dword ptr [0x0056e0e4]']], [0x4a3c1c, 'CMP', ['EAX', '0x21']],
    [0x4a3c23, 'CALL', ['dword ptr [0x0056e0cc]']], [0x4a3c29, 'PUSH', ['0x0']],
    [0x4a3c3f, 'CALL', ['dword ptr [0x0056e07c]']], [0x4a3c45, 'MOV', ['dword ptr [EBX]', 'EAX']],
    [0x4a7807, 'CALL', ['dword ptr [0x0056e078]']], [0x4a780d, 'TEST', ['EAX', 'EAX']],
    [0x4a2b2c, 'CALL', ['dword ptr [0x0056e0bc]']], [0x4a2b32, 'MOV', ['dword ptr [ESI]', '0xffffffff']],
    [0x4a789d, 'CALL', ['dword ptr [0x0056e0bc]']], [0x4a78a3, 'MOV', ['dword ptr [ESP + 0x414]', '0xffffffff']],
    [0x4a7a26, 'CALL', ['dword ptr [EAX]']], [0x4b1dee, 'PUSH', ['0x50']], [0x4b1df8, 'CALL', ['dword ptr [0x0056e220]']],
    [0x4b23dd, 'MOV', ['dword ptr [ESI + 0x48]', 'EAX']], [0x4b23e0, 'MOV', ['dword ptr [ESI + 0x4c]', '0x3f800000']],
    [0x4a92e0, 'MOV', ['EAX', 'dword ptr [ECX + 0x8]']], [0x4a92e3, 'RET', []],
  ];
  for (const [address, op, args] of expected) {
    const row = listing.get(address);
    if (row?.op !== op || JSON.stringify(row.args) !== JSON.stringify(args)) throw Error(`Recovery binding boundary differs at0x${address.toString(16)}.`);
  }
  return {evidenceIds: evidence.map(row => row.evidence_id)};
}
