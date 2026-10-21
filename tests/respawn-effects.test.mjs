import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateRespawnParticle,emitRespawnParticle,emitVehicleRespawnRing} from '../src/respawn-effects.mjs';
test('free allocation appends first active record and removes its old spatial membership before clearing user fields',()=>{
 const next={previousAC:null},particle={previousAC:next,nextA8:{},field94:1,fieldB0:7,fieldB4:9},runtime={freeHead6e65b4:particle,activeHead6e65c0:null,activeTail6e65c8:null};let removed=0;
 assert.equal(allocateRespawnParticle(runtime,{removeSpatial:object=>{assert.equal(object,particle);assert.equal(runtime.activeHead6e65c0,particle);assert.equal(runtime.activeTail6e65c8,particle);assert.equal(object.fieldB0,7);assert.equal(object.fieldB4,9);removed++;}}),particle);
 assert.equal(runtime.freeHead6e65b4,next);assert.equal(particle.nextA8,null);assert.equal(particle.previousAC,null);assert.equal(particle.fieldB0,0);assert.equal(particle.fieldB4,0);assert.equal(removed,1);
});
test('recycling skips pinned records and keeps a selected tail linked without a self-cycle',()=>{
 const first={fieldB0:1,fieldB4:2,field94:0,previousAC:null},last={fieldB0:0,fieldB4:3,field94:0,nextA8:null,previousAC:first};first.nextA8=last;
 const runtime={freeHead6e65b4:null,activeHead6e65c0:first,activeTail6e65c8:last};assert.equal(allocateRespawnParticle(runtime),last);assert.equal(first.nextA8,last);assert.equal(last.previousAC,first);assert.equal(last.nextA8,null);
});
test('all pinned records fall back to the original head and move it to the tail',()=>{
 const first={fieldB0:4,fieldB4:2,field94:0,previousAC:null},last={fieldB0:8,fieldB4:3,field94:0,nextA8:null,previousAC:first};first.nextA8=last;
 const runtime={freeHead6e65b4:null,activeHead6e65c0:first,activeTail6e65c8:last};assert.equal(allocateRespawnParticle(runtime),first);assert.equal(runtime.activeHead6e65c0,last);assert.equal(runtime.activeTail6e65c8,first);assert.equal(last.previousAC,null);assert.equal(last.nextA8,first);assert.equal(first.previousAC,last);assert.equal(first.nextA8,null);
});
test('emitter reads vectors after allocation, then registers before reading the live seed and timestamp',()=>{
 const particle={},position=[1,2,3],velocity=[4,5,6],runtime={seed5ec958:7,time9153e8:8},log=[];
 const result=emitRespawnParticle(position,velocity,{colorMode:1,typeMode:0,runtime,handlers:{allocate435df0:()=>{velocity[0]=65537;position[2]=9;log.push('allocate');return particle;},register474670:(object,p)=>{assert.equal(object,particle);assert.deepEqual(p,[(65537<<8)+1,1282,1545]);assert.equal(object.color98,-7968);assert.equal(object.field94,undefined);runtime.seed5ec958=1;runtime.time9153e8=99;log.push('register');}}});
 assert.deepEqual(particle.velocity9c,[1,5,6]);assert.equal(particle.flags,23);assert.equal(particle.field95,16);assert.equal(particle.field96,100);assert.equal(particle.fieldA2,32768);assert.equal(particle.timestampA4,99);assert.equal(particle.field94,1);assert.equal(runtime.seed5ec958,16807);assert.equal(result.registerEcx,16807);assert.equal(particle.color98,0xff000000|0);assert.deepEqual(log,['allocate','register']);
});
test('RGB emission consumes three LCG values and returns the second value still in ECX',()=>{
 const runtime={seed5ec958:1,time9153e8:0},particle={};const result=emitRespawnParticle([0,0,0],[0,0,0],{colorMode:0,typeMode:-1,runtime,handlers:{allocate435df0:()=>particle,register474670:()=>{}}});
 const next=value=>Math.imul(value,16807)&0x7fffffff,first=next(1),second=next(first),third=next(second);
 assert.equal(particle.flags,30);assert.equal(result.registerEcx,second);assert.equal(runtime.seed5ec958,third);assert.equal(particle.color98,(((second>>>15)*255>>>8)&0xffff00)|(((third>>>15)*255)&0xffff0000)|0xff000000);
});
test('ring captures center once and code2 preserves field699 while selecting RGB emission',()=>{
 const body={position:[0,10,0],field699:77},calls=[],marker={registerEcx:123};const result=emitVehicleRespawnRing(body,2,{emitParticle:(position,velocity,options)=>{calls.push({position,velocity,options});body.position=[100,200,300];return marker;}});
 assert.equal(result,marker);assert.equal(body.field699,77);assert.equal(calls.length,16);assert.deepEqual(calls[0],{position:[0,10,48*65536],velocity:[1024,0,0],options:{colorMode:0,typeMode:0}});assert.ok(calls.every(call=>call.position[1]===10));assert.deepEqual(calls[4].position,[48*65536,10,0]);
});
test('other ring codes set field699 and retain their signed color mode',()=>{
 for(const code of [0,1,-1]){const body={position:[0,0,0],field699:0};let emitted=0;emitVehicleRespawnRing(body,code,{emitParticle:(p,v,options)=>{assert.equal(options.colorMode,code);emitted++;return{registerEcx:1};}});assert.equal(body.field699,31);assert.equal(emitted,16);}
});
