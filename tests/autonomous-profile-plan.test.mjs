import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeAutonomousProfileTables,updateNearestAutonomousCompetitor,updateAutonomousProfileTier,updateAutonomousLapPolicy,updateAutonomousPairedPolicy,updateAutonomousTierPolicy,updateAutonomousTrafficPolicy,updateAutonomousGapGatePolicy,updateAutonomousProfileCountdown,updateAutonomousProfileRate,updateAutonomousProfilePlan} from '../src/autonomous-profile-plan.mjs';

const BODY=0x10000, SESSION=0x50000, RECORDS=0x909300;
const rng=seed=>Math.imul(seed,0x41a7)&0x7fffffff;
const fixture=(body=BODY)=>{
  const memory=initializeAutonomousProfileTables(Buffer.alloc(0xa00000));
  memory.writeUInt32LE(SESSION,0x5ecb1c); memory.writeUInt32LE(1,0x5ea4d4);
  memory[SESSION+0x54d]=3; memory.writeUInt16LE(0,body+0x65e); memory[body+0x6f3]=255;
  for(let i=0;i<3;i++){memory.writeUInt32LE(i===0?body:BODY+i*0x4000,RECORDS+i*0x30c);memory[BODY+i*0x4000+0x718]=10;}
  return memory;
};
const put=(memory,address,value)=>memory.writeInt32LE(value|0,address);

test('434960 prefers an ahead competitor and retains the closest nonpositive gap',()=>{
  const memory=fixture(); put(memory,RECORDS+0x24,10000); put(memory,RECORDS+0x30c+0x24,10100); put(memory,RECORDS+2*0x30c+0x24,10020);
  assert.deepEqual(updateNearestAutonomousCompetitor(BODY,{memory}),{index:2,distance:-20});
  put(memory,RECORDS+2*0x30c+0x24,10000);
  assert.deepEqual(updateNearestAutonomousCompetitor(BODY,{memory}),{index:2,distance:0});
  memory[BODY+0x4000+0x718]=8; memory[BODY+0x8000+0x718]=9;
  assert.deepEqual(updateNearestAutonomousCompetitor(BODY,{memory}),{index:255,distance:0x70000000});
});

test('420090 wraps tier additions before clamping and mode2 bypasses the leader',()=>{
  const memory=fixture(); put(memory,0x5ea4d8,3); memory.writeUInt16LE(1,BODY+0x65e); memory[BODY+0x6f1]=255; memory[BODY+0x6f3]=0; put(memory,RECORDS+0x24,40000);
  updateAutonomousProfileTier(BODY,{memory}); assert.equal(memory[BODY+0x6f1],1);
  put(memory,0x5ea4d8,2); updateAutonomousProfileTier(BODY,{memory}); assert.equal(memory[BODY+0x6f1],4);
});

test('41fd20 early clock gate consumes no RNG and final lap increases probability',()=>{
  const memory=fixture(); put(memory,BODY+0x6ec,-1); put(memory,BODY+0x6f4,1<<9); put(memory,0x90a548,349);
  updateAutonomousLapPolicy(BODY,{memory}); assert.equal(memory.readUInt32LE(0x5ea4d4),1); assert.equal(memory.readUInt32LE(BODY+0x6ec)&2,0);
  put(memory,0x90a548,350); updateAutonomousLapPolicy(BODY,{memory}); assert.equal(memory.readUInt32LE(0x5ea4d4),rng(1)); assert.equal(memory.readUInt32LE(BODY+0x6ec)&2,2);
});

test('41ff20 uses original unsigned thresholds and exactly two RNG transitions',()=>{
  const memory=fixture(); memory[BODY+0x6f8]=0; put(memory,BODY+0x6ec,-1);
  updateAutonomousPairedPolicy(BODY+0x6c0,{memory}); assert.equal(memory.readUInt32LE(BODY+0x6ec)&0x180,0); assert.equal(memory.readUInt32LE(0x5ea4d4),rng(rng(1)));
  memory[BODY+0x6f8]=7; updateAutonomousPairedPolicy(BODY+0x6c0,{memory}); assert.equal(memory.readUInt32LE(BODY+0x6ec)&0x180,0x180);
});

