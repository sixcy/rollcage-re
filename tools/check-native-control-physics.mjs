import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots, verifyNativeControlBoundaries} from './lib/native-control-capture.mjs';
import {replayNativeControlThroughPhysics} from './lib/native-control-physics.mjs';
import {verifyNativeControlPrefixEvidence} from './lib/native-frame-control-continuation.mjs';
import {compareNativeControlOutput} from './check-native-frame-control-prefix.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export async function checkNativeControlPhysics(input, output) {
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json')));
  const pairing = pairNativeControlSnapshots(capture, configuration);
  if (!pairing.physicsExitCheckpoint) throw Error('Joined source comparison requires an actually declared and paired physics exit.');
  const [proof, prefixProof] = await Promise.all([verifyNativeControlBoundaries(), verifyNativeControlPrefixEvidence()]);
  await mkdir(output);
  for (const name of ['configuration.json', 'trace.jsonl']) await copyFile(path.join(input, name), path.join(output, name), constants.COPYFILE_EXCL);
  const report = {schemaVersion: 1, method: 'source-carried-prephysics-and-physics', targetSha256: REDUX_SHA256,
    authority: 'original-process-with-declared-instrumentation', captureDirectory: path.resolve(input), evidenceIds: [...new Set([...proof.evidenceIds, ...prefixProof.evidenceIds])],
    matched: true, sourceComplete: false, frames: [], completion: capture.complete, interventions: capture.interventions,
    limits: ['A completed joined call is not a complete450e50 tick or a source-only continuous race.',
      'No intermediate native memory/register outputs are admitted to replay; they are comparison inputs only.',
      'Full private CPU/CRT ABI, unresolved volatile/status registers and unobserved physical scenarios remain open.']};
  for (const pair of pairing.pairs) {
    const frame = {beforeOrdinal: pair.before.ordinal, physicsEntryOrdinal: pair.after.ordinal, physicsAfterOrdinal: pair.physicsAfter.ordinal, logicalClock: pair.logicalClock};
    report.frames.push(frame);
    try {
      const source = replayNativeControlThroughPhysics(pair.before, {...pairing.options, moduleBaseAddress: pair.moduleBaseAddress,
        onBeforeStage: ({source}) => {if (pair.checkpoints?.afterAi) frame.afterAi = compareNativeControlOutput(source, pair.checkpoints.afterAi);},
        onPrefixComplete: source => {frame.prefix = compareNativeControlOutput(source, pair.after); frame.prefixExecution = source.report;}});
      frame.derivedPhysicsRegisters = {...source.derivedPhysicsRegisters,
        comparison: Object.entries(source.derivedPhysicsRegisters.registers).map(([name, value]) => ({name, source: value, native: Number(pair.after.registers[name]), matched: value === Number(pair.after.registers[name])}))};
      frame.physics = compareNativeControlOutput(source, pair.physicsAfter);
      frame.nativeReturn = Number(pair.physicsAfter.registers.eax); frame.sourceReturn = source.report.nativeReturn;
      frame.physicsCounters = Object.fromEntries(['preparedBodies', 'scriptedBodies', 'ordinaryBodies', 'processedEvents', 'storedContacts', 'rejectedContacts', 'finishedBodies', 'regeneratedEvents', 'worldUpdatedRecords'].filter(key => Number.isSafeInteger(source.report[key])).map(key => [key, source.report[key]]));
      if (Array.isArray(source.report.vehicles)) {
        frame.physicsCounters.vehicleResults = source.report.vehicles.length;
        for (const [name, key] of [['wheelQueries', 'queries'], ['wheelHits', 'hits']]) {
          if (source.report.vehicles.every(vehicle => Number.isSafeInteger(vehicle.contacts?.[key]))) frame.physicsCounters[name] = source.report.vehicles.reduce((sum, vehicle) => sum + vehicle.contacts[key], 0);
        }
      }
      frame.stackPolicy = {parentBytesBefore: pairing.options.stackBytesBefore, physicsBytesBefore: pairing.options.stackBytesBefore - 20};
      frame.matched = frame.prefix.matched && (!frame.afterAi || frame.afterAi.matched) && frame.physics.matched && frame.nativeReturn === frame.sourceReturn && frame.derivedPhysicsRegisters.comparison.every(row => row.matched);
      if (!frame.matched) report.matched = false;
    } catch (error) {frame.replayStage = error.replayStage; frame.error = error.stack; frame.partialSourceExecution = error.nativeControlProgress; report.matched = false; break;}
  }
  report.comparedFrames = report.frames.filter(frame => frame.physics).length;
  report.sourceComplete = report.matched && report.comparedFrames === pairing.frames;
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2), {flag: 'wx'});
  return {report, output: path.resolve(output)};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || process.argv.length > 4) throw Error('Usage: node tools/check-native-control-physics.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
  const {report} = await checkNativeControlPhysics(input, output);
  console.log(JSON.stringify({matched: report.matched, sourceComplete: report.sourceComplete, comparedFrames: report.comparedFrames,
    frames: report.frames.map(frame => ({prefixMatched: frame.prefix?.matched, physicsMatched: frame.physics?.matched, bytesCompared: frame.physics?.bytesCompared,
      firstDivergence: frame.physics?.firstDivergence, stage: frame.replayStage, error: frame.error?.split('\n')[0]})), output}));
  if (!report.matched) process.exitCode = 1;
}
