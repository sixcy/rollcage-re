import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from './check-native-recovery-replay.mjs';
import {selectNativeRecoverySoundSnapshots} from './lib/native-recovery-sound-selection.mjs';
import {selectNativeRecoverySourceConstructorPair, replayNativeRecoverySourceConstructor,
  inspectNativeRecoverySourceServices, verifyNativeRecoverySourceConstructorBoundaries} from './lib/native-recovery-source-replay.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

//The constructor's actual entry supplies its input. The manager's finished
//source is never used to seed the constructor, factory or parent.
export async function checkNativeRecoverySourceReplay(input, output) {
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json'), 'utf8'));
  const boundaryEvidence = await verifyNativeRecoverySourceConstructorBoundaries();
  let constructor, services, error;
  try {
    const {pairs} = pairNativeRecoverySnapshots(capture, configuration);
    if (pairs.length !== 1) throw Error('Source replay requires exactly one complete controlled parent.');
    const sound = selectNativeRecoverySoundSnapshots(capture, pairs[0], configuration);
    const pair = selectNativeRecoverySourceConstructorPair(capture, pairs[0]);
    constructor = replayNativeRecoverySourceConstructor(pair);
    services = inspectNativeRecoverySourceServices(capture, pairs[0], sound);
  } catch (failure) {error = failure.stack ?? String(failure);}
  const report = {
    schemaVersion: 1, targetSha256: REDUX_SHA256, authority: 'controlled-native-recovery-input',
    captureDirectory: path.resolve(input), constructorMatched: constructor?.matched === true,
    sourceReplayComplete: false, boundaryEvidence, ...(constructor ? {constructor} : {}), ...(services ? {services} : {}), ...(error ? {error} : {}),
    method: 'Original4ad7e0 entry/preRET4ad8de paired inside the declared controlled parent; full9a8 input source, actual descriptor, literals, PC24 and thread SEH are independent constructor inputs. Genuine bounded CRT string operations supplied explicitly. COM/critical-section observations are inspected separately.',
    limits: ['Constructor equality and observed external service outcomes do not prove full factory, channel append/play request or recovery-parent equality.',
      'No finished source, native waveform answer, game-child result or null replacement service is supplied as constructor input.']
  };
  await mkdir(output);
  for (const file of ['configuration.json', 'trace.jsonl']) await copyFile(path.join(input, file), path.join(output, file), constants.COPYFILE_EXCL);
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw Error('Usage: node tools/check-native-recovery-source-replay.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
  const report = await checkNativeRecoverySourceReplay(input, output);
  console.log(JSON.stringify({constructorMatched: report.constructorMatched, comparedBytes: report.constructor?.comparedBytes, error: report.error, output}));
  if (!report.constructorMatched || report.error) process.exitCode = 1;
}
