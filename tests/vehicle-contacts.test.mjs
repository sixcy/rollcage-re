import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeVehicleContacts,updateVehicleContacts} from '../src/vehicle-contacts.mjs';
import {boxCollision} from '../tools/lib/model-query-fixtures.mjs';
test('verified vehicle geometry initializes native wheel positions and aggregate radius',()=>{
 const state=initializeVehicleContacts();
 assert.deepEqual(state.descriptors.map(descriptor=>descriptor.positionQ8),[[-6912,0,8192],[6912,0,8192],[-6912,0,-8192],[6912,0,-8192]]);
 assert.ok(state.descriptors.every(descriptor=>JSON.stringify(descriptor.directionQ8)==='[0,256,0]'));
 assert.equal(state.collisionShapes.length,5);assert.ok(state.collisionShapes.every(shape=>shape.radiusQ8===4864));
 assert.equal(state.baseRadiusQ8,12448);assert.equal(state.wheelRadiusQ8,15520);assert.equal(state.bodyRadiusQ8,15520);assert.equal(state.activeTag,5);
});
test('connected native-sized vehicle contacts select a model roof and terrain for other wheels',()=>{
 const vertices=[];for(let row=0;row<3;row++)for(let col=0;col<3;col++)vertices.push([-128+col*128,0,128-row*128,4]);
 const cells=Array.from({length:4},(_,index)=>({forms:[{type:0,normal:0,point:null}],row:index>>1,column:index&1}));
 const registration={found:true,outside:false,node:{index:0,zone:0}},spatial={available:true,lookup:()=>registration};
 const grid={available:true,spatial,normals:[{packed:768<<10,components:[0,-256,0]}],sectors:[{index:0,columns:2,rows:2,vertices,cells,flags:1}],regions:[{index:0,sector:0,row:0,column:0,rows:2,columns:2,padding:200}],zones:[{root:0,regions:[0]}],scene:{uvTable:0x100,segments:[{columns:2,rows:2,packetsOffset:0x80}]}};
 const data=Buffer.alloc(0x180);data.writeUInt32LE(0xf03,0x10c);
 const collision=boxCollision(),settings={placementIndex:0,position:[-27,0,32],yaw:0,class:0,configurations:[{type:1}]};
 const context={spatial,links:{nodes:[{placementIndices:[0]}]},instances:new Map([[0,{collision,settings}]])};
 const body={flags:3,position:[0,-40*65536,0],linearVelocity:[0,0,0],angularVelocity:[0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096]},state=initializeVehicleContacts();
 const result=updateVehicleContacts(data,grid,context,body,state);
 assert.equal(result.preparation.contact,true);assert.equal(result.preparation.attempts,1);assert.equal(result.models.candidates.length,1);
 assert.ok(state.wheels.every(wheel=>wheel.flags&1));assert.equal(state.descriptors[0].cellRef,-4);assert.equal(state.descriptors[0].surface,null);
 assert.ok(state.descriptors.slice(1).every(descriptor=>descriptor.surface.category===3&&descriptor.surface.gripReduction===15));
 assert.ok(state.contacts[0].distance<state.contacts[1].distance);
});
