import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {completeRejectedCollisionBody} from '../src/body-advancement.mjs';
const parent=await readInstructionEvidence(['071-body-removal-assembly.json'],{directory:'analysis/native-simulation/results'}),math=await readInstructionEvidence(['135-body-advance-assembly.json','128-normalize-small-assembly.json','129-normalize-large-assembly.json','300-quaternion-matrix-assembly.json','133-sqrt-lookup-assembly.json','211-sqrt-leading-zeros-assembly.json','217-wheel-capacity-curve-assembly.json']),evidence=[...parent.evidence,...math.evidence],instructions=[...parent.instructions,...math.instructions],machine=new BoundedX86(instructions),sqrt=JSON.parse(await readFile('src/sqrt-table.json','utf8')),root=0x10000;
sqrt.values.forEach((value,index)=>machine.bytes.writeUInt16LE(value,0x5eb290+index*2));
function encode(bytes,p,body){for(const [value,offset]of [[body.flags,0],[body.integrationFlags,0x108],[body.frameTimeQ16,0x118],[body.collisionState128,0x128]])bytes.writeInt32LE(value,p+offset);bytes.writeUInt16LE(body.attachmentCount,p+0x16a);for(const [values,offset]of [[body.position,0x34],[body.linearVelocity,0x68],[body.quaternion,0x58],[body.quaternionDerivative,0x8c]])values.forEach((value,index)=>bytes.writeInt32LE(value,p+offset+index*4));body.rotation.forEach((value,index)=>bytes.writeInt16LE(value,p+0xc4+index*2));}
export function verifyRejectedCollisionBody(inputBody,options={}){
 const body=structuredClone(inputBody);machine.reset();const bytes=machine.bytes;bytes.fill(0xa5,root,root+0x180);encode(bytes,root,body);const original=Buffer.from(bytes.subarray(root,root+0x180));
 bytes.writeInt32LE(options.timeScaleActive?1:0,0x811180);bytes.writeInt32LE(options.timeScaleExempt?root:root+0x4000,0x811184);bytes.writeInt32LE(options.timeScaleQ16??65536,0x81118c);
 bytes.writeUInt32LE(5,0x6e6ba0);bytes.fill(0x73,0x902040,0x902080);const queueBefore=Buffer.from(bytes.subarray(0x902040,0x902080)),attachmentQueue=['retained0','retained1','retained2','retained3','retained4'];
 const actual=[],expected=[],snapshot=()=>{const value=Buffer.from(original);encode(value,0,body);return value;};
 for(const [address,name]of [[0x474850,'remove'],[0x474600,'insert']])machine.externalCalls.set(address,m=>actual.push([name,m.r.ECX,Buffer.from(m.bytes.subarray(root,root+0x180))]));
 completeRejectedCollisionBody(body,{attachmentQueue,removeSpatial:()=>expected.push(['remove',root,snapshot()]),insertSpatial:()=>expected.push(['insert',root,snapshot()])},options);
 const expectedBytes=Buffer.from(original);encode(expectedBytes,0,body);machine.entry=0x47cc20;machine.r.ECX=root;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);const steps=machine.run();
 assert.deepEqual(bytes.subarray(root,root+0x180),expectedBytes,'complete body bytes');assert.deepEqual(actual,expected,'spatial hooks observe full pose, completed clock and prior collision state');
 const queued=(inputBody.flags&0x1ff)===4&&inputBody.attachmentCount?1:0,expectedQueue=Buffer.from(queueBefore);if(queued)expectedQueue.writeUInt32LE(root,20);assert.deepEqual(attachmentQueue.slice(0,5),['retained0','retained1','retained2','retained3','retained4']);assert.equal(attachmentQueue.length,5+queued);if(queued)assert.equal(attachmentQueue[5],body);assert.equal(bytes.readUInt32LE(0x6e6ba0),5+queued);assert.deepEqual(bytes.subarray(0x902040,0x902080),expectedQueue);
 return {body,steps,spatialRefreshes:expected.length/2,attachmentEntries:queued};
}
export async function checkRejectedCollisionBody(){
 let seed=0x47cc20ab,steps=0,spatialRefreshes=0,type4=0,negativeRemaining=0,negativeClock=0,flag8000=0,attachmentEntries=0;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;};
 const clocks=[0,1,65535,65536,65537,131072,-65536,-1,2147483647,-2147483648],positions=[0,0xffffff,0x1000000,-1,-0x1000000,2147483647,-2147483648],fixtures=4000;
 for(let fixture=0;fixture<fixtures;fixture++){
  const clock=clocks[random(clocks.length)],body={flags:(fixture%2===0?4:[3,7,17,21,29][random(5)])|(fixture%3===0?0x8000:0)|(fixture%4===0?0x1800:0),integrationFlags:Math.abs(clock)>131072||fixture%5===0?1:0,frameTimeQ16:clock,collisionState128:random(0xffffffff)|0,attachmentCount:fixture%3?0:random(65535)+1,position:[0,1,2].map(()=>positions[random(positions.length)]),linearVelocity:[0,1,2].map(()=>random(0xffffffff)|0),quaternion:fixture%11===0?[20000000,1000000,-1000000,1000000]:[65536,random(20001)-10000,random(20001)-10000,random(20001)-10000],quaternionDerivative:[0,1,2,3].map(()=>random(100001)-50000),rotation:Array.from({length:9},()=>random(65536)-32768)},options={timeScaleActive:!!random(2),timeScaleExempt:!!random(2),timeScaleQ16:[0,32768,65536,98304][random(4)]};
  if((body.flags&0x1ff)===4)type4++;if(clock>65536)negativeRemaining++;if(clock<0)negativeClock++;if(body.flags&0x8000)flag8000++;
  const result=verifyRejectedCollisionBody(body,options);steps+=result.steps;spatialRefreshes+=result.spatialRefreshes;attachmentEntries+=result.attachmentEntries;
 }
 const report={method:'Bounded complete47cc20 plus real479d20 pose advancement, both quaternion normalizers, matrix conversion, lookup root and fixed division. Full384-byte body comparison and full384-byte snapshots at ordered nonmutating spatial hook boundaries prove updated pose/clock while prior+128 remains visible. Compares preserved source attachment entries, native queue count and64 queue bytes, including type4 attachment append inside479d20. Includes type4/other,8000 flags, completed/negative/overshot clocks, signed-wrap coordinates, high-byte crossings and explicit time globals. Type4 receives ordinary time because its type is ineligible for special scaling. No original process execution.',evidence:evidence.map(value=>value.evidence_id),instructions:instructions.length,fixtures,type4Fixtures:type4,otherTypeFixtures:fixtures-type4,negativeRemainingFixtures:negativeRemaining,negativeClockFixtures:negativeClock,flag8000Fixtures:flag8000,spatialRefreshes,attachmentEntries,instructionSteps:steps,matched:true};await writeFile('analysis/rejected-collision-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await checkRejectedCollisionBody();

