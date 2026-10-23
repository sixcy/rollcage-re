import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {forceAlongBorderNormal,cloneNativeFrameWithForce,checkNativeChassisBorderPreflight} from '../tools/check-native-chassis-border-preflight.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';

test('force directions use original quantized normal lanes and bounded signed Q16 arithmetic',()=>{
  assert.deepEqual(forceAlongBorderNormal([15360,0,62464],-16*65536),[-245760,0,-999424]);
  assert.deepEqual(forceAlongBorderNormal([-257,0,65536],1),[-1,0,1]);
  assert.deepEqual(forceAlongBorderNormal([15360,0,62464],16*65536),[245760,0,999424]);
  for(const [n,s]of [[[0,0,0],65536],[[65537,0,0],65536],[[1.5,0,0],65536],[[65536,0,0],0],[[65536,0,0],65*65536]])assert.throws(()=>forceAlongBorderNormal(n,s));
});

function inputFixture(){
  //Synthetic byte-layout fixture for mutation boundaries, not a body constructor
  //or original-process physics observation.
  const body=0x1200000,record=Buffer.alloc(6*0x30c),bytes=Buffer.from({length:0x3e78},(_,i)=>(i*17+3)&255);
  record.writeUInt32LE(body,2*0x30c);bytes.writeUInt32LE(0x1c03);[100,-200,300].forEach((v,i)=>bytes.writeInt32LE(v,0x74+i*4));
  const parts=[{id:'participants',address:0x909300,bytes:record},{id:'body',address:body,bytes},{id:'header-alias',address:body,bytes:Buffer.from(bytes.subarray(0,0x180))},{id:'partial-force-alias',address:body+0x78,bytes:Buffer.from(bytes.subarray(0x78,0x7c))}];
  return {body,snapshot:{moduleBaseAddress:0x400000,ranges:new Map(parts.map(r=>[r.id,r]))}};
}

test('force clone preserves every non-force byte and updates all complete/partial overlapping original spans',()=>{
  const {body,snapshot}=inputFixture(),hashes=[...snapshot.ranges.values()].map(r=>createHash('sha256').update(r.bytes).digest('hex'));
  const changed=cloneNativeFrameWithForce(snapshot,{participantIndex:2,incrementQ16:[-100,100,400]});
  assert.deepEqual(changed.proof.originalForceQ16,[100,-200,300]);assert.deepEqual(changed.proof.experimentalForceQ16,[0,-100,700]);
  const original=createCapturedMemory([...snapshot.ranges.values()]).memory,m=createCapturedMemory([...changed.snapshot.ranges.values()]).memory;
  assert.deepEqual(m.subarray(body,body+0x74),original.subarray(body,body+0x74));assert.deepEqual(m.subarray(body+0x80,body+0x3e78),original.subarray(body+0x80,body+0x3e78));
  assert.equal(changed.proof.unchangedBodyBytes,0x3e78-12);assert.equal(changed.proof.changedRanges.length,3);
  assert.equal(changed.snapshot.ranges.get('partial-force-alias').bytes.readInt32LE(),-100);
  assert.deepEqual([...snapshot.ranges.values()].map(r=>createHash('sha256').update(r.bytes).digest('hex')),hashes);
  assert.throws(()=>cloneNativeFrameWithForce(snapshot,{participantIndex:0,incrementQ16:[1,2,3]}),/actual participant type3/);
  assert.throws(()=>cloneNativeFrameWithForce(snapshot,{participantIndex:2,incrementQ16:[0x1000000,0,0]}),/addition exceeds/);
  snapshot.ranges.get('body').bytes.writeUInt32LE(4);snapshot.ranges.get('header-alias').bytes.writeUInt32LE(4);
  assert.throws(()=>cloneNativeFrameWithForce(snapshot,{participantIndex:2,incrementQ16:[1,2,3]}),/actual participant type3/);
});

const retained='analysis/native-physics-local/startup-20261022/hidden-selected-collision-capture';
test('retained348 full source preflight keeps all24 bounded outcomes and requires genuine type3/7 candidate geometry after complete execution', {skip:!existsSync(`${retained}/trace.jsonl`)},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'rollcage-chassis-border-preflight-'));
  try{
    const output=path.join(directory,'report.json'),r=await checkNativeChassisBorderPreflight(retained,output);
    assert.equal(r.clock,348);assert.equal(r.baseline.nativeFrameMatched,true);assert.equal(r.baseline.processedEvents,2);assert.equal(r.baseline.modelQueries,0);
    assert.ok(r.baseline.events.every(e=>e.before.object1.type===4));assert.equal(r.preflightCompleted,true);assert.equal(r.originalInputBytesUnchanged,true);
    assert.equal(r.originalGameLaunched,false);assert.equal(r.nativeControlledExperimentPerformed,false);assert.equal(r.summary.attempts,24);
    assert.equal(r.summary.completeSourceAttempts,24);assert.equal(r.summary.unboundOrFailedAttempts,0);assert.equal(r.summary.sourceChassisBorderAttempts,8);assert.equal(r.summary.samePlannedPlaneAttempts,3);assert.equal(r.summary.smallestSamePlaneAttemptIndex,14);
    assert.deepEqual(r.plan.participants.map(p=>p.borders.length),[0,4,0,0,0,0]);assert.ok(r.plan.participants[1].borders.every(b=>b.type===7&&b.nativeAfterCandidateMatched));
    for(const a of r.attempts){assert.equal(a.sourceComplete,true);assert.equal(a.physics.finishedBodies,19);assert.equal(a.physics.modelQueries,0);assert.equal(a.nativeOutputCompared,false);
      for(const e of a.qualifyingEvents){assert.equal(e.bodyAddress,a.bodyAddress);assert.equal(e.classification.category,'terrain-border');assert.deepEqual(e.classification.matchingPlaneTypes,[7]);assert.ok(e.matchingActualCandidates.length>0);assert.ok(e.matchingActualCandidates.every(c=>c.type===7&&c.id===e.cellId&&c.normalQ16.every((v,i)=>v===e.normalQ16[i])));}}
    const smallest=r.attempts[14];assert.deepEqual(smallest.inputProof.originalForceQ16,[0,0,0]);assert.deepEqual(smallest.incrementQ16,[-245760,0,-999424]);assert.ok(smallest.qualifyingEvents.every(e=>e.samePlannedPlane&&e.cellId===4920584));
    const saved=JSON.parse(await readFile(output,'utf8'));assert.deepEqual(saved.summary,r.summary);
    //Bounded misses are retained, not escalated into a winning input or moved
    //beside a wall. Four-unit signed trials do not reach a chassis border here.
    const missed=await checkNativeChassisBorderPreflight(retained,path.join(directory,'miss.json'),{scalarsQ16:[4*65536]});
    assert.equal(missed.preflightCompleted,true);assert.equal(missed.summary.attempts,8);assert.equal(missed.summary.completeSourceAttempts,8);assert.equal(missed.sourceScenarioFound,false);
    const existing=path.join(directory,'existing.json');await writeFile(existing,'retained');
    await assert.rejects(checkNativeChassisBorderPreflight(retained,existing,{scalarsQ16:[4*65536]}),/EEXIST/);assert.equal(await readFile(existing,'utf8'),'retained');
  }finally{assert.equal(path.dirname(directory),path.resolve(tmpdir()));await rm(directory,{recursive:true,force:true});}
});
