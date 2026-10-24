import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const hash=b=>createHash('sha256').update(b).digest('hex');
const pin=async path=>{const b=await readFile(path);return{path,bytes:b.length,sha256:hash(b)};};
const read=async p=>JSON.parse(await readFile(p));
const auditPath='analysis/native-race-step-clock-independent-status-reviewed-audit-20261024.json',audit=await read(auditPath);
assert.equal(audit.verified,true);
for(const p of [...audit.currentFilePins,audit.report,audit.priorReviewedAudit])assert.equal((await pin(p.path)).sha256,p.sha256,p.path);
const r=await read(audit.report.path);
assert.equal(r.matched,true);assert.equal(r.totalFixtures,341);assert.equal(r.schedulerInstructions,68);assert.equal(r.schedulerInstructionsReached,68);
assert.ok(r.explicitScheduling.some(c=>c.count===2));assert.ok(r.explicitScheduling.some(c=>c.count===3));
const staticPath='analysis/native-clock-integer-static-20261024/completed-summary.json',s=await read(staticPath);
assert.equal(s.binaryClosed,true);assert.equal(s.sessionTerminalExitCode,0);assert.equal(s.gameLaunched,false);
for(const p of s.pins)assert.equal((await pin(p.path)).sha256,p.sha256,p.path);
assert.equal((await pin('C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe')).sha256,r.targetSha256);
const cameraPath='analysis/physics-clock-source-viewer-camera-20261024/report.json',editorPath='analysis/physics-clock-source-viewer-state-20261024/report.json';
assert.equal((await read(cameraPath)).matched,true);assert.equal((await read(editorPath)).matched,true);
const processText=execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-Command',
  '@(Get-Process -Name "Rollcage*" -ErrorAction SilentlyContinue) | Select-Object Id,ProcessName | ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true}).trim();
assert.equal(processText,'','No game currently running');
const evidence=await Promise.all([
  auditPath,audit.report.path,audit.priorReviewedAudit.path,staticPath,
  'analysis/physics-resumed-next-tick-evidence-checkpoint-20261024.json',
  'analysis/native-parent-final-stock-reviewed-replay-v2-20261024/report.json',
  're-docs/native-race-step-clock-checkpoint.md',cameraPath,editorPath,'docs/track-viewer.html',
  ...audit.currentFilePins.map(p=>p.path),
  'tests/bounded-x86-clock-conversion.test.mjs'
].map(pin));
const checkpoint={schemaVersion:1,status:'active',createdUtc:new Date().toISOString(),previousGoalTurnClassification:'progress',currentGoalTurnClassification:'progress',
  fullObjectiveUnchanged:true,fullObjectiveComplete:false,completeParentTicksMatched:1,completeParentTickMatched:true,
  complete441c70SourceImplemented:true,clockOriginalProcessMatched:false,completeNextTickProducerIntervalMatched:false,longRaceParityEstablished:false,
  timingProof:{authority:r.authority,cases:r.totalFixtures,instructionSteps:r.instructionSteps,schedulerInstructionsReached:68,schedulerInstructions:68,
    stackAlignments:r.comparedStack.entryEspVariants,originalHelpersExecuted:r.actualChildren,answerHooks:['Declared synthetic Windows QPF/QPC only'],
    exactAPIInputsAndPreimages:true,wholeFixtureMemoryCompared:true,knownReturnSubsetCompared:true,
    numericalStickyFlags:'Source-derived metadata, not complete original-process/interpreter status parity'},
  sourceContextFix:'Explicit supplied x87 status survives all conversion stages; missing status remains unknown, and unmasked cases stage the genuine except1 boundary.',
  validation:{combinedSourceProtocolWeatherNativeParentTests:{passed:40,failed:0,skipped:0,terminalSession:98186},
    afterStatusFixIndependentTests:audit.tests,interpreterFocusedTests:{passed:103,failed:0,skipped:0},
    cameraAndEditorBrowserChecksPassed:true,viewerRebuilt:true,experimentalLabelAndThreeCarDefaultPreserved:true},
  preservation:{newGameLaunchesThisTurn:0,gameCurrentlyRunning:false,staticSessionClosed:true,originalExecutableSha256:r.targetSha256,
    installedFilesWritten:false,existingEvidenceOverwritten:false},
  nextRequiredWork:'Implement and test a separate bounded warm441c70 native call/QPC/return observation, validate this source against actual original outcomes, then connect450d60/440930 input/viewport/render producers through the next parent without native game-state refresh.',
  remainingFullObjective:['Original-process clock and continuous-race timing','Outer input/render/event-loop producers and closed second tick',
    'Broader car/terrain/wall/ceiling/inverted-driving collision scenarios','Startup and numerical-context coverage',
    'Full recovery and active weapon-force effects','Moving/destructible scenery and complete native scenario coverage'],evidence};
const output='analysis/physics-resumed-timing-source-checkpoint-20261024.json';
await writeFile(output,JSON.stringify(checkpoint,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,status:checkpoint.status,cases:r.totalFixtures,schedulerInstructionsReached:68,fullObjectiveComplete:false,pins:evidence.length}));
