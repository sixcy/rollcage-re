//Complete existing48d680/48d7c0 source execution, never a decay-only shortcut.
//Unavailable intervening gates, tables, producers or services fail explicitly.
import {updateVehicleMotionState, updateVehicleSurfaceDrive} from '../../src/vehicle-control-state.mjs';
import {updateProceduralTexture} from '../../src/procedural-texture.mjs';
import {updateWormholeState} from '../../src/wormhole-state.mjs';
import {updateRaceWeaponStage} from '../../src/race-weapon-stage.mjs';
import {updatePeriodicBody} from '../../src/periodic-body-spawn.mjs';
import {nativeMotionStateOwnedRegions, verifyNativeMotionStateContinuationEvidence} from './native-frame-motion-continuation.mjs';
import {resolveNativeMemoryAddress, nativeCodeAddress} from '../../src/native-memory-spans.mjs';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {REDUX_SHA256} from './retained-native-program.mjs';
import {createCapturedMemory} from './captured-memory.mjs';
import {nativeFrameGlobalRegions} from './native-frame-manifest.mjs';
import {replayNativeFrame, createNativeFrameContext} from './native-frame-replay.mjs';
import {createNativeFrameGeometry} from './native-frame-geometry.mjs';
import {createNativeFrameSoundBindings, bindCapturedNativeThreadEnvironment} from './native-frame-sound.mjs';

//These are source-known module inputs, not inferred heap aliases. A future
//caller can admit only their genuinely captured bytes via additionalRegions.
export const nativeDriveModuleRegions = Object.freeze([
  ['drive-wormhole-root', 0x80b5e0, 4], ['drive-pickup-roots', 0x902020, 8], ['drive-projectile-roots', 0x9034a0, 24 * 4],
  ['drive-terrain-wave-gate', 0x90cb80, 4], ['drive-security-cookie', 0x5e8890, 4], ['drive-time-effect-output', 0x6e6cac, 8],
  //The80h table observation ends at the separate native count. Producers
  //append unchecked:16 rows are an observation bound, NOT native capacity.
  ['drive-target-registry-observation', 0x82e880, 0x80], ['drive-target-counts', 0x82e900, 8],
  ['drive-pickup-controller-observation', 0x91d480, 0x32],
  ['drive-periodic-state', 0x903510, 0x14], ['drive-periodic-selector', 0x6e6af8, 4],
  ['drive-procedural-handle', 0x5ed02c, 4], ['drive-procedural-clock', 0x5ed2c4, 4], ['drive-render-angle-table', 0x570720, 0x4000],
].map(([id, preferredAddress, length]) => Object.freeze({id, preferredAddress, length, comparison: 'mutable', evidence: '450e50→499de0/49ac30/48d7c0/469fd0 actual reached source module inputs; no initialization or fallback.'})));
export const nativeFrameDriveInputRegions = nativeDriveModuleRegions;

export function mergeNativeDriveModuleAliases(aliases, moduleBaseAddress) {
  const rows = aliases.map(row => {
    const address = Number(row.address), targetAddress = Number(row.targetAddress), length = Number(row.length);
    if (!Number.isSafeInteger(address) || address < 0x400000 || !Number.isSafeInteger(length) || length < 1 || address + length > 0x100000000
      || targetAddress !== moduleBaseAddress + address - 0x400000 || targetAddress < 0 || targetAddress + length > 0x100000000) throw Error('Drive module alias differs from the observed module identity.');
    return {address, targetAddress, length};
  }).sort((a, b) => a.address - b.address);
  const result = [];
  for (const row of rows) {
    const last = result.at(-1);
    if (last && row.address <= last.address + last.length) last.length = Math.max(last.length, row.address + row.length - last.address);
    else result.push({...row});
  }
  return result;
}

