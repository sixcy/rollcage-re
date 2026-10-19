import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSpatialIndex} from '../src/spatial-index.mjs';
const rowTable=288,mapBase=rowTable+4096,nodeBase=mapBase+32,unit=65536;
function fixture() {
 const data=Buffer.alloc(nodeBase+36);data.write('GFXM');data.writeUInt32LE(1,0x10);data.writeUInt32LE(3,0xc);
 data.writeUInt32LE(rowTable,0x24);data.writeUInt32LE(mapBase,0x6c);data.writeUInt32LE(nodeBase,0x68);
 for(let row=0;row<256;row++)for(let span=0;span<6;span++)data.writeUInt16LE(0xff,rowTable+row*16+span*2);
 const row=rowTable+128*16;data.writeUInt16LE(128|(129<<8),row);data.writeUInt16LE(133|(133<<8),row+2);data.writeUInt32LE(1,row+12);
 data.writeUInt16LE(0,mapBase);data.writeUInt16LE(0,mapBase+2);data.writeUInt16LE(24,mapBase+4);
 data.writeUInt32LE(0x80000000,nodeBase+4);data.writeUInt32LE(40<<13,nodeBase+12);data.writeUInt32LE(0x10000,nodeBase+28);
 return data;
}
test('spatial row map uses one-based indices and signed coordinate bins',()=>{
 const index=parseSpatialIndex(fixture());
 const inside=index.lookup([0,0,0]);assert.equal(inside.found,true);assert.equal(inside.outside,false);
 assert.deepEqual(inside.bins,[128,32,128]);assert.equal(inside.node.index,1);assert.equal(inside.layers,1);
 const belowZero=index.lookup([-1,0,0]);assert.equal(belowZero.bins[0],127);assert.equal(belowZero.outside,true);assert.equal(belowZero.selected.column,128);
 assert.equal(index.lookup([5*256*unit,0,0]).node.zone,1);
});
test('height continuation follows the next-node threshold inclusively',()=>{
 const index=parseSpatialIndex(fixture());
 assert.equal(index.lookup([0,8*256*unit,0]).node.index,1);
 assert.equal(index.lookup([0,9*256*unit,0]).node.index,0);
});
test('outside lookup preserves row search order and horizontal endpoint ties',()=>{
 const data=fixture(),initial=parseSpatialIndex(data).lookup([3*256*unit,0,0]);
 assert.equal(initial.outside,true);assert.equal(initial.selected.column,129);
 const row=rowTable+127*16;data.writeUInt16LE(131|(131<<8),row);data.writeUInt32LE(4,row+12);data.writeUInt16LE(24,mapBase+6);
 const adjacent=parseSpatialIndex(data).lookup([3*256*unit,0,0]);
 assert.equal(adjacent.selected.row,127);assert.equal(adjacent.selected.column,131);assert.equal(adjacent.node.index,2);
});
test('six occupied ranges preserve the native following-map-word path',()=>{
 const data=fixture(),row=rowTable+128*16;
 for(let i=0;i<6;i++){const x=128+i*2;data.writeUInt16LE(x|(x<<8),row+i*2);data.writeUInt16LE(0,mapBase+i*2);}
 data.writeUInt16LE(24,mapBase+12);
 const result=parseSpatialIndex(data).lookup([11*256*unit,0,0]);
 assert.equal(result.node.index,2);assert.equal(result.outside,false);
});
test('invalid maps, row ranges and height tails fail explicitly',()=>{
 const badMap=fixture();badMap.writeUInt16LE(36,mapBase);assert.throws(()=>parseSpatialIndex(badMap),/invalid node/);
 const badRow=fixture();badRow.writeUInt16LE(127|(128<<8),rowTable+128*16+2);assert.throws(()=>parseSpatialIndex(badRow),/invalid column/);
 const badTail=fixture();badTail.writeUInt32LE(0x80000000,nodeBase+28);assert.throws(()=>parseSpatialIndex(badTail),/height chain/);
});
