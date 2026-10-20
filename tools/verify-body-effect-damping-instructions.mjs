import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {applyBodyEffectDamping} from '../src/body-effect-damping.mjs';
const {evidence,instructions}=await readInstructionEvidence(['077-second-body-effect-assembly.json'],{directory:'analysis/native-simulation/results'}),machine=new BoundedX86(instructions,{entry:0x47b280});
let seed=0x47b280ab,instructionSteps=0,applied=0,outside=0,specialVehicleSkips=0,globalWrites=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0xffffffff)|0,put=(bytes,p,values)=>values.forEach((value,index)=>bytes.writeInt32LE(value,p+index*4));
const root=0x10000,fixtures=4000,fields=[0x60,0x64,0x68,0x6c,0x70,0x74];
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();const bytes=machine.bytes,originQ16=Array.from({length:3},signed),state=[null,0,1,255][random(4)],timeScaleActive=[0,1,2,-1,-2147483648][fixture%5],globals=Object.fromEntries(fields.map(offset=>[`field91cd${offset.toString(16)}`,signed()])),body={flags:[3,0x1003,7,17,26,0x8003][random(6)],position:originQ16.slice(),linearVelocity:Array.from({length:3},signed),momentum:Array.from({length:3},signed),pairCollisionContext:{stateByte6bc:state}};
 switch(fixture%6){case 0:break;case 1:body.position=originQ16.map(value=>(value+random(0x1800000)-0xc00000)|0);break;case 2:body.position[0]=(originQ16[0]+0x1000000)|0;break;case 3:body.position=Array.from({length:3},signed);break;case 4:originQ16[0]=-2147483648;body.position=[2147483647,originQ16[1],originQ16[2]];break;case 5:body.position=originQ16.map(value=>(value+random(0x600000)-0x300000)|0);break;}
 for(let p=root;p<root+0x1000;p++)bytes[p]=random(256);bytes.writeInt32LE(body.flags,root);put(bytes,root+0x34,body.position);put(bytes,root+0x68,body.linearVelocity);put(bytes,root+0x40,body.momentum);bytes.writeUInt32LE(state===null?0xffffffff:0x70000,root+0x6bc);if(state!==null)bytes[0x70000]=state;
 put(bytes,0x9153f0,originQ16);bytes.writeInt32LE(timeScaleActive,0x811180);for(const offset of fields)bytes.writeInt32LE(globals[`field91cd${offset.toString(16)}`],0x91cd00+offset);
 const expectedBody=Buffer.from(bytes.subarray(root,root+0x1000)),inputOrigin=Buffer.from(bytes.subarray(0x9153f0,0x9153fc)),expectedGlobals=Buffer.from(bytes.subarray(0x91cd60,0x91cd78));
 const result=applyBodyEffectDamping(body,{originQ16,timeScaleActive,globals});put(expectedBody,0x68,body.linearVelocity);put(expectedBody,0x40,body.momentum);for(const offset of fields)expectedGlobals.writeInt32LE(globals[`field91cd${offset.toString(16)}`],offset-0x60);
 machine.r.ECX=root;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);instructionSteps+=machine.run();
 assert.ok(bytes.subarray(root,root+0x1000).equals(expectedBody),`body fixture${fixture}`);assert.ok(bytes.subarray(0x91cd60,0x91cd78).equals(expectedGlobals),`globals fixture${fixture}`);assert.ok(bytes.subarray(0x9153f0,0x9153fc).equals(inputOrigin));assert.equal(bytes.readInt32LE(0x811180),timeScaleActive);if(state!==null)assert.equal(bytes[0x70000],state);
 if(result.applied){applied++;if(timeScaleActive===0)globalWrites++;}else if(result.distanceSquared>=0x1000)outside++;else specialVehicleSkips++;
}
const report={method:'Complete retained47b280 instructions, no helper calls/stubs and no original process execution. All4096 body bytes, all six retained output globals, unchanged origin/time global and pointed state byte compared. Full signed32 momentum/velocity/origin domains, wrapped position subtraction, strict radius boundary, type3 native pointer-1/zero/nonzero byte gates and any-nonzero time-scale global.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,fixtures,applied,outside,specialVehicleSkips,globalWrites,instructionSteps,matched:true};
await writeFile('analysis/body-effect-damping-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
