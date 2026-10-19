import {readFile,writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {advanceBodyForCollision,advanceKinematicBody,finishBodyAdvancement} from '../src/body-advancement.mjs';
const {evidence,instructions}=await readInstructionEvidence(['284-body-event-advance-assembly.json','281-final-body-advance-assembly.json','295-kinematic-body-advance-assembly.json','135-body-advance-assembly.json','128-normalize-small-assembly.json','129-normalize-large-assembly.json','300-quaternion-matrix-assembly.json','133-sqrt-lookup-assembly.json','211-sqrt-leading-zeros-assembly.json','217-wheel-capacity-curve-assembly.json']);
const sqrt=JSON.parse(await readFile('src/sqrt-table.json','utf8'));let actual=[];
const machine=new BoundedX86(instructions,{externalCalls:new Map([0x474850,0x474600].map((address,index)=>[address,m=>actual.push([index?'insert':'remove',m.r.ECX,m.bytes.readInt32LE(m.r.ECX+0x118),[0,1,2].map(i=>m.bytes.readInt32LE(m.r.ECX+0x34+i*4))])]))});
sqrt.values.forEach((value,index)=>machine.bytes.writeUInt16LE(value,0x5eb290+index*2));
let seed=0x479d20ab,instructionSteps=0,checks=0;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;};
function encode(bytes,p,body) {
 bytes.writeInt32LE(body.flags,p);bytes.writeInt32LE(body.integrationFlags,p+0x108);bytes.writeInt32LE(body.frameTimeQ16,p+0x118);bytes.writeUInt16LE(body.attachmentCount,p+0x16a);
 for(const [values,offset]of [[body.position,0x34],[body.linearVelocity,0x68],[body.quaternion,0x58],[body.quaternionDerivative,0x8c]])values.forEach((value,index)=>bytes.writeInt32LE(value,p+offset+index*4));
 body.rotation.forEach((value,index)=>bytes.writeInt16LE(value,p+0xc4+index*2));
}
function bodyAt(address,index) {
 const edges=[0,0xffffff,0x1000000,-1,-0x1000000,2147483647,-2147483648];
 return {address,flags:[3,7,21,17,0x8000][index%5],integrationFlags:index%4===0?1:0,frameTimeQ16:[0,65535,65536,65537,-65536,131072][random(6)],attachmentCount:random(3)?0:random(65535)+1,
  position:[0,1,2].map(()=>random(2)?edges[random(edges.length)]:random(0xffffffff)|0),linearVelocity:[0,1,2].map(()=>random(0xffffffff)|0),
  quaternion:index%7===0?[random(2)?20000000:-20000000,...[0,1,2].map(()=>random(2000001)-1000000)]:[0,1,2,3].map(()=>random(200001)-100000),quaternionDerivative:[0,1,2,3].map(()=>random(100001)-50000),rotation:Array.from({length:9},()=>random(65536)-32768)};
}
function setup(bodies,options) {
 machine.reset();actual=[];machine.bytes.writeUInt32LE(0,0x6e6ba0);machine.bytes.writeUInt32LE(options.timeScaleActive?1:0,0x811180);machine.bytes.writeUInt32LE(options.timeScaleExempt?bodies[0]?.address??0:0,0x811184);machine.bytes.writeInt32LE(options.timeScaleQ16,0x81118c);
 bodies.forEach(body=>{machine.bytes.fill(0xa5,body.address,body.address+0x180);encode(machine.bytes,body.address,body);});
}
function call(entry,ecx,edx,normal) {
 machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);machine.bytes.writeUInt32LE(normal?0x7000:0,0x9004);normal?.forEach((value,index)=>machine.bytes.writeInt32LE(value,0x7000+index*4));instructionSteps+=machine.run();checks++;
}
function compare(bodies,expectedBytes,events,attachments,label) {
 for(let index=0;index<bodies.length;index++){encode(expectedBytes[index],0,bodies[index]);if(!machine.bytes.subarray(bodies[index].address,bodies[index].address+0x180).equals(expectedBytes[index]))throw Error(`${label}: body bytes differ at ${index}: ${JSON.stringify(bodies[index])}`);}
 if(JSON.stringify(actual)!==JSON.stringify(events))throw Error(`${label}: spatial call order differs.`);
 const count=machine.bytes.readUInt32LE(0x6e6ba0),queued=Array.from({length:count},(_,index)=>machine.bytes.readUInt32LE(0x902040+index*4));if(JSON.stringify(queued)!==JSON.stringify(attachments.map(body=>body.address)))throw Error(`${label}: attachment queue differs.`);
}
const handlersFor=(events,attachmentQueue)=>({attachmentQueue,removeSpatial:body=>events.push(['remove',body.address,body.frameTimeQ16,body.position.slice()]),insertSpatial:body=>events.push(['insert',body.address,body.frameTimeQ16,body.position.slice()])});
const individualFixtures=4000;let spatialRefreshes=0,attachmentEntries=0;
for(let fixture=0;fixture<individualFixtures;fixture++) {
 const body=bodyAt(0x10000,fixture),options={timeScaleActive:!!random(2),timeScaleExempt:!!random(2),timeScaleQ16:[0,32768,65536,98304][random(4)]},normal=random(2)?[0,1,2].map(()=>random(0xffffffff)|0):null,delta=fixture%11===0&&body.integrationFlags&1?(random(0xffffffff)|0):random(262145)-131072;
 for(const kind of ['event','kinematic']) {
  const state=structuredClone(body);setup([state],options);const before=[Buffer.from(machine.bytes.subarray(state.address,state.address+0x180))],expected=[],attachments=[],handlers=handlersFor(expected,attachments);
  if(kind==='event')advanceBodyForCollision(state,delta,normal,handlers,options);else advanceKinematicBody(state,delta,handlers);
  call(kind==='event'?0x474950:0x4757a0,state.address,delta,kind==='event'?normal:null);compare([state],before,expected,attachments,`${kind} ${fixture}`);spatialRefreshes+=expected.length/2;attachmentEntries+=attachments.length;
 }
}
const finishFixtures=1500;let finishedBodies=0;
for(let fixture=0;fixture<finishFixtures;fixture++) {
 const bodies=Array.from({length:fixture%9},(_,index)=>bodyAt(0x10000+index*0x400,fixture+index)),options={timeScaleActive:!!random(2),timeScaleExempt:false,timeScaleQ16:32768+random(65537)};setup(bodies,options);
 machine.bytes.writeUInt32LE(0x6000,0x902bc0);bodies.forEach((body,index)=>machine.bytes.writeUInt32LE(body.address,0x6000+index*4));machine.bytes.writeUInt32LE(0,0x6000+bodies.length*4);
 const before=bodies.map(body=>Buffer.from(machine.bytes.subarray(body.address,body.address+0x180))),expected=[],attachments=[];finishedBodies+=finishBodyAdvancement(bodies,handlersFor(expected,attachments),options);call(0x475450,0,0);compare(bodies,before,expected,attachments,`finish ${fixture}`);spatialRefreshes+=expected.length/2;attachmentEntries+=attachments.length;
}
const report={method:'Bounded interpretation of collision advance, frame completion, kinematic advance, shared pose arithmetic, both quaternion normalization paths, quaternion matrix, lookup root and fixed division. Compares every byte of each 384-byte body region and attachment queue. Only spatial removal/insertion are explicit nonmutating event mocks; their full order and observed pose/clock match. No original process execution.',evidence:evidence.map(item=>item.evidence_id),table:sqrt.evidence??sqrt.evidence_id??'PE/Ghidra-verified src/sqrt-table.json',instructions:instructions.length,individualFixtures,individualChecks:individualFixtures*2,finishFixtures,finishedBodies,spatialRefreshes,attachmentEntries,checks,instructionSteps,matched:true};
await writeFile('analysis/body-advancement-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
