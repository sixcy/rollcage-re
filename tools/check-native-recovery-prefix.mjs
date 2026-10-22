// Compare declared state at the native application entry, before later sound
// allocation. A successful prefix is deliberately separate from parent output.
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {pairNativeRecoverySnapshots} from './check-native-recovery-replay.mjs';
import {bindCapturedNativeRecovery, nativeRecoveryGlobalRegions} from './lib/native-recovery-context.mjs';
import {nativeFrameGlobalRegions} from './lib/native-frame-manifest.mjs';
import {compareNativeRecoveryApplications} from './lib/native-recovery-selection.mjs';
import {firstByteDivergence} from './lib/native-body-replay.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {runRawPostFrameBodyStates} from '../src/raw-respawn-state.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export function compareNativeRecoveryPrefix(capture, pair) {
  if (!pair.nativeApplications?.length) throw Error('Recovery prefix requires strictly paired native application entries.');
  const events = capture.snapshots.filter(row => row.breakpointId === 'native-recovery-apply-entry');
  const initial = createCapturedMemory([...pair.before.ranges.values()]);
  const bound = bindCapturedNativeRecovery(pair.before, {...pair.options, moduleBaseAddress: pair.moduleBaseAddress});
  const sourceApplications = [], prefixes = [];
  let sourceComplete = false, sourceError = null, sourceReport = null;
  bound.runtime.onRecoveryApply = record => {
    const index = sourceApplications.length;
    sourceApplications.push(record);
    const snapshot = events[index];
    if (!snapshot) {prefixes.push({index, matched: false, firstDivergence: {kind: 'extra-source-application'}}); return;}
    const comparisons = [...nativeFrameGlobalRegions, ...nativeRecoveryGlobalRegions].map(region => {
      const address = pair.moduleBaseAddress + region.preferredAddress - 0x400000;
      const row = snapshot.ranges.get(region.id);
      if (!row || Number(row.address) !== address || row.bytes.length !== region.length) throw Error(`Recovery prefix lacks exact native ${region.id} coverage.`);
      const divergence = firstByteDivergence(row.bytes, bound.span(address, region.length));
      const readOnlyDivergence = region.comparison === 'read-only'
        ? firstByteDivergence(initial.span(address, region.length), row.bytes) : null;
      return {id: region.id, address, length: region.length, policy: region.comparison, matched: !divergence && !readOnlyDivergence, divergence, readOnlyDivergence};
    });
    prefixes.push({index, nativeOrdinal: snapshot.ordinal, matched: comparisons.every(row => row.matched),
      comparedBytes: comparisons.reduce((sum, row) => sum + row.length, 0), comparisons,
      firstDivergence: comparisons.find(row => !row.matched) ?? null});
  };
  try {sourceReport = runRawPostFrameBodyStates(bound.runtime); sourceComplete = true;}
  catch (error) {sourceError = error.stack ?? String(error);}
  const applications = compareNativeRecoveryApplications(pair.nativeApplications, sourceApplications,
    {sourceComplete, respawnedBodies: sourceReport?.respawnedBodies});
  return {matched: applications.matched && prefixes.length === events.length && prefixes.every(row => row.matched),
    prefixes, applications, sourceComplete, sourceError,
    firstDivergence: prefixes.find(row => !row.matched)?.firstDivergence ?? applications.firstDivergence,
    fullParentOutputCompared: false};
}

export async function checkNativeRecoveryPrefix(input, output) {
  const capture = await loadPhysicsCapture(input, {expectedSha256: REDUX_SHA256});
  const configuration = JSON.parse(await readFile(path.join(input, 'configuration.json'), 'utf8'));
  const pairing = pairNativeRecoverySnapshots(capture, configuration);
  if (pairing.pairs.length !== 1 || pairing.selection.mode !== 'first-respawn-application') throw Error('Recovery prefix requires one selected complete native parent.');
  const pair = pairing.pairs[0], comparison = compareNativeRecoveryPrefix(capture, pair);
  const report = {schemaVersion: 1, authority: pairing.controlledInput?.authority ?? 'original-process-with-declared-instrumentation',
    targetSha256: REDUX_SHA256, captureDirectory: path.resolve(input), controlledInput: pair.controlledInput ?? null,
    method: 'Execute the real source parent from its captured entry; compare every predeclared frame/recovery global span and exact application input at each actual native47d440 entry. No placement or query answer is supplied.',
    ...comparison, interventions: capture.interventions,
    limits: ['Prefix agreement is separate from full parent output, application exit, and sound/particle completion.',
      'The event has complete declared globals and exact application inputs; it does not contain all body-arena or shape-pool backing bytes at this intermediate boundary.',
      'The supplied state32 request, when present, is a controlled input rather than a naturally produced rejection.',
      'No process is launched by this checker.']};
  await mkdir(output);
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw Error('Usage: node tools/check-native-recovery-prefix.mjs CAPTURE NEW_REPORT_DIRECTORY');
  const report = await checkNativeRecoveryPrefix(input, output);
  console.log(JSON.stringify({matched: report.matched, prefixes: report.prefixes.length,
    comparedBytes: report.prefixes.map(row => row.comparedBytes), sourceComplete: report.sourceComplete,
    firstDivergence: report.firstDivergence, output}));
  if (!report.matched) process.exitCode = 1;
}
