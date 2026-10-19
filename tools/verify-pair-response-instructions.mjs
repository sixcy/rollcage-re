import {writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {resolveBodyPairContact,exchangePairNormalVelocity,splitCollisionVelocity} from '../src/collision-response.mjs';
const {evidence,instructions}=await readInstructionEvidence(['320-pair-contact-response-assembly.json','321-pair-velocity-exchange-assembly.json','322-contact-velocity-split-assembly.json','314-contact-vector-scale-assembly.json','315-contact-inertia-transform-assembly.json','316-contact-quaternion-product-assembly.json','256-wheel-cross-assembly.json','220-wheel-drive-dot-assembly.json','217-wheel-capacity-curve-assembly.json']);
const machine=new BoundedX86(instructions);let seed=0x447f60ab,instructionSteps=0,checks=0,reducedFirst=0,reducedSecond=0,separating=0,aliases=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;},signed=()=>random(0xffffffff)|0,put=(bytes,p,values)=>values.forEach((value,index)=>bytes.writeInt32LE(value,p+index*4));
function encode(bytes,p,body) {
 bytes.writeInt32LE(body.flags,p);bytes.writeInt32LE(body.mass,p+0xa8);bytes.writeInt32LE(body.inverseMass,p+0xac);bytes.writeInt32LE(body.coefficient7c,p+0xb0);bytes[p+0x10c]=body.collisionCount10c;
 for(const [values,offset]of [[body.momentum,0x40],[body.angularMomentum,0x4c],[body.quaternion,0x58],[body.linearVelocity,0x68],[body.quaternionDerivative,0x8c],[body.angularVelocity,0xb8],[body.worldInverseInertia,0xe4]])put(bytes,p+offset,values);
}
function encodeContact(bytes,p,contact){put(bytes,p+0x20,contact.point);put(bytes,p+0x2c,contact.normal);}
function call(entry,ecx,edx,args=[]) {machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);args.forEach((value,index)=>machine.bytes.writeUInt32LE(value>>>0,0x9004+index*4));instructionSteps+=machine.run();checks++;}
function createBody(address,index) {
 return {address,flags:index%3===0?7:3,mass:[32768,65536,131072][random(3)],inverseMass:[32768,65536,131072][random(3)],coefficient7c:[0,32768,65536][random(3)],collisionCount10c:[0,1,2,5,127,128,255][random(7)],momentum:[signed(),signed(),signed()],angularMomentum:[signed(),signed(),signed()],quaternion:[0,1,2,3].map(()=>random(131073)-65536),linearVelocity:[0,1,2].map(()=>random(8000001)-4000000),angularVelocity:[signed(),signed(),signed()],quaternionDerivative:[signed(),signed(),signed(),signed()],worldInverseInertia:[21671,1024,-500,1024,17762,1536,-500,1536,31930]};
}
const fixtures=5000,normals=[[65536,0,0],[-65536,0,0],[0,65536,0],[0,0,-65536],[46340,46340,0],[0,-46340,46340]],classes=[-2147483648,-33,-1,0,1,2,3,31,32,33,2147483647];
for(let fixture=0;fixture<fixtures;fixture++) {
 machine.reset();const first=createBody(0x10000,fixture),second=fixture%17===0?first:createBody(0x20000,fixture+1),bodies=second===first?[first]:[first,second],contexts=bodies.map(()=>({field3d00:classes[random(classes.length)],stateByte6bc:[null,0,1,2,255][random(5)]})),bytes=machine.bytes;
 if(second===first)aliases++;
 bodies.forEach((body,index)=>{bytes.fill(0xa5,body.address,body.address+0x4000);encode(bytes,body.address,body);bytes.writeInt32LE(contexts[index].field3d00,body.address+0x3d00);bytes.writeInt32LE(contexts[index].stateByte6bc===null?-1:0x7200+index*0x100,body.address+0x6bc);if(contexts[index].stateByte6bc!==null)bytes[0x7200+index*0x100]=contexts[index].stateByte6bc;});
 const contact1={point:[0,1,2].map(()=>random(32*65536)-16*65536),normal:normals[random(normals.length)].slice()},contact2={point:[0,1,2].map(()=>random(32*65536)-16*65536),normal:contact1.normal.map(value=>-value)},velocity=[0,1,2].map(()=>random(8000001)-4000000);
 bytes.fill(0xa5,0x6000,0x6150);encodeContact(bytes,0x6000,contact1);encodeContact(bytes,0x6100,contact2);put(bytes,0x7000,velocity);
 const expected=bodies.map(body=>Buffer.from(bytes.subarray(body.address,body.address+0x4000))),contactsBefore=Buffer.from(bytes.subarray(0x6000,0x6150));
 const result=resolveBodyPairContact(first,second,contact1,contact2,velocity,{firstContext:contexts[0],secondContext:contexts[contexts.length-1]});
 call(0x447f60,first.address,0x6000,[0x7000,second.address,0x6100]);
 bodies.forEach((body,index)=>{encode(expected[index],0,body);if(!bytes.subarray(body.address,body.address+0x4000).equals(expected[index]))throw Error(`Pair response differs: ${JSON.stringify({fixture,index,result,first,second,contact1,contact2,velocity,contexts,nativeMomentum:[0,1,2].map(axis=>bytes.readInt32LE(body.address+0x40+axis*4))})}`);});
 if(!bytes.subarray(0x6000,0x6150).equals(contactsBefore))throw Error('Pair response changed contact bytes.');
 if(result.magnitudes[0]!==result.magnitude)reducedFirst++;if(result.magnitudes[1]!==result.magnitude)reducedSecond++;if(result.normalSpeed>=0)separating++;
 // Exercise normal/tangent splitting independently with wide signed inputs.
 const splitVelocity=[signed(),signed(),signed()],splitNormal=[signed(),signed(),signed()];put(bytes,0x7000,splitVelocity);put(bytes,0x7100,splitNormal);const split=splitCollisionVelocity(splitNormal,splitVelocity);call(0x47a5d0,0x7100,0x7000,[0x7400,0x7500]);for(const [values,p]of [[split.normal,0x7400],[split.tangent,0x7500]])if(values.some((value,index)=>value!==bytes.readInt32LE(p+index*4)))throw Error('Normal/tangent split differs.');
 // Class8 shares relative normal speed without mass weighting. Keep native
 // event/body pointer aliasing; no angular state is updated by this routine.
 bytes.writeUInt32LE(first.address,0x6204);bytes.writeUInt32LE(second.address,0x6208);const exchangeBefore=bodies.map(body=>Buffer.from(bytes.subarray(body.address,body.address+0x4000)));
 exchangePairNormalVelocity(first,second,contact1.normal);call(0x475300,0x6200,0x6000);bodies.forEach((body,index)=>{encode(exchangeBefore[index],0,body);if(!bytes.subarray(body.address,body.address+0x4000).equals(exchangeBefore[index]))throw Error(`Normal exchange differs: ${fixture}/${index}`);});
}
const report={method:'Bounded interpretation of full body-pair impulse, class8 normal exchange and velocity split, including retained cross/dot/inertia/division/quaternion instructions. Complete 16,384-byte body regions and contact bytes match. Includes nonapproaching contacts, signed class comparisons, wrapped shift differences, override bytes, unequal masses and body-pointer aliases. No helper stubs or original process execution; event dispatch and generation are separate.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,fixtures,checks,reducedFirst,reducedSecond,separating,aliases,instructionSteps,matched:true};
await writeFile('analysis/pair-response-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