test('41ff90 high tier clears the policy without consuming a random value',()=>{
  const memory=fixture(); memory[BODY+0x6f1]=4; put(memory,BODY+0x6ec,-1);
  updateAutonomousTierPolicy(BODY,{memory}); assert.equal(memory.readUInt32LE(0x5ea4d4),1); assert.equal(memory.readUInt32LE(BODY+0x6ec)&0x200,0);
});

test('41fb30 folds laps and preserves strict200/-3000 traffic boundaries',()=>{
  for(const [gap,enabled] of [[200,true],[201,false],[-3000,false],[-2999,true],[65536+200,true],[65536+201,false]]){
    const memory=fixture(); memory[SESSION+0x54d]=2; put(memory,BODY+0x6f8,3<<18); put(memory,RECORDS+0x30c+0x24,gap);
    updateAutonomousTrafficPolicy(BODY,0,{memory}); assert.equal(!!(memory.readUInt32LE(BODY+0x6ec)&0x400),enabled,`gap${gap}`);
  }
});

test('41fa90 tier3 gate opens at exactly2048 and blocked paths preserve RNG',()=>{
  const memory=fixture(); memory[BODY+0x6f1]=3; memory[BODY+0x6da]=1; put(memory,BODY+0x6f8,7<<21); put(memory,BODY+0x6dc,2047);
  updateAutonomousGapGatePolicy(BODY+0x6c0,{memory}); assert.equal(memory.readUInt32LE(0x5ea4d4),1);
  put(memory,BODY+0x6dc,2048); updateAutonomousGapGatePolicy(BODY+0x6c0,{memory}); assert.equal(memory.readUInt32LE(0x5ea4d4),rng(1)); assert.equal(memory.readUInt32LE(BODY+0x6ec)&0x800,0x800);
});

test('41f7b0 consumes the correct zero/one/two/three RNG steps for all profiles',()=>{
  for(let selector=0;selector<8;selector++){
    const memory=fixture(); memory[BODY+0x6f7]=selector; updateAutonomousProfileCountdown(BODY+0x6c0,{memory});
    let expected=1; for(let i=0;i<(selector===0?0:selector===7?1:selector===4?3:2);i++)expected=rng(expected);
    assert.equal(memory.readUInt32LE(0x5ea4d4),expected,`profile${selector}`);
    if(selector===0)assert.equal(memory[BODY+0x6f0],255);
  }
});

test('4201b0 preserves the early byte, bypasses bonuses without a competitor, and treats clock unsigned',()=>{
  const memory=fixture(); memory[BODY+0x6f2]=133; memory[BODY+0x6da]=255; memory[BODY+0x6f1]=3; memory[SESSION+0x1c]=6;
  put(memory,0x90a548,377); updateAutonomousProfileRate(BODY,0,{memory}); assert.equal(memory[BODY+0x6f2],133);
  put(memory,0x90a548,-1); updateAutonomousProfileRate(BODY,0,{memory}); assert.equal(memory[BODY+0x6f2],7);
  memory[BODY+0x6da]=1; put(memory,BODY+0x6dc,-32768); updateAutonomousProfileRate(BODY,0,{memory}); assert.equal(memory[BODY+0x6f2],10);
});

test('41f900 captures its clock before live aliasing flag writes and keeps nonzero-mode gap stale',()=>{
  const body=0x90a548-0x6ec,memory=fixture(body); put(memory,body+0x6dc,12345); put(memory,0x90a548,351);
  updateAutonomousProfilePlan(body,1,{memory,scratchBase:0x9000});
  assert.equal(memory[body+0x6da],255); assert.equal(memory.readInt32LE(body+0x6dc),12345); assert.equal(memory.readUInt32LE(body+0x6ec)&0x20,0); assert.equal(memory[body+0x6f2],15);
  assert.equal(memory.readInt32LE(0x8ffc),1);
});
