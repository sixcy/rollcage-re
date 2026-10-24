//Read-only audit of a CLOSED declined input experiment, including stop diagnostics.
import assert from 'node:assert/strict';
import {readFile,readdir,realpath,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {loadHeldForceRequest,validateHeldBudgetEvidence} from '../tools/lib/native-held-force.mjs';
import {verifyHeldRangeStorageDiagnostic} from '../tools/lib/native-held-range-storage.mjs';
import {verifyControlledRaceSettingsRecords} from '../tools/lib/native-controlled-race-settings.mjs';

const directory='analysis/native-physics-local/startup-20261022/held-chassis-border-high-lev1-shared-v4-20261023';
const root=await realpath(directory),trace=await readFile(path.join(root,'trace.jsonl'));
const records=trace.toString().trim().split(/\r?\n/).map(JSON.parse),hash=b=>createHash('sha256').update(b).digest('hex');
const configurationBytes=await readFile(path.join(root,'configuration.json')),configuration=JSON.parse(configurationBytes);
assert.equal(hash(configurationBytes),'d77619e385e7de69e5756943c6010073a331b162785dee79e0630d254f873a8b');
const helper='analysis/native-physics-local/startup-20261022/bounded-contained-held-runner-v4-20261023/native-physics-debugger.cs';
assert.equal(hash(await readFile(helper)),'a77e6894a235316f0f65274b5b262370e921ea0211196bdf4804c1c98b0773e9');
const files=new Map(),snapshotFiles=new Set();
function add(file,sha256,length,snapshot=false){
  const descriptor={sha256,length};if(files.has(file))assert.deepEqual(files.get(file),descriptor);files.set(file,descriptor);if(snapshot)snapshotFiles.add(file);
}
for(const row of records){
  if(row.contextFile)add(row.contextFile,row.contextSha256,row.contextLength??716,row.type==='snapshot');
  for(const range of row.ranges??[])if(range.file)add(range.file,range.sha256,range.length,row.type==='snapshot');
  if(row.stack?.file)add(row.stack.file,row.stack.sha256,row.stack.length);
}
assert.deepEqual((await readdir(root)).filter(file=>file.endsWith('.bin')).sort(),[...files.keys()].sort());
let bytes=0,snapshotBytes=0;const settingsRow=records.find(row=>row.type==='snapshot'&&row.breakpointId==='controlled-race-settings'),buffers=new Map();
for(const[file,expected]of files){
  assert.equal(path.basename(file),file);const resolved=await realpath(path.join(root,file));assert.equal(path.dirname(resolved),root);
  const data=await readFile(resolved);assert.equal(data.length,expected.length,file);assert.equal(hash(data),expected.sha256,file);bytes+=data.length;if(snapshotFiles.has(file))snapshotBytes+=data.length;
  if(file===settingsRow.contextFile||settingsRow.ranges.some(range=>range.file===file))buffers.set(file,data);
}
const held=await loadHeldForceRequest(directory),owner=records.find(row=>row.type==='owned-process');
const settings={...settingsRow,context:buffers.get(settingsRow.contextFile),ranges:new Map(settingsRow.ranges.map(range=>[range.id,{...range,bytes:buffers.get(range.file)}]))};
const raceSettings=verifyControlledRaceSettingsRecords(configuration,records,settings,owner,held.snapshot);
const budget=validateHeldBudgetEvidence(held,configuration,records.find(row=>row.type==='held-force-budget'));
const storage=verifyHeldRangeStorageDiagnostic(held.snapshot,records,{pid:owner.pid,role:'held-pre-input'});
const plan=JSON.parse(await readFile(path.join(root,'held-force-plan.json'))),cleanup=records.find(row=>row.type==='owned-process-cleanup');
assert.equal(records.some(row=>row.type==='complete'),false);assert.equal(records.filter(row=>row.type==='held-force-intervention').length,0);
assert.equal(cleanup.terminated,true);assert.equal(plan.selected,null);assert.equal(plan.attempts.length,0);
const summary={schemaVersion:1,authority:'original-held-entry-and-native-host-contained-storage-proof',captureDirectory:directory,
  supersedes:'analysis/held-chassis-border-high-lev1-shared-v4-input-storage-audit-20261023.json',
  correction:'The initial audit hashed snapshot blobs only and included an incorrect literal total in a limit sentence. This audit independently verifies every snapshot and stop-diagnostic blob.',
  captureSucceeded:false,completeNativeFrameCompared:false,nativeChassisWallContactProved:false,forceWrites:0,
  targetSha256:records[0].executableSha256,traceSha256:hash(trace),configurationSha256:hash(configurationBytes),
  allEmittedBlobs:{files:files.size,bytes,allHashesMatch:true,snapshotFiles:snapshotFiles.size,snapshotBytes,stopDiagnosticFiles:files.size-snapshotFiles.size},
  raceSettings,budget,storage:{verified:storage.verified,logicalSnapshotBytes:storage.logicalSnapshotBytes,retainedSnapshotBytes:storage.retainedSnapshotBytes,backingCount:storage.backingCount,viewCount:storage.viewCount},
  sourcePlan:{authority:plan.authority,baselineComplete:plan.baselineComplete,attempts:0,selected:null,elapsedMs:plan.elapsedMs,originalInputBytesUnchanged:plan.originalInputBytesUnchanged,independentlyReplayedHere:false},
  requestPresent:true,decisionPresent:false,errors:records.filter(row=>row.type==='capture-error').map(row=>({error:row.error.split('\n')[0],elapsedMs:row.elapsedMs})),cleanup,
  limits:['No completed native physics frame, force response or chassis-wall contact is claimed.','The actual native host checks each backing identity and view offset; all emitted file hashes are independently verified.','Fresh source candidate replay belongs to the separate source audit.']};
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(summary,null,2),{flag:'wx'});
console.log(JSON.stringify({verified:true,output:process.argv[2]??null,allEmittedBlobs:summary.allEmittedBlobs,budget,storage:summary.storage,raceSettingsVerified:raceSettings.verified,forceWrites:0,cleanupMs:cleanup.elapsedMs}));
