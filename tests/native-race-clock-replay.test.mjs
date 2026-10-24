import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {checkNativeRaceClock,compareNativeRaceClockRegions,describeNativeCounterStackEffects} from '../tools/check-native-race-clock.mjs';
import {writeNativeRaceClockCaptureFixture} from './fixtures/native-race-clock-capture-fixture.mjs';

const snapshot=parts=>({ranges:new Map(parts.map(r=>[r.id,r]))});

test('clock comparison detects both changed output and corruption in otherwise unchanged observed storage',()=>{
  const original=Buffer.from([1,2,3,4,5,6,7,8]),native=Buffer.from(original);
  const source=createCapturedMemory([{address:0x1000,bytes:original}]);
  const regions=[{id:'clock-global',address:0x1000,length:4},{id:'clock-stack',address:0x1004,length:4}];
  const expected=snapshot(regions.map(r=>({...r,bytes:Buffer.from(native.subarray(r.address-0x1000,r.address-0x1000+r.length))})));
  assert.equal(compareNativeRaceClockRegions(source.memory,expected,regions).matched,true);
  for(const address of[0x1000,0x1007]) {
    source.memory[address]^=1;
    const result=compareNativeRaceClockRegions(source.memory,expected,regions);
    assert.equal(result.matched,false);assert.equal(result.differingBytes,1);assert.equal(result.firstDivergence.address,address);
    source.memory[address]^=1;
  }
  assert.deepEqual(original,native,'Neither original input nor native comparison buffers are refreshed.');
});

test('before-CALL comparison excludes only its declared CPU return slot and still detects adjacent/private differences',()=>{
  const region={id:'race-clock-stack',address:0x1000,length:16},source=createCapturedMemory([{address:0x1000,bytes:Buffer.alloc(16)}]);
  const expected=snapshot([{...region,bytes:Buffer.alloc(16)}]);
  source.memory.writeUInt32LE(0x489d13,0x1004);
  const options={excluded:[{address:0x1004,length:4}]};
  assert.equal(compareNativeRaceClockRegions(source.memory,expected,[region]).matched,false);
  assert.equal(compareNativeRaceClockRegions(source.memory,expected,[region],options).uniqueBytesCompared,12);
  for(const address of[0x1003,0x1008]) {
    source.memory[address]=7;
    const result=compareNativeRaceClockRegions(source.memory,expected,[region],options);
    assert.equal(result.matched,false);assert.equal(result.firstDivergence.address,address);source.memory[address]=0;
  }
});

test('observed API private stack residues are classified as evidence without becoming replay inputs',()=>{
  const layout={stackAddress:0x1000,frame:0x1020,outputAddress:0x1038},before=Buffer.alloc(64),after=Buffer.from(before);
  for(const address of[0x1001,0x1018,0x1038,0x101f])after[address-0x1000]=0x77;
  const row=b=>snapshot([{id:'race-clock-stack',address:0x1000,length:b.length,bytes:b}]);
  const effects=describeNativeCounterStackEffects({layout,counterCall:row(before),counterReturn:row(after)});
  assert.deepEqual(Object.fromEntries(Object.entries(effects).map(([k,v])=>[k,v.differingBytes])),
    {privateApiStack:1,cpuCallReturn:1,counterOutput:1,other:1});
  assert.ok(before.every(v=>v===0));assert.equal(after[1],0x77);
});

test('a rehashed final XMM0 mismatch fails numeric proof even when the offline count and every memory byte still match',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'clock-xmm0-negative-')),input=path.join(root,'capture');
  await writeNativeRaceClockCaptureFixture(input);
  const trace=path.join(input,'trace.jsonl'),records=(await readFile(trace,'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const final=records.find(r=>r.type==='snapshot'&&r.breakpointId==='native-race-clock-return');
  const filename=path.join(input,final.contextFile),context=await readFile(filename);
  context[364]^=1;
  final.contextSha256=createHash('sha256').update(context).digest('hex');
  await writeFile(filename,context);
  await writeFile(trace,records.map(r=>JSON.stringify(r)).join('\n')+'\n');
  const {report}=await checkNativeRaceClock(input,path.join(root,'report'));
  assert.equal(report.sourceExecuted,true,report.error);
  assert.equal(report.sourceCount,1);
  assert.ok(report.stages.every(s=>s.comparison.matched&&s.registers.every(r=>r.matched)));
  assert.equal(report.scaledClockMatched,false);
  assert.equal(report.clockResultMatched,false);
  assert.equal(report.sourceComplete,false);
  assert.equal(report.matched,false);
});

const originalClockCapture='analysis/native-race-clock-stock-capture-v2-20261024';
test('original warm clock matches numeric and game results while preserving the strict native API private-stack failure',
  {skip:!existsSync(path.join(originalClockCapture,'trace.jsonl'))},async()=>{
    const root=await mkdtemp(path.join(tmpdir(),'original-warm-clock-'));
    const {report:r}=await checkNativeRaceClock(originalClockCapture,path.join(root,'report'));
    assert.equal(r.sourceExecuted,true,r.error);
    assert.equal(r.sourceCount,1);
    assert.equal(r.clockResultMatched,true);
    assert.equal(r.scaledClockMatched,true);
    assert.equal(r.scaledClock.sourceHex,'62b9a5d510b17240');
    assert.equal(r.scaledClock.nativeHex,r.scaledClock.sourceHex);
    assert.deepEqual(r.stages.map(s=>[s.stage,s.comparison.differingBytes]),
      [['counter-call',0],['counter-return',109],['return',105]]);
    assert.ok(r.stages.every(s=>s.registers.length===7&&s.registers.every(v=>v.matched)));
    const final=r.stages.at(-1),nonstack=final.comparison.regions.filter(v=>v.id!=='race-clock-stack');
    assert.equal(nonstack.length,14);
    assert.equal(nonstack.reduce((n,v)=>n+v.comparedBytes,0),202);
    assert.ok(nonstack.every(v=>v.differingBytes===0));
    assert.equal(final.numerical.length,3);assert.ok(final.numerical.every(v=>v.matched));
    assert.equal(r.counterEvents.length,1);assert.equal(r.counterEvents[0].authority,'actual-QPC-only');
    assert.equal(r.counterStackEffects.privateApiStack.differingBytes,109);
    assert.equal(r.counterStackEffects.other.differingBytes,0);
    assert.equal(r.sourceComplete,false);assert.equal(r.matched,false);
  });
