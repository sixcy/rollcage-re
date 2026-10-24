import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {checkNativeParentTail} from '../tools/check-native-parent-tail.mjs';

const raw='analysis/native-parent-rtti-stock-capture-v4-20261024';
test('original V4 carries overlapping ASLR globals and source-mutated channel pointers through cameras, then consumes both weather casts before missing QPC',{skip:!existsSync(`${raw}/trace.jsonl`)},async()=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'rollcage-weather-replay-'));
  try{
    const {report:r}=await checkNativeParentTail(raw,path.join(temporary,'result')),f=r.frames[0];
    assert.equal(r.rttiCaptureProofs[0].verified,true);assert.equal(r.rttiCaptureProofs[0].moduleBaseAddress,0x5f0000);
    assert.equal(r.tyreSound2,true);assert.equal(r.sourceComplete,false);assert.equal(r.completeParentTickMatched,false);
    for(const result of [f.afterAi,f.prefix,f.physics])assert.equal(result.matched,true);
    assert.deepEqual(f.stages.map(row=>row.stage),['attachments','recovery','drive','auxiliary','cameras']);
    for(const row of f.stages){assert.equal(row.comparison.matched,true);assert.equal(row.comparison.uniqueBytesCompared,row.stage==='cameras'?5108106:5107873);}
    assert.deepEqual(f.sourceRttiEvents.map(row=>row.family),['camera','weather-screen','weather-screen']);
    assert.deepEqual(f.sourceRttiEvents.slice(1).map(row=>row.weatherQueryIndex),[1,2]);
    assert.ok(f.sourceRttiEvents.every(row=>Buffer.from(row.sourceNameHex,'hex').toString()==='0 Player'));
    assert.deepEqual(f.sourceSoundCreationEvents,[],'This frame does not establish native tyre-onset creation.');
    assert.match(f.error,/Game network requires platform service QueryPerformanceCounter/);
    assert.equal(f.partialExecution.parentReturned,false);
  }finally{
    const resolved=path.resolve(temporary),root=path.resolve(tmpdir());
    if(path.dirname(resolved)!==root||!path.basename(resolved).startsWith('rollcage-weather-replay-'))throw Error('Unexpected temporary replay path.');
    await rm(resolved,{recursive:true,force:true});
  }
});
