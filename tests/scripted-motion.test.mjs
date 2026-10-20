import test from 'node:test';
import assert from 'node:assert/strict';
import {stepScriptedMotion,scriptedCurveVelocity} from '../src/scripted-motion.mjs';

const body=(extra={})=>({flags:26,position:[1,2,3],linearVelocity:[10,20,30],momentum:[40,50,60],mass:65536,
 rotation:[4096,0,0,0,4096,0,0,0,4096],integrationFlags:0,scriptOffset138:0,scriptTimer13a:0,
 scriptActionTimer13c:0,scriptSegment13e:0,scriptSpawnIndex13f:0,scriptField180:0,scriptField184:0,...extra});
const run=(target,bytecode,options={})=>stepScriptedMotion(target,{bytecode,roundingMode:'nearest-even',...options});
const command=(opcode,size=16)=>{const bytes=Buffer.alloc(size);bytes.writeInt16LE(opcode);return bytes;};
function path(opcode=3,{count=3,speed=256,action=0,points}={}) {
 const bytes=Buffer.alloc(256);bytes.writeInt16LE(opcode);bytes.writeInt16LE(count,2);
 for(let index=0;index<count+3;index++){
  bytes.writeUInt16LE(index===0?speed:512,4+index*16);
  const point=points?.[index]??[index*65536,0,0];
  point.forEach((value,axis)=>bytes.writeInt32LE(value,8+index*16+axis*4));
 }
 bytes.writeUInt16LE(action,22);bytes.writeInt16LE(5,count*16+52);return bytes;
}

test('velocity opcode applies signed Q8 operands, scales momentum and waits until the next call',()=>{
 const target=body({mass:32768}),bytes=command(0);[-2,4,-32768].forEach((value,index)=>bytes.writeInt16LE(value,2+index*2));
 assert.deepEqual(run(target,bytes),{destroyed:false,executedOpcodes:1});
 assert.deepEqual(target.linearVelocity,[-512,1024,-8388608]);assert.deepEqual(target.momentum,[-256,512,-4194304]);
 assert.equal(target.scriptOffset138,8);
});

test('timed velocity loads once, decrements on later calls and advances without executing the next opcode',()=>{
 const target=body(),bytes=command(1);bytes.writeUInt16LE(2,2);[3,-4,5].forEach((value,index)=>bytes.writeInt16LE(value,6+index*2));
 run(target,bytes);assert.equal(target.scriptTimer13a,2);assert.deepEqual(target.linearVelocity,[768,-1024,1280]);
 run(target,bytes);assert.equal(target.scriptTimer13a,1);assert.equal(target.scriptOffset138,0);
 run(target,bytes);assert.equal(target.scriptTimer13a,0);assert.equal(target.scriptOffset138,12);
 assert.deepEqual(target.momentum,[768,-1024,1280]);
});

test('zero-duration timed velocity reloads forever while a signed negative timer decrements its storage word',()=>{
 const zero=body(),bytes=command(1);bytes.writeInt16LE(7,6);run(zero,bytes);run(zero,bytes);
 assert.equal(zero.scriptOffset138,0);assert.equal(zero.scriptTimer13a,0);
 const negative=body({scriptTimer13a:65535});run(negative,bytes);assert.equal(negative.scriptTimer13a,65534);
 assert.deepEqual(negative.linearVelocity,[10,20,30]);assert.deepEqual(negative.momentum,[10,20,30]);
});

test('teleport removes at the old position, inserts at the new position and continues the chain',()=>{
 const target=body(),bytes=command(2,24),log=[];[100,200,300].forEach((value,axis)=>bytes.writeInt32LE(value,4+axis*4));bytes.writeInt16LE(5,16);
 assert.equal(run(target,bytes,{handlers:{removeSpatial:b=>log.push(['remove',b.position.slice()]),insertSpatial:b=>log.push(['insert',b.position.slice()])}}).executedOpcodes,2);
 assert.deepEqual(log,[['remove',[1,2,3]],['insert',[100,200,300]]]);assert.equal(target.scriptOffset138,16);
 assert.deepEqual(target.momentum,[40,50,60]);
});

test('teleport tests flags again after removal, allowing the callback to suppress insertion',()=>{
 const target=body(),bytes=command(2,24);bytes.writeInt16LE(5,16);
 run(target,bytes,{handlers:{removeSpatial:b=>{b.flags|=0x8000;}}});assert.deepEqual(target.position,[0,0,0]);
 const detached=body({flags:0x8000});run(detached,bytes);assert.equal(detached.scriptOffset138,16);
 assert.throws(()=>run(body(),bytes),/explicit removeSpatial callback/);
});

test('restart chooses the signed spawn record, preserves timers and re-enters offset zero',()=>{
 const target=body({scriptOffset138:16,scriptTimer13a:17,scriptActionTimer13c:23,scriptSpawnIndex13f:1}),bytes=command(5,24);bytes.writeInt16LE(4,16);
 const positions=Buffer.alloc(16);[-2,3,-32768].forEach((value,axis)=>positions.writeInt16LE(value,8+axis*2));
 const result=run(target,bytes,{spawnPositions:positions});assert.equal(result.executedOpcodes,2);
 assert.deepEqual(target.position,[-131072,196608,-2147483648]);assert.deepEqual(target.linearVelocity,[0,0,0]);
 assert.deepEqual(target.momentum,[40,50,60]);assert.equal(target.scriptTimer13a,17);assert.equal(target.scriptActionTimer13c,23);
});

