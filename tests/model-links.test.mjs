import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStaticModelLinks} from '../src/model-links.mjs';
function fixture(){const data=Buffer.alloc(0x140);data.writeUInt32LE(0x100,0xac);data.writeUInt16LE(4,0x96);[0xffffffff,2,1,2].forEach((value,i)=>data.writeUInt32LE(value,0x100+i*4));return {data,spatial:{available:true,nodes:[{index:0,boundsWord:2<<19},{index:1,boundsWord:(1<<22)|(2<<19)}]},placements:{records:[{type:2},{type:0},{type:0}]}};}
test('static model links preserve pre-incremented starts, order and repeated placements',()=>{
 const {data,spatial,placements}=fixture(),links=parseStaticModelLinks(data,spatial,placements);
 assert.deepEqual(links.nodes.map(node=>node.placementIndices),[[2,1],[1,2]]);assert.equal(links.entries[0],0xffffffff);
});
test('static model links reject out-of-table groups and unresolved placement pointers',()=>{
 const {data,spatial,placements}=fixture();spatial.nodes[1].boundsWord=(2<<22)|(2<<19);assert.throws(()=>parseStaticModelLinks(data,spatial,placements),/exceeds its table/);
 spatial.nodes.pop();data.writeUInt32LE(0,0x104);assert.throws(()=>parseStaticModelLinks(data,spatial,placements),/unresolved ordinary/);
});
test('front-end packs have no static spatial model lists',()=>{
 assert.deepEqual(parseStaticModelLinks(Buffer.alloc(0),{available:false},{records:[]}),{available:false,nodes:[],entries:[]});
});
