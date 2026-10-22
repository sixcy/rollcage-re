import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeWheelEffectTables,updateWheelTractionEffects,permitWheelEmission,emitWheelRearParticle,emitWheelSurfaceDebris,emitWheelSurfaceParticles,measureSkidSegment} from '../src/wheel-effects.mjs';

const BODY=0x10000,WHEEL=BODY+0x324,CONFIG=0x30000,GATE=0x31000,POSITION=0x32000,DIRECTION=0x32100,SKIDS=0x35000,OLD=0x36000,ROWS=0x40000,INDICES=0x43000,BUCKET=0x45000,FREE=0x46000,ACTIVE=0x46100,PARTICLE=0x100000,DEBRIS=0x110000,STACK=0x9000;
function fixture(){
 const memory=initializeWheelEffectTables(Buffer.alloc(0xa00000));
 const put=(p,value)=>memory.writeInt32LE(value|0,p),word=(p,value)=>memory.writeUInt16LE(value&65535,p),vector=(p,values)=>values.forEach((value,i)=>put(p+i*4,value));
 put(0x5ecefc,CONFIG);memory[CONFIG+0x2c]=1;put(0x909300,BODY);put(WHEEL+0xb8,-1);vector(WHEEL+0x10,[65536,0,0]);vector(WHEEL+0x40,[65536,0,0]);vector(WHEEL+0xac,[65536,0,0]);
 put(0x8495d0,SKIDS);put(0x8495d4,SKIDS);put(0x8495d8,SKIDS+4*292);
 put(0x909254,ROWS);put(0x909278,BUCKET);for(let i=0;i<256;i++){word(ROWS+i*16,0xff00);put(ROWS+i*16+12,INDICES);}
 put(0x902eec,PARTICLE);put(0x6e65b4,PARTICLE);put(0x902b7c,FREE);put(0x902b80,ACTIVE);put(0x902b84,DEBRIS);put(0x902b8c,-1);put(0x5ed2b8,256);put(0x5ed2c0,256);put(0x5ec958,1);
 return {memory,put,word,vector,options:{memory,scratchBase:STACK}};
}

test('disabled skid setting updates effect speed and preserves the existing skid record',()=>{
 const {memory,put,options}=fixture();memory[CONFIG+0x2c]=0;put(WHEEL+0xb8,OLD);put(WHEEL+0xa8,0x12348000);memory[WHEEL+0x9e]=1;
 updateWheelTractionEffects(WHEEL,0x40001,2,options);
 assert.equal(memory.readInt32LE(WHEEL+0xc4),0x40001);assert.equal(memory.readInt32LE(WHEEL+0xb8),OLD);assert.equal(memory.readInt32LE(WHEEL+0xa8),0x12348000);assert.equal(memory[WHEEL+0x9e],1);
 updateWheelTractionEffects(WHEEL,0x40001,-1,options);assert.equal(memory.readInt32LE(WHEEL+0xc4),0);
});

test('skid hysteresis retains an active endpoint below the new-skid threshold',()=>{
 const {memory,put,options}=fixture();put(WHEEL+0xac,0);updateWheelTractionEffects(WHEEL,0x100000,0,options);assert.equal(memory.readInt32LE(WHEEL+0xa8)&0x8000,0);
 put(WHEEL+0xa8,0x8000);updateWheelTractionEffects(WHEEL,0x100000,0,options);assert.equal(memory.readInt32LE(WHEEL+0xa8)&0x8000,0x8000);assert.equal(memory.readInt16LE(WHEEL+0xa0),4);assert.equal(memory[WHEEL+0x9e],0);
});

test('a short collinear skid extends the previous record without consuming the ring slot',()=>{
 const {memory,put,word,vector,options}=fixture();vector(BODY+0x34,[20*65536,0,0]);word(WHEEL+0xa0,10);put(WHEEL+0xa8,0x8000);put(WHEEL+0xb8,OLD);word(OLD+12,10);word(OLD+26,1);
 updateWheelTractionEffects(WHEEL,0xe0001,0,options);
 assert.equal(memory.readInt32LE(WHEEL+0xb8),OLD);assert.equal(memory.readInt16LE(OLD+12),24);assert.equal(memory.readUInt16LE(OLD+26),1);assert.equal(memory.readUInt32LE(0x8495d0),SKIDS);assert.equal(memory[WHEEL+0x9e],1);
});

