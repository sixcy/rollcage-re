import test from 'node:test';
import assert from 'node:assert/strict';
import * as source from '../src/projectile-trails.mjs';
import {initializeWheelEffectTables} from '../src/wheel-effects.mjs';
import {createRawScriptFixture} from '../tools/lib/raw-scripted-motion-fixtures.mjs';
import {verifyProjectileTrails} from '../tools/verify-projectile-trails-instructions.mjs';
function fixture(){const f=createRawScriptFixture(),m=f.memory,body=0x180000;m.fill(0,body,body+0x1000);initializeWheelEffectTables(m);for(let i=0;i<9;i++)m.writeInt16LE(i%4?0:4096,body+0xc4+i*2);for(let i=0;i<3;i++)m.writeInt32LE((i+1)*100*65536,body+0x34+i*4);return{...f,body};}
test('trail producer constructs four oriented corners and advances its signed byte count',()=>{
 const f=fixture(),m=f.memory;source.updateProjectileTrail(f.body,1,f);const row=f.body+14*32;assert.deepEqual([0,8,16,24].map(o=>[0,2,4].map(a=>m.readInt16LE(row+o+a))),[[100,152,260],[148,200,260],[100,248,260],[52,200,260]]);assert.equal(m.readInt8(f.body+0x18e),1);assert.equal(m.readInt16LE(f.body+0x18c),0);
});
test('state1 trail with more than two records returns before touching shared scratch',()=>{
 const f=fixture(),m=f.memory;m.writeInt32LE(1,f.body+0x188);m[f.body+0x18e]=3;const before=Buffer.from(m);source.updateProjectileTrail(f.body,1,f);assert.ok(m.equals(before));
});
test('lowering wraps head31 once and preserves kinds/state that skip it',()=>{
 const f=fixture(),m=f.memory;m[f.body+0x18e]=2;m.writeInt16LE(31,f.body+0x18c);m.writeInt32LE(2,f.body+0x188);source.lowerProjectileTrail(f.body,f);assert.equal(m.readInt16LE(f.body+14*32+2),-2);assert.equal(m.readInt16LE(f.body+45*32+2),-2);m.writeInt32LE(2,f.body+0x184);source.lowerProjectileTrail(f.body,f);assert.equal(m.readInt16LE(f.body+14*32+2),-2);
});
test('loop sound keeps unsigned volume and signed pitch before actual effect conversion',()=>{
 let request;const result=source.startProjectileLoopSound(0x107,0xffff,0xffff,123,456,{handlers:{dispatch40ea40:r=>{request=r;return 42;}}});assert.equal(result,42);assert.equal(request.code,7);assert.equal(request.first,456);assert.equal(request.registerEdx,123);assert.equal(request.modeIs9,1);assert.equal(request.parameters.readInt32LE(4),-1);assert.ok(request.parameters.readInt32LE(0)>65535);
});
test('raw particle producer reuses active particles after exhausting its16-slot pool',()=>{
 const f=fixture(),m=f.memory;let first;for(let i=0;i<17;i++){const p=source.emitProjectileLaunchRing(f.body+0x34,f);if(i===0)first=p;if(i===16)assert.equal(p,first);}assert.equal(m.readUInt16LE(first+0x96),30);assert.equal(m[first+0x95],48);assert.equal(m.readUInt32LE(first+0x98),0xb4ffe0e0);
});
test('raw launch ring publishes the actual incoming EBX saved word for later trail use',()=>{
 const f=fixture();f.entryRegisters={EBX:0x9034f8};source.emitProjectileLaunchRing(f.body+0x34,f);assert.equal(f.memory.readUInt32LE(f.scratchBase-60),0x9034f8);
});
test('actual signed ring, transform, spatial, event and sound native instructions',async()=>{const r=await verifyProjectileTrails({fixtures:100,output:null});assert.equal(r.matched,true);assert.equal(r.calls,100);});
