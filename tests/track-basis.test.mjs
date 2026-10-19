import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrackBasisAxis,readVehicleTrackBasis} from '../src/track-basis.mjs';
test('track axis policy retains mode, sector, row and progression thresholds',()=>{
 assert.deepEqual([15,16,23,24].map(row=>selectTrackBasisAxis(row<<16,{mode:12,progressStage:6})),[1,2,2,-1]);
 assert.deepEqual([59,60,70,71].map(row=>selectTrackBasisAxis((row<<16)|5,{mode:11,progressStage:4})),[1,3,3,-1]);
 assert.equal(selectTrackBasisAxis(8,{mode:11,progressStage:11}),1);assert.equal(selectTrackBasisAxis(10,{mode:11,progressStage:11}),-1);assert.equal(selectTrackBasisAxis(8,{mode:0,progressStage:11}),0);
});
test('track basis keeps native route-dot direction, bottom neighbor and Q16 normal decoding',()=>{
 const data=Buffer.alloc(0x200);data.writeUInt32LE(0x100,0xa0);data.writeInt16LE(1,0x110);
 const vertices=[];for(let row=0;row<=2;row++)for(let col=0;col<=2;col++)vertices.push([col,0,row]);
 const grid={sectors:[{columns:2,rows:2,vertices,cells:Array.from({length:4},()=>({rawNormalIndex:0}))}],normals:[{packed:768<<10}]},context={mode:0,progressStage:0,routeIndex:0};
 assert.deepEqual(readVehicleTrackBasis(data,grid,0,context),{tangentQ16:[0,0,-4096],normalQ16:[0,-65536,0]});
 assert.deepEqual(readVehicleTrackBasis(data,grid,2<<16,context).tangentQ16,[0,0,-4096]);data.writeInt16LE(-1,0x110);assert.deepEqual(readVehicleTrackBasis(data,grid,0,context).tangentQ16,[0,0,4096]);
 assert.equal(readVehicleTrackBasis(null,null,-4),null);assert.throws(()=>readVehicleTrackBasis(data,grid,0),/explicit mode/);
});