test('emission gate uses unsigned elapsed time across clock wrap',()=>{
 const {memory,put,options}=fixture();put(GATE+8,30);put(GATE+12,-16);put(0x90a548,5);
 assert.equal(permitWheelEmission(POSITION,GATE,options),0);assert.equal(memory.readInt32LE(GATE+12),-16);
 put(0x90a548,16);assert.equal(permitWheelEmission(POSITION,GATE,options),1);assert.equal(memory.readInt32LE(GATE+12),16);
});

test('emission gate snapshots overlapping input before its timestamp writes',()=>{
 const {memory,put,options}=fixture();put(GATE,1);put(GATE+8,123);put(GATE+12,456);put(GATE+16,789);put(0x90a548,999);
 assert.equal(permitWheelEmission(GATE+8,GATE,options),1);
 assert.deepEqual([16,20,24].map(o=>memory.readInt32LE(GATE+o)),[123,456,789]);assert.equal(memory.readInt32LE(GATE+12),999);
});

test('rear emission applies sentinel opacity, quantized velocity and native frame rollover',()=>{
 const {memory,put,vector,options}=fixture();vector(BODY+0x68,[65536,-65536,0]);vector(POSITION,[65536,0,0]);put(0x811180,1);put(0x81118c,32768);put(0x919004,0x030b00ff);
 const p=emitWheelRearParticle(BODY,POSITION,DIRECTION,0x704040,-1,0,options);
 assert.equal(p,PARTICLE);assert.deepEqual([0,4,8].map(o=>memory.readInt32LE(p+0x88+o)),[98304,-32768,0]);assert.deepEqual([0,2,4].map(o=>memory.readInt16LE(p+0x9c+o)),[96,-96,0]);
 assert.equal(memory.readUInt32LE(p+0x98),0xc0704040);assert.equal(memory[p+0xa6],11);assert.equal(memory[0x919006],0);assert.equal(memory[p+0x94],1);assert.equal(memory.readInt32LE(0x5ec958),16807);assert.equal(memory.readUInt16LE(BUCKET+10),1);
});

test('surface type20 divides the caller velocity even when no debris slot is free',()=>{
 const {memory,vector,options}=fixture();vector(DIRECTION,[-5,7,0x10000]);assert.equal(emitWheelSurfaceDebris(POSITION,DIRECTION,20,options),0);
 assert.deepEqual([0,4,8].map(o=>memory.readInt32LE(DIRECTION+o)),[-2,1,0x4000]);assert.equal(memory.readInt32LE(0x902b88),0);
});

test('surface particles use the inclusive speed threshold and rear wheels only',()=>{
 const {memory,put,word,options}=fixture();const descriptor=0x33000;memory[descriptor+12]=5;
 for(let i=0;i<4;i++){memory[BODY+0x324+i*200]=1;put(BODY+0x198+i*28,descriptor);}for(let i=0;i<9;i++)word(BODY+0xc4+i*2,i%4===0?4096:0);
 put(BODY+0x664,0x1ffff);put(0x5ec958,1);assert.equal(emitWheelSurfaceParticles(BODY,options),0);assert.equal(memory.readInt32LE(0x5ec958),1);
 // Front wheels remain active while both rear wheels are detached.
 memory[BODY+0x324+2*200]=0;memory[BODY+0x324+3*200]=0;put(BODY+0x664,0x20000);emitWheelSurfaceParticles(BODY,options);assert.equal(memory.readInt32LE(0x5ec958),1);assert.equal(memory.readFloatLE(0x91cdc0),1);
 memory[BODY+0x324+2*200]=1;put(0x5ec958,2);memory.writeFloatLE(4,CONFIG+0x68);put(0x902b8c,7);for(let i=0;i<8;i++)word(FREE+i*2,i);
 assert.equal(emitWheelSurfaceParticles(BODY,options),0); // seed2 produces zero initial count despite eligibility
 put(0x5ec958,4);assert.equal(emitWheelSurfaceParticles(BODY,options),2);assert.equal(memory.readInt32LE(0x902b88),2);
});

test('skid distance clamps long and wrapped signed-short segments',()=>{
 assert.equal(measureSkidSegment([3,4,0]),5);assert.equal(measureSkidSegment([48,1,0]),48);assert.equal(measureSkidSegment([65535,0,0]),1);assert.equal(measureSkidSegment([32768,0,0]),48);
});
