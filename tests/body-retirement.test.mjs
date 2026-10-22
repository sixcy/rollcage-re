import test from 'node:test';
import assert from 'node:assert/strict';
import {unregisterPhysicalBody,removeBodySpatial,appendBodyPositionEffect,emitBodyEffectBurst,retireType33Body} from '../src/body-retirement.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
const BODY=0x10000,POOL=0x30000,BUCKET=0x40000,ARRAY=0x41000,GROUP=0x42000,GROUP_ARRAY=0x42100,CONTROL=0x43000,FREE=0x50000,ACTIVE=0x51000,REVERSE=0x52000,POSITION=0x53000,VELOCITY=0x53100,STACK=0x9000;
const put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
const fixture=()=>{
 const memory=Buffer.alloc(0xa00000);put(memory,0x902bc0,ARRAY);word(memory,0x902bc4,3);put(memory,ARRAY,0x18000);put(memory,ARRAY+4,BODY);put(memory,ARRAY+8,0x19000);put(memory,BODY+0x130,GROUP);put(memory,GROUP,GROUP_ARRAY);word(memory,GROUP+4,2);put(memory,GROUP_ARRAY,BODY);put(memory,GROUP_ARRAY+4,0x19000);put(memory,BODY+0x164,CONTROL);memory[BODY+0x10c]=255;
 put(memory,0x91e780,FREE);put(memory,0x91e78c,ACTIVE);put(memory,0x91e790,REVERSE);put(memory,0x91e784,3);put(memory,0x91e794,-1);put(memory,0x91e798,4);for(let i=0;i<4;i++){memory[ACTIVE+i]=i;memory[REVERSE+i]=i;}
 put(memory,0x902eec,POOL);put(memory,BODY+12,BUCKET|1);word(memory,BUCKET+8,1);return memory;
};

test('4284d0 collision count0 releases one ID and swaps global/group membership',()=>{
 const memory=fixture();memory[BODY+0x10c]=0;memory[BODY+0x140]=1;unregisterPhysicalBody(BODY,{memory});assert.equal(memory[FREE],1);assert.equal(memory[ACTIVE+1],3);assert.equal(memory[REVERSE+3],1);assert.equal(memory.readInt32LE(0x91e784),2);assert.equal(memory.readInt32LE(0x91e798),3);assert.equal(memory.readUInt16LE(0x902bc4),2);assert.equal(memory.readInt32LE(ARRAY+4),0x19000);assert.equal(memory.readInt32LE(ARRAY+8),0);assert.equal(memory.readUInt16LE(GROUP+4),1);assert.equal(memory.readInt32LE(GROUP_ARRAY),0x19000);assert.equal(memory.readInt32LE(BODY)&0x8000,0x8000);
});

test('4284d0 negative signed collision count skips releases and still clears byte10c',()=>{
 const memory=fixture();memory[BODY+0x10c]=128;unregisterPhysicalBody(BODY,{memory});assert.equal(memory.readInt32LE(0x91e784),3);assert.equal(memory.readInt32LE(0x91e794),-1);assert.equal(memory[BODY+0x10c],0);
});

test('474850 head removal masks bucket tag and detaches the next packed pool node',()=>{
 const memory=fixture();word(memory,BODY+4,3);word(memory,BODY+6,0);word(memory,POOL+2*128+6,99);removeBodySpatial(BODY,{memory});assert.equal(memory.readUInt16LE(BUCKET+8),3);assert.equal(memory.readUInt16LE(POOL+2*128+6),0);assert.equal(memory.readInt32LE(BODY+4),0);
});

test('474850 interior removal patches both adjacent packed IDs',()=>{
 const memory=fixture();word(memory,BODY+4,3);word(memory,BODY+6,2);removeBodySpatial(BODY,{memory});assert.equal(memory.readUInt16LE(POOL+2*128+6),2);assert.equal(memory.readUInt16LE(POOL+128+4),3);assert.equal(memory.readInt32LE(BODY+4),0);
});

test('436410 appends position and pointer, clamps unsigned16 count, and honors capacity',()=>{
 const memory=fixture();put(memory,POSITION,123);appendBodyPositionEffect(POSITION,-3,{memory});assert.equal(memory.readInt32LE(0x8106e0),123);assert.equal(memory.readInt32LE(0x8106ec),POSITION);assert.equal(memory.readUInt16LE(0x8106f0),5);put(memory,0x810920,16);appendBodyPositionEffect(POSITION,4,{memory});assert.equal(memory.readInt32LE(0x810920),16);
});

test('435ba0 cycles24 position slots and forwards exact original emission arguments',()=>{
 const memory=fixture();put(memory,0x9153dc,23);put(memory,POSITION,123);let emission;emitBodyEffectBurst(POSITION,VELOCITY,8,0,11,{memory,scratchBase:STACK,handlers:{emit484bb0:request=>{emission=request;}}});assert.equal(memory.readInt32LE(0x9153dc),0);assert.equal(memory.readInt32LE(0x919020+23*12),123);assert.deepEqual(emission.args,[0,0x400,12000,6,24,0,0]);assert.equal(emission.code,11);assert.equal(emission.registerEdx,0x919020+23*12);assert.equal(emission.position,POSITION);assert.equal(emission.velocity,VELOCITY);
});

