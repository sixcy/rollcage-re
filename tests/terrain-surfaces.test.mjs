import test from 'node:test';
import assert from 'node:assert/strict';
import {readTerrainSurface} from '../src/terrain-surfaces.mjs';
function fixture() {
 const data=Buffer.alloc(0x180),scene={uvTable:0x100,segments:[{columns:2,rows:2,packetsOffset:0x80}]};
 for(let i=0;i<4;i++)data.writeUInt32LE(i,0x84+i*8);data.writeUInt32LE(0xabc0160e,0x13c);return {data,scene};
}
test('terrain surfaces resolve packet descriptors and retain category/grip bit fields',()=>{
 const {data,scene}=fixture(),surface=readTerrainSurface(data,scene,0x10100);
 assert.equal(surface.index,3);assert.equal(surface.offset,0x130);assert.equal(surface.category,14);assert.equal(surface.gripReduction,22);
 assert.equal(surface.flags,0xabc0160e);assert.deepEqual(surface.raw,data.subarray(0x130,0x140));
});
test('negative native surface sentinels yield no terrain descriptor',()=>{
 const {data,scene}=fixture();assert.equal(readTerrainSurface(data,scene,-4),null);assert.equal(readTerrainSurface(data,scene,0xffffffff),null);
});
test('signed cell coordinates, sector bounds and descriptor ranges are checked',()=>{
 const {data,scene}=fixture();for(const reference of [1,0xff00,0x200,0x20000])assert.throws(()=>readTerrainSurface(data,scene,reference),/cell reference/);
 data.writeUInt32LE(0xffffffff,0x84);assert.throws(()=>readTerrainSurface(data,scene,0),/descriptor.*bounds/);
});
