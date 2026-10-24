import test from 'node:test';
import assert from 'node:assert/strict';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createAttachmentEffectsFixture} from '../tools/verify-attachment-effects-instructions.mjs';
import {emitRawAttachmentParticle,updateRawPersistentEmitters} from '../src/attachment-effects.mjs';

const DEFAULT=0x9153d8,ALTERNATE=0x919140,POOL=0x100000,TARGET=0x72000,RECORD=0x6ff140;
function fixture({missing,persistent=false,flags=0,aliasActive=false}={}){
  const original=createAttachmentEffectsFixture(0).memory,particle=aliasActive?ALTERNATE-0x94:POOL;
  if(aliasActive){original.writeUInt32LE(particle,0x902eec);original.writeUInt32LE(particle,0x6e65b4);original.fill(0xa5,particle,particle+256);original.writeUInt32LE(0,particle+0xac);original.writeUInt32LE(0,particle+0xb0);original.writeUInt32LE(0x55555500,ALTERNATE);}
  if(persistent){for(let i=0;i<10;i++)original.writeInt32LE(0,RECORD+i*20+12);original.writeInt32LE(900,RECORD+12);original.writeInt16LE(0,RECORD+6);original.writeInt32LE(0,RECORD+16);original[RECORD+11]=flags;}
  const rows=missing?[{address:0,bytes:Buffer.from(original.subarray(0,missing))},{address:missing+4,bytes:Buffer.from(original.subarray(missing+4))}]:[{address:0,bytes:original}];
  const f=createCapturedMemory(rows),events=[],underlying=f.memory;
  //Observe actual source memory reads only. This intentionally does not use
  //BoundedX86's lazy CMOV getter as proof of architectural memory obligations.
  const read=underlying.readUInt32LE.bind(underlying),readSigned=underlying.readInt32LE.bind(underlying);
  const observeRead=(address,...args)=>{
    if(address===DEFAULT||address===ALTERNATE)events.push({kind:'mesh',address,active:underlying[particle+0x94],stored:read(particle+0xa4)});
    return read(address,...args);
  };
  const observeSigned=(address,...args)=>{if(address===0x5ec958)events.push({kind:'rng',address});return readSigned(address,...args);};
  const memory=new Proxy(underlying,{get:(target,key)=>key==='readUInt32LE'?observeRead:key==='readInt32LE'?observeSigned:Reflect.get(target,key,target)});
  return{...f,memory,events,particle,run:()=>persistent?updateRawPersistentEmitters({memory}):emitRawAttachmentParticle(TARGET,28,0x4000,17,flags,{memory})};
}

test('retained MOV/CMOV and active/mesh store order differ exactly between44f7a0 and44f990',async()=>{
  const proof=await readInstructionEvidence(['1065-attachment-emitter-assembly.json','1063-attachment-target-update-b-assembly.json'],{directory:'analysis/native-simulation/results'});
  assert.ok(proof.evidence.every(e=>e.subject.digest.sha256==='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5'));
  const list=new Map(proof.instructions.map(row=>[row.address,row]));
  for(const[address,op,args]of[[0x44f873,'MOV',['EAX','[0x009153d8]']],[0x44f880,'MOV',['byte ptr [EDI + 0x94]','0x1']],
    [0x44f887,'CMOVNZ',['EAX','dword ptr [0x00919140]']],[0x44f88e,'MOV',['dword ptr [EDI + 0xa4]','EAX']],
    [0x44f990,'MOV',['ECX','dword ptr [0x005ec958]']],[0x44f99d,'MOV',['EDI','dword ptr [0x009153d8]']],
    [0x44fb0b,'CMOVNZ',['EAX','dword ptr [0x00919140]']],[0x44fb12,'MOV',['dword ptr [EDX + 0xa4]','EAX']],[0x44fb18,'MOV',['byte ptr [EDX + 0x94]','0x1']]]){
    assert.deepEqual(list.get(address),{address,op,args});
  }
});

test('both flag states perform both direct-emitter mesh reads with active publication between them',()=>{
  for(const flags of[0,0x10]){
    const f=fixture({flags});f.run();
    assert.deepEqual(f.events.filter(e=>e.kind==='mesh'),[{kind:'mesh',address:DEFAULT,active:0,stored:0xa5a5a5a5},{kind:'mesh',address:ALTERNATE,active:1,stored:0xa5a5a5a5}]);
    assert.equal(f.memory.readUInt32LE(f.particle+0xa4),flags?0x55555555:0x44444444);
  }
});

test('a false-condition CMOV source is still required, after direct-emitter active publication',()=>{
  const f=fixture({flags:0,missing:ALTERNATE});
  assert.throws(f.run,/Uncaptured native memory at 0x919140 \(4 bytes\)/);
  assert.deepEqual(f.events.filter(e=>e.kind==='mesh').map(e=>[e.address,e.active]),[[DEFAULT,0],[ALTERNATE,1]]);
  assert.equal(f.memory[f.particle+0x94],1);assert.equal(f.memory.readUInt32LE(f.particle+0xa4),0xa5a5a5a5);
});

test('the unconditional default word is required even when the alternate mesh is selected',()=>{
  const f=fixture({flags:0x10,missing:DEFAULT});assert.throws(f.run,/Uncaptured native memory at 0x9153d8 \(4 bytes\)/);
  assert.deepEqual(f.events.filter(e=>e.kind==='mesh').map(e=>e.address),[DEFAULT]);assert.equal(f.memory[f.particle+0x94],0);
  assert.equal(f.memory.readUInt32LE(f.particle+0xa4),0xa5a5a5a5);
});

test('persistent emitters capture RNG before default mesh and read alternate before mesh/active stores for both flags',()=>{
  for(const flags of[0,0x10]){
    const f=fixture({persistent:true,flags});assert.equal(f.run(),1);
    assert.deepEqual(f.events.slice(0,2).map(e=>[e.kind,e.address]),[['rng',0x5ec958],['mesh',DEFAULT]]);
    assert.deepEqual(f.events.filter(e=>e.kind==='mesh').map(e=>[e.address,e.active,e.stored]),[[DEFAULT,0,0xa5a5a5a5],[ALTERNATE,0,0xa5a5a5a5]]);
    assert.equal(f.memory.readUInt32LE(f.particle+0xa4),flags?0x55555555:0x44444444);assert.equal(f.memory[f.particle+0x94],1);
  }
});

test('persistent false-condition CMOV still requires original alternate bytes before publishing the particle',()=>{
  const f=fixture({persistent:true,flags:0,missing:ALTERNATE});assert.throws(f.run,/Uncaptured native memory at 0x919140 \(4 bytes\)/);
  assert.equal(f.memory[f.particle+0x94],0);assert.equal(f.memory.readUInt32LE(f.particle+0xa4),0xa5a5a5a5);
});

test('actual mesh-cell/active-byte aliases distinguish each native publication order',()=>{
  const direct=fixture({flags:0x10,aliasActive:true});direct.run();assert.equal(direct.memory.readUInt32LE(direct.particle+0xa4),0x55555501);
  const persistent=fixture({persistent:true,flags:0x10,aliasActive:true});persistent.run();assert.equal(persistent.memory.readUInt32LE(persistent.particle+0xa4),0x55555500);
});
