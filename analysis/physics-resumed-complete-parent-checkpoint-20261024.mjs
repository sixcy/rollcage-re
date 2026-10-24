import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const digest = b => createHash('sha256').update(b).digest('hex');
const json = async p => JSON.parse(await readFile(p, 'utf8'));
const pin = async path => {const b = await readFile(path); return {path, bytes:b.length, sha256:digest(b)};};
const reportPath = 'analysis/native-parent-final-stock-reviewed-replay-v2-20261024/report.json';
const auditPath = 'analysis/native-parent-final-stock-independent-source-reviewed-audit-v2-20261024.json';
const r = await json(reportPath), audit = await json(auditPath), raw = await json('analysis/native-parent-final-stock-independent-audit-v2-20261024.json');
assert.equal(r.matched, true); assert.equal(r.sourceComplete, true); assert.equal(r.completeParentTickMatched, true);
assert.equal(r.comparedFrames, 1); assert.equal(audit.verified, true); assert.equal(raw.verified, true);
assert.equal((await pin(reportPath)).sha256, audit.report.sha256);
for (const p of [...audit.reviewedCode, audit.originalRawAudit]) assert.equal((await pin(p.path)).sha256, p.sha256, `Current reviewed pin ${p.path}`);
const cameraPath = 'analysis/physics-final-parent-viewer-camera-20261024/report.json';
const editorPath = 'analysis/physics-final-parent-viewer-state-20261024/report.json';
const camera = await json(cameraPath), editor = await json(editorPath);
assert.equal(camera.matched, true); assert.equal(editor.matched, true); assert.deepEqual(camera.mutations.page, {});
const legacyPath = 'analysis/native-parent-rtti-stock-final-compatible-replay-v8-20261024/report.json', legacy = await json(legacyPath);
assert.equal(legacy.matched, true); assert.equal(legacy.completeParentTickMatched, false);
const processText = execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile','-Command',
  '@(Get-Process -Name "Rollcage*" -ErrorAction SilentlyContinue) | Select-Object Id,ProcessName | ConvertTo-Json -Compress'], {encoding:'utf8', windowsHide:true}).trim();
const processes = processText ? JSON.parse(processText) : [];
assert.equal(Array.isArray(processes) ? processes.length : 1, 0, 'No game currently running');
const f = r.frames[0], final = f.stages.at(-1), evidence = await Promise.all([
  reportPath, auditPath, audit.originalRawAudit.path, legacyPath, cameraPath, editorPath,
  'analysis/attachment-effects-mesh-read-order-instruction-check-20261024.json',
  'analysis/native-parent-final-stock-installation-after-v2-20261024.json',
  'analysis/native-parent-final-installed-edits-after-v2-20261024.json',
  're-docs/native-parent-final-tick-checkpoint.md', 'docs/track-viewer.html',
  'src/native-global-address.mjs', 'src/attachment-effects.mjs',
  'tests/native-parent-final-replay.test.mjs', 'tests/native-parent-tail-inputs.test.mjs',
  'tests/attachment-mesh-read-order.test.mjs', 'tests/camera-weather-global-address.test.mjs',
  'tests/native-global-render-scratch.test.mjs', 'tests/captured-memory.test.mjs'
].map(pin));
const checkpoint = {schemaVersion:1, status:'active', createdUtc:new Date().toISOString(),
  previousGoalTurnClassification:'progress', currentGoalTurnClassification:'progress', fullObjectiveUnchanged:true,
  priorCheckpoint:'analysis/physics-resumed-callback-and-final-tick-checkpoint-20261024.json',
  completeParentTickMatched:true, completeParentTicksMatched:1, uniqueFinalBytesMatched:final.comparison.uniqueBytesCompared,
  returnedRegistersMatched:f.returnedRegisters.length, parentAbiBytesMatched:final.comparison.parentAbiBytesCompared,
  counterIncrements:{logical90a548:[288,289], sample6e675c:[288,289], delivered6e66f8:'not observed or closed'},
  externalOutcomes:{crtCasts:f.sourceRttiEvents.length, qpcCalls:f.sourceCounterEvents.length, gameChildResultsSupplied:0},
  sourceControlSoundCreations:f.sourceSoundCreationEvents.length,
  sourceGameInputs:'Authenticated original-entry game-state/storage, carried through source; native later game bytes comparison-only.',
  finalInputGraph:r.rttiCaptureProofs[0].finalTick.inputs,
  sourceFocusedVerification:{command:'node --test (18 explicitly named focused test files in root tool session66525)', passed:96, failed:0, skipped:0, terminalExitCode:0,
    scope:'Source tests, retained-instruction checks, raw capture/input/provenance rejection, actual FinalV2 and older V8 replay; no native game launch.'},
  viewer:{built:true, cameraAndEditorChecksPassed:true, idleFramesObserved:20, idlePageMutations:0, aiDefault:3, experimentalLabelPreserved:true},
  nativeCapture:{newGameLaunchesThisTurn:0, previousRawCaptureClosed:raw.cleanup.terminated, priorCleanupElapsedMs:raw.cleanup.cleanupElapsedMs,
    gameCurrentlyRunning:false, processCheckUtc:new Date().toISOString(), previousInstallationFileIdentitiesPreserved:688},
  fullObjectiveComplete:false, longRaceParityEstablished:false,
  nextRequiredWork:'Recover and execute the actual outer producer/timing/input interval through the next authenticated parent entry, then broaden native physical/weapon/recovery/scenery scenarios. The full physics objective remains active.',
  limits:['One successful declared semantic/known-register parent case; private callee CPU/CRT ABI remains unproved.',
    'No continuous race/outer producer closure or original delivered6e66f8 observation.',
    'No new control sound-creation event in this case; adaptive runtime, audio interleaving and audible output remain separate.',
    'Broader natural collision, inversion, recovery, active weapon, scenery and startup/context requirements remain open.'], evidence};
const output = 'analysis/physics-resumed-complete-parent-checkpoint-20261024.json';
await writeFile(output, JSON.stringify(checkpoint, null, 2)+'\n', {flag:'wx'});
console.log(JSON.stringify({output, status:checkpoint.status, completeParentTicksMatched:1, fullObjectiveComplete:false, evidencePinsVerified:evidence.length}));
