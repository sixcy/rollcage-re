import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCollisionGrid,unpackCollisionNormal} from '../src/collision-grid.mjs';
const sector=288,vertices=384,packets=432,uv=448,pointers=464,normals=468,zone=476,rowTable=512,map=4608,nodes=4612;
function fixture(flags=6) {
 const data=Buffer.alloc(4640);data.write('GFXM');data.writeUInt32LE(1,0xc);data.writeUInt32LE(1,0x10);data.writeUInt32LE(pointers,0x14);data.writeUInt32LE(sector,pointers);
 for(const [field,value]of [[0x110,uv],[0x34,normals],[0x38,2],[0x28,zone],[0x24,rowTable],[0x6c,map],[0x68,nodes],[0x50,484]])data.writeUInt32LE(value,field);
 data.write('SEGM',sector);data.writeUInt32LE(1,sector+4);data.writeUInt32LE(2,sector+8);data.writeUInt32LE(1,sector+12);
 data.writeUInt32LE(vertices,sector+0x20);data.writeUInt32LE(packets,sector+0x50);
 for(let row=0;row<2;row++)for(let col=0;col<3;col++){const p=vertices+(row*3+col)*8;data.writeInt16LE(col*100,p);data.writeInt16LE(row*100,p+4);}
 data.writeUInt16LE(flags,vertices+5*8+6);data.writeUInt16LE(0xffff,packets+2);
 data.writeUInt32LE(768<<10,normals);data.writeUInt32LE(256<<20,normals+4);
 data.writeUInt16LE(1<<10,zone);data.writeUInt16LE(0x1100,zone+4);
 for(let row=0;row<256;row++)for(let i=0;i<6;i++)data.writeUInt16LE(0xff,rowTable+row*16+i*2);
 data.writeUInt16LE(128|(128<<8),rowTable+128*16);data.writeUInt32LE(1,rowTable+128*16+12);
 data.writeUInt16LE(0xffff,484);data.writeUInt16LE(1,486);
 return data;
}
test('collision normals retain signed ten-bit components and discard upper flags',()=>{
 const packed=(((-512&1023)<<20)|((511&1023)<<10)|(-1&1023)|0xc0000000)>>>0;
 assert.deepEqual(unpackCollisionNormal(packed),[-512,511,-1]);
});
test('collision regions exclude unused render-cell codes and preserve diagonal forms',()=>{
 const grid=parseCollisionGrid(fixture()),cells=grid.sectors[0].cells;
 assert.equal(cells[0].covered,false);assert.equal(cells[0].rawNormalIndex,0xffff);assert.deepEqual(cells[0].forms,[]);
 assert.equal(cells[1].covered,true);assert.deepEqual(cells[1].forms.map(f=>f.type),[2,3]);
 assert.deepEqual(cells[1].forms[0].indices,[1,2,4]);assert.deepEqual(cells[1].forms[1].indices,[2,5,4]);
 assert.deepEqual(cells[1].forms.map(f=>f.normal),[0,1]);
 assert.deepEqual(parseCollisionGrid(fixture(2)).sectors[0].cells[1].forms.map(f=>f.type),[5,4]);
 assert.deepEqual(parseCollisionGrid(fixture(4)).sectors[0].cells[1].forms[0],{type:0,normal:0,point:null,indices:[1,2,5,4]});
});
test('border planes require region coverage and preserve the absent-plane sentinel',()=>{
 const data=fixture();data.writeUInt32LE(0,sector+4);data.writeUInt16LE(0x9999,484);
 let border=parseCollisionGrid(data).sectors[0].borders[0];
 assert.equal(border.left.covered,false);assert.equal(border.left.normal,null);assert.equal(border.right.normal,1);
 data.writeUInt16LE(0xffff,486);border=parseCollisionGrid(data).sectors[0].borders[0];assert.equal(border.right.normal,null);
});
test('active normal references and region extents are checked',()=>{
 const badNormal=fixture();badNormal.writeUInt32LE(1,0x38);assert.throws(()=>parseCollisionGrid(badNormal),/normal index 1/);
 const badRegion=fixture();badRegion.writeUInt16LE(0x2100,zone+4);assert.throws(()=>parseCollisionGrid(badRegion),/exceeds its sector/);
});
