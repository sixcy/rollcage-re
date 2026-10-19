import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareWheelDriveInputs,readVehicleSurfaceMode} from '../src/wheel-drive.mjs';
const body=velocity=>({linearVelocity:velocity,rotation:[4096,0,0,0,4096,0,0,0,4096]});
const state=()=>({inputByte:129,counter658:0,counter65a:0,counter65c:0,scaleQ12:4096,reductionQ16:0,multiplierQ16:65536,capacityOffset:0,capacityOverride:0});
const globals={gameMode:0,modeFlags:0};
test('drive counters transition from lateral motion to aligned recovery and expire',()=>{
 const drive=state(),lateral=prepareWheelDriveInputs(body([32*65536,0,0]),drive,globals);
 assert.deepEqual([drive.counter658,drive.counter65a,drive.counter65c],[1,0,29]);assert.equal(lateral.driveShift,0);
 drive.inputByte=128;
 const aligned=prepareWheelDriveInputs(body([0,0,32*65536]),drive,globals);
 assert.deepEqual([drive.counter658,drive.counter65a,drive.counter65c],[0,7,29]);assert.equal(aligned.driveShift,3);assert.ok(aligned.capacity>lateral.capacity);
 let result;for(let i=0;i<7;i++)result=prepareWheelDriveInputs(body([0,0,32*65536]),drive,globals);
 assert.equal(drive.counter65a,0);assert.equal(result.driveShift,0);assert.equal(drive.counter65c,22);
});
test('drive modes prioritize bit one, apply reduction, and retain the final capacity override',()=>{
 const base=state();base.inputByte=128;
 const run=(drive,mode)=>prepareWheelDriveInputs(body([0,0,0]),drive,mode).capacity;
 assert.equal(run({...base},{gameMode:0,modeFlags:3}),run({...base},{gameMode:0,modeFlags:1}));
 assert.ok(run({...base,reductionQ16:32768},{gameMode:4,modeFlags:0})<run({...base},{gameMode:4,modeFlags:0}));
 assert.ok(run({...base,multiplierQ16:29999},globals)>run({...base,multiplierQ16:30000},globals));
 assert.equal(run({...base,capacityOverride:1,capacityOffset:1000000},globals),0xc00);
 assert.throws(()=>prepareWheelDriveInputs(body([0,0,0]),state()),/explicit game mode/);
});
test('vehicle surface mode uses registered vertex codes and the loader lower bound',()=>{
 const data=Buffer.alloc(0x200),scene={segments:[{columns:2,rows:1,verticesOffset:0x100}]};data.writeUInt16LE(900,0x66);
 const classify=code=>{data.writeUInt32LE((code<<22)>>>0,0x100+5*8+4);return readVehicleSurfaceMode(data,scene,0x10200);};
 assert.equal(classify(899),0);assert.equal(classify(900),1);assert.equal(classify(975),1);assert.equal(classify(976),2);assert.equal(classify(1007),2);assert.equal(classify(1008),0);
 assert.equal(readVehicleSurfaceMode(null,null,-1),0);
 assert.throws(()=>readVehicleSurfaceMode(data,scene,0x10300),/vertex grid/);
});
