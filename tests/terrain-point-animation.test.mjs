import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeTerrainPointAnimation, updateTerrainPointAnimation} from '../src/terrain-point-animation.mjs';
import {initializeBodyRetirementEffectTables} from '../src/body-retirement-effects.mjs';

function fixture() {
  const memory=Buffer.alloc(0xa00000),put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p);
  initializeBodyRetirementEffectTables(memory);put(0x90b990,0x50000);put(0x50100,0x51000);put(0x909240,0x52000);put(0x52000,0x53000);put(0x53008,2);put(0x53020,0x54000);put(0x909270,0x55000);
  for(let i=0;i<9;i++){word(0x54000+i*8,i);word(0x54002+i*8,-i);word(0x54004+i*8,i+20);word(0x54006+i*8,5<<6);}memory[0x55000+5*4+3]=42;
  const runtime={memory,scratchBase:0x9000,handlers:{allocate:size=>{assert.equal(size,0x6000);return 0x60000;}}};return{memory,put,word,runtime};
}
test('constructor deduplicates shared cell corners in authored order and captures their base positions',()=>{
  const f=fixture();f.memory[0x500fc]=2;f.memory[0x51007]=1;initializeTerrainPointAnimation(f.runtime);
  assert.equal(f.memory.readInt32LE(0x90b998),6);assert.deepEqual(Array.from({length:6},(_,i)=>f.memory.readUInt32LE(0x60000+i*24)),[0x54000,0x54008,0x54018,0x54020,0x54010,0x54028]);
  assert.equal(f.memory.readInt16LE(0x60006),0);assert.equal(f.memory.readInt16LE(0x60000+24+6),-1);
  assert.deepEqual([...f.memory.subarray(0x55000+0xfbc,0x55000+0xfc0)],[32,0,0,42]);
});
test('constructor captures authored cell count before allocation but reads its table after allocation',()=>{
  const f=fixture();f.memory[0x500fc]=1;f.runtime.handlers.allocate=()=>{f.memory[0x500fc]=0;f.put(0x50100,0x51100);f.memory[0x51103]=1;return 0x60000;};
  initializeTerrainPointAnimation(f.runtime);assert.equal(f.memory.readInt32LE(0x90b998),4);assert.equal(f.memory.readUInt32LE(0x60000),0x54008);
});
test('phase reset retains the incoming exceeded phase for this update displacement',()=>{
  const f=fixture();f.memory[0x500fc]=1;f.put(0x90b994,0x60000);f.put(0x90b998,1);f.put(0x60000,0x54000);f.word(0x60004,10);f.word(0x60006,20);f.word(0x60008,30);f.word(0x60010,127);f.word(0x60012,64);
  //RNG seed1 avoids the independent random point emissions for this one row.
  f.put(0x5ec958,1);updateTerrainPointAnimation(f.runtime);assert.equal(f.memory.readUInt16LE(0x60010),0);assert.deepEqual([0,2,4].map(o=>f.memory.readInt16LE(0x54000+o)),[14,28,34]);
});
test('enabled empty point table still advances two independent emission RNG gates',()=>{
  const f=fixture();f.memory[0x500fc]=1;f.put(0x90b994,0x60000);f.put(0x5ec958,1);updateTerrainPointAnimation(f.runtime);assert.equal(f.memory.readInt32LE(0x5ec958),282475249);assert.equal(f.memory.readInt32LE(0x5ed2b4),0);
});
test('disabled point update preserves phase, dirty state and RNG',()=>{
  const f=fixture();f.put(0x5ec958,123);f.put(0x5ed2b4,5);updateTerrainPointAnimation(f.runtime);assert.equal(f.memory.readInt32LE(0x5ec958),123);assert.equal(f.memory.readInt32LE(0x5ed2b4),5);
});
