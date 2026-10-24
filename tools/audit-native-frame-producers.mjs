//Read-only attribution audit of saved after→next-entry changes. Storage
//membership alone is NEVER presented as proof of its individual writer.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeFrameSnapshots} from './check-native-frame-replay.mjs';
import {createNativeFrameMemory as createCapturedMemory} from './lib/native-frame-memory.mjs';
import {buildNativeFrameManifest} from './lib/native-frame-manifest.mjs';
import {expandNativeFramePatchRuns} from './lib/native-frame-sequence.mjs';
import {createNativeMotionStateContinuation} from './lib/native-frame-motion-continuation.mjs';
import {inspectNativeFrameScenario} from './lib/native-frame-scenario.mjs';
import {updateVehicleSurfaceDrive} from '../src/vehicle-control-state.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const defaultReports = ['three-compact', 'moving-union', 'turn-compact'].map(name => `analysis/native-frame-sequence-${name}-20261022/report.json`);

export async function auditNativeFrameProducers({reportPaths = defaultReports} = {}) {
  const producer = await createNativeMotionStateContinuation();
  const storage = await readInstructionEvidence(['2553-vehicle-block-init-assembly.json', '967-world-particle-storage-initialize-assembly.json',
    '1052-world-debris-pool-initialize-assembly.json', '295-vehicle-state-48d680-assembly.json'], {directory: 'analysis/native-simulation/results'});
  if (storage.evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Producer storage evidence target differs.');
  const windows = [];
  for (const filename of reportPaths) {
    const original = await readFile(filename), report = JSON.parse(original);
    if (!report.matched || report.targetSha256 !== REDUX_SHA256 || report.schemaVersion !== 2) throw Error('Producer audit requires a matching retained baseline sequence.');
    const capture = await loadPhysicsCapture(report.captureDirectory, {expectedSha256: REDUX_SHA256});
    const configuration = JSON.parse(await readFile(path.join(report.captureDirectory, 'configuration.json'))), pairing = pairNativeFrameSnapshots(capture, configuration);
    const transitions = [];
    for (const [index, ledger] of report.transitions.entries()) {
      const pair = pairing.pairs[index], nextPair = pairing.pairs[index + 1], manifest = buildNativeFrameManifest(pair.after, pairing.options);
      const after = createCapturedMemory([...pair.after.ranges.values()], {aliases: manifest.aliases}), next = createCapturedMemory([...nextPair.before.ranges.values()]);
      const {memory: m} = after, actual = preferred => manifest.moduleBaseAddress + preferred - 0x400000, ptr = preferred => m.readUInt32LE(actual(preferred));
      const cars = Array.from({length: manifest.observed.participantCount}, (_, i) => ptr(0x909300 + i * 0x30c));
      const particle = ptr(0x9153c4), particleEnd = ptr(0x91900c), nodeBase = m.readUInt32LE(ptr(0x90b98c) + 0x38), nodeCount = m.readUInt32LE(ptr(0x90b990) + 12);
      const arena = manifest.requiredRegions.find(row => row.id === 'body-arena-allocation-bytes');
      const groups = [...cars.flatMap(address => [
        {id: 'participant-body-and-controls', address, length: 0x728},
        {id: 'participant-inline-effect-storage', address: address + 0x728, length: 0x223c},
        {id: 'participant-other-tail-storage', address: address + 0x2964, length: 0x1514},
      ]), {id: 'particle-storage', address: particle, length: particleEnd - particle},
      {id: 'debris-storage', address: ptr(0x902b84), length: 0x10000},
      {id: 'skid-storage', address: ptr(0x8495d4), length: ptr(0x8495d8) - ptr(0x8495d4)},
      {id: 'other-used-body-arena', address: manifest.observed.arenaBaseAddress, length: manifest.observed.arenaUsedBytes},
      {id: 'unused-body-arena', address: arena.address, length: arena.length},
      ...report.cases[index].comparisons.filter(row => row.id !== 'body-arena-allocation-bytes').map(row => ({...row, id: `other-semantic:${row.id}`}))];
      const groupsCount = {}, spatialHeadOffsets = {}, changes = [];
      for (const run of expandNativeFramePatchRuns(ledger, {kind: 'external-producer'})) for (let address = run.address; address < run.address + run.length; address++) {
        changes.push(address);
        const group = groups.find(row => address >= row.address && address < row.address + row.length), id = group?.id ?? 'observation-only';
        groupsCount[id] = (groupsCount[id] ?? 0) + 1;
        if (address >= nodeBase && address < nodeBase + nodeCount * 12) {
          const offset = (address - nodeBase) % 12; spatialHeadOffsets[offset] = (spatialHeadOffsets[offset] ?? 0) + 1;
        }
      }
      if (changes.length !== ledger.externallyPatchedBytes) throw Error('Audit external-byte reconstruction differs from retained ledger.');
      const owned = producer.regionsFor({source: {...after, manifest}, pair}), oldOwned = owned.map(row => Buffer.from(after.span(row.address, row.length)));
      const oldRootScratch = Buffer.from(after.span(actual(0x91d45c), 8));
      const execution = producer.execute({source: {...after, manifest}, pair});
      let motionChangedBytes = 0;
      for (const [i, row] of owned.entries()) {
        const expected = next.span(row.address, row.length);
        if (!after.span(row.address, row.length).equals(expected)) throw Error(`Motion producer differs in ${filename}:${index}:${row.id}.`);
        for (let offset = 0; offset < row.length; offset++) motionChangedBytes += Number(oldOwned[i][offset] !== expected[offset]);
      }
      const intermediateOverwrites = changes.filter(address => {
        return address >= actual(0x91d45c) && address < actual(0x91d464) && after.memory[address] !== oldRootScratch[address - actual(0x91d45c)];
      }).map(address => ({address, preferredAddress: address - manifest.moduleBaseAddress + 0x400000, producedByte: after.memory[address], nextNativeByte: next.memory[address], changesSourceByte: after.memory[address] !== next.memory[address]}));
      const surface = createCapturedMemory([...pair.after.ranges.values()], {aliases: manifest.aliases}); let surfaceChangedBytes = 0, surfaceMatched = true;
      for (let i = 0; i < cars.length; i++) {
        updateVehicleSurfaceDrive(actual(0x909300 + i * 0x30c), {memory: surface.memory});
        const address = cars[i] + 0x6a8, expected = next.span(address, 4), original = after.span(address, 4);
        surfaceMatched &&= surface.span(address, 4).equals(expected);
        for (let offset = 0; offset < 4; offset++) surfaceChangedBytes += Number(original[offset] !== expected[offset]);
      }
      transitions.push({transition: index + 1, clock: m.readUInt32LE(actual(0x90a548)), externalPatchBytes: changes.length,
        abiRefreshBytes: ledger.abiRefreshedBytes, groups: Object.entries(groupsCount).sort((a, b) => b[1] - a[1]).map(([storageClass, changedBytes]) => ({storageClass, changedBytes})),
        spatialNodeChangedByteOffsets: spatialHeadOffsets,
        motionProducer: {matched: true, comparedBytes: owned.reduce((sum, row) => sum + row.length, 0), changedBytes: motionChangedBytes, calls: execution.calls.length},
        sourceMotionIntermediateScratchLaterOverwritten: intermediateOverwrites,
        nextCandidateSurfaceDrive: {matched: surfaceMatched, comparedBytes: cars.length * 4, changedBytes: surfaceChangedBytes,
          policy: 'Independent read-only candidate probe; not integrated or removed from supplied patch inputs.'}});
    }
    const firstManifest = buildNativeFrameManifest(pairing.pairs[0].before, pairing.options);
    windows.push({baselineReport: filename, baselineReportSha256: digest(original), captureDirectory: report.captureDirectory,
      identity: inspectNativeFrameScenario(pairing.pairs[0], firstManifest).identity, transitions});
  }
  const sourceFiles = ['src/vehicle-control-state.mjs', 'src/lap-timing.mjs', 'src/fixed-integer.mjs', 'src/sqrt-table.json',
    'tools/lib/native-frame-motion-continuation.mjs', 'tools/lib/native-frame-sequence.mjs', 'tools/audit-native-frame-producers.mjs'];
  return {schemaVersion: 1, targetSha256: REDUX_SHA256, method: 'retained-after-to-next-entry-storage-and-selected-producer-audit',
    evidenceIds: [...producer.evidence.evidenceIds, ...storage.evidence.map(row => row.evidence_id)],
    sourceFiles: await Promise.all(sourceFiles.map(async filename => ({filename, sha256: digest(await readFile(filename))}))), windows,
    limitations: ['Storage classes are not individual-writer attribution. Other-used arena and observation-only changes remain unresolved.',
      'The selected443d90 producer is executed from carried physics exit state and matches owned outputs; intervening attachment/recovery and other race stages remain separate.',
      'Async audio/clock/device/render causality is not established by broad commit-region changes. Caller ABI bytes remain explicit inputs.',
      'Spatial-node offsets8/9 and10/11 are body/particle list heads; identifying the exact intervening writer requires its actual stage boundary.',
      'No target, GUI or browser process is launched, and no retained report/capture is overwritten.']};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [output] = process.argv.slice(2);
  if (!output || process.argv.length !== 3) throw Error('Usage: node tools/audit-native-frame-producers.mjs NEW_REPORT_FILE');
  const report = await auditNativeFrameProducers();
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  console.log(JSON.stringify({output, windows: report.windows.length, transitions: report.windows.reduce((sum, row) => sum + row.transitions.length, 0)}));
}
