import test from 'node:test';
import assert from 'node:assert/strict';
import {parseModelCollision,readPlacementCollision} from '../src/model-collision.mjs';
function fixture() {
 const data=Buffer.alloc(0x400),model={index:7,offset:0,type:'MODC',vertexCount:3,verticesOffset:0x300};
 data[0x27]=2;data.writeUInt16LE(0x50,0x1c);data.writeUInt16LE(0x180,0x34);data.writeUInt16LE(0x200,0x38);data.writeUInt16LE(0x250,0x3a);
 data.writeUInt16LE(1,0x50+6);data.writeUInt32LE(0x50,0x50+0xc);data.writeUInt32LE(0x60,0x50+0x10);
 Buffer.from([1,2,3,0]).copy(data,0xa0);Buffer.from([1,3,4,0]).copy(data,0xa8);
 for(const p of [0xa4,0xac])data.writeUInt32LE(768<<10,p);
 data.writeInt16LE(-12,0x180);data.writeUInt32LE(3<<16,0x180+16);data.writeUInt32LE(1,0x194+12);data.writeUInt32LE((2<<16)|3,0x194+16);
 for(let i=0;i<3;i++){Buffer.from([0,1,2,255,0,0,0,255,i===1?1:0]).copy(data,0x200+i*9);}
 data[0x200+27]=3;
 for(let i=0;i<4;i++){const p=0x250+i*8;data.writeUInt32LE(256<<20,p);data[p+4]=i<3?1:3;data[p+5]=i<3?i+2:4;}
 for(let i=0;i<4;i++){data.writeInt16LE(i*10,0x300+i*8);data.writeInt16LE(-i*3,0x302+i*8);}
 return {data,model};
}
test('collision records retain extra faces and vertices beyond rendered counts',()=>{
 const {data,model}=fixture(),collision=parseModelCollision(data,model);
 assert.equal(collision.collisionModelOffset,0x50);assert.equal(collision.faces.length,2);assert.equal(collision.vertices.length,4);
 assert.deepEqual(collision.vertices[3],[30,-9,0,0]);assert.deepEqual(collision.faces[1].normalQ8,[0,-256,0]);
 assert.equal(collision.faceRecords.length,4);assert.equal(collision.edges.length,4);
 assert.deepEqual(collision.shapes.map(shape=>shape.kind),['polyhedron','edge']);assert.equal(collision.shapes[1].slot,1);
 assert.deepEqual(collision.faceRecords[1].edgeIndices,[0,1,2]);assert.deepEqual(collision.edges[3].indices,[3,4]);
});
test('disabled and point shapes do not invent face or edge references',()=>{
 const {data,model}=fixture();data[0x27]=4;data.writeUInt32LE(255,0x1a8+16);data.writeUInt32LE((1<<16)|255,0x1bc+16);
 const collision=parseModelCollision(data,model);
 assert.deepEqual(collision.shapes.slice(2).map(shape=>[shape.kind,shape.records]),[['disabled',[]],['point',[]]]);
 assert.equal(collision.faceRecords.length,4);
});
test('render-only models report unsupported collision data without interpreting placeholders',()=>{
 const {data,model}=fixture();model.type='MODL';data.fill(255,0x30,0x40);
 const collision=parseModelCollision(data,model);assert.equal(collision.available,false);assert.deepEqual(collision.shapes,[]);
});
test('invalid collision extents, lookup faces, edge vertices and vertex storage fail',()=>{
 let {data,model}=fixture();data.writeUInt32LE(0x4f,0x50+0x10);assert.throws(()=>parseModelCollision(data,model),/invalid extent/);
 ({data,model}=fixture());data[0x208]=8;assert.throws(()=>parseModelCollision(data,model),/missing face/);
 ({data,model}=fixture());data[0x254]=0;assert.throws(()=>parseModelCollision(data,model),/invalid vertex/);
 ({data,model}=fixture());model.verticesOffset=0x3f0;assert.throws(()=>parseModelCollision(data,model),/vertex array.*bounds/);
});
test('placement collision settings retain separate yaw, class and per-shape configuration',()=>{
 const {data,model}=fixture(),raw=Buffer.alloc(56);data.writeUInt32LE(0x100,0x88);raw.writeUInt16LE(4,20);raw.writeInt16LE(-32,16);raw[31]=7;
 data.writeUInt32LE(0xabc00102,0x110);data.writeUInt32LE(0x12445566,0x114);
 const placement={type:0,index:11,modelIndex:7,position:[10,-20,30],raw},collision=parseModelCollision(data,model),settings=readPlacementCollision(data,placement,collision);
 assert.equal(settings.yaw,254);assert.equal(settings.class,7);assert.equal(settings.configurationBase,0x110);
 assert.deepEqual(settings.configurations.map(config=>config.type),[11,2]);assert.deepEqual(settings.position,[10,-20,30]);
 raw.writeUInt16LE(0xffff,20);assert.throws(()=>readPlacementCollision(data,placement,collision),/configuration.*bounds/);
});
