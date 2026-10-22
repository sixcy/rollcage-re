import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeBodyRetirementEffectTables,lookupRawSpatialBucket,emitRawEffectParticles,emitRawBodyDebris,calculateRawEffectColor,alterRawTerrainBrightness,appendRawBodyFlash,activateRawBodyTrail,activateRawBodyPulse} from '../src/body-retirement-effects.mjs';
const ROWS=0x40000,INDICES=0x43000,BUCKET=0x45000,PARTICLES=0x100000,DEBRIS=0x110000,FREE=0x46000,ACTIVE=0x46100,POSITION=0x47000,VELOCITY=0x47100;
const put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p),rng=v=>Math.imul(v,0x41a7)&0x7fffffff;
const fixture=()=>{
 const memory=initializeBodyRetirementEffectTables(Buffer.alloc(0xa00000));put(memory,0x909254,ROWS);put(memory,0x909278,BUCKET);for(let i=0;i<256;i++){word(memory,ROWS+i*16,0xff00);put(memory,ROWS+i*16+12,INDICES);}
 put(memory,0x902eec,PARTICLES);put(memory,0x6e65b4,PARTICLES);put(memory,PARTICLES+0xac,PARTICLES+256);put(memory,0x5ec958,1);put(memory,0x5eb500,256);
 put(memory,0x902b7c,FREE);put(memory,0x902b80,ACTIVE);put(memory,0x902b84,DEBRIS);put(memory,0x902b8c,1);word(memory,FREE,0);word(memory,FREE+2,1);
 return memory;
};

test('435f20 reuses active particles while preserving real list and packed spatial links',()=>{
 const memory=fixture();assert.equal(emitRawEffectParticles(POSITION,VELOCITY,0,0x0300aaff,8,{memory}),3);
 assert.equal(memory.readUInt32LE(0x6e65b4),0);assert.equal(memory.readUInt32LE(0x6e65c0),PARTICLES+256);assert.equal(memory.readUInt32LE(0x6e65c8),PARTICLES);assert.equal(memory.readUInt32LE(PARTICLES+256+0xa8),PARTICLES);assert.equal(memory.readUInt16LE(BUCKET+10),1);assert.equal(memory.readUInt16LE(PARTICLES+4),3);
 let seed=1;for(let i=0;i<12;i++)seed=rng(seed);assert.equal(memory.readInt32LE(0x5ec958),seed);assert.equal(memory[PARTICLES+0xa6],2);assert.equal(memory[PARTICLES+256+0xa6],1);
});

test('435f20 kind1 jitter changes position after its original bucket was registered',()=>{
 const memory=fixture();word(memory,INDICES+127*2,12);put(memory,POSITION,100);emitRawEffectParticles(POSITION,VELOCITY,0,0,1,{memory});
 const found=lookupRawSpatialBucket(memory.readInt32LE(PARTICLES+0x88),memory.readInt32LE(PARTICLES+0x8c),memory.readInt32LE(PARTICLES+0x90),{memory});
 assert.equal(memory.readUInt32LE(PARTICLES+12),BUCKET);assert.equal(found.bucket,BUCKET+12);assert.equal(memory.readUInt16LE(BUCKET+10),1);assert.equal(memory.readUInt32LE(PARTICLES+0x9c),0);
});

test('4286e0 sparse row reports outside while selecting the nearest authored column',()=>{
 const memory=fixture();put(memory,ROWS+128*16+12,0);assert.deepEqual(lookupRawSpatialBucket(0,0,0,{memory}),{bucket:BUCKET,outside:1});
});

test('475a10 exhausts the available debris indices and advances four RNG steps per object',()=>{
 const memory=fixture();assert.equal(emitRawBodyDebris(POSITION,VELOCITY,8,{memory}),2);assert.equal(memory.readInt32LE(0x902b8c),-1);assert.equal(memory.readInt32LE(0x902b88),2);assert.deepEqual([memory.readUInt16LE(ACTIVE),memory.readUInt16LE(ACTIVE+2)],[1,0]);let seed=1;for(let i=0;i<8;i++)seed=rng(seed);assert.equal(memory.readInt32LE(0x5ec958),seed);
});

test('4386b0 ordinary white alpha consumes no RNG and radial kind consumes one',()=>{
 const memory=fixture();assert.equal(calculateRawEffectColor(1,32,{memory}),-1);assert.equal(memory.readInt32LE(0x5ec958),1);calculateRawEffectColor(0x4000,45,{memory});assert.equal(memory.readInt32LE(0x5ec958),rng(1));
});

test('437aa0 preserves packed X borrow into Y and deduplicates the last dirty range',()=>{
 const memory=fixture();put(memory,0x9092c0,0x49000);word(memory,0x49002,1);put(memory,0x909240,0x48000);put(memory,0x48004,0x60000);put(memory,0x60008,0);put(memory,0x6000c,1);put(memory,0x60020,0x70000);put(memory,0x90b980,0x4b000);for(let i=0;i<1024;i++)put(memory,0x4b000+i*4,0xffffff);put(memory,BUCKET,1);put(memory,POSITION,65536);
 alterRawTerrainBrightness(POSITION,10,{memory,scratchBase:0x9000});assert.equal(memory.readInt16LE(0x91d408),-1);assert.equal(memory.readInt16LE(0x91d40c),-1);assert.equal(memory.readInt32LE(0x70004),0xfc000000|0);assert.equal(memory.readInt32LE(0x80f210),1);
 alterRawTerrainBrightness(POSITION,10,{memory,scratchBase:0x9000});assert.equal(memory.readInt32LE(0x80f210),1);assert.equal(memory.readInt32LE(0x5ed2b4),1);
});

test('436490 unsigned radius wraps without the minimum clamp of436410',()=>{
 const memory=fixture();appendRawBodyFlash(POSITION,-1,{memory});assert.equal(memory.readUInt16LE(0x8106f0),4);assert.equal(memory.readUInt16LE(0x8106f2),3);assert.equal(memory.readInt32LE(0x8106f4),712);assert.equal(memory.readInt32LE(0x810920),1);
});

test('436510 and437670 consume inactive records and preserve exhausted storage',()=>{
 const memory=fixture();put(memory,0x919008,0x120000);put(memory,0x9153c0,0x140000);assert.equal(activateRawBodyTrail(POSITION,1,{memory}),0);assert.equal(memory.readInt32LE(0x120000+4),-20*65536);assert.equal(memory.readInt32LE(0x120000+40),21);assert.equal(activateRawBodyTrail(POSITION,2,{memory}),1);assert.equal(memory.readInt32LE(0x120000+0x1e2c+40),16);
 for(let i=0;i<3;i++)assert.equal(activateRawBodyPulse(POSITION,{memory}),i);const before=Buffer.from(memory.subarray(0x140000,0x140000+3*0xf14));assert.equal(activateRawBodyPulse(POSITION,{memory}),-1);assert.deepEqual(memory.subarray(0x140000,0x140000+3*0xf14),before);
});
