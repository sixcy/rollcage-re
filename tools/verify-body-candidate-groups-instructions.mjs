import {writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {buildBodyCandidateGroups} from '../src/body-candidate-groups.mjs';
const {evidence,instructions}=await readInstructionEvidence(['009-body-groups-assembly.json'],{directory:'analysis/native-simulation/results'});
let cookies=0;
const machine=new BoundedX86(instructions,{externalCalls:new Map([[0x568162,m=>{if((m.r.ECX>>>0)!==m.bytes.readUInt32LE(0x5e8890))throw Error('Security cookie differs.');cookies++;}]])});
let seed=0x46ea80ab,steps=0,totalBodies=0,totalGroups=0,duplicates=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;};
const fixtures=1600,groupCapacity=20;
for(let fixture=0;fixture<fixtures;fixture++) {
 machine.reset();const bytes=machine.bytes;
 const buckets=Array.from({length:4},(_,index)=>({address:0x30000+index*12,headId:[0,1,5,65535][random(4)]}));
 const context={count:fixture%22-2,groups:Array.from({length:groupCapacity},(_,index)=>({address:0x902be0+index*12,listAddress:0x40000+index*0x100,bodies:Array(8).fill(null),count:random(4),spatialBucket:random(2)?null:buckets[random(4)]}))};
 const unique=Array.from({length:16},(_,index)=>({address:0x10000+index*0x800,flags:[0,3,4,0x803,0x804,0x807,0x8803,0x800,0x81d][random(9)],collisionFlags:(random(0xffffffff)&~0x1000000)|(random(4)===0?0x1000000:0),collisionGroup130:context.groups[random(groupCapacity)],position:Array.from({length:3},()=>random(0xffffffff)|0),spatialBucket:buckets[random(4)],spatialOutside:!!random(2)}));
 const count=fixture%17,physicalBodies=Array.from({length:count},(_,index)=>index&&random(4)===0?unique[random(index)]:unique[index]);
 duplicates+=count-new Set(physicalBodies).size;
 for(const group of context.groups){group.bodies=group.bodies.map(()=>random(2)?null:unique[random(unique.length)]);bytes.fill(0xa5,group.address,group.address+12);bytes.writeUInt32LE(group.listAddress,group.address);bytes.writeUInt16LE(group.count,group.address+4);bytes.writeUInt32LE(group.spatialBucket?.address??0,group.address+8);group.bodies.forEach((body,index)=>bytes.writeUInt32LE(body?.address??0,group.listAddress+index*4));}
 for(const bucket of buckets){bytes.fill(0xa5,bucket.address,bucket.address+12);bytes.writeUInt16LE(bucket.headId,bucket.address+8);}
 for(const body of unique){bytes.fill(0xa5,body.address,body.address+0x700);bytes.writeInt32LE(body.flags,body.address);bytes.writeUInt32LE(body.spatialBucket.address|(body.spatialOutside?1:0),body.address+12);bytes.writeInt32LE(body.collisionFlags,body.address+0x110);bytes.writeUInt32LE(body.collisionGroup130.address,body.address+0x130);body.position.forEach((value,axis)=>bytes.writeInt32LE(value,body.address+0x34+axis*4));}
 const expectedBodies=unique.map(body=>Buffer.from(bytes.subarray(body.address,body.address+0x700))),expectedGroups=context.groups.map(group=>Buffer.from(bytes.subarray(group.address,group.address+12))),expectedLists=context.groups.map(group=>Buffer.from(bytes.subarray(group.listAddress,group.listAddress+32))),expectedBuckets=buckets.map(bucket=>Buffer.from(bytes.subarray(bucket.address,bucket.address+12)));
 bytes.writeInt32LE(context.count,0x902bcc);bytes.writeUInt16LE(count,0x902bc4);bytes.writeUInt32LE(0x6000,0x902bc0);physicalBodies.forEach((body,index)=>bytes.writeUInt32LE(body.address,0x6000+index*4));bytes.writeUInt32LE(0x36d4c921,0x5e8890);
 buildBodyCandidateGroups(physicalBodies,context);
 machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);steps+=machine.run();
 unique.forEach((body,index)=>{expectedBodies[index].writeInt32LE(body.collisionFlags,0x110);expectedBodies[index].writeUInt32LE(body.collisionGroup130.address,0x130);if(!bytes.subarray(body.address,body.address+0x700).equals(expectedBodies[index]))throw Error(`Body mismatch ${fixture}/${index}.`);});
 context.groups.forEach((group,index)=>{expectedGroups[index].writeUInt16LE(group.count,4);expectedGroups[index].writeUInt32LE(group.spatialBucket?.address??0,8);group.bodies.forEach((body,item)=>expectedLists[index].writeUInt32LE(body?.address??0,item*4));if(!bytes.subarray(group.address,group.address+12).equals(expectedGroups[index])||!bytes.subarray(group.listAddress,group.listAddress+32).equals(expectedLists[index]))throw Error(`Group mismatch ${fixture}/${index}.`);});
 buckets.forEach((bucket,index)=>{if(!bytes.subarray(bucket.address,bucket.address+12).equals(expectedBuckets[index]))throw Error('Bucket changed.');});
 if(bytes.readInt32LE(0x902bcc)!==context.count)throw Error('Group count differs.');
 totalBodies+=count;totalGroups+=context.count;
}
const report={method:'Bounded interpretation of all candidate-group builder instructions. Complete 1792-byte body regions, 12-byte reusable groups including padding, eight-slot body arrays, bucket records and group count are compared. Fixtures cover tagged buckets, all eligibility gates, duplicate physical-list pointers, negative/zero/positive previous counts, stale list entries and counts outside the cleared range, plus trailing sentinel. Only __security_check_cookie is an explicit external boundary and its cookie argument is checked; no original process execution or allocator inference.',evidence:evidence.map(value=>value.evidence_id),instructions:instructions.length,fixtures,totalBodies,totalGroups,duplicatePhysicalPointers:duplicates,securityCookieChecks:cookies,instructionSteps:steps,matched:true};
await writeFile('analysis/body-candidate-groups-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
