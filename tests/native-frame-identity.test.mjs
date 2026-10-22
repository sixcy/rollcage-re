import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {inspectNativeFrameIdentity,compareNativeFrameIdentity} from '../tools/lib/native-frame-identity.mjs';
import {inspectNativeFrameScenario} from '../tools/lib/native-frame-scenario.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';
import {buildNativeFrameManifest} from '../tools/lib/native-frame-manifest.mjs';
import {pairNativeFrameSnapshots} from '../tools/check-native-frame-replay.mjs';

function fixture() {
  const session=Buffer.alloc(0x590),configuration=Buffer.alloc(0x70);
  session[0x579]=2;session[0xe]=3;session[0x54d]=6;session[0x58c]=1;session.writeUInt32LE(4,0x57c);
  session.set([6,3,5,0,4,1],0x1c);session.fill(8,0,6);session.set([0,1,2,3,4,5],0x10);configuration[0x31]=1;
  const snapshot={moduleBaseAddress:0x6e0000,ranges:[{address:0x70000000,bytes:session},{address:0x71000000,bytes:configuration}]};
  const manifest={observed:{participantCount:6},requiredRegions:[{id:'session',address:0x70000000,length:session.length},{id:'configuration',address:0x71000000,length:configuration.length}]};
  return {snapshot,manifest,session,configuration};
}

test('native filename producer uses captured unsigned track selector and exact quality-one branch',()=>{
  const f=fixture();
  for(const [quality,directory]of [[0,'LOW'],[1,'HIGH'],[2,'LOW'],[255,'LOW']]){
    f.configuration[0x31]=quality;const r=inspectNativeFrameIdentity(f.snapshot,f.manifest);
    assert.equal(r.selectedBlpResource,`${directory}/LEV3.BLP`);assert.equal(r.selectedBtpResource,`${directory}/LEV3.BTP`);
    assert.equal(r.selectedTrackIndex,2);assert.equal(r.selectedLevelNumber,3);assert.equal(r.qualityByte,quality);
    assert.deepEqual(r.sessionVehicleTypes,[6,3,5,0,4,1]);assert.equal(r.sessionAddress,0x70000000);
    assert.equal(r.directlyCapturedTrackStem.available,false);
  }
  f.session[0x579]=255;assert.equal(inspectNativeFrameIdentity(f.snapshot,f.manifest).selectedTrackStem,'LOW/LEV256','Do not clamp or infer supported-track bounds absent from43b0e0.');
});

test('identity preserves all six selectors, active count and before/after changes without reading common chassis kind',()=>{
  const f=fixture(),before=inspectNativeFrameIdentity(f.snapshot,f.manifest);
  assert.equal(compareNativeFrameIdentity(before,inspectNativeFrameIdentity(f.snapshot,f.manifest)).stable,true);
  f.session[0x1c]=0;f.session[0x579]=1;
  const changed=compareNativeFrameIdentity(before,inspectNativeFrameIdentity(f.snapshot,f.manifest));
  assert.equal(changed.stable,false);assert.deepEqual(changed.changedFields.map(row=>row.field),['selectedTrackIndex','sessionVehicleTypes']);
  f.session[0x54d]=2;f.manifest.observed.participantCount=2;f.session[0x20]=255;
  const r=inspectNativeFrameIdentity(f.snapshot,f.manifest);assert.deepEqual(r.activeVehicleTypes,[0,3]);assert.equal(r.sessionVehicleTypes[4],255);
  const beforeCountChange=inspectNativeFrameIdentity(f.snapshot,f.manifest);f.session[0x54d]=1;
  assert.deepEqual(compareNativeFrameIdentity(beforeCountChange,inspectNativeFrameIdentity(f.snapshot,f.manifest)).changedFields.map(row=>row.field),['participantCount']);
});

test('optional directly captured filename is separate evidence and mismatches remain visible',()=>{
  const f=fixture(),bytes=Buffer.from('high\\lev3\0'),address=0xa0001000;
  f.snapshot.ranges.push({address,bytes});f.manifest.requiredRegions.push({id:'track-stem',preferredAddress:0x6e6660,address,length:bytes.length});
  let r=inspectNativeFrameIdentity(f.snapshot,f.manifest);assert.equal(r.directlyCapturedTrackStem.matchesSelectedStem,true);assert.equal(r.directlyCapturedTrackStem.value,'high\\lev3');
  bytes[8]='2'.charCodeAt(0);r=inspectNativeFrameIdentity(f.snapshot,f.manifest);assert.equal(r.directlyCapturedTrackStem.matchesSelectedStem,false);assert.equal(r.selectedTrackStem,'HIGH/LEV3');
  bytes[bytes.length-1]=1;assert.throws(()=>inspectNativeFrameIdentity(f.snapshot,f.manifest),/terminator/);
});

test('absent declarations remain unavailable; truncated captures and contradictory bounds fail closed',()=>{
  const f=fixture();assert.equal(inspectNativeFrameIdentity(f.snapshot,{requiredRegions:[]}).available,false);
  f.manifest.requiredRegions[0].length=0x20;assert.throws(()=>inspectNativeFrameIdentity(f.snapshot,f.manifest),/Invalid native identity/);
  f.manifest.requiredRegions[0].length=0x590;f.session[0x54d]=7;assert.throws(()=>inspectNativeFrameIdentity(f.snapshot,f.manifest),/participant count/);
  f.session[0x54d]=6;f.snapshot.ranges.pop();assert.throws(()=>inspectNativeFrameIdentity(f.snapshot,f.manifest),/Uncaptured/);
});

const recordings=[
  ['hidden-three-frames-capture','HIGH/LEV3',[6,3,5,0,4,1]],
  ['hidden-moving-frames-capture','HIGH/LEV2',[6,0,5,2,4,3]],
  ['hidden-turn-frames-capture','HIGH/LEV2',[6,4,0,2,1,3]],
  ['hidden-selected-collision-capture','HIGH/LEV3',[6,2,5,3,1,4]],
];
test('retained original frame identities follow captured selectors and remain stable through each native physics call',{skip:recordings.some(([name])=>!existsSync(`analysis/native-physics-local/startup-20261022/${name}/trace.jsonl`))},async t=>{
  let checked=0;
  for(const[name,expectedStem,expectedTypes]of recordings){
    const directory=`analysis/native-physics-local/startup-20261022/${name}`,capture=await loadPhysicsCapture(directory),config=JSON.parse(await readFile(`${directory}/configuration.json`,'utf8'));
    const pairing=pairNativeFrameSnapshots(capture,config);
    for(const pair of pairing.pairs){
      const manifest=buildNativeFrameManifest(pair.before,pair.options),scenario=inspectNativeFrameScenario(pair,manifest),identity=scenario.identity;
      assert.equal(identity.available,true);assert.equal(identity.stable,true);
      if(expectedStem)assert.equal(identity.before.selectedTrackStem,expectedStem);
      if(expectedTypes)assert.deepEqual(identity.before.sessionVehicleTypes,expectedTypes);
      assert.equal(identity.before.participantCount,6);assert.equal(identity.before.qualityByte,1);checked++;
      if(pair===pairing.pairs[0])t.diagnostic(`${name}: ${identity.before.selectedTrackStem}, native types${JSON.stringify(identity.before.sessionVehicleTypes)}`);
    }
  }
  assert.equal(checked,10);
});