test('type-26 configuration opcodes preserve unsigned kind filtering and continue immediately',()=>{
 const bytes=command(6,24);bytes.writeInt16LE(2,2);bytes.writeInt16LE(6,8);bytes.writeInt16LE(99,10);bytes.writeUInt16LE(0xabcd,12);bytes.writeInt16LE(5,16);
 const target=body();assert.equal(run(target,bytes).executedOpcodes,3);assert.equal(target.scriptField180,3);assert.equal(target.scriptField184,0xabcd);
 for(const kind of [-1,100]){bytes.writeInt16LE(kind,2);bytes.writeInt16LE(kind,10);const other=body();run(other,bytes);assert.equal(other.scriptField180,0);assert.equal(other.scriptField184,0);}
 bytes.writeInt16LE(2,2);bytes.writeInt16LE(99,10);const other=body({flags:3});run(other,bytes);assert.equal(other.scriptField180,0);assert.equal(other.scriptField184,0);
});

test('stop, opcode-eight and unknown opcodes leave timer, velocity and momentum untouched',()=>{
 for(const opcode of [5,8,9,-1])for(const timer of [0,1,65535]){
  const target=body({scriptTimer13a:timer}),before=structuredClone(target);run(target,command(opcode));assert.deepEqual(target,before);
 }
});

test('curve helper uses the retained table differences and clamps the final phase',()=>{
 const points=[[0,0,0],[65536,0,0],[131072,0,0],[196608,0,0]];
 assert.deepEqual(scriptedCurveVelocity(points,0,16),[6092,0,0]);
 // Rounded native coefficients do not sum to an exact constant partition.
 assert.deepEqual(scriptedCurveVelocity(points.map(point=>[point[0]+65536,0,0]),0,16),[6080,0,0]);
 assert.deepEqual(scriptedCurveVelocity(points,250,100),scriptedCurveVelocity(points,250,6));
 assert.deepEqual(scriptedCurveVelocity(points,256,16),[0,0,0]);
 const sum=[0,0,0];for(let phase=0;phase<256;phase+=16)scriptedCurveVelocity(points,phase,16).forEach((value,axis)=>sum[axis]+=value);
 assert.deepEqual(sum,scriptedCurveVelocity(points,0,256));
});

test('path wait action consumes the positive timer then stores the native negative sentinel',()=>{
 const target=body(),bytes=path(3,{action:0x11});
 run(target,bytes);assert.equal(target.scriptActionTimer13c,1);assert.deepEqual(target.linearVelocity,[0,0,0]);assert.equal(target.scriptTimer13a,0);
 run(target,bytes);assert.equal(target.scriptActionTimer13c,65535);assert.equal(target.scriptTimer13a,0);
 run(target,bytes);assert.equal(target.scriptTimer13a,4096);assert.deepEqual(target.linearVelocity,[6092,0,0]);
 assert.equal(target.scriptActionTimer13c,65535);
});

test('path effect is one-shot per segment and destruction returns before momentum or offset changes',()=>{
 const target=body(),bytes=path(3,{action:3}),log=[];const handlers={triggerEffect:(b,kind)=>log.push([b,kind])};
 run(target,bytes,{handlers});run(target,bytes,{handlers});assert.deepEqual(log,[[target,7]]);assert.equal(target.scriptActionTimer13c,1);
 const doomed=body(),before=structuredClone(doomed);const result=run(doomed,path(3,{action:2}),{handlers:{destroyBody:(b,...args)=>{assert.equal(b,doomed);assert.deepEqual(args,[0,0]);}}});
 assert.equal(result.destroyed,true);assert.deepEqual(doomed,before);
});

test('segment transition clears the adjacent action word and uses the previous segment speed for the new points',()=>{
 const target=body({scriptTimer13a:1,scriptActionTimer13c:77});run(target,path());
 assert.equal(target.scriptSegment13e,1);assert.equal(target.scriptTimer13a,4096);assert.equal(target.scriptActionTimer13c,0);
 assert.deepEqual(target.linearVelocity,[6080,0,0]);
});

test('final path segment clears aliased timers and continues at count times sixteen plus fifty-two',()=>{
 const target=body({scriptTimer13a:1,scriptActionTimer13c:77,scriptSegment13e:2});const result=run(target,path());
 assert.equal(result.executedOpcodes,2);assert.equal(target.scriptOffset138,100);assert.equal(target.scriptSegment13e,0);
 assert.equal(target.scriptTimer13a,0);assert.equal(target.scriptActionTimer13c,0);assert.deepEqual(target.momentum,[40,50,60]);
});

test('direction-following path writes the Q12 basis and freezes quaternion integration',()=>{
 const target=body();run(target,path(7));
 assert.deepEqual(target.linearVelocity,[4096,0,0]);assert.deepEqual(target.rotation,[0,0,4096,0,4096,0,-4096,0,0]);assert.equal(target.integrationFlags,1);
 const vertical=body(),rotation=vertical.rotation.slice();run(vertical,path(7,{points:Array.from({length:6},(_,index)=>[0,index*65536,0])}));
 assert.deepEqual(vertical.rotation,rotation);assert.equal(vertical.integrationFlags,0);
});

test('an explicit opcode guard terminates malformed restart loops',()=>{
 const target=body(),bytes=command(4);assert.throws(()=>run(target,bytes,{spawnPositions:[[0,0,0]],maxOpcodes:3}),/opcode budget exceeded/);
});

test('script offsets wrap as native storage words',()=>{
 const target=body({scriptOffset138:65528}),bytes=Buffer.alloc(65536);bytes.writeInt16LE(0,65528);bytes.writeInt16LE(-1,65530);
 run(target,bytes);assert.equal(target.scriptOffset138,0);assert.deepEqual(target.linearVelocity,[-256,0,0]);
});
