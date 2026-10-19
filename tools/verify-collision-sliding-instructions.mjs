import {writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {replaceCollisionLinearVelocity,projectCollisionAngularState,applySlidingAngularImpulse,stopCollisionBody} from '../src/collision-sliding.mjs';
const {evidence,instructions}=await readInstructionEvidence(['350-sliding-linear-replace-assembly.json','348-kind8-threshold-assembly.json','349-kind8-update-assembly.json','351-sliding-slow-body-assembly.json','220-wheel-drive-dot-assembly.json','256-wheel-cross-assembly.json','315-contact-inertia-transform-assembly.json']);
const machine=new BoundedX86(instructions);let seed=0x47a670cf,instructionSteps=0,checks=0,nonzeroTorques=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0xffffffff)|0;
const put=(bytes,p,values)=>values.forEach((value,index)=>bytes.writeInt32LE(value,p+index*4));
const fields=[['position',0x34],['momentum',0x40],['angularMomentum',0x4c],['quaternion',0x58],['linearVelocity',0x68],['force',0x74],['torque',0x80],['quaternionDerivative',0x8c],['angularVelocity',0xb8],['worldInverseInertia',0xe4]];
function encode(bytes,p,body){for(const[field,offset]of fields)put(bytes,p+offset,body[field]);bytes.writeInt32LE(body.mass,p+0xa8);bytes.writeInt32LE(body.collisionFlags,p+0x110);}
function call(entry,edx){machine.entry=entry;machine.r.ECX=0x10000;machine.r.EDX=edx;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);instructionSteps+=machine.run();checks++;}
const fixtures=4000,normals=[[65536,0,0],[-65536,0,0],[0,65536,0],[0,-65536,0],[0,0,65536],[46340,46340,0],[0,-46340,46340],[-32768,32768,46340],[0,0,0],[12345,-23456,34567]];
for(let fixture=0;fixture<fixtures;fixture++) {
 const normal=normals[fixture%normals.length],point=Array.from({length:3},signed),velocity=Array.from({length:3},signed),gravityQ16=[642908,65536,-65536,0,2147483647,-2147483648][fixture%6];
 const original=Object.fromEntries(fields.map(([field])=>[field,Array.from({length:field==='worldInverseInertia'?9:field==='quaternion'||field==='quaternionDerivative'?4:3},signed)]));
 Object.assign(original,{mass:[65536,32768,98304,2147483647,-2147483648,0][fixture%6],collisionFlags:signed()});
 for(const[entry,operation]of [[0x47a770,body=>replaceCollisionLinearVelocity(body,velocity)],[0x47a7f0,body=>projectCollisionAngularState(body,{point,normal})],[0x47a670,body=>{const result=applySlidingAngularImpulse(body,{point,normal},gravityQ16);if(result.torque.some(Boolean))nonzeroTorques++;}],[0x47af80,stopCollisionBody]]) {
  machine.reset();const bytes=machine.bytes,body=structuredClone(original);bytes.fill(0xa5,0x10000,0x10180);encode(bytes,0x10000,body);bytes.fill(0xa5,0x6000,0x6050);put(bytes,0x6020,point);put(bytes,0x602c,normal);put(bytes,0x7000,velocity);bytes.writeInt32LE(gravityQ16,0x5eb5e0);
  const expected=Buffer.from(bytes.subarray(0x10000,0x10180)),expectedContact=Buffer.from(bytes.subarray(0x6000,0x6050)),expectedVelocity=Buffer.from(bytes.subarray(0x7000,0x700c));
  operation(body);call(entry,entry===0x47a770?0x7000:0x6000);encode(expected,0,body);
  if(!bytes.subarray(0x10000,0x10180).equals(expected)||!bytes.subarray(0x6000,0x6050).equals(expectedContact)||!bytes.subarray(0x7000,0x700c).equals(expectedVelocity))throw Error(`Sliding response differs at fixture ${fixture}, entry ${entry.toString(16)}.`);
 }
}
const report={method:'Bounded interpretation of class8 linear replacement, independent angular projections, sliding angular impulse, slow-body clearing, and their retained dot/cross/inertia instructions. Compares all 384 body bytes plus contact and input vector bytes across full signed-domain arithmetic, oblique and zero normals, and extreme masses/gravity. No helper stubs or original process execution. Excludes dispatcher gates, advancement and response/effect callbacks.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,fixtures,checks,nonzeroTorques,instructionSteps,matched:true};
await writeFile('analysis/collision-sliding-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
