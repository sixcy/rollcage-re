import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeWorkerWindowRecovery, verifyNativeWorkerGainWindow} from '../tools/lib/native-worker-gain-window.mjs';
import {replayNativeWorkerGainEntry} from '../tools/lib/native-worker-gain-replay.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';

const directory='analysis/native-physics-local/startup-20261022/controlled-recovery-worker-gain-window-v18-20261023';
const present=existsSync(path.join(directory,'trace.jsonl'));
let retained;
async function evidence() {
  return retained ??= (async()=>{
    const configuration=JSON.parse(await readFile(path.join(directory,'configuration.json')));
    const capture=await loadPhysicsCapture(directory,{expectedSha256:REDUX_SHA256});
    const records=(await readFile(path.join(directory,'trace.jsonl'),'utf8')).trim().split(/\r?\n/).map(JSON.parse);
    const pair=pairNativeWorkerWindowRecovery(capture,configuration);
    return {capture,configuration,records,pair,entry:capture.snapshots.find(r=>r.breakpointId==='worker-gain-entry')};
  })();
}

test('original V18 independently binds owned worker entry/normal return and source runs only to first real Win32 boundary', {skip:!present}, async()=>{
  const {capture,configuration,records,pair,entry}=await evidence();
  const proof=verifyNativeWorkerGainWindow(capture,pair,configuration,records);
  assert.deepEqual(proof.endpoints.map(e=>[e.ordinal,e.tid,e.debugOrdinal,e.clock]),[[236,37368,2402,229],[237,37368,2404,229]]);
  assert.ok(pair.after.observedDebugEventOrdinal<proof.endpoints[0].debugOrdinal);
  assert.equal(proof.endpoints[0].source,0x16fec628);assert.equal(proof.endpoints[0].manager,0x086f9388);
  assert.equal(proof.endpoints[0].fpuControlWord,0x27f);assert.equal(proof.fullWorkerInterleavingProved,false);
  const originals=[...entry.ranges.values()].map(r=>Buffer.from(r.bytes));
  const {report}=replayNativeWorkerGainEntry(entry,{moduleBaseAddress:pair.moduleBaseAddress});
  assert.equal(report.failure,null);assert.equal(report.sourceReplayComplete,false);assert.equal(report.externalOutcomesApplied,0);
  assert.equal(report.boundary.name,'EnterCriticalSection');assert.equal(report.boundary.entryEsp,0x0e7bfccc-0x194);
  assert.equal(report.boundary.returnAddress,pair.moduleBaseAddress+0xa7a05);assert.deepEqual(report.boundary.args,[0x086f9388+0x854]);
  assert.deepEqual(report.partialChanges,{sourceBytes:0,managerBytes:0,stackBytes:45});
  [...entry.ranges.values()].forEach((r,i)=>assert.deepEqual(r.bytes,originals[i]));
});

test('original V18 worker proof rejects publication timing, parent borrowing, raw PC24, missing exit and corrupt entry input', {skip:!present}, async()=>{
  const f=await evidence(), verify=()=>verifyNativeWorkerGainWindow(f.capture,f.pair,f.configuration,f.records);
  const admission=f.records.find(r=>r.type==='owned-worker-gain-window-admitted'), time=admission.elapsedMs;
  try{admission.elapsedMs=f.entry.observedElapsedMs-1;assert.throws(verify,/timing/);}finally{admission.elapsedMs=time;}
  try{f.entry.pendingFrame={role:'nested'};assert.throws(verify,/independent/);}finally{delete f.entry.pendingFrame;}
  const cw=f.entry.context.readUInt32LE(28);
  try{f.entry.context.writeUInt32LE(0x7f,28);assert.throws(verify,/PC53/);}finally{f.entry.context.writeUInt32LE(cw,28);}
  assert.throws(()=>verifyNativeWorkerGainWindow({...f.capture,snapshots:f.capture.snapshots.filter(r=>r.breakpointId!=='worker-gain-exit')},f.pair,f.configuration,f.records),/entry and normal exit/);
  const source=f.entry.ranges.get('worker-gain-source').bytes, byte=source[0x300];
  try{source[0x300]^=1;assert.throws(()=>replayNativeWorkerGainEntry(f.entry),/blob hash differs/);}finally{source[0x300]=byte;}
  assert.equal(verify().verified,true);
});
