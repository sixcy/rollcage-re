import test from 'node:test';
import assert from 'node:assert/strict';
import * as source from '../src/terrain-wave.mjs';
import {createTerrainWaveFixture} from '../tools/lib/terrain-wave-fixtures.mjs';
import {verifyTerrainWave} from '../tools/verify-terrain-wave-instructions.mjs';
const fixture=i=>createTerrainWaveFixture({initializeMemory:m=>m},i);
test('palette brightening reserves one descending slot and preserves six vertex flags',()=>{
 const f=fixture(0),m=f.memory,vertex=0x70000;m.writeInt32LE(0xff646464|0,f.palette);source.brightenTerrainWaveVertex(vertex,31,f);assert.equal(m.readUInt16LE(f.map),975);assert.equal(m.readUInt16LE(0x90d974),974);assert.equal(m.readUInt32LE(f.palette+975*4),0xffffb4b4);assert.equal(m.readUInt16LE(vertex+6),(975<<6)|31);source.brightenTerrainWaveVertex(vertex+8,7,f);assert.equal(m.readUInt16LE(0x90d974),974);assert.equal(m.readUInt16LE(vertex+14),(975<<6)|7);
});
test('palette guard leaves the vertex and mapping untouched when reservation is exhausted',()=>{
 const f=fixture(0),m=f.memory;m.writeUInt16LE(64,0x90d974);m.writeUInt16LE(123,0x70006);source.brightenTerrainWaveVertex(0x70000,0,f);assert.equal(m.readUInt16LE(0x70006),123);assert.equal(m.readUInt16LE(f.map),65535);
});
test('row removal restores original color words and swaps the final cached row',()=>{
 const f=fixture(0),m=f.memory,sector=m.readUInt32LE(f.table),vertices=m.readUInt32LE(sector+0x20),first=0x70000,second=0x70010,original=m.readUInt16LE(vertices+6);m.writeUInt16LE(0,first);m[first+2]=0;m[first+3]=1;m.writeUInt16LE(1,second);m[second+2]=0;m[second+3]=1;source.toggleTerrainWaveRow(first,f);source.toggleTerrainWaveRow(second,f);assert.equal(m.readInt32LE(0x90d970),2);source.toggleTerrainWaveRow(first,f);assert.equal(m.readInt32LE(0x90d970),1);assert.equal(m.readUInt16LE(0x90ccb0),1);assert.equal(m.readUInt16LE(vertices+6),original);source.toggleTerrainWaveRow(second,f);assert.equal(m.readInt32LE(0x90d970),0);
});
test('endpoint neighbor search follows the actual adjacent segment and stops at outer boundary',()=>{
 const f=fixture(0);assert.equal(source.findTerrainWaveNeighbor(0,1,f),1);assert.equal(source.findTerrainWaveNeighbor(0,-1,f),-1);assert.equal(source.findTerrainWaveNeighbor(1,-1,f),0);
});
test('wave contact feedback selects opposite driver mode inside the wrapped progress interval',()=>{
 const f=fixture(0),other=f.body+0x5000;source.updateTerrainWaveContactScores(f.record,-1,f);assert.equal(f.memory.readUInt16LE(other+0x6fc),300);
});
test('receive activation consumes its packet direction and initializes reservation/cache state',()=>{
 const f=fixture(0),m=f.memory;m.writeInt32LE(0,0x6eafe0);assert.equal(source.activateTerrainWave(f.record,0,0,0x70000,0,f),1);assert.equal(m.readInt32LE(0x90cb94),-1);assert.equal(m.readInt32LE(0x90cb8c),4);assert.equal(m.readInt32LE(0x90cb90),4);assert.equal(m.readUInt16LE(0x90d976),65535);assert.equal(m.readInt32LE(0x6e6704),127);
});
test('network active-wave guard rejects activation before resetting its cache',()=>{
 const f=fixture(0),m=f.memory;m.writeInt32LE(2,0x90cb80);m.writeInt32LE(7,0x90d970);assert.equal(source.activateTerrainWave(f.record,0,0,0x70000,0,f),0);assert.equal(m.readInt32LE(0x90d970),7);
});
test('actual full terrain-wave lifecycle with palette, dirty queue, scores and particles',async()=>{const r=await verifyTerrainWave({fixtures:60,lifecycles:2,output:null});assert.equal(r.matched,true);assert.equal(r.calls,542);});