test('435bc6 publishes the actual sparse-ASLR ring pointer through both emitter and numeric dispatcher boundaries',()=>{
 const relocation=0x13c00000,position=0x33000000,velocity=0x33000100,ring=0x919020,values=[0x919020,-65536,0x713180];
 for(const index of[0,23])for(const boundary of['emit484bb0','dispatch40ea40']){
  const{memory}=createCapturedMemory([{address:ring+relocation,bytes:Buffer.alloc(24*12)},{address:0x9153dc+relocation,bytes:Buffer.alloc(4)},{address:position,bytes:Buffer.alloc(12)},{address:velocity,bytes:Buffer.alloc(12)}],{aliases:[{address:ring,targetAddress:ring+relocation,length:24*12},{address:0x9153dc,targetAddress:0x9153dc+relocation,length:4}]});
  put(memory,0x9153dc,index);values.forEach((v,i)=>put(memory,position+i*4,v));let calls=0;
  const target=ring+relocation+index*12,handlers={[boundary]:request=>{
   calls++;assert.equal(request.registerEdx>>>0,target);assert.equal(request.code,11);assert.equal(request.memory,memory);assert.deepEqual([0,4,8].map(o=>memory.readInt32LE(target+o)),values,'Position integers are copied unchanged.');
   if(boundary==='emit484bb0'){assert.equal(request.position,position);assert.equal(request.velocity,velocity);assert.deepEqual(request.args,[0,0x400,12000,6,index+1,0,0]);}
   else{assert.equal(request.parameters.readInt32LE(8),6);assert.equal(request.first,0);assert.equal(request.sixth,0);}
   put(memory,request.registerEdx,321);return -1;
  }};
  emitBodyEffectBurst(position,velocity,8,0,11,{memory,scratchBase:0x31001000,handlers});assert.equal(calls,1);assert.equal(memory.readInt32LE(0x9153dc),index===23?0:1);assert.equal(memory.readInt32LE(target),321);assert.deepEqual([0,4,8].map(o=>memory.readInt32LE(position+o)),values);assert.throws(()=>memory.readInt32LE(position+12),/Uncaptured/);
 }
});

test('435ba0 requires captured bytes for its static ring instead of publishing an unresolved preferred pointer',()=>{
 const{memory}=createCapturedMemory([{address:0x149153dc,bytes:Buffer.alloc(4)},{address:0x33000000,bytes:Buffer.alloc(12)}],{aliases:[{address:0x9153dc,targetAddress:0x149153dc,length:4}]});let called=false;
 assert.throws(()=>emitBodyEffectBurst(0x33000000,0x33000100,1,0,11,{memory,scratchBase:0x31001000,handlers:{emit484bb0:()=>{called=true;}}}),/Uncaptured/);assert.equal(called,false);assert.equal(memory.readInt32LE(0x9153dc),1,'Native cursor publication precedes the reached ring store.');
});

test('ordinary-address435ba0 burst and actual emitter/null-bank children retain the instruction baseline',async()=>{
 const{instructions,evidence}=await readInstructionEvidence(['653-retirement-435ba0-assembly.json','149-event-emitter-assembly.json','151-effect-dispatch-assembly.json'],{directory:'analysis/native-simulation/results'});
 assert.ok(evidence.every(row=>row.subject.digest.sha256==='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5'));
 const machine=new BoundedX86(instructions,{entry:0x435ba0});let cases=0;
 for(const index of[0,23])for(const count of[0,1,-3])for(const code of[0,11,0x10b]){
  const memory=Buffer.alloc(0xa00000);put(memory,0x9153dc,index);[123,-456,789].forEach((v,i)=>put(memory,POSITION+i*4,v));
  put(memory,STACK,-1);put(memory,STACK+4,count);put(memory,STACK+8,0);put(memory,STACK+12,code);machine.reset();Object.assign(machine.r,{ECX:POSITION,EDX:VELOCITY,ESP:STACK});
  memory.copy(machine.bytes);machine.run(100000);emitBodyEffectBurst(POSITION,VELOCITY,count,0,code,{memory,scratchBase:STACK});
  assert.deepEqual(memory.subarray(0x10000),machine.bytes.subarray(0x10000),`index${index}/count${count}/code${code}: every mapped semantic byte`);cases++;
 }
 assert.equal(cases,18);
});

test('46a2d0 captures controller before removal and rereads timestamp/audio handle after effects',()=>{
 const memory=fixture();put(memory,CONTROL+4,10);put(memory,CONTROL+8,0);put(memory,BODY+0x38,65536);const events=[];
 retireType33Body(BODY,{memory,scratchBase:STACK,handlers:{emitBurst435ba0:({position,velocity,count,mask,code})=>{assert.equal(memory.readInt32LE(CONTROL+4),0);assert.equal(memory.readUInt16LE(0x902bc4),2);assert.equal(memory.readInt32LE(BODY+4),0);assert.equal(memory.readInt32LE(position+4),41*65536);assert.equal(memory.readInt32LE(velocity+4),-64*65536);assert.deepEqual([count,mask,code],[8,0x5126b,11]);put(memory,0x90a548,777);put(memory,CONTROL+8,0x60000);put(memory,0x60000,0x61000);put(memory,0x61000,0x62000);put(memory,0x62034,0x63000);events.push('effect');},stopAudioVirtual34:request=>{assert.equal(request.object,0x61000);assert.equal(request.method,0x63000);events.push('audio');}}});assert.deepEqual(events,['effect','audio']);assert.equal(memory.readInt32LE(0x903520),777);assert.equal(memory.readInt32LE(CONTROL+8),127);
});
