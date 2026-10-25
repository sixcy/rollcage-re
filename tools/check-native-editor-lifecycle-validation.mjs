// Independent event/source verification, plus the full native topology checker.
// Does not launch, attach to, or modify any process.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {checkEditorLifecycleEvidence} from './lib/editor-lifecycle-evidence.mjs';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
const [root,output]=process.argv.slice(2);if(!root||!output)throw Error('Usage: node tools/check-native-editor-lifecycle-validation.mjs CASE_ROOT NEW_REPORT.json');
const config=JSON.parse(await readFile(path.join(root,'scenery-capture-config.json'),'utf8')),expected=JSON.parse(await readFile(path.join(root,'scenery-expected.json'),'utf8'));assert.equal(expected.profile,'editor-lifecycle');let report,archive;
try{
  const capture=await loadPhysicsCapture(path.join(root,'capture'),{expectedSha256:config.expectedSha256}),records=(await readFile(path.join(root,'capture/trace.jsonl'),'utf8')).trim().split(/\r?\n/).map(JSON.parse),events=records.filter(r=>r.type==='editor-lifecycle-event'),first=capture.snapshots.find(s=>s.breakpointId==='pickup-first-tick');assert.ok(first);const dataBase=first.ranges.get('pickup-module-roots').bytes.readUInt32LE(),moduleBase=Number(first.ranges.get('pickup-module-roots').moduleBaseAddress),bodyAddresses=new Map(expected.probe.placements.map(p=>[p.index,Number(first.ranges.get('scenery-body-'+p.index).address)])),carAddresses=[];
  for(const snapshot of capture.snapshots.filter(s=>s.pickupEditorObservation?.nativeCarSpawnObserved))carAddresses[snapshot.pickupEditorObservation.participantIndex]=Number(snapshot.ranges.get('combined-car-spawn-body').address);assert.equal(carAddresses.length,6);assert.ok(carAddresses.every(Boolean));
  archive=await RollcageArchive.open(path.join(root,'installation'));const track=getGame('rollcage').tracks.find(t=>t.name===`${expected.quality}/LEV${expected.level}.BLP`),data=(await archive.readResource(track.index)).data,proof=checkEditorLifecycleEvidence({events,data,expected,dataBase,moduleBase,tid:first.tid,firstTickOrdinal:first.observedDebugEventOrdinal,bodyAddresses,carAddresses}),completion=capture.complete.editorLifecycleObservation;
  assert.ok(completion?.enabled);assert.equal(completion.lapObserved,proof.lapObserved);assert.equal(completion.timingObserved,proof.timing.length>0);assert.equal(completion.addedPadContactObserved,proof.pads.length>0);assert.equal(completion.selectedDestructionObserved,proof.allAttachmentOwnersReleased);assert.equal(completion.nativeOutputsWritten,false);
  const inheritedOutput=output.replace(/\.json$/i,'')+'-initialization.json',inherited=spawnSync(process.execPath,['tools/check-native-topology-editor-validation.mjs',root,inheritedOutput],{encoding:'utf8',windowsHide:true,timeout:60000});assert.equal(inherited.status,0,inherited.stdout+inherited.stderr);const initialization=JSON.parse(await readFile(inheritedOutput,'utf8'));assert.equal(initialization.passed,true);assert.ok(initialization.files.every(f=>f.sourceUnchanged));assert.ok(initialization.combinedInitialization?.constructors.length===2);assert.ok(initialization.combinedInitialization?.carSpawns.length===6);
  report={passed:true,authority:'original-process-with-declared-instrumentation',quality:expected.quality,level:expected.level,profile:expected.profile,proof,initializationReport:inheritedOutput,sourceFilesVerified:initialization.files.length,cleanupObserved:records.some(r=>r.type==='owned-process-cleanup'&&r.terminated),completion:capture.complete,scope:'Natural original checkpoint/lap progression, timing-flag behavior, native added-arrow drive increment, independent clone damage and later release of all selected attachment owners. Later natural original damage is reported separately and is not treated as storage aliasing.'};assert.equal(report.cleanupObserved,true);
}catch(error){report={passed:false,authority:'rejected-native-lifecycle-evidence',quality:expected.quality,level:expected.level,error:error.stack,positiveAcceptance:false};throw error;}
finally{await archive?.close();if(report)await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify(report));
