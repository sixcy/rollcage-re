import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {checkPostFrameVehicles} from '../src/post-frame-vehicle-check.mjs';

const {evidence,instructions}=await readInstructionEvidence(['109-post-frame-vehicle-check-assembly.json'],{directory:'analysis/native-simulation/results'}),machine=new BoundedX86(instructions);
const SESSION=0x50000,RECORDS=0x909300,SECTORS=0x5e000,HEADERS=0x60000;
let seed=0x47e180ab,instructionSteps=0,checkedVehicles=0,markedBodies=0,heightFailures=0,slowFailures=0,wrappedCounters=0,groundedResets=0,aliasedRegistrations=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0xffffffff)|0,fixtures=5000;
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();const bytes=machine.bytes,count=fixture%9,sectorHeights=Array.from({length:256},()=>random(65536)-32768);
 const bodies=Array.from({length:8},(_,index)=>({address:0x10000+index*0x4000,position:[signed(),signed(),signed()],closestTerrain11c:signed(),collisionFlags:signed(),collisionState128:signed(),speed668:[-32768,-1,0,1,2,3,32767][random(7)]})),states=bodies.map(()=>({wheels:Array.from({length:4},()=>({flags:random(256)}))}));
 const runtime={session:{vehicleCount54d:count},records:Array.from({length:8},(_,index)=>({body00:bodies[fixture%3===0?random(8):index],field248:[0,89,90,91,254,255,random(256)][random(7)]}))};
 for(let index=0;index<bodies.length;index++){
  const body=bodies[index],sector=body.closestTerrain11c&255;
  //Every third fixture lands exactly on or just beyond an ordinary threshold;
  //the others retain the complete signed16 height/Y range.
  if(fixture%3===0){sectorHeights[sector]=random(1000)-500;body.position[1]=((sectorHeights[sector]+511+random(3))<<16)|random(65536);}
 }
 function encodeBody(target,p,body,index){body.position.forEach((value,axis)=>target.writeInt32LE(value,p+0x34+axis*4));target.writeInt32LE(body.closestTerrain11c,p+0x11c);target.writeInt32LE(body.collisionFlags,p+0x110);target.writeInt32LE(body.collisionState128,p+0x128);target.writeInt16LE(body.speed668,p+0x668);states[index].wheels.forEach((wheel,axis)=>target[p+0x324+axis*200]=wheel.flags);}
 bodies.forEach((body,index)=>{bytes.fill(0xa5,body.address,body.address+0x4000);encodeBody(bytes,body.address,body,index);});
 const originals=bodies.map(body=>Buffer.from(bytes.subarray(body.address,body.address+0x4000)));
 bytes.fill(0xa5,RECORDS,RECORDS+8*0x30c);runtime.records.forEach((record,index)=>{bytes.writeUInt32LE(record.body00.address,RECORDS+index*0x30c);bytes[RECORDS+index*0x30c+0x248]=record.field248;});
 const registry=Buffer.from(bytes.subarray(RECORDS,RECORDS+8*0x30c));bytes.fill(0xa5,SESSION,SESSION+0x600);bytes[SESSION+0x54d]=count;bytes.writeUInt32LE(SESSION,0x5ecb1c);
 bytes.writeUInt32LE(SECTORS,0x909240);sectorHeights.forEach((height,index)=>{bytes.writeUInt32LE(HEADERS+index*32,SECTORS+index*4);bytes.fill(0xa5,HEADERS+index*32,HEADERS+(index+1)*32);bytes.writeInt16LE(height,HEADERS+index*32+0x14);});
 const originalHeaders=Buffer.from(bytes.subarray(HEADERS,HEADERS+256*32)),originalSession=Buffer.from(bytes.subarray(SESSION,SESSION+0x600)),originalSectorPointers=Buffer.from(bytes.subarray(SECTORS,SECTORS+256*4));
 const counters=runtime.records.map(record=>record.field248),result=checkPostFrameVehicles(runtime,{sectorHeights,vehicleStateFor:body=>states[bodies.indexOf(body)]});
 machine.entry=0x47e180;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);instructionSteps+=machine.run();
 bodies.forEach((body,index)=>{const expected=Buffer.from(originals[index]);encodeBody(expected,0,body,index);assert.deepEqual(bytes.subarray(body.address,body.address+0x4000),expected,`complete body ${fixture}:${index}`);});
 runtime.records.forEach((record,index)=>registry[0x30c*index+0x248]=record.field248);assert.deepEqual(bytes.subarray(RECORDS,RECORDS+8*0x30c),registry,`complete registry ${fixture}`);assert.deepEqual(bytes.subarray(SESSION,SESSION+0x600),originalSession);assert.deepEqual(bytes.subarray(HEADERS,HEADERS+256*32),originalHeaders);assert.deepEqual(bytes.subarray(SECTORS,SECTORS+256*4),originalSectorPointers);
 checkedVehicles+=result.checkedVehicles;markedBodies+=result.markedBodies;heightFailures+=result.heightFailures;slowFailures+=result.slowFailures;
 for(let index=0;index<count;index++){const record=runtime.records[index],body=record.body00,state=states[bodies.indexOf(body)],below=(body.position[1]>>16)<=sectorHeights[body.closestTerrain11c&255]+512;if(below&&body.speed668<2){if(counters[index]===255)wrappedCounters++;if(state.wheels.every(wheel=>wheel.flags&1))groundedResets++;}if(runtime.records.slice(0,index).some(other=>other.body00===body))aliasedRegistrations++;}
}
const report={method:'Complete retained47e180 vehicle prepass, without mocked calls or arithmetic helpers. Every byte of8 full16384-byte bodies,8 registry records of780bytes,256 sector headers/pointers and the1536-byte session is compared. Synthetic fixtures cover signed16 height/Y/speed limits, strict height+512 and speed2 thresholds, every wheel-bit pattern, counters89/90/91/254/255, aliases between registered body pointers, exact count and untouched fields. No original process execution.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,fixtures,checkedVehicles,markedBodies,heightFailures,slowFailures,wrappedCounters,groundedResets,aliasedRegistrations,instructionSteps,matched:true};
await writeFile('analysis/post-frame-vehicle-check-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
