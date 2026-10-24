import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from '../tools/lib/native-control-capture.mjs';
import {verifyNativeParentRttiCaptureRecords} from '../tools/lib/native-parent-rtti-capture.mjs';
import {createNativeParentRttiBindings} from '../tools/lib/native-parent-rtti.mjs';
import {nativeParentTailAdditionalRegions} from '../tools/lib/native-parent-tail-inputs.mjs';
import {nativeControlSound19ObservedRegions} from '../tools/lib/native-control-sound-inputs.mjs';
import {createNativeControlSoundCreationBindings} from '../tools/lib/native-control-sound-creation.mjs';
import {nativeParentLateReplayRegions} from '../tools/check-native-parent-tail.mjs';
import {replayNativeControlThroughPhysics} from '../tools/lib/native-control-physics.mjs';
import {bindNativeParentTail,executeNativeParentTail} from '../tools/lib/native-parent-tail.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {nativeParentViewportObservedRegions} from '../tools/lib/native-parent-viewport-map.mjs';
import {extendNativeFrameGeometryComparison} from '../tools/lib/native-frame-replay.mjs';
import {compareNativeControlOutput} from '../tools/check-native-frame-control-prefix.mjs';

const raw='analysis/native-parent-rtti-stock-capture-v2-20261024';
test('original V2 camera update carries source physics, clone query and authenticated CRT through exact viewport output; weather remains unproved',{skip:!existsSync(`${raw}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(raw),configuration=JSON.parse(await readFile(`${raw}/configuration.json`,'utf8'));
  const records=(await readFile(`${raw}/trace.jsonl`,'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0],options={...pairing.options,moduleBaseAddress:pair.moduleBaseAddress};
  const proof=verifyNativeParentRttiCaptureRecords({capture,configuration,records,pair});assert.equal(proof.externalPairs,1);
  const source=replayNativeControlThroughPhysics(pair.before,{...options,createControlAudioBindings:createNativeControlSoundCreationBindings,
    additionalRegions:[...nativeParentTailAdditionalRegions(pair.before,options),...nativeParentLateReplayRegions(pair.before,pair.moduleBaseAddress,options),...nativeControlSound19ObservedRegions(pair.before,pair.moduleBaseAddress)],
    onBeforeStage:({source})=>assert.equal(compareNativeControlOutput(source,pair.checkpoints.afterAi).matched,true),
    onPrefixComplete:source=>assert.equal(compareNativeControlOutput(source,pair.after).matched,true)});
  assert.equal(compareNativeControlOutput(source,pair.physicsAfter).matched,true);
  const initial=createCapturedMemory([...pair.before.ranges.values()]),bound=bindNativeParentTail(source,{snapshot:pair.before,includeLateInputs:true});
  const rtti=createNativeParentRttiBindings({capture,pair,memory:bound.memory,initialSpan:initial.span});
  const seen=[];let viewport,corruptionDetected=false;
  assert.throws(()=>executeNativeParentTail(bound,{through:'world-effects',crtDynamicCast:rtti.crtDynamicCast,onStage:row=>{
    if(row.stage==='cameras') {
      rtti.assertComplete();viewport=nativeParentViewportObservedRegions(pair.before,{events:rtti.events,moduleBaseAddress:pair.moduleBaseAddress});
      extendNativeFrameGeometryComparison(row.source.manifest,viewport.regions);
    }
    const result=compareNativeControlOutput(row.source,pair.postphysics[row.stage]);
    assert.equal(result.matched,true,JSON.stringify(result.firstDivergence));
    assert.equal(result.uniqueBytesCompared,row.stage==='cameras'?5106930:5106697);seen.push(row.stage);
    if(row.stage==='cameras') {
      const address=viewport.lookups[0].record+28,before=bound.memory[address];bound.memory[address]=before^1;
      const corrupt=compareNativeControlOutput(bound,pair.postphysics.cameras);
      assert.equal(corrupt.matched,false);assert.equal(corrupt.firstDivergence.address,address);bound.memory[address]=before;corruptionDetected=true;
    }
  }}),/source call lacks its recovered common-tail frame\/type tokens/);
  assert.deepEqual(seen,['attachments','recovery','drive','auxiliary','cameras']);assert.equal(rtti.events.length,1);
  assert.equal(Buffer.from(rtti.events[0].sourceNameHex,'hex').toString(),'0 Player');
  assert.ok(viewport.regions.every(row=>row.length<=100),'Whole raw graph/region transport is not a semantic comparison span');
  assert.equal(viewport.regions.reduce((n,row)=>n+row.length,0),241);assert.equal(corruptionDetected,true);
});
