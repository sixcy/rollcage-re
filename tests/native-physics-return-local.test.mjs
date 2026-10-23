import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {pairNativeControlSnapshots} from '../tools/lib/native-control-capture.mjs';
import {replayNativeParentPhysicsSegment,compareNativePhysicsReturnLocal} from '../tools/check-native-parent-physics-segment.mjs';

const root='analysis/native-physics-local/startup-20261022';
async function replay(name){
  const raw=`${root}/${name}`,capture=await loadPhysicsCapture(raw),configuration=JSON.parse(await readFile(`${raw}/configuration.json`)),pairing=pairNativeControlSnapshots(capture,configuration),pair=pairing.pairs[0];
  return {pair,...replayNativeParentPhysicsSegment(pair,pairing.options,{lateStages:pairing.lateStages})};
}

test('original collision frame derives the POP ECX local from real responses and detects corruption',{skip:!existsSync(`${root}/parent-late-v3-20261023/trace.jsonl`)},async()=>{
  const {pair,source,comparison,returnLocal,sourceDispatches}=await replay('parent-late-v3-20261023');
  assert.equal(comparison.matched,true,JSON.stringify(comparison.firstDivergence));
  assert.equal(comparison.comparedBytes,5124163);
  assert.equal(comparison.sourceReport.processedEvents,5);
  assert.equal(comparison.sourceReport.scriptedBodies,7);
  assert.equal(returnLocal.matched,true);
  assert.notEqual(Number(pair.after.registers.ecx),returnLocal.sourceValue);
  assert.equal(returnLocal.sourceValue,sourceDispatches.filter(row=>row.stage==='after').at(-1).object1.address);
  source.memory.writeUInt32LE(returnLocal.sourceValue^1,returnLocal.address);
  assert.equal(compareNativePhysicsReturnLocal(source,pair).matched,false);
});

test('original empty event loop retains the observed incoming ECX in the pushed local',{skip:!existsSync(`${root}/parent-late-v2-20261023/trace.jsonl`)},async()=>{
  const {pair,comparison,returnLocal}=await replay('parent-late-v2-20261023');
  assert.equal(comparison.matched,true,JSON.stringify(comparison.firstDivergence));
  assert.equal(comparison.sourceReport.processedEvents,0);
  assert.equal(returnLocal.sourceValue,Number(pair.after.registers.ecx));
  assert.equal(returnLocal.matched,true);
});
