import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from './check-native-recovery-replay.mjs';
import {compareNativeRecoveryAudioPrefix} from './lib/native-recovery-audio-prefix.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export async function checkNativeRecoveryAudioPrefix(input, output) {
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json'), 'utf8'));
  const {pairs} = pairNativeRecoverySnapshots(capture, configuration);
  if (pairs.length !== 1) throw Error('Recovery audio prefix requires one complete controlled parent.');
  const report = {targetSha256: REDUX_SHA256, captureDirectory: path.resolve(input), authority: 'controlled-native-recovery-input',
    ...compareNativeRecoveryAudioPrefix(capture, pairs[0], configuration)};
  await mkdir(output);
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw Error('Usage: node tools/check-native-recovery-audio-prefix.mjs CAPTURE_DIRECTORY NEW_REPORT_DIRECTORY');
  const report = await checkNativeRecoveryAudioPrefix(input, output);
  console.log(JSON.stringify({matched: report.matched, comparedArgumentBytes: report.comparedArgumentBytes, firstDivergence: report.firstDivergence, sourceError: report.sourceError, output}));
  if (!report.matched) process.exitCode = 1;
}
