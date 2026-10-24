import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {checkNativeParentTail} from '../tools/check-native-parent-tail.mjs';

const raw='analysis/native-parent-rtti-stock-capture-v8-20261024';
test('original V8 carries one source execution through weather/world effects with its genuine single QPC outcome', {skip:!existsSync(`${raw}/trace.jsonl`)},async()=>{
  const temporary=await mkdtemp(path.join(tmpdir(),'rollcage-world-effects-replay-'));
  try{
    const {report:r}=await checkNativeParentTail(raw,path.join(temporary,'result')),f=r.frames[0];
    assert.equal(r.matched,true);assert.equal(r.sourceComplete,true);assert.equal(r.completeParentTickMatched,false);
    assert.equal(r.comparedFrames,1);assert.equal(f.execution.parentReturned,false);
    for(const result of[f.afterAi,f.prefix,f.physics])assert.equal(result.matched,true);
    assert.deepEqual(f.stages.map(s=>s.stage),['attachments','recovery','drive','auxiliary','cameras','world-effects']);
    for(const s of f.stages)assert.equal(s.comparison.matched,true);
    assert.equal(f.stages.at(-1).comparison.uniqueBytesCompared,5109442); //Expanded original light-slot and alternate-mesh input comparison.
    assert.deepEqual(f.sourceRttiEvents.map(e=>e.family),['camera','weather-screen','weather-screen']);
    assert.deepEqual(f.sourceRttiEvents.slice(1).map(e=>e.weatherQueryIndex),[1,2]);
    assert.equal(f.sourceCounterEvents.length,1);assert.equal(f.sourceCounterEvents[0].service,'QueryPerformanceCounter');
    assert.equal(f.sourceCounterEvents[0].authority,'observed-external-QPC-only');
    assert.equal(f.sourceCounterEvents[0].returnedEax,1);
    assert.equal(Buffer.from(f.sourceCounterEvents[0].outputHex,'hex').length,8);
    const graph=r.rttiCaptureProofs[0].soundBankOwnerGraph;
    assert.equal(graph.checkpoints,10);assert.equal(graph.ownerRows,640);
    assert.deepEqual(graph.channelGraph,{checkpoints:10,usedChannelSlots:340,storageRows:130,wrapperRows:340,sourceRows:340,vtableRows:10,additionalBytes:847280});
    assert.ok(graph.observations.every(o=>o.semanticOwnersAdmitted===0&&o.channelGraph.semanticDescendantsAdmitted===0));
    assert.deepEqual(f.sourceSoundCreationEvents,[],'This recording does not exercise newly reconstructed adaptive creation.');
  }finally{
    const resolved=path.resolve(temporary),root=path.resolve(tmpdir());
    if(path.dirname(resolved)!==root||!path.basename(resolved).startsWith('rollcage-world-effects-replay-'))throw Error('Unexpected temporary replay path.');
    await rm(resolved,{recursive:true,force:true});
  }
});
