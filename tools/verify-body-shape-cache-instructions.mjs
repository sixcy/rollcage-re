import {writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {prepareBodyShapeCache,updateBodyShapeCacheEntry,storeBodyShapeContact} from '../src/body-shape-cache.mjs';
const {evidence,instructions}=await readInstructionEvidence(['400-body-shape-cache-assembly.json','402-body-shape-cache-entry-assembly.json','404-body-shape-contact-store-assembly.json','406-body-cache-rotation-assembly.json']);
const machine=new BoundedX86(instructions),bodyAddress=0x10000,poolAddress=0x20000,contactAddress=0x30000,poolLength=256*72;
let seed=0x429820ab,steps=0,checks=0,spheres=0,zeroTimeResets=0,scaled=0,negativeCounts=0,aggregateAliases=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0x100000000)|0,vector=()=>[signed(),signed(),signed()];
function invoke(entry,ecx,edx,args=[]){machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);args.forEach((value,index)=>machine.bytes.writeInt32LE(value,0x9004+index*4));steps+=machine.run();checks++;}
const vec=(bytes,p,values)=>values.forEach((value,index)=>bytes.writeInt32LE(value,p+index*4));
function difference(actual,expected,label){if(actual.equals(expected))return;const p=actual.findIndex((value,index)=>value!==expected[index]);throw Error(`${label} differs at byte 0x${p.toString(16)}: native ${actual[p]} reconstructed ${expected[p]}`);}
const fixtures=2500;
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();machine.bytes.writeUInt32LE(poolAddress,0x91e79c);machine.bytes.writeFloatLE(1/4096,0x5dc5f4);
 for(let p=0;p<poolLength;p+=4)machine.bytes.writeInt32LE(signed(),poolAddress+p);
 machine.bytes.fill(0xa5,bodyAddress,bodyAddress+0x300);
 const count=[0,1,2,3,5,12,31,127,-1,-2,-128][fixture%11],encodedCount=count&255;
 const body={flags:[3,7,21,1,0x2007,0x8003][fixture%6],frameTimeQ16:[0,32768,65536,-1,0x7fffffff,-2147483648][fixture%6],collisionCache114:signed(),collisionCount10c:encodedCount,collisionIds:[],position:vector(),linearVelocity:vector(),angularVelocity:vector(),rotation:Array.from({length:9},()=>random(65536)-32768)};
 machine.bytes.writeInt32LE(body.flags,bodyAddress);machine.bytes.writeUInt8(encodedCount,bodyAddress+0x10c);machine.bytes.writeInt32LE(body.frameTimeQ16,bodyAddress+0x118);machine.bytes.writeInt32LE(body.collisionCache114,bodyAddress+0x114);
 vec(machine.bytes,bodyAddress+0x34,body.position);vec(machine.bytes,bodyAddress+0x68,body.linearVelocity);vec(machine.bytes,bodyAddress+0xb8,body.angularVelocity);body.rotation.forEach((value,index)=>machine.bytes.writeInt16LE(value,bodyAddress+0xc4+index*2));
 for(let index=0;index<=count;index++){body.collisionIds[index]=random(256);machine.bytes.writeUInt8(body.collisionIds[index],bodyAddress+0x140+index);}
 if(count<0){negativeCounts++;body.collisionIds[count]=random(256);machine.bytes.writeUInt8(body.collisionIds[count],bodyAddress+0x140+count);}
 if(count>1&&fixture%3===0){body.collisionIds[count]=body.collisionIds[count-1];machine.bytes.writeUInt8(body.collisionIds[count],bodyAddress+0x140+count);aggregateAliases++;}
 const expectedPool=Buffer.from(machine.bytes.subarray(poolAddress,poolAddress+poolLength)),expectedBody=Buffer.from(machine.bytes.subarray(bodyAddress,bodyAddress+0x300));
 const time=[0,65536,32768,-65536,0x7fffffff,-2147483648,signed()][fixture%7],options={timeScaleActive:!!(fixture&1),timeScaleExempt:!!(fixture&2),timeScaleQ16:[0,32768,65536,98304,-32768,0x7fffffff,-2147483648][fixture%7]};
 machine.bytes.writeInt32LE(options.timeScaleActive?1:0,0x811180);machine.bytes.writeUInt32LE(options.timeScaleExempt?bodyAddress:bodyAddress+0x400,0x811184);machine.bytes.writeInt32LE(options.timeScaleQ16,0x81118c);
 prepareBodyShapeCache(body,time,expectedPool,options);invoke(0x429820,bodyAddress,time);expectedBody.writeInt32LE(time,0x114);
 difference(machine.bytes.subarray(poolAddress,poolAddress+poolLength),expectedPool,`Cache fixture ${fixture}`);difference(machine.bytes.subarray(bodyAddress,bodyAddress+0x300),expectedBody,`Body fixture ${fixture}`);
 spheres+=Math.max(0,count);if(time===0&&body.frameTimeQ16===0)zeroTimeResets+=Math.max(0,count);if(options.timeScaleActive&&!options.timeScaleExempt&&(time-body.frameTimeQ16|0)!==0&&[3,7,21].includes(body.flags&0x1ff))scaled++;
 // Direct helper calls admit arbitrary signed deltas and zero/negative scales.
 if(count>=0){const id=fixture&255,record=expectedPool.subarray(id*72,(id+1)*72),delta=[0,65536,-65536,signed()][fixture%4],scale=[0,32768,98304,-65536,signed()][fixture%5];updateBodyShapeCacheEntry(body,record,delta,scale);invoke(0x429ab0,bodyAddress,poolAddress+id*72,[delta,scale]);difference(machine.bytes.subarray(poolAddress,poolAddress+poolLength),expectedPool,`Entry fixture ${fixture}`);}
 const contact={point:vector(),normal:vector(),scalar:signed()};vec(machine.bytes,contactAddress+0x20,contact.point);vec(machine.bytes,contactAddress+0x2c,contact.normal);machine.bytes.writeInt32LE(contact.scalar,contactAddress+0x3c);
 storeBodyShapeContact(body,contact,expectedPool);invoke(0x475840,bodyAddress,contactAddress);difference(machine.bytes.subarray(poolAddress,poolAddress+poolLength),expectedPool,`Contact fixture ${fixture}`);
}
const report={method:'Bounded interpretation of all native instructions in429820,429ab0,4334b0,475840; no external callees mocked and no target process executed. Full256*72-byte cache pool and untouched body bytes compared, including alias IDs, negative signed counts with explicit byte addresses, wrapped times/products, zero and negative scales, the separately scaled delta and velocity, stale fields, and contact copies. The native scratch integer/float matrix writes execute but are not exposed as public state.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,fixtures,checks,spheres,zeroTimeResets,scaled,negativeCounts,aggregateAliases,instructionSteps:steps,matched:true};
await writeFile('analysis/body-shape-cache-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
