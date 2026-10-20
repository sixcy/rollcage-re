import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {mergeStaticShapeContacts} from '../src/static-contact.mjs';
const native=await readInstructionEvidence(['026-static-contact-assembly.json','027-contact-normal-combine-assembly.json','028-contact-dot-assembly.json'],{directory:'analysis/native-simulation/results'}),math=await readInstructionEvidence(['244-wheel-direction-normalize-assembly.json','152-vector-length-assembly.json','217-wheel-capacity-curve-assembly.json','221-fixed-sqrt-assembly.json']);
const evidence=[...native.evidence,...math.evidence],instructions=[...native.instructions,...math.instructions],machine=new BoundedX86(instructions);let seed=0x448570ab,steps=0,checks=0,removed=0,sliding=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;};
const putVector=(bytes,p,values)=>values.forEach((value,index)=>bytes.writeInt32LE(value|0,p+index*4));
function encodeContact(bytes,p,contact){putVector(bytes,p+0x20,contact.point);putVector(bytes,p+0x2c,contact.normal);bytes.writeInt32LE(contact.scalar,p+0x3c);bytes.writeInt32LE(contact.field38,p+0x38);bytes.writeUInt16LE(contact.flags44,p+0x44);}
const fixtures=5000;
for(let fixture=0;fixture<fixtures;fixture++) {
 machine.reset();const bytes=machine.bytes,root=0x10000,output=0x7000,tagPointer=0x7100,poolBase=0x30000;
 const count=[0,1,2,5,8,24,128,255][random(8)],body={collisionCount10c:count,collisionIds:Array.from({length:128},()=>random(64)),collisionFlags:random(0xffffffff)|0,collisionState128:[0,1,2,8,0x2001,0x2002,0x2008][random(7)],position:Array.from({length:3},()=>random(0xffffffff)|0)},signedCount=count<<24>>24;
 body.collisionIds[signedCount]=random(64);const records=Buffer.alloc(64*72),contact={point:[random(0xffffffff)|0,random(0xffffffff)|0,random(0xffffffff)|0],normal:[random(0xffffffff)|0,random(0xffffffff)|0,random(0xffffffff)|0],scalar:random(0xffffffff)|0,field38:random(0xffffffff)|0,flags44:random(65536)},tag={value:random(0xffffffff)|0};
 const axes=[[65536,0,0],[0,65536,0],[0,0,65536],[-65536,0,0],[0,-65536,0],[0,0,-65536],[32768,32768,0],[0,0,0]];
 for(let index=0;index<64;index++){const p=index*72;for(let k=0;k<72;k++)records[p+k]=random(256);putVector(records,p+0x20,[0,1,2].map(()=>random(0xffffffff)|0));putVector(records,p+0x2c,fixture%11===0?[0x240000,65536,0]:axes[random(axes.length)]);records.writeInt32LE(-random(4096),p+0x3c);}
 if(fixture%13===0)body.collisionFlags&=0xff000000;
 bytes.fill(0xa5,root,root+0x400);bytes.writeInt32LE(body.collisionState128,root+0x128);bytes.writeInt32LE(body.collisionFlags,root+0x110);putVector(bytes,root+0x34,body.position);bytes[root+0x10c]=count;
 body.collisionIds.forEach((id,index)=>bytes[root+0x140+index]=id);if(signedCount<0)bytes[root+0x140+signedCount]=body.collisionIds[signedCount];
 records.copy(bytes,poolBase);bytes.writeUInt32LE(poolBase,0x91e79c);bytes.fill(0xa5,output,output+72);encodeContact(bytes,output,contact);bytes.writeInt32LE(tag.value,tagPointer);
 const expectedBody=Buffer.from(bytes.subarray(root,root+0x400)),expectedOutput=Buffer.from(bytes.subarray(output,output+72));
 const result=mergeStaticShapeContacts(body,contact,tag,true,records);expectedBody.writeInt32LE(body.collisionState128,0x128);encodeContact(expectedOutput,0,contact);
 machine.entry=0x448570;machine.r.ECX=root;machine.r.EDX=output;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);bytes.writeUInt32LE(tagPointer,0x9004);bytes.writeUInt32LE(1,0x9008);steps+=machine.run();
 assert.equal(machine.r.EAX,result,`return ${fixture}`);assert.ok(bytes.subarray(root,root+0x400).equals(expectedBody),`body ${fixture}`);assert.ok(bytes.subarray(output,output+72).equals(expectedOutput),`contact ${fixture}`);assert.ok(bytes.subarray(poolBase,poolBase+records.length).equals(records),`pool ${fixture}`);assert.equal(bytes.readInt32LE(tagPointer),tag.value,`tag ${fixture}`);
 checks++;removed+=result;if(body.collisionState128&0x2000)throw Error('Aggregate marker should be consumed.');if((expectedBody.readInt32LE(0x128)&0xff)===8)sliding++;
}
const report={method:'Bounded interpretation of complete static contact merger448570, large-normal reduction492cc0, fixed normalization/length/dot/root/division helpers; no stubs or original process execution. Compares full body/cache pool, complete72-byte contact scratch and tag. Explicit scalar/state/mask inputs include aliased IDs, signed counts, zero/cancelling normals, aggregate copy, overlap scalar projection, sliding tags, stale output bytes, per-record100-bit clearing and large normal reduction. Sliding inclusion is enabled as in427bd0; invalid divide-by-zero caller contexts remain outside these fixtures.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,fixtures,checks,removed,sliding,instructionSteps:steps,matched:true};
await writeFile('analysis/static-contact-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
