import {writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {CollisionEventQueue,insertCollisionEvent,filterCollisionEvent,processCollisionEvents} from '../src/collision-events.mjs';
const {evidence,instructions}=await readInstructionEvidence(['292-event-heap-build-assembly.json','286-event-heap-sift-assembly.json','293-event-heap-invalidate-assembly.json','297-event-heap-insert-assembly.json','299-event-heap-push-assembly.json','285-event-filter-assembly.json','278-physics-frame-assembly.json']);
const HEAP=0x4000,FREE=0x5000,CONTACT=0x6000,FLAGS=0x6100,POINT=0x6200,EVENTS=0x20000;
let seed=0x4749e0ab;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;},signed=()=>random(0xffffffff)|0;
const machine=new BoundedX86(instructions);let instructionSteps=0,checks=0;
function call(entry,ecx=0,edx=0,args=[]) {
 machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);args.forEach((value,index)=>machine.bytes.writeInt32LE(value|0,0x9004+index*4));instructionSteps+=machine.run();checks++;return machine.r.EAX;
}
const encodeEvent=(bytes,p,event)=>{
 for(const [field,offset]of [['kind',0],['scalar',0x48],['field44',0x44],['classFlags',0x54]])if(field in event)bytes.writeInt32LE(event[field]|0,p+offset);
 for(const [field,offset]of [['object1',4],['object2',8]])if(field in event)bytes.writeUInt32LE(event[field]?.address??0,p+offset);
 for(const [field,offset]of [['point',0x2c],['normal',0x38],['auxiliaryVector',0x5c]])if(field in event)event[field].forEach((value,index)=>bytes.writeInt32LE(value,p+offset+index*4));
 if('tag'in event)bytes.writeUInt16LE(event.tag,p+0x58);if('damping'in event)bytes.writeUInt16LE(event.damping,p+0x5a);
};
function initialize(queue,bodies) {
 const bytes=machine.bytes;machine.reset();bytes.writeUInt32LE(queue.capacity,0x902ba4);bytes.writeUInt32LE(HEAP,0x902bac);bytes.writeUInt32LE(FREE,0x902bb0);bytes.writeUInt32LE(EVENTS,0x902ba8);
 bodies.forEach(body=>{bytes.writeInt32LE(body.frameTimeQ16,body.address+0x118);bytes.writeInt32LE(body.collisionFlags,body.address+0x110);});
 queue.events.forEach((event,index)=>encodeEvent(bytes,EVENTS+index*0x68,event));call(0x440510);
}
function compareQueue(queue,recordsBefore) {
 const bytes=machine.bytes;if(bytes.readInt32LE(0x902ba0)!==queue.count||bytes.readInt32LE(0x902bb4)!==queue.freeTop)throw Error('Queue counts differ.');
 for(const [values,p]of [[queue.heap,HEAP],[queue.free,FREE]])for(let i=0;i<values.length;i++)if(bytes.readUInt32LE(p+i*4)!==values[i])throw Error(`Queue storage differs at ${p.toString(16)}:${i}.`);
 if(recordsBefore){const expected=Buffer.from(recordsBefore);queue.events.forEach((event,index)=>encodeEvent(expected,index*0x68,event));if(!bytes.subarray(EVENTS,EVENTS+expected.length).equals(expected))throw Error('Event record bytes differ.');}
}
const poolFixtures=600;let insertions=0,invalidations=0;
for(let fixture=0;fixture<poolFixtures;fixture++) {
 const queue=new CollisionEventQueue(4+random(29)),bodies=Array.from({length:6},(_,index)=>({address:0x10000+index*0x400,frameTimeQ16:random(65537),collisionFlags:signed()}));
 queue.events.forEach(event=>Object.assign(event,{kind:signed(),object1:null,object2:null,point:[signed(),signed(),signed()],normal:[signed(),signed(),signed()],auxiliaryVector:[signed(),signed(),signed()],scalar:signed(),field44:signed(),classFlags:signed(),tag:random(65536),damping:random(65536)}));initialize(queue,bodies);compareQueue(queue);
 for(let step=0;step<32;step++) {
  const before=Buffer.from(machine.bytes.subarray(EVENTS,EVENTS+queue.capacity*0x68));
  if(queue.freeTop>=0&&(step%4||!queue.count)) {
   const object1=bodies[random(bodies.length)],object2=random(2)?bodies[random(bodies.length)]:null,contact={point:[signed(),signed(),signed()],normal:[signed(),signed(),signed()],scalar:signed(),field38:signed()},flags={value:signed()},tag=random(65536),auxiliaryVector=random(2)?[signed(),signed(),signed()]:null,deltaQ16=random(0x70000)-object1.frameTimeQ16;
   const bytes=machine.bytes;for(const [values,p]of [[contact.point,0x20],[contact.normal,0x2c]])values.forEach((value,index)=>bytes.writeInt32LE(value,CONTACT+p+index*4));bytes.writeInt32LE(contact.scalar,CONTACT+0x3c);bytes.writeInt32LE(contact.field38,CONTACT+0x38);bytes.writeInt32LE(flags.value,FLAGS);auxiliaryVector?.forEach((value,index)=>bytes.writeInt32LE(value,POINT+index*4));
   insertCollisionEvent(queue,{object1,object2,contact,flags,tag,auxiliaryVector,deltaQ16});call(0x475500,object1.address,object2?.address??0,[CONTACT,FLAGS,tag,auxiliaryVector?POINT:0,deltaQ16]);insertions++;
   if(bytes.readInt32LE(FLAGS)!==flags.value||auxiliaryVector?.some((value,index)=>bytes.readInt32LE(POINT+index*4)!==value))throw Error('Insertion input mutations differ.');
   if(object2&&bytes.readInt32LE(object2.address+0x110)!==object2.collisionFlags)throw Error('Second body flags differ.');
  }else{const first=random(4)?bodies[random(bodies.length)]:null,second=random(2)?bodies[random(bodies.length)]:null;const removed=queue.invalidate(first,second),native=call(0x475630,first?.address??0,second?.address??0);if(removed!==native)throw Error(`Invalidation result differs: ${removed}/${native}.`);invalidations++;}
  compareQueue(queue,before);
 }
}
// Indirect native callbacks are controlled mocks; their order, arguments and
// mutations are compared. The callback implementation itself is not claimed.
let actual=[];const filterFixtures=3000;let promoted=0;
for(let fixture=0;fixture<filterFixtures;fixture++) {
 const bodies=Array.from({length:2},(_,index)=>({address:0x10000+index*0x400,frameTimeQ16:signed(),collisionFlags:0,accept:[0,1,-1][random(3)],callback:!!random(2)}));
 const first=bodies[0],second=random(2)?bodies[1]:null,event={object1:first,object2:second,normal:[signed(),signed(),signed()]},expected=[],delta=signed();initialize(new CollisionEventQueue(1),bodies);encodeEvent(machine.bytes,EVENTS,event);machine.bytes.writeInt32LE(delta,FLAGS);actual=[];
 for(let index=0;index<2;index++) {
  const body=bodies[index],address=0x710000+index*0x100;
  if(body.callback){body.collisionFilter=(self,other,record)=>{expected.push([self.address,other?.address??0,record.normal.slice()]);self.frameTimeQ16=(self.frameTimeQ16+17)|0;if(index===0&&record.object2)record.object2.frameTimeQ16=(record.object2.frameTimeQ16-23)|0;return self.accept;};machine.bytes.writeUInt32LE(address,body.address+0x148);}
  machine.externalCalls.set(address,m=>{const self=m.bytes.readUInt32LE(m.r.ESP),other=m.bytes.readUInt32LE(m.r.ESP+4),record=m.bytes.readUInt32LE(m.r.ESP+8);actual.push([self,other,[0,1,2].map(i=>m.bytes.readInt32LE(record+0x38+i*4))]);m.bytes.writeInt32LE((m.bytes.readInt32LE(self+0x118)+17)|0,self+0x118);const next=m.bytes.readUInt32LE(record+8);if(index===0&&next)m.bytes.writeInt32LE((m.bytes.readInt32LE(next+0x118)-23)|0,next+0x118);m.r.EAX=body.accept;});
 }
 const expectedDelta=filterCollisionEvent(event,delta),before=Buffer.from(machine.bytes.subarray(EVENTS,EVENTS+0x68));call(0x474b20,EVENTS,FLAGS);encodeEvent(before,0,event);
 if(machine.bytes.readInt32LE(FLAGS)!==expectedDelta||!machine.bytes.subarray(EVENTS,EVENTS+0x68).equals(before)||JSON.stringify(actual)!==JSON.stringify(expected))throw Error(`Filter differs for fixture ${fixture}.`);
 if(event.object1===second&&second)promoted++;
 for(const body of bodies)if(machine.bytes.readInt32LE(body.address+0x118)!==body.frameTimeQ16)throw Error('Filter callback clock mutation differs.');
}
// Entire retained frame executes. Preparation/candidate/response/finalization
// calls are explicit mocks; heap pop, filtering and invalidation execute native
// instructions. This verifies orchestration, not time-of-impact or responses.
const frameFixtures=1500;let processedEvents=0,negativeDeltas=0;
const pre=[0x46e9b0,0x476550,0x47a8e0,0x413fc0,0x4287f0,0x46ea80,0x475760];
for(const address of pre)machine.externalCalls.set(address,()=>{});
for(let fixture=0;fixture<frameFixtures;fixture++) {
 const capacity=16,queue=new CollisionEventQueue(capacity),bodies=Array.from({length:8},(_,index)=>({address:0x10000+index*0x400,frameTimeQ16:fixture%5===0?50000:0,collisionFlags:0})),byAddress=new Map(bodies.map(body=>[body.address,body])),expected=[];initialize(queue,bodies);machine.bytes.writeUInt16LE(0,0x902bc4);actual=[];
 const add=(index)=>{const object1=bodies[index%8],object2=index&1?bodies[(index+1)%8]:null;insertCollisionEvent(queue,{object1,object2,contact:{point:[index,0,0],normal:[0,65536,0],scalar:0,field38:0},flags:{value:1},tag:index,deltaQ16:random(65537)-object1.frameTimeQ16});};
 const count=fixture%9;for(let i=0;i<count;i++)add(i);
 const heap=queue.heap.slice(),free=queue.free.slice(),countBefore=queue.count,topBefore=queue.freeTop;
 queue.events.forEach((event,index)=>encodeEvent(machine.bytes,EVENTS+index*0x68,event));
 machine.externalCalls.set(0x427870,m=>{heap.forEach((key,index)=>m.bytes.writeUInt32LE(key,HEAP+index*4));free.forEach((key,index)=>m.bytes.writeUInt32LE(key,FREE+index*4));m.bytes.writeInt32LE(countBefore,0x902ba0);m.bytes.writeInt32LE(topBefore,0x902bb4);});
 machine.externalCalls.set(0x474bb0,m=>{const p=m.r.ECX,a=m.bytes.readUInt32LE(p+4),b=m.bytes.readUInt32LE(p+8),delta=m.r.EDX;actual.push(['respond',a,b,delta]);if(a)m.bytes.writeInt32LE((m.bytes.readInt32LE(a+0x118)+delta)|0,a+0x118);if(m.bytes.readUInt16LE(p+0x58)%3===0)m.bytes.writeUInt32LE(0,p+4);});
 machine.externalCalls.set(0x427910,m=>actual.push(['refresh',m.r.ECX,m.r.EDX]));machine.externalCalls.set(0x475450,()=>actual.push(['finish']));
 const processed=processCollisionEvents(queue,{respond:(event,delta)=>{expected.push(['respond',event.object1?.address??0,event.object2?.address??0,delta]);if(delta<0)negativeDeltas++;if(event.object1)event.object1.frameTimeQ16=(event.object1.frameTimeQ16+delta)|0;if(event.tag%3===0)event.object1=null;},refresh:(a,b)=>expected.push(['refresh',a?.address??0,b?.address??0]),finish:()=>expected.push(['finish'])});processedEvents+=processed;
 call(0x4749e0);if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(`Frame order differs: ${JSON.stringify({fixture,actual,expected})}`);compareQueue(queue);
 for(const body of byAddress.values())if(machine.bytes.readInt32LE(body.address+0x118)!==body.frameTimeQ16)throw Error('Frame response clock mutation differs.');
}
const report={method:'Bounded retained-x86 interpretation. Pool reset, insertion, sift, byte-preserving contact record writes, backwards invalidation, complete event-filter instructions and frame orchestration. Indirect acceptance callbacks and nonqueue frame callees are explicit state-mutating mocks; contact generation and collision responses are not verified. No original process execution.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,poolFixtures,insertions,invalidations,filterFixtures,promoted,frameFixtures,processedEvents,negativeDeltas,checks,instructionSteps,matched:true};
await writeFile('analysis/collision-events-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
