import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const hash=b=>createHash('sha256').update(b).digest('hex');
const pin=async path=>{const b=await readFile(path);return{path,bytes:b.length,sha256:hash(b)};};
const read=async p=>JSON.parse(await readFile(p));
const auditPath='analysis/native-race-clock-stock-independent-audit-v2-20261024.json',audit=await read(auditPath);
assert.equal(audit.raw.allBlobHashesMatched,true);assert.equal(audit.raw.blobFiles,179);
assert.equal(audit.raw.exactPolicyAndAdmissionVerified,true);
assert.ok(audit.identities.installationChecks.every(r=>r.matched));
assert.equal(audit.identities.installationChecks.reduce((n,r)=>n+r.fileHashesChecked,0),688);
assert.equal(audit.raw.ownedCleanup.terminated,true);assert.ok(audit.raw.ownedCleanup.elapsedMs<90000);
assert.equal((await pin(audit.identities.helper.path)).sha256,audit.identities.helper.sha256);
assert.equal((await pin(audit.identities.sourceReport.path)).sha256,audit.identities.sourceReport.sha256);
const report=await read(audit.identities.sourceReport.path);
assert.equal(report.sourceExecuted,true);assert.equal(report.clockResultMatched,true);assert.equal(report.scaledClockMatched,true);
assert.equal(report.matched,false);assert.equal(report.sourceComplete,false);
assert.equal(report.stages.at(-1).comparison.differingBytes,105);
assert.ok(report.stages.at(-1).numerical.every(v=>v.matched));
assert.equal(audit.source.allFinalDifferencesSubsetOfActualApiPrivateChanges,true);
const numericPath='analysis/native-race-clock-stock-independent-numeric-audit-v2-20261024.json',numeric=await read(numericPath);
assert.equal(numeric.transportVerified,true);assert.equal(numeric.originalEntryOnly,true);
assert.equal(numeric.api.extraGameOrPrivateBytesAdmitted,0);assert.equal(numeric.api.bytesAdmitted,8);
assert.equal(numeric.numeric.scaledClockMatched,true);assert.equal(numeric.numeric.instructionCount,1);
assert.equal(numeric.strictWhole540Matched,false);assert.equal(numeric.footprint.ownWrittenBytes,76);
assert.equal(numeric.footprint.mismatchingFinalOwnWrittenBytes,0);
assert.equal(numeric.footprint.privateReadBeforeGenuineWrite.length,0);
for(const p of numeric.filePins)assert.equal((await pin(p.path)).sha256,p.sha256,p.path);
const cameraPath='analysis/physics-native-clock-viewer-camera-20261024/report.json',editorPath='analysis/physics-native-clock-viewer-state-20261024/report.json';
assert.equal((await read(cameraPath)).matched,true);assert.equal((await read(editorPath)).matched,true);
assert.deepEqual((await read(cameraPath)).mutations.page,{});
const processText=execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-Command',
  '@(Get-Process -Name "Rollcage*" -ErrorAction SilentlyContinue) | Select-Object Id,ProcessName | ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true}).trim();
