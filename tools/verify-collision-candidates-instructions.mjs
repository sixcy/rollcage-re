import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {buildInitialCollisionEvents,refreshCollisionCandidates} from '../src/collision-candidates.mjs';
const {evidence,instructions}=await readInstructionEvidence(['010-initial-candidates-assembly.json','007-pair-refresh-assembly.json'],{directory:'analysis/native-simulation/results'});
const machine=new BoundedX86(instructions);let seed=0x427870ab,steps=0,checks=0,staticCalls=0,pairCalls=0,earlyReturns=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;};
const fixtures=2400;
for(let fixture=0;fixture<fixtures;fixture++)for(const entry of [0x427870,0x427910]) {
 machine.reset();const bytes=machine.bytes;
 const buckets=Array.from({length:4},(_,id)=>({id,address:0x5000+id*16,headId:1}));
 const bodies=Array.from({length:8},(_,id)=>({id,address:0x10000+id*0x400,flags:[3,4,7,21][random(4)],collisionCounter168:[0,1,3,127,128,254,255][random(7)],spatialBucket:buckets[random(4)],spatialOutside:!!random(2)}));
 const group=(address,array,length)=>({address,array,bodies:Array.from({length:8},()=>bodies[random(8)]),count:length,spatialBucket:buckets[random(4)]});
 const groups=Array.from({length:6},(_,id)=>group(0x902be0+id*12,0x6000+id*64,random(5)));
 const state={groups,count:random(7),refreshGroup:group(0x902ee0,0x6400,random(3))},physical=group(0x902bc0,0x6500,8);
 const first=random(3)?bodies[random(8)]:null,second=random(3)?bodies[random(8)]:null;
 const address=value=>value?.address??0;
 function encodeBody(body){bytes.writeInt32LE(body.flags,body.address);bytes[body.address+0x168]=body.collisionCounter168;bytes.writeInt32LE(address(body.spatialBucket)|(body.spatialOutside?1:0),body.address+12);}
 function encodeGroup(item){bytes.writeUInt32LE(item.array,item.address);bytes.writeUInt16LE(item.count,item.address+4);bytes.writeUInt32LE(address(item.spatialBucket),item.address+8);item.bodies.forEach((body,index)=>bytes.writeUInt32LE(address(body),item.array+index*4));}
 for(const body of bodies){bytes.fill(0xa5,body.address,body.address+0x400);encodeBody(body);}for(const item of [...groups,state.refreshGroup,physical])encodeGroup(item);
 bytes.writeInt32LE(state.count,0x902bcc);
 const source=structuredClone({state,physical,first,second,bodies}),nativeLog=[],sourceLog=[];
 function staticEvent(group,context,log){
  log.push(['static',group.address,group.count,group.bodies.slice(0,group.count).map(address),address(group.spatialBucket)]);
  if(fixture%5===0)context.count=(context.count+2)%7;
  if(group.bodies[0]&&fixture%7===0)group.bodies[0].flags=4;
  return fixture%13===0?0x7fffffff:fixture%23;
 }
 let nativeSerial=0,sourceSerial=0;
 function pairEvent(a,b,context,log,serial){
  log.push(['pair',a.address,address(b),a.count,b?.count??null]);
  if(fixture%11===0&&serial===1)context.count=fixture%7;
  if(b&&fixture%17===0)b.count=0;
  return fixture%19===0?0x7fffffff:(a.address^(b?.address??0))&31;
 }
 const expected=entry===0x427870?buildInitialCollisionEvents(source.physical,source.state,{buildStaticEvents:g=>staticEvent(g,source.state,sourceLog),buildPairEvents:(a,b)=>pairEvent(a,b,source.state,sourceLog,++sourceSerial)}):refreshCollisionCandidates(source.first,source.second,source.state,{buildStaticEvents:g=>staticEvent(g,source.state,sourceLog),buildPairEvents:(a,b)=>pairEvent(a,b,source.state,sourceLog,++sourceSerial)});
 const byGroup=new Map([...groups,state.refreshGroup,physical].map(item=>[item.address,item]));
 function sync(){bytes.writeInt32LE(state.count,0x902bcc);for(const body of bodies)encodeBody(body);for(const item of [...groups,state.refreshGroup,physical])encodeGroup(item);}
 machine.externalCalls.set(0x427bd0,m=>{const item=byGroup.get(m.r.ECX);if(item===state.refreshGroup){item.count=bytes.readUInt16LE(item.address+4);item.bodies[0]=bodies.find(body=>body.address===bytes.readUInt32LE(item.array));item.bodies[1]=bodies.find(body=>body.address===bytes.readUInt32LE(item.array+4))??null;item.spatialBucket=buckets.find(bucket=>bucket.address===bytes.readUInt32LE(item.address+8));}
  const result=staticEvent(item,state,nativeLog);sync();m.r.EAX=result;m.r.ECX=0x7abc;});
 machine.externalCalls.set(0x4279d0,m=>{const result=pairEvent(byGroup.get(m.r.ECX),byGroup.get(m.r.EDX)??null,state,nativeLog,++nativeSerial);sync();m.r.EAX=result;m.r.ECX=0x7def;});
 machine.entry=entry;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);machine.r.ECX=address(first);machine.r.EDX=address(second);steps+=machine.run();
 assert.equal(machine.r.EAX,expected,`return ${fixture}/${entry.toString(16)}`);assert.deepEqual(nativeLog,sourceLog,`calls ${fixture}/${entry.toString(16)}`);
 for(const body of source.bodies){const native=bodies.find(item=>item.id===body.id);assert.equal(bytes.readInt32LE(body.address),body.flags);assert.equal(bytes[body.address+0x168],body.collisionCounter168);assert.equal(native.flags,body.flags);}
 for(const item of [...source.state.groups,source.state.refreshGroup,source.physical]){assert.equal(bytes.readUInt16LE(item.address+4),item.count);assert.equal(bytes.readUInt32LE(item.address+8),address(item.spatialBucket));item.bodies.forEach((body,index)=>assert.equal(bytes.readUInt32LE(item.array+index*4),address(body)));}
 assert.equal(bytes.readInt32LE(0x902bcc),source.state.count);checks++;staticCalls+=nativeLog.filter(item=>item[0]==='static').length;pairCalls+=nativeSerial;if(!nativeLog.length)earlyReturns++;
}
const report={method:'Bounded interpretation of initial candidate schedule427870 and refresh427910. Static generator427bd0 and pair builder4279d0 are explicit order/state-mutating mocks. Compares returns, callback order and observed group payloads, group/refresh storage, tagged bucket masking, body counters/flags, count capture/reload, signed counter rejection and type4 behavior. Includes zero through six groups, same/aliased/null bodies, stale refresh-array entries and wrapped sums. No static-contact detection or original process execution.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,fixtures,checks,staticCalls,pairCalls,earlyReturns,instructionSteps:steps,matched:true};
await writeFile('analysis/collision-candidates-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
