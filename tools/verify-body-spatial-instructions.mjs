import {writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BodySpatialRegistry} from '../src/body-spatial.mjs';
const {evidence,instructions}=await readInstructionEvidence(['360-spatial-body-insert-assembly.json','361-spatial-body-remove-assembly.json']);
const poolBase=0x10000,bucketBase=0x6000;let selected,selectorBody,selectorCalls=0,instructionSteps=0,checks=0,insertions=0,removals=0,outsideInsertions=0,headRemovals=0,middleRemovals=0,tailRemovals=0;
const machine=new BoundedX86(instructions,{externalCalls:new Map([[0x4286e0,m=>{
 const position=[m.r.ECX,m.r.EDX,m.bytes.readInt32LE(m.r.ESP)];if(JSON.stringify(position)!==JSON.stringify(selectorBody.position))throw Error('Spatial selector position differs.');
 const output=m.bytes.readUInt32LE(m.r.ESP+4);if(m.bytes.readUInt32LE(output)!==selectorBody.address)throw Error('Spatial selector outside-output initial value differs.');
 m.bytes.writeInt32LE(selected.flag,output);m.r.EAX=selected.bucket.address;selectorCalls++;
}]] )});
let seed=0x474600af;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0xffffffff)|0;
function encode(bytes,p,body){bytes.writeUInt16LE(body.spatialNextId,p+4);bytes.writeUInt16LE(body.spatialPreviousId,p+6);bytes.writeUInt32LE(body.spatialBucket.address+(body.spatialOutside?1:0),p+0xc);body.position.forEach((value,index)=>bytes.writeInt32LE(value,p+0x34+index*4));}
function call(entry,body){machine.entry=entry;machine.r.ECX=body.address;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);instructionSteps+=machine.run();checks++;}
const fixtures=600;
for(let fixture=0;fixture<fixtures;fixture++) {
 machine.reset();machine.bytes.writeUInt32LE(poolBase,0x902eec);
 const buckets=Array.from({length:1+fixture%8},(_,index)=>({address:bucketBase+index*12,headId:0}));
 const bodies=Array.from({length:1+fixture%24},(_,index)=>({address:poolBase+(fixture%4===3?65534-index*5:(fixture%4===2?32768:fixture%4===1?32760:0)+index*5)*128,position:[signed(),signed(),signed()],spatialNextId:0,spatialPreviousId:0,spatialBucket:buckets[random(buckets.length)],spatialOutside:!!random(2)}));
 const registry=new BodySpatialRegistry(bodies.map(body=>({body,poolOffset:body.address-poolBase})),body=>{selectorBody=body;return {bucket:selected.bucket,outside:!!selected.flag};});
 const expectedBodies=bodies.map(body=>{machine.bytes.fill(0xa5,body.address,body.address+128);encode(machine.bytes,body.address,body);return Buffer.from(machine.bytes.subarray(body.address,body.address+128));});
 const expectedBuckets=buckets.map(bucket=>{machine.bytes.fill(0x5a,bucket.address,bucket.address+12);machine.bytes.writeUInt16LE(0,bucket.address+8);return Buffer.from(machine.bytes.subarray(bucket.address,bucket.address+12));});
 const linked=new Set();
 for(let step=0;step<96;step++) {
  const available=bodies.filter(body=>!linked.has(body)),active=[...linked],insert=available.length&&(!active.length||random(2));
  if(insert){const body=available[random(available.length)];selected={bucket:buckets[random(buckets.length)],flag:[0,1,-1,37][random(4)]};registry.insert(body);call(0x474600,body);linked.add(body);insertions++;if(selected.flag)outsideInsertions++;}
  else{const body=active[random(active.length)];if(!body.spatialPreviousId)headRemovals++;else if(body.spatialNextId)middleRemovals++;else tailRemovals++;registry.remove(body);call(0x474850,body);linked.delete(body);removals++;}
  bodies.forEach((body,index)=>{encode(expectedBodies[index],0,body);if(!machine.bytes.subarray(body.address,body.address+128).equals(expectedBodies[index]))throw Error(`Spatial body bytes differ at fixture ${fixture}, step ${step}, body ${index}.`);});
  buckets.forEach((bucket,index)=>{expectedBuckets[index].writeUInt16LE(bucket.headId,8);if(!machine.bytes.subarray(bucket.address,bucket.address+12).equals(expectedBuckets[index]))throw Error(`Spatial bucket bytes differ at fixture ${fixture}, step ${step}, bucket ${index}.`);});
 }
}
const report={method:'Bounded interpretation of native linked-body spatial insertion474600 and removal474850. The sole external selector4286e0 is an explicit position-checking, outside-output-writing mock; actual parsed-index selection has separate focused tests. Explicit sparse 128-byte pool offsets including IDs across32768 and65535, head/middle/tail removal, moves, outside tags, stale bucket references, untouched body bytes and bucket upper head-word bytes all compared. No allocator inference or original process execution.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,fixtures,checks,insertions,removals,outsideInsertions,headRemovals,middleRemovals,tailRemovals,selectorCalls,instructionSteps,matched:true};
await writeFile('analysis/body-spatial-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