assert.equal(processText,'','No game currently running');
const evidence=await Promise.all([
  auditPath,audit.identities.sourceReport.path,audit.identities.helper.path,
  'analysis/native-race-clock-stock-capture-v2-20261024/trace.jsonl',
  'analysis/native-race-clock-stock-capture-v2-20261024/configuration.json',
  'analysis/native-race-clock-stock-transport-failure-v1-20261024.json',
  numericPath,...numeric.filePins.map(p=>p.path),
  'analysis/native-race-clock-physical-source-instruction-check-20261024.json',
  'analysis/native-race-clock-physical-address-review-20261024.json',
  'analysis/native-race-clock-xmm0-scale-proof-20261024.json',
  'analysis/native-parent-final-stock-reviewed-replay-v2-20261024/report.json',
  ...audit.identities.installationReports.map(r=>r.filename),
  'src/native-race-step-clock.mjs','src/native-clock-conversion.mjs','src/race-clock.mjs','src/game-network-protocol.mjs',
  'tools/check-native-race-clock.mjs','tools/lib/native-race-clock-inputs.mjs','tools/lib/native-race-clock-capture.mjs',
  'tools/prepare-native-race-clock-capture.mjs','tests/native-race-clock-host.test.mjs','tests/native-race-clock-capture.test.mjs',
  'tests/native-race-clock-replay.test.mjs','tests/native-race-clock-physical-addresses.test.mjs',
  'tests/fixtures/native-race-clock-capture-fixture.mjs',
  'tools/track-viewer/app.mjs','tools/check-pickup-editor-camera-viewer.mjs','docs/track-viewer.html',
  're-docs/native-race-clock-runtime-checkpoint.md',cameraPath,editorPath
].map(pin));
const checkpoint={schemaVersion:1,status:'active',createdUtc:new Date().toISOString(),previousGoalTurnClassification:'progress',currentGoalTurnClassification:'progress',
  fullObjectiveUnchanged:true,fullObjectiveComplete:false,completeParentTicksMatched:1,completeParentTickMatched:true,
  complete441c70SourceImplemented:true,clockOriginalProcessNumericResultMatched:true,completeClockStorageMatched:false,
  observedGameClockOwnStoresMatched:true,privateApiReadBeforeOwnWriteInObservedCall:false,
  completeNextTickProducerIntervalMatched:false,longRaceParityEstablished:false,
  timingProof:{originalWarmCalls:1,entryInputsOnly:true,externalOutcomes:['One actual QPC eight-byte output and BOOL'],
    sourceExecuted:true,scaledResultMatched:true,scaledResultHex:report.scaledClock.nativeHex,count:report.sourceCount,
    nonstackRegions:14,nonstackBytes:202,knownFinalRegisters:7,numericalStateMatched:true,
    strictMatched:false,sourceComplete:false,privateApiChanges:109,finalPrivateDifferences:105,nativePrivateStackRefreshed:false},
  captureAttempts:[{version:1,status:'rejected-invalid-header-json',pid:13576,closed:true},
    {version:2,status:'authenticated-numeric-match-strict-stack-mismatch',pid:audit.raw.ownerPid,closed:true,elapsedMs:audit.raw.ownedCleanup.elapsedMs}],
  viewerFix:{issue:'Camera menu repeatedly refreshes after adding pickup',
    correction:'Write hidden attributes only when their boolean value changes.',
    browserChecked:true,idleFrames:20,pageDomMutations:0,cameraMouseSelectionAndDraftPreservationPassed:true,viewerRebuilt:true},
  validation:{clockSourceHostProtocolSchedulingBatch:{passed:34,failed:0,skipped:0},
    finalRetainedOriginalClockRegression:{passed:5,failed:0,skipped:0},
    completeRecordedParentRegression:{passed:1,failed:0,skipped:0,declaredBytes:5107238},
    rawBlobHashesChecked:179,installationFileIdentitiesChecked:688,cameraAndEditorBrowserChecksPassed:true},
  preservation:{gameCurrentlyRunning:false,installedFilesWritten:false,existingEvidenceOverwritten:false,userGitignorePreserved:true,
    stockFiles:171,editedFiles:173,originalExecutableSha256:audit.identities.targetSha256},
  nextRequiredWork:'Carry the observed explicit external-stack ownership and genuine clock source into450d60/440930 input/viewport/render producers; prove the enclosing suffix and next parent without refreshing game state from a later native endpoint. Retain the strict private-stack failure and verify future reads before extending its ownership scope.',
  remainingFullObjective:['Continuous-race timing and cold initialization coverage','Outer input/render/event-loop producers and closed second tick',
    'Broader car/terrain/wall/ceiling/inverted-driving collision scenarios','Startup and numerical-context coverage',
    'Full recovery and active weapon-force effects','Moving/destructible scenery and complete native scenario coverage'],evidence};
const output='analysis/physics-resumed-native-clock-checkpoint-20261024.json';
await writeFile(output,JSON.stringify(checkpoint,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,status:checkpoint.status,clockNumericResultMatched:true,strictClockStorageMatched:false,fullObjectiveComplete:false,pins:evidence.length}));
