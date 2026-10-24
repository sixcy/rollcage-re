//Characterize actual continuation writes later touched by supplied native
//producers. No writer is inferred merely from a broad heap-region label.
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeFrameSnapshots} from './check-native-frame-replay.mjs';
import {replayNativeFrameSequence, expandNativeFramePatchRuns} from './lib/native-frame-sequence.mjs';
import {createNativeDriveContinuation, replayNativeDriveFrame} from './lib/native-frame-drive-continuation.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {nativeGlobalAddress} from '../src/native-global-address.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function auditNativeDriveContinuation(reportFile) {
  const original = await readFile(reportFile), retained = JSON.parse(original), continuation = await createNativeDriveContinuation();
  if (!retained.matched || retained.targetSha256 !== continuation.evidence.targetSha256) throw Error('Drive write audit requires a matching actual-capture report.');
  const capture = await loadPhysicsCapture(retained.captureDirectory, {expectedSha256: continuation.evidence.targetSha256});
  const config = JSON.parse(await readFile(path.join(retained.captureDirectory, 'configuration.json'))), pairing = pairNativeFrameSnapshots(capture, config), observations = [];
  const execute = continuation.execute;
  const audited = {...continuation, execute(context) {
    const index = context.frameIndex, ledger = retained.transitions[index], beforeContinuation = new Map();
    for (const run of expandNativeFramePatchRuns(ledger, {kind: 'external-producer'})) for (let address = run.address; address < run.address + run.length; address++) beforeContinuation.set(address, context.source.memory[address]);
    const result = execute(context);
    const after = createCapturedMemory([...pairing.pairs[index].after.ranges.values()]), next = createCapturedMemory([...pairing.pairs[index + 1].before.ranges.values()]);
    const {source} = context, m = source.memory, actual = preferred => source.manifest.moduleBaseAddress + preferred - 0x400000;
    const count = source.manifest.observed.participantCount, cars = Array.from({length: count}, (_, i) => m.readUInt32LE(actual(0x909300 + i * 0x30c)));
    const pickupCount = m.readInt32LE(nativeGlobalAddress(m,0x902024)), pickupList = m.readUInt32LE(nativeGlobalAddress(m,0x902020)), pickups = Array.from({length: pickupCount}, (_, i) => m.readUInt32LE(pickupList + i * 4));
    const gfxm = m.readUInt32LE(0x90b990), controllerPointers = Array.from({length: m[gfxm + 0xf7]}, (_, i) => m.readUInt32LE(0x91d480 + i * 4));
    const classes = [...pickups.map((address, i) => ({id: 'pickup-matrices', address: address + 0xc4, length: 18, objectIndex: i})),
      ...pickups.map((address, i) => ({id: 'pickup-state-counter', address: address + 0x180, length: 0x10, objectIndex: i})),
      ...controllerPointers.map((address, i) => ({id: 'pickup-controller-state', address: address + 0x180, length: 12, objectIndex: i})),
      ...cars.map((address, i) => ({id: 'vehicle-launch-state', address: address + 0x6a0, length: 8, objectIndex: i})),
      ...cars.map((address, i) => ({id: 'vehicle-weapon-cooldown', address: address + 0x699, length: 1, objectIndex: i})),
      ...cars.map((_, i) => ({id: 'participant-target-state', address: actual(0x909300 + i * 0x30c) + 0x68, length: 0x18, objectIndex: i})),
      {id: 'shared-sqrt-scratch', address: actual(0x91d45c), length: 8, preferredAddress: 0x91d45c}, {id: 'shared-transform-scratch', address: actual(0x91d360), length: 0xfc, preferredAddress: 0x91d360},
      {id: 'shared-float-matrix', address: actual(0x91cdc0), length: 48, preferredAddress: 0x91cdc0}];
    const groups = new Map(), samples = []; let differing = 0, alreadyMatchesNext = 0, changedByThisContinuation = 0;
    for (const run of expandNativeFramePatchRuns(ledger, {kind: 'external-producer'})) for (let address = run.address; address < run.address + run.length; address++) {
      const produced = m[address], originalByte = after.memory[address]; if (produced === originalByte) continue;
      const expected = next.memory[address], already = produced === expected, identified = classes.find(row => address >= row.address && address < row.address + row.length), id = identified?.id ?? 'other-produced-byte';
      const group = groups.get(id) ?? {storageClass: id, overwrittenSourceDivergenceBytes: 0, alreadyMatchesNextBytes: 0, laterDifferentBytes: 0};
      group.overwrittenSourceDivergenceBytes++; group[already ? 'alreadyMatchesNextBytes' : 'laterDifferentBytes']++; groups.set(id, group);
      differing++; alreadyMatchesNext += Number(already);
      changedByThisContinuation += Number(produced !== beforeContinuation.get(address));
      if (samples.filter(row => row.storageClass === id).length < 8) samples.push({address, storageClass: id,
        ...(identified?.preferredAddress === undefined ? {} : {preferredAddress: identified.preferredAddress + address - identified.address}),
        ...(identified?.objectIndex === undefined ? {} : {objectIndex: identified.objectIndex, fieldOffset: address - identified.address}),
        nativeAfterByte: originalByte, sourceBeforeContinuationByte: beforeContinuation.get(address), producedByte: produced, nextNativeByte: expected, alreadyMatchesNext: already});
    }
    if (differing !== ledger.overwrittenSourceDivergenceBytes) throw Error('Drive write audit differs from the exact retained patch counter.');
    const projectilePointers = Array.from({length: 24}, (_, i) => m.readUInt32LE(0x9034a0 + i * 4));
    observations.push({transition: index + 1, overwrittenSourceDivergenceBytes: differing, changedByThisContinuation, carriedSourceDifferencesAlreadyPresent: differing - changedByThisContinuation, alreadyMatchesNextBytes: alreadyMatchesNext, laterDifferentBytes: differing - alreadyMatchesNext,
      groups: [...groups.values()], samples, sourceStateAfterContinuation: {pickupCount, pickupControllerCount: m[gfxm + 0xf7], activeProjectiles: projectilePointers.filter(body => m.readInt32LE(body + 0x188)).length,
        terrainWaveState: m.readInt32LE(0x90cb80), timeEffectState: m.readInt32LE(nativeGlobalAddress(m,0x811180)), registryCount: m.readInt32LE(nativeGlobalAddress(m,0x82e900)), modelTargetCount: m.readInt32LE(nativeGlobalAddress(m,0x82e904)),
        periodicAge: m.readInt32LE(0x903514), periodicRetiredClock: m.readUInt32LE(0x903520), logicalClock: m.readUInt32LE(0x90a548),
        launchStates: cars.map(body => m.readInt16LE(body + 0x6a0)), launchAges: cars.map(body => m.readInt16LE(body + 0x6a2)), contactOwnersActive: cars.filter(body => {const owner = m.readUInt32LE(body + 0x6bc); return owner !== 0xffffffff && m[owner];}).length}});
    return result;
  }};
  const {report} = await replayNativeFrameSequence(pairing.pairs, {replayFrame: replayNativeDriveFrame, frameOptions: pairing.options, sourceContinuation: audited, coveragePolicy: retained.coveragePolicy});
  if (!report.matched) throw Error('Drive write audit replay diverges.');
  return {schemaVersion: 1, targetSha256: retained.targetSha256, reportFile, reportSha256: hash(original), method: 'actual-carried-source-continuation-output-versus-native-after-and-next-entry',
    matched: true, protectedBytes: report.sourceContinuation.comparedBytes, sourceProducerEvidence: continuation.evidence, observations,
    limits: ['Counts describe real source continuation bytes touched by later supplied producers; they do not imply a failed earlier physics comparison.',
      'Already-matching bytes need no subsequent source-byte change. Later-different shared outputs remain supplied inputs and are not a full parent equivalence claim.',
      'Storage labels identify mapped fields; source coordinator execution is genuine, but individual later native writers are not inferred from these offsets.']};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || process.argv.length !== 4) throw Error('Usage: node tools/audit-native-drive-continuation.mjs MATCHING_REPORT_FILE NEW_AUDIT_FILE');
  const report = await auditNativeDriveContinuation(input);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  console.log(JSON.stringify({output, matched: report.matched, observations: report.observations.map(row => ({transition: row.transition, overwritten: row.overwrittenSourceDivergenceBytes, alreadyMatchesNext: row.alreadyMatchesNextBytes, laterDifferent: row.laterDifferentBytes, groups: row.groups}))}));
}
