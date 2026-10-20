import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {CollisionEventQueue,insertCollisionEvent} from '../src/collision-events.mjs';
import {runPhysicsFrame} from '../src/physics-frame.mjs';
const {evidence,instructions}=await readInstructionEvidence(['278-physics-frame-assembly.json','292-event-heap-build-assembly.json','286-event-heap-sift-assembly.json','293-event-heap-invalidate-assembly.json','285-event-filter-assembly.json']);
const machine=new BoundedX86(instructions,{entry:0x4749e0}),HEAP=0x4000,FREE=0x5000,EVENTS=0x20000,LIST=0x30000,OTHER=0x31000;
let seed=0x4749e041,instructionSteps=0,processedEvents=0,negativeDeltas=0,scriptedBodies=0,ordinaryBodies=0,capturedCountMutations=0,liveEntryMutations=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;};
const address=body=>body?.address??0;
function encodeEvent(bytes,p,event){
 for(const [name,offset]of [['kind',0],['scalar',0x48],['field44',0x44],['classFlags',0x54]])bytes.writeInt32LE(event[name]|0,p+offset);
 for(const [name,offset]of [['object1',4],['object2',8]])bytes.writeUInt32LE(address(event[name]),p+offset);
 for(const [name,offset]of [['point',0x2c],['normal',0x38],['auxiliaryVector',0x5c]])event[name].forEach((value,index)=>bytes.writeInt32LE(value,p+offset+index*4));
 bytes.writeUInt16LE(event.tag,p+0x58);bytes.writeUInt16LE(event.damping,p+0x5a);
}
const fixtures=1600;
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();const bytes=machine.bytes,capacity=16,queue=new CollisionEventQueue(capacity),bodies=Array.from({length:8},(_,index)=>({address:0x10000+index*0x400,flags:random(2)?0x2003:3,frameTimeQ16:fixture%5===0?50000:0,collisionFlags:0,state180:random(1000)})),expected=[],actual=[];
 queue.events.forEach((event,index)=>Object.assign(event,{kind:index,object1:null,object2:null,point:[index,-index,0],normal:[0,65536,0],auxiliaryVector:[17,18,19],scalar:index,field44:0,classFlags:1,tag:index,damping:0x1234}));
 queue.push(12345,false);queue.push(40000,true);
 const group={bodies:bodies.slice(),count:fixture%8},other=bodies.slice().reverse(),effectFlags={first:random(4)-1,second:random(4)-1},beginCount=fixture%3===0?(fixture+2)%8:group.count,replaceArray=fixture%4===0;
 const captured=replaceArray?other:group.bodies,capturedPointer=replaceArray?OTHER:LIST;
 bodies.forEach(body=>{bytes.fill(0xa5,body.address,body.address+0x400);bytes.writeInt32LE(body.flags,body.address);bytes.writeInt32LE(body.frameTimeQ16,body.address+0x118);bytes.writeInt32LE(body.collisionFlags,body.address+0x110);bytes.writeUInt32LE(0,body.address+0x148);bytes.writeInt32LE(body.state180,body.address+0x180);});
 const bodyBytes=bodies.map(body=>Buffer.from(bytes.subarray(body.address,body.address+0x400)));
 group.bodies.forEach((body,index)=>bytes.writeUInt32LE(body.address,LIST+index*4));other.forEach((body,index)=>bytes.writeUInt32LE(body.address,OTHER+index*4));
 bytes.writeUInt16LE(group.count,0x902bc4);bytes.writeUInt32LE(LIST,0x902bc0);bytes.writeInt32LE(effectFlags.first,0x91cd90);bytes.writeInt32LE(effectFlags.second,0x9153d0);
 bytes.writeInt32LE(capacity,0x902ba4);bytes.writeUInt32LE(HEAP,0x902bac);bytes.writeUInt32LE(FREE,0x902bb0);bytes.writeUInt32LE(EVENTS,0x902ba8);bytes.writeInt32LE(queue.count,0x902ba0);bytes.writeInt32LE(queue.freeTop,0x902bb4);
 queue.heap.forEach((value,index)=>bytes.writeUInt32LE(value,HEAP+index*4));queue.free.forEach((value,index)=>bytes.writeUInt32LE(value,FREE+index*4));bytes.fill(0xa5,EVENTS,EVENTS+capacity*0x68);queue.events.forEach((event,index)=>encodeEvent(bytes,EVENTS+index*0x68,event));
 const originalRecords=Buffer.from(bytes.subarray(EVENTS,EVENTS+capacity*0x68)),templates=Array.from({length:fixture%9},(_,index)=>({object1:bodies[index%8],object2:index&1?bodies[(index+1)%8]:null,contact:{point:[index,0,0],normal:[0,65536,0],scalar:0,field38:0},flags:{value:1},tag:index,deltaQ16:random(65537)-bodies[index%8].frameTimeQ16}));
 // Initial generation is an explicit native boundary: its predetermined output
 // is copied to native memory. JS generation uses real event insertion.
 const generated=new CollisionEventQueue(capacity);generated.heap.set(queue.heap);generated.events=queue.events.map(event=>({...event}));generated.reset();for(const template of templates)insertCollisionEvent(generated,{...template,flags:{...template.flags}});
 const generatedRecords=Buffer.from(originalRecords);generated.events.forEach((event,index)=>encodeEvent(generatedRecords,index*0x68,event));
 let nativeIndex=0;
 const snapshot=(log,name)=>log.push([name,bytes.readInt32LE(0x91cd90),bytes.readInt32LE(0x9153d0),bytes.readInt32LE(0x902ba0)]);
 machine.externalCalls.set(0x46e9b0,()=>{snapshot(actual,'begin');bytes.writeUInt16LE(beginCount,0x902bc4);if(replaceArray)bytes.writeUInt32LE(OTHER,0x902bc0);});
 for(const [entry,name]of [[0x476550,'scripted'],[0x47a8e0,'ordinary']])machine.externalCalls.set(entry,m=>{
  const p=m.r.ECX,index=nativeIndex++;actual.push([name,p,index,bytes.readInt32LE(0x91cd90),bytes.readInt32LE(0x9153d0)]);bytes.writeInt32LE(bytes.readInt32LE(p+0x180)+1,p+0x180);
  if(index===0&&beginCount>1){bytes.writeUInt32LE(bodies[7].address,capturedPointer+4);bytes.writeInt32LE(bytes.readInt32LE(bodies[7].address)^0x2000,bodies[7].address);bytes.writeUInt16LE(0,0x902bc4);bytes.writeUInt32LE(capturedPointer===LIST?OTHER:LIST,0x902bc0);}
 });
 machine.externalCalls.set(0x413fc0,()=>{snapshot(actual,'externalWorld');bytes.writeInt32LE(88,0x91cd90);bytes.writeInt32LE(99,0x9153d0);});
 for(const [entry,name]of [[0x4287f0,'collectCandidates'],[0x46ea80,'updateGroups'],[0x475760,'updateVehicles']])machine.externalCalls.set(entry,()=>snapshot(actual,name));
 machine.externalCalls.set(0x427870,()=>{snapshot(actual,'buildInitialEvents');bytes.writeInt32LE(generated.count,0x902ba0);bytes.writeInt32LE(generated.freeTop,0x902bb4);generated.heap.forEach((value,index)=>bytes.writeUInt32LE(value,HEAP+index*4));generated.free.forEach((value,index)=>bytes.writeUInt32LE(value,FREE+index*4));generatedRecords.copy(bytes,EVENTS);});
 machine.externalCalls.set(0x474bb0,m=>{
  const p=m.r.ECX,a=bytes.readUInt32LE(p+4),b=bytes.readUInt32LE(p+8),delta=m.r.EDX,tag=bytes.readUInt16LE(p+0x58);actual.push(['respond',a,b,delta,bytes.readInt32LE(0x902bb4)]);
  if(a)bytes.writeInt32LE((bytes.readInt32LE(a+0x118)+delta)|0,a+0x118);bytes.writeInt32LE(bytes.readInt32LE(p+0x48)+1,p+0x48);if(tag%3===0)bytes.writeUInt32LE(0,p+4);if(tag%5===0)bytes.writeUInt32LE(0,p+8);
 });
 machine.externalCalls.set(0x427910,m=>actual.push(['refresh',m.r.ECX,m.r.EDX,bytes.readInt32LE(0x902ba0)]));
 machine.externalCalls.set(0x475450,()=>actual.push(['finish',bytes.readInt32LE(0x902ba0),bodies.map(body=>bytes.readInt32LE(body.address+0x118))]));
 const portSnapshot=name=>expected.push([name,effectFlags.first,effectFlags.second,queue.count]);
 const prep=(body,index,name)=>{expected.push([name,body.address,index,effectFlags.first,effectFlags.second]);body.state180++;if(index===0&&beginCount>1){captured[1]=bodies[7];bodies[7].flags^=0x2000;group.count=0;group.bodies=captured===other?bodies.slice():other;capturedCountMutations++;liveEntryMutations++;}};
 const result=runPhysicsFrame(group,{queue,effectFlags,
  begin:()=>{portSnapshot('begin');group.count=beginCount;if(replaceArray)group.bodies=other;},prepareOrdinary:(body,index)=>prep(body,index,'ordinary'),stepScripted:(body,index)=>prep(body,index,'scripted'),
  externalWorld:()=>{portSnapshot('externalWorld');effectFlags.first=88;effectFlags.second=99;},collectCandidates:()=>portSnapshot('collectCandidates'),updateGroups:()=>portSnapshot('updateGroups'),updateVehicles:()=>portSnapshot('updateVehicles'),
  buildInitialEvents:()=>{portSnapshot('buildInitialEvents');for(const template of templates)insertCollisionEvent(queue,{...template,flags:{...template.flags}});},
  respond:(event,delta)=>{expected.push(['respond',address(event.object1),address(event.object2),delta,queue.freeTop]);if(event.object1)event.object1.frameTimeQ16=(event.object1.frameTimeQ16+delta)|0;event.scalar++;if(event.tag%3===0)event.object1=null;if(event.tag%5===0)event.object2=null;if(delta<0)negativeDeltas++;},
  refresh:(first,second)=>expected.push(['refresh',address(first),address(second),queue.count]),finish:()=>expected.push(['finish',queue.count,bodies.map(body=>body.frameTimeQ16)])});
 machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);instructionSteps+=machine.run();assert.equal(machine.r.EAX,result.nativeReturn);assert.deepEqual(actual,expected,`stage sequence fixture ${fixture}`);
 assert.equal(result.preparedBodies,beginCount);assert.equal(result.scriptedBodies+result.ordinaryBodies,beginCount);scriptedBodies+=result.scriptedBodies;ordinaryBodies+=result.ordinaryBodies;processedEvents+=result.processedEvents;
 assert.equal(bytes.readInt32LE(0x91cd90),effectFlags.first);assert.equal(bytes.readInt32LE(0x9153d0),effectFlags.second);assert.equal(bytes.readUInt16LE(0x902bc4),group.count);
 for(let index=0;index<bodies.length;index++){const body=bodies[index],expectedBytes=bodyBytes[index];expectedBytes.writeInt32LE(body.flags,0);expectedBytes.writeInt32LE(body.frameTimeQ16,0x118);expectedBytes.writeInt32LE(body.state180,0x180);assert.ok(bytes.subarray(body.address,body.address+0x400).equals(expectedBytes),`body bytes ${fixture}:${index}`);}
 assert.equal(bytes.readInt32LE(0x902ba0),queue.count);assert.equal(bytes.readInt32LE(0x902bb4),queue.freeTop);
 for(const [values,p]of [[queue.heap,HEAP],[queue.free,FREE]])values.forEach((value,index)=>assert.equal(bytes.readUInt32LE(p+index*4),value,`queue ${fixture}:${index}`));
 const records=Buffer.from(originalRecords);queue.events.forEach((event,index)=>encodeEvent(records,index*0x68,event));assert.ok(bytes.subarray(EVENTS,EVENTS+records.length).equals(records),`complete event bytes ${fixture}`);
}
const report={method:'Complete4749e0 stage scheduler plus retained queue reset/sift/filter/invalidation instructions. Preparation, world, candidates, groups, vehicles, initial contact generation, response and finish are explicit state-mutating boundary mocks. Initial builder output is predetermined; no claim about its contact geometry. Live body-array mutations, captured word count/pointer, effect-clear timing, all event bytes and body bytes compared. Real JS collision-event processing executes. No original process execution.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,fixtures,scriptedBodies,ordinaryBodies,capturedCountMutations,liveEntryMutations,processedEvents,negativeDeltas,instructionSteps,matched:true};
await writeFile('analysis/physics-frame-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
