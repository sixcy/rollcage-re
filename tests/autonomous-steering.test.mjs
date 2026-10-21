import test from 'node:test';
import assert from 'node:assert/strict';
import {autonomousSteeringAngle,measureAutonomousVelocity,orientedSteeringRatio,updateAutonomousSteering} from '../src/autonomous-steering.mjs';
const BODY=0x10000,TARGET=0x20000,STACK=0x9000,U=65536;
function fixture(){
 const memory=Buffer.alloc(0x40000);[4096,0,0,0,4096,0,0,0,4096].forEach((value,index)=>memory.writeInt16LE(value,BODY+0xc4+index*2));
 const put=(p,values)=>values.forEach((value,index)=>memory.writeInt32LE(value,p+index*4));
 return {memory,put,run:(target,first=0,reverse=0)=>{put(TARGET,target);memory.writeInt32LE(first,STACK+4);memory.writeInt32LE(reverse,STACK+8);return updateAutonomousSteering(BODY,TARGET,first,reverse,{memory,scratchBase:STACK});}};
}
test('target side selects original control bits while retaining every existing control bit',()=>{
 const f=fixture();f.memory.writeInt32LE(0x12340001,BODY+0x710);assert.equal(f.run([U,0,U]).addedBits,0x2000);assert.equal(f.memory.readInt32LE(BODY+0x710),0x12342001);
 assert.equal(f.run([-U,0,U]).addedBits,0x8000);assert.equal(f.memory.readInt32LE(BODY+0x710),0x1234a001);
});
test('the deadzone is strict below1143 for both desired and existing steering',()=>{
 const f=fixture();f.memory.writeInt32LE(1142,BODY+0x644);assert.equal(f.run([0,0,U]).addedBits,0);f.memory.writeInt32LE(1143,BODY+0x644);assert.equal(f.run([0,0,U]).addedBits,0x8000);f.memory.writeInt32LE(-1143,BODY+0x644);assert.equal(f.run([0,0,U]).addedBits,0x2000);
 f.memory.writeInt32LE(0,BODY+0x644);assert.equal(f.run([629,0,U]).addedBits,0);assert.equal(f.run([630,0,U]).addedBits,0x2000);assert.equal(f.run([-629,0,U]).desired,-1142);assert.equal(f.run([-629,0,U]).addedBits,0);assert.equal(f.run([-630,0,U]).addedBits,0x8000);
});
test('behind-facing zero side saturates negative and bypasses angular correction memory',()=>{
 const {memory}=fixture();memory[BODY+0x6f1]=3;memory.writeInt32LE(0x7fffffff,BODY+0x50);memory[BODY+0x324]=1;memory.writeUInt32LE(0xffffffff,BODY+0x198);
 assert.equal(autonomousSteeringAngle(BODY,0,-1,{memory}),-0xa000);assert.equal(autonomousSteeringAngle(BODY,1,-1,{memory}),0xa000);
});
test('the dominant axis ratio uses Z on ties and rejects components below1024',()=>{
 assert.equal(orientedSteeringRatio([U,0,0],[0,U,0],[1024,1024,1024]),64*U);assert.equal(orientedSteeringRatio([U,0,0],[0,U,0],[1023,1023,1023]),0);
});
test('angular correction threshold and first flagged wheel metadata are native ordered',()=>{
 const {memory}=fixture();memory[BODY+0x6f1]=2;memory[BODY+0x324]=1;memory.writeUInt32LE(0,BODY+0x198);memory[BODY+0x324+200]=1;memory.writeUInt32LE(0x30000,BODY+0x198+28);memory.writeUInt32LE(31<<8,0x3000c);
 memory.writeInt32LE(4000000,BODY+0x50);assert.equal(autonomousSteeringAngle(BODY,0,U,{memory}),0);memory.writeInt32LE(4000001,BODY+0x50);assert.equal(autonomousSteeringAngle(BODY,0,U,{memory}),-31250);
 memory[BODY+0x64f]=1;assert.equal(autonomousSteeringAngle(BODY,0,U,{memory}),31250);
});
test('low-speed velocity writes its diagnostic byte and preserves adjacent storage',()=>{
 const f=fixture();f.memory.fill(0xa5,BODY+0x6c7,BODY+0x6ca);assert.deepEqual(measureAutonomousVelocity(BODY,{memory:f.memory}),{forward:U,side:0,length:0});assert.equal(f.memory[BODY+0x6c8],0);assert.equal(f.memory[BODY+0x6c7],0xa5);assert.equal(f.memory[BODY+0x6c9],0xa5);
 f.put(BODY+0x68,[U,0,U]);const result=measureAutonomousVelocity(BODY,{memory:f.memory});assert(result.length>0x800);assert(result.forward>0&&result.forward<U);assert.equal(f.memory[BODY+0x6c8],(result.forward>>8)&255);
});
test('the velocity replacement gate reads stored TARGET forward at50000',()=>{
 const f=fixture();f.memory.writeInt16LE(101,BODY+0x668);f.put(BODY+0x68,[-2*U,0,U]);
 const below=f.run([6553,0,49999],1);assert.equal(below.comparedVelocity,true);assert.equal(below.replacedTarget,false);assert.equal(below.addedBits,0x2000);
 const exact=f.run([6553,0,50000],1);assert.equal(exact.replacedTarget,true);assert.equal(exact.addedBits,0x8000);assert.equal(f.memory.readInt32LE(STACK-44),50000);assert.equal(f.memory.readInt32LE(STACK+4),-0xa000);
});
test('the target-side comparison uses bit27 rather than the arithmetic sign',()=>{
 const f=fixture();f.memory.writeInt16LE(101,BODY+0x668);f.put(BODY+0x68,[-2*U,0,U]);const result=f.run([0x08000000,0,49999],1);assert.equal(result.replacedTarget,true);assert.equal(result.addedBits,0x8000);
});
test('reverse mode flips the old desired again even when the velocity candidate is rejected',()=>{
 const f=fixture();f.memory.writeInt16LE(101,BODY+0x668);f.put(BODY+0x68,[-2*U,0,U]);assert.equal(f.run([6553,0,50000],0,1).addedBits,0x2000);const result=f.run([6553,0,50000],1,1);assert.equal(result.comparedVelocity,true);assert.equal(result.replacedTarget,false);assert.equal(result.addedBits,0x8000);
});
test('the body reverse byte flips the final desired and speed100 skips velocity correction',()=>{
 const f=fixture();f.memory[BODY+0x64f]=255;assert.equal(f.run([U,0,U]).addedBits,0x8000);f.memory.writeInt16LE(100,BODY+0x668);f.put(BODY+0x68,[-2*U,0,U]);assert.equal(f.run([U,0,U],1).comparedVelocity,false);
});
