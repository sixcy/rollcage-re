import {readFile,writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {runVehicleWheelStages,updateFrameBodyDerivatives} from '../src/vehicle-frame.mjs';
const reply=JSON.parse(await readFile('analysis/scene/results/233-wheel-frame-assembly.json','utf8')),evidence=reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);
const instructions=evidence.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid instruction: ${line}`);return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};});
const entries=new Map([[0x41d680,'directions'],[0x488910,'contacts'],[0x488370,'suspension'],[0x41c080,'drive'],[0x499e90,'forces'],[0x47ac50,'rest'],[0x47ada0,'airSpin'],[0x47ae30,'orientation'],[0x41e510,'special']]);let actual=[];
const machine=new BoundedX86(instructions,{externalCalls:new Map([...entries].map(([address,key])=>[address,m=>actual.push(key==='forces'?[key]:[key,m.r.ECX])]))});
let instructionSteps=0;const fixtures=17;
for(let count=0;count<fixtures;count++) {
 machine.reset();actual=[];const bytes=machine.bytes,vehicles=Array.from({length:count},(_,index)=>({address:0x10000+index*0x1000})),expected=[];bytes.writeUInt32LE(0x6000,0x5ecb1c);bytes[0x654d]=count;vehicles.forEach((vehicle,index)=>bytes.writeUInt32LE(vehicle.address,0x909300+index*0x30c));
 const stages=Object.fromEntries([...entries.values()].map(key=>[key,key==='forces'?()=>expected.push([key]):vehicle=>expected.push([key,vehicle.address])]));runVehicleWheelStages(vehicles,stages);
 machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);instructionSteps+=machine.run();if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(`Frame order mismatch for ${count} vehicles.`);
}
const report={method:'Bounded interpretation of all retained vehicle wheel-frame scheduler instructions for zero through sixteen vehicles. Every stage callee is an explicit event mock; compares complete ordered calls and vehicle pointers, not callee physics. No original process execution.',evidence:evidence.evidence_id,instructions:instructions.length,fixtures,instructionSteps,matched:true};
const parentReply=JSON.parse(await readFile('analysis/scene/results/272-vehicle-derivatives-parent-assembly.json','utf8')),parent=parentReply.structuredContent??JSON.parse(parentReply.content.find(c=>c.type==='text').text);
const parentInstructions=parent.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};});
let derivativeEvents=[];const parentMachine=new BoundedX86(parentInstructions,{externalCalls:new Map([[0x47ab30,()=>derivativeEvents.push(['wheels'])],[0x4799f0,m=>derivativeEvents.push(['derive',m.r.ECX])]])});let parentSteps=0;
for(let count=0;count<fixtures;count++) {
 parentMachine.reset();derivativeEvents=[];const bytes=parentMachine.bytes,bodies=Array.from({length:count},(_,index)=>({address:0x10000+index*0x1000,flags:index%3===0?0x8000:3})),expected=[['wheels']];bytes.writeUInt16LE(count,0x902bc4);bytes.writeUInt32LE(0x6000,0x902bc0);bodies.forEach((body,index)=>{bytes.writeUInt32LE(body.address,0x6000+index*4);bytes.writeInt32LE(body.flags,body.address);});updateFrameBodyDerivatives(bodies,body=>expected.push(['derive',body.address+0x34]));
 parentMachine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);parentSteps+=parentMachine.run();if(JSON.stringify(expected)!==JSON.stringify(derivativeEvents))throw Error(`Derivative guard/order mismatch for ${count} bodies.`);
}
report.derivatives={evidence:parent.evidence_id,instructions:parentInstructions.length,fixtures,instructionSteps:parentSteps,matched:true};
await writeFile('analysis/vehicle-frame-order-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