//Only actually readable descriptor bytes are admitted. Missing inputs remain
//missing until their real stage is reached; no static table is initialized.
export function nativeDriveObservedInputRegions(snapshot, moduleBaseAddress) {
  const rows = snapshot.ranges instanceof Map ? [...snapshot.ranges.values()] : snapshot.ranges, captured = createCapturedMemory(rows);
  const result = [];
  for (const region of nativeDriveModuleRegions) {
    const address = moduleBaseAddress + region.preferredAddress - 0x400000;
    try {captured.span(address, region.length);} catch {continue;}
    result.push({...region, address});
  }
  return result;
}

function subtractDeclared(region, declared) {
  let cursor = region.address;
  const end = cursor + region.length, result = [];
  for (const row of declared.sort((a, b) => a.address - b.address)) {
    if (row.address + row.length <= cursor || row.address >= end) continue;
    if (row.address > cursor) result.push({address: cursor, length: row.address - cursor});
    cursor = Math.max(cursor, row.address + row.length);
  }
  if (cursor < end) result.push({address: cursor, length: end - cursor});
  return result.map(row => ({...region, ...row, id: `${region.id}-${row.address.toString(16)}`, preferredAddress: region.preferredAddress + row.address - region.address}));
}

export function nativeDriveAdditionalFrameRegions(snapshot, options = {}) {
  const rows = snapshot.ranges instanceof Map ? [...snapshot.ranges.values()] : snapshot.ranges;
  const bases = new Set([options.moduleBaseAddress, snapshot.moduleBaseAddress, ...rows.map(row => row.moduleBaseAddress)].filter(value => value !== undefined && value !== null).map(Number));
  if (bases.size !== 1) throw Error('Drive frame requires one observed main-module base.');
  const base = [...bases][0], declared = [...nativeFrameGlobalRegions.map(row => ({address: base + row.preferredAddress - 0x400000,
    length: row.id === 'attachment-queue' ? options.attachmentWindowBytes ?? row.length : row.length})), ...(options.additionalRegions ?? [])];
  return nativeDriveObservedInputRegions(snapshot, base).flatMap(row => subtractDeclared(row, declared));
}

//Core physics runs once with the captured extra fields. Afterward compatible
//adjacent/overlapping source-known module routes merge for larger raw reads.
//The rebuilt buffers contain carried source output only, never native answers.
export async function replayNativeDriveFrame(snapshot, options = {}) {
  const additional = nativeDriveAdditionalFrameRegions(snapshot, options);
  const source = await replayNativeFrame(snapshot, {...options, additionalRegions: [...(options.additionalRegions ?? []), ...additional]});
  const manifest = {...source.manifest, aliases: mergeNativeDriveModuleAliases(source.manifest.aliases, source.manifest.moduleBaseAddress)};
  const rows = snapshot.ranges instanceof Map ? [...snapshot.ranges.values()] : snapshot.ranges;
  const captured = createCapturedMemory(rows.map(row => ({address: Number(row.address), bytes: Buffer.from(source.span(Number(row.address), row.bytes.length))})), {aliases: manifest.aliases});
  const geometry = createNativeFrameGeometry({...options.geometryOptions, memory: captured.memory});
  const threadEnvironment = bindCapturedNativeThreadEnvironment(snapshot, {memory: captured.memory});
  const sound = createNativeFrameSoundBindings({memory: captured.memory, moduleBaseAddress: manifest.moduleBaseAddress, numericalContext: source.numericalContext, nativeTls: threadEnvironment.nativeTls});
  const bound = createNativeFrameContext({memory: captured.memory, manifest, geometry, numericalContext: source.numericalContext, sound});
  return {...source, ...captured, ...bound, manifest, threadEnvironment, sound};
}

function dependency(label, address, length, cause, kind = 'missing-captured-input') {
  const error = Error(`Drive continuation ${label} requires actual native0x${address.toString(16)} (${length} bytes).`, {cause});
  error.nativeDriveDependency = {kind, label, address, length}; return error;
}
function literal(source, preferred, length, label) {
  const actual = source.manifest.moduleBaseAddress + preferred - 0x400000;
  try {source.span(actual, length);} catch (cause) {throw dependency(label, actual, length, cause);}
  try {
    if (resolveNativeMemoryAddress(source.memory, preferred, length) !== actual) throw Error('Missing explicit module input alias.');
  } catch (cause) {throw dependency(label, actual, length, cause, 'unbound-captured-module-input');}
  return actual;
}

