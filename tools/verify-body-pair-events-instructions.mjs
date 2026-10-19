import {readFile,writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {buildBodyPairEvents,isBodyPairExcluded} from '../src/body-pair-events.mjs';
const {evidence,instructions}=await readInstructionEvidence(['331-pair-event-builder-assembly.json','420-body-pair-exclusion-assembly.json']);
const switchReply=JSON.parse(await readFile('analysis/scene/results/421-body-pair-exclusion-switch.json','utf8')),switchEvidence=switchReply.structuredContent??JSON.parse(switchReply.content[0].text),table=switchEvidence.normalized_result;
let activeBodies,byAddress,nativeLog,nativeSerial,nativeQueries,steps=0,checks=0,pairs=0,events=0,screened=0;
const readVector=(bytes,p)=>[0,1,2].map(index=>bytes.readInt32LE(p+index*4)),writeVector=(bytes,p,values)=>values.forEach((value,index)=>bytes.writeInt32LE(value,p+index*4));
function preparation(body,time,serial){body.collisionCache114=time;body.collisionFlags=(body.collisionFlags^((serial%5===0)?0x80000000:0))|0;if(serial%7===0)body.frameTimeQ16=(body.frameTimeQ16+73)|0;}
function result(first,second,maximum,serial){const base=(first.id*713+second.id*971+serial*137)|0;return {flags:[0,1,2,8,256,0x20008][(first.id+second.id+serial)%6],point:[base,-base|0,base+13|0],normal:[base<<5,base>>3,base^0x76543210],scalar:base*11|0,field38:base+17|0,auxiliaryVector:[base-3|0,base<<2,base>>7],deltaQ16:Math.min(maximum,32768+(base&255))};}
function emitMutation(second,output){output.auxiliaryVector=output.auxiliaryVector.map(value=>value<<8);if(second.collisionFlags&0x80000000)second.collisionFlags=0;}
const machine=new BoundedX86(instructions,{tables:[table],externalCalls:new Map([
 [0x429820,m=>{const body=byAddress.get(m.r.ECX),time=m.r.EDX;nativeLog.push(['prepare',body.id,time]);preparation(body,time,++nativeSerial);encode(m.bytes,body);}],
 [0x422dc0,m=>{const first=byAddress.get(m.r.ECX),second=byAddress.get(m.r.EDX),flags=m.bytes.readUInt32LE(m.r.ESP),contact=m.bytes.readUInt32LE(m.r.ESP+4),auxiliary=m.bytes.readUInt32LE(m.r.ESP+8),maximum=m.bytes.readInt32LE(m.r.ESP+12),value=result(first,second,maximum,++nativeQueries);nativeLog.push(['query',first.id,second.id,maximum]);m.bytes.writeInt32LE(value.flags,flags);writeVector(m.bytes,contact+0x20,value.point);writeVector(m.bytes,contact+0x2c,value.normal);m.bytes.writeInt32LE(value.scalar,contact+0x3c);m.bytes.writeInt32LE(value.field38,contact+0x38);writeVector(m.bytes,auxiliary,value.auxiliaryVector);m.r.EAX=value.deltaQ16;}],
 [0x475500,m=>{const first=byAddress.get(m.r.ECX),second=byAddress.get(m.r.EDX),contact=m.bytes.readUInt32LE(m.r.ESP),flags=m.bytes.readUInt32LE(m.r.ESP+4),tag=m.bytes.readUInt32LE(m.r.ESP+8),auxiliary=m.bytes.readUInt32LE(m.r.ESP+12),delta=m.bytes.readInt32LE(m.r.ESP+16);const output={flags:m.bytes.readInt32LE(flags),point:readVector(m.bytes,contact+0x20),normal:readVector(m.bytes,contact+0x2c),scalar:m.bytes.readInt32LE(contact+0x3c),field38:m.bytes.readInt32LE(contact+0x38),auxiliaryVector:readVector(m.bytes,auxiliary)};nativeLog.push(['emit',first.id,second.id,tag,delta,structuredClone(output)]);emitMutation(second,output);writeVector(m.bytes,auxiliary,output.auxiliaryVector);encode(m.bytes,second);}]
])});
let seed=0x4279d01b;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0x100000000)|0;
const pointerAddress=value=>value?.address??0;
function encode(bytes,body){bytes.writeInt32LE(body.flags,body.address);writeVector(bytes,body.address+0x34,body.position);bytes.writeInt32LE(body.frameTimeQ16,body.address+0x118);bytes.writeInt32LE(body.collisionFlags,body.address+0x110);bytes.writeInt32LE(body.collisionCache114,body.address+0x114);for(const [name,offset]of [['pointer180',0x180],['pointer194',0x194],['pointer198',0x198]])bytes.writeUInt32LE(pointerAddress(body[name]),body.address+offset);}
function invoke(entry,first,second){machine.entry=entry;machine.r.ECX=first;machine.r.EDX=second;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);steps+=machine.run();checks++;return machine.r.EAX;}
const fixtures=1600;
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();const bodies=Array.from({length:12},(_,id)=>({id,address:0x10000+id*0x400,flags:[3,4,12,17,22,1,7,21][random(8)]|(random(2)?0x2000:0),position:[0,1,2].map(()=>fixture%5===0?signed():random(0x1000000)-0x800000),frameTimeQ16:[0,32768,65536,65537,-1,0x7fffffff,-2147483648][random(7)],collisionFlags:random(2)?-2147483648:0,collisionCache114:signed()}));
 for(const body of bodies){for(const name of ['pointer180','pointer194','pointer198'])body[name]=random(5)?bodies[random(12)]:null;encode(machine.bytes,body);}
 // The directional exclusion check executes its actual retained switch table.
 for(let sample=0;sample<8;sample++){const a=bodies[random(12)],b=bodies[random(12)],expected=isBodyPairExcluded(a,b)?1:0,actual=invoke(0x428010,a.address,b.address);if(actual!==expected)throw Error(`Exclusion fixture${fixture} mismatch.`);pairs++;}
 const pick=()=>random(5)?bodies[random(12)]:null;
 const firstGroup={bodies:Array.from({length:fixture%9},pick),isRefreshGroup:fixture%4===0},secondGroup=fixture%3?{bodies:Array.from({length:fixture%7+1},pick)}:null;
 // Cross-group first-pointer dereferences precede count checks, so only install
 // defined first entries there. Subsequent entries deliberately retain holes.
 if(secondGroup){firstGroup.bodies[0]=bodies[0];secondGroup.bodies[0]=bodies[1];}
 firstGroup.count=fixture%13===0?0:firstGroup.bodies.length;
 if(firstGroup.isRefreshGroup&&firstGroup.bodies.length>1){firstGroup.bodies[0]=bodies[0];firstGroup.bodies[1]=bodies[1];}
 const firstAddress=firstGroup.isRefreshGroup?0x902ee0:0x6000,secondAddress=0x6020;
 function install(group,address,array){machine.bytes.writeUInt32LE(array,address);machine.bytes.writeUInt16LE(group.count??group.bodies.length,address+4);group.bodies.forEach((body,index)=>machine.bytes.writeUInt32LE(body?.address??0,array+index*4));}
 install(firstGroup,firstAddress,0x7000);if(secondGroup)install(secondGroup,secondAddress,0x7100);
 const sourceBodies=structuredClone(bodies),sourceById=new Map(sourceBodies.map(body=>[body.id,body]));for(const body of sourceBodies)for(const name of ['pointer180','pointer194','pointer198'])body[name]=body[name]===null?null:sourceById.get(body[name].id);
 const copyGroup=group=>group&&({...group,bodies:group.bodies.map(body=>body?sourceById.get(body.id):null)}),sourceFirst=copyGroup(firstGroup),sourceSecond=copyGroup(secondGroup),sourceLog=[];let sourceSerial=0,sourceQueries=0;
 const expected=buildBodyPairEvents(sourceFirst,sourceSecond,{prepare:(body,time)=>{sourceLog.push(['prepare',body.id,time]);preparation(body,time,++sourceSerial);},query:(first,second,records,output,maximum)=>{sourceLog.push(['query',first.id,second.id,maximum]);const value=result(first,second,maximum,++sourceQueries);Object.assign(output,value);return value.deltaQ16;},emit:(queue,{object1:first,object2:second,contact,flags,tag,auxiliaryVector,deltaQ16})=>{sourceLog.push(['emit',first.id,second.id,tag,deltaQ16,{flags:flags.value,point:contact.point.slice(),normal:contact.normal.slice(),scalar:contact.scalar,field38:contact.field38,auxiliaryVector:auxiliaryVector.slice()}]);emitMutation(second,contact);}});
 activeBodies=bodies;byAddress=new Map(bodies.map(body=>[body.address,body]));nativeLog=[];nativeSerial=0;nativeQueries=0;const actual=invoke(0x4279d0,firstAddress,secondGroup?secondAddress:0);
 if(actual!==expected||JSON.stringify(nativeLog)!==JSON.stringify(sourceLog))throw Error(`Builder fixture${fixture} differs. native${JSON.stringify({actual,nativeLog})} source${JSON.stringify({expected,sourceLog})}`);
 for(const body of sourceBodies){const expectedBytes=Buffer.from(machine.bytes.subarray(body.address,body.address+0x400));encode(expectedBytes,{...body,address:0});if(!machine.bytes.subarray(body.address,body.address+0x400).equals(expectedBytes))throw Error(`Builder fixture${fixture} body${body.id} differs.`);}
 events+=expected;if(secondGroup&&!nativeLog.length)screened++;
}
const report={method:'Bounded native builder4279d0 and directional exclusion428010 including real jump-table bytes. Prepare429820, query422dc0 and emit475500 are explicit deterministic mocks, compared for order, clock/flag mutations, first-body snapshots, stale live state, output writes and full body bytes; their math is validated separately. Same/cross/refresh groups, zero counts, holes, identities, complete/overshot/wrapped clocks, asymmetric shifted coarse-screen thresholds and flags80000000 tested. No target process execution.',evidence:[...evidence.map(item=>item.evidence_id),switchEvidence.evidence_id],instructions:instructions.length,fixtures,checks,exclusionChecks:pairs,emittedEvents:events,coarseScreened:screened,instructionSteps:steps,matched:true};
await writeFile('analysis/body-pair-events-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