export async function verifyNativeDriveContinuationEvidence() {
  const motion = await verifyNativeMotionStateContinuationEvidence();
  const {evidence, instructions} = await readInstructionEvidence(['295-vehicle-state-48d680-assembly.json', '3201-race-stage-48d7c0-assembly.json', '310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'});
  if (evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Drive continuation target SHA differs.');
  const listing = new Map(instructions.map(row => [row.address, row]));
  for (const [address, op, args] of [[0x48d6af, 'ADD', ['dword ptr [EAX + 0x6a8]', '0x5000']], [0x48d6bb, 'ADD', ['dword ptr [EAX + 0x6a8]', '0x3000']],
    [0x451088, 'CALL', ['0x00499de0']], [0x45108d, 'CALL', ['0x0049ac30']], [0x451092, 'CALL', ['0x0048d7c0']], [0x451097, 'CALL', ['0x00469fd0']],
    [0x48d7ca, 'CALL', ['0x0047b680']], [0x48d7cf, 'CALL', ['0x0046a7f0']], [0x48d7d4, 'CALL', ['0x00447050']], [0x48d7d9, 'CALL', ['0x0048c120']], [0x48d7de, 'CALL', ['0x0048ac00']]]) {
    const row = listing.get(address); if (row?.op !== op || JSON.stringify(row.args) !== JSON.stringify(args)) throw Error('Drive continuation retained surface producer differs.');
  }
  return {targetSha256: REDUX_SHA256, evidenceIds: [...new Set([...motion.evidenceIds, ...evidence.map(row => row.evidence_id)])]};
}

export function nativeDriveOwnedRegions(context) {
  const motion = nativeMotionStateOwnedRegions(context);
  const speed = motion.filter(row => row.id.endsWith('-speed'));
  return [...motion, ...speed.map((row, index) => ({id: `drive-car${index}-front-and-base`, address: row.address - 0x664 + 0x6a8, length: 8}))];
}

export function inspectNativeDriveInputs(source) {
  return nativeDriveModuleRegions.map(row => {
    const address = source.manifest.moduleBaseAddress + row.preferredAddress - 0x400000;
    try {const bytes = source.span(address, row.length); return {...row, address, captured: true, ...(row.length <= 8 ? {bytesHex: bytes.toString('hex')} : {})};}
    catch {return {...row, address, captured: false};}
  });
}

export function executeNativeDriveContinuation({source, pair}) {
  const owned = nativeDriveOwnedRegions({source, pair}), m = source.memory, base = source.manifest.moduleBaseAddress;
  const entryEsp = Number(pair.after.registers.esp), records = owned.filter(row => row.id.endsWith('-speed')).map((row, index) =>
    ({index, record: base + 0x509300 + index * 0x30c, body: row.address - 0x664}));
  const progress = {stage: 'motion-and-surface', calls: [], gates: [], inputs: inspectNativeDriveInputs(source)};
  const putReturn = preferred => m.writeUInt32LE(nativeCodeAddress(preferred, {moduleBaseAddress: base}), entryEsp);
  const runtime = {...source.driveRuntime, memory: m, moduleBaseAddress: base, scratchBase: entryEsp,
    roundingMode: source.numericalContext?.x87?.roundingMode ?? 'nearest-even', x87PrecisionBits: 24,
    ...(source.views ? {views: source.views} : {}), ...(source.geometry ? {grid: source.geometry.grid, models: source.geometry.modelContext, modelPointersFor: source.geometry.candidateMapping?.modelPointersFor} : {})};
  try {
    for (const {index, record, body} of records) {
      putReturn(0x45103d); updateVehicleMotionState(record, runtime);
      putReturn(0x451044); updateVehicleSurfaceDrive(record, runtime);
      progress.calls.push({index, recordAddress: record, bodyAddress: body, entryEsp, stages: ['443d90', '48d680']});
    }
    progress.stage = 'procedural-and-wormhole-gates';
    const config = m.readUInt32LE(0x5ecefc), enabled = m[config + 0x28];
    //450e50's procedural gate reads this same live root BEFORE49ac30. It
    //cannot be replaced by an assumed mode0 merely because bytes are missing.
    const root = literal(source, 0x80b5e0, 4, 'procedural/wormhole root80b5e0'), wormhole = m.readUInt32LE(root);
    let mode;
    try {mode = m.readInt32LE(wormhole + 0x188);} catch (cause) {throw dependency('wormhole mode+188', wormhole + 0x188, 4, cause);}
    progress.gates.push({stage: '499de0', enabled: Boolean(enabled), wormholeAddress: wormhole, mode, called: Boolean(enabled && mode)});
    if (enabled && mode) {literal(source, 0x5ed02c, 4, 'procedural handle'); putReturn(0x45108d); updateProceduralTexture(runtime);}
    putReturn(0x451092); updateWormholeState(runtime);
    progress.gates.push({stage: '49ac30', called: true, incomingMode: mode});
    progress.stage = 'weapon-coordinator';
    for (const [address, length, label] of [[0x902020, 8, 'pickup roots/count'], [0x9034a0, 96, '24 projectile roots'], [0x90cb80, 4, 'terrain-wave gate'],
      [0x5e8890, 4, 'terrain-wave security cookie'], [0x6e6cac, 4, 'time-effect output']]) literal(source, address, length, label);
    const gfxm = m.readUInt32LE(0x90b990), controllers = m[gfxm + 0xf7];
    if (controllers > 6) throw Error('Pickup-controller count exceeds the declared six-pointer observation; no native capacity is inferred.');
    literal(source, 0x91d480, 0x32, 'pickup-controller/pending observation');
    literal(source, 0x82e900, 8, 'target registry counts');
    const targetCount = m.readInt32LE(0x82e900);
    if (targetCount < 0 || targetCount > 16) throw Error('Target registry count exceeds the declared128-byte observation; no native capacity is inferred.');
    if (targetCount) literal(source, 0x82e880, targetCount * 8, 'observed target rows');
    const incoming = {};
    for (const name of ['ebx', 'ebp']) {
      const value = Number(pair.after.registers[name]);
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw Error(`Drive continuation requires captured parent ${name}.`);
      incoming[name.toUpperCase()] = value;
    }
    //451049 increments EDI after the live participant sweep;48d7c0's first
    //pickup pass preserves it in shared trail scratch. No arbitrary fixture EDI.
    Object.assign(incoming, {EDI: records.length, ESI: base + 0x509300 + records.length * 0x30c});
    putReturn(0x451097); updateRaceWeaponStage({...runtime, entryRegisters: incoming});
    progress.calls.push({stage: '48d7c0', entryEsp, entryRegisters: incoming});
    progress.stage = 'periodic-stage';
    const periodicEnabled = Boolean(m[m.readUInt32LE(0x5ecb1c) + 0x554]);
    if (periodicEnabled) literal(source, 0x903510, 0x14, 'periodic body state');
    putReturn(0x45109c); updatePeriodicBody(runtime);
    progress.gates.push({stage: '469fd0', called: true, enabled: periodicEnabled});
    progress.stage = 'complete';
    return progress;
  } catch (error) {error.nativeDriveContinuationProgress = progress; throw error;}
}

export async function createNativeDriveContinuation() {
  const evidence = await verifyNativeDriveContinuationEvidence();
  return Object.freeze({id: '443d90-48d680-48d7c0-native-drive-feedback', evidence, regionsFor: nativeDriveOwnedRegions, execute: executeNativeDriveContinuation});
}
