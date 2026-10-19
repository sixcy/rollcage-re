import {readFile,writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {initializeVehicleContacts} from '../src/vehicle-contacts.mjs';
const readEvidence=async name=>{const reply=JSON.parse(await readFile(`analysis/scene/results/${name}`,'utf8'));return reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);};
const init=await readEvidence('207-wheel-state-initialization-assembly.json'),sqrt=await readEvidence('133-sqrt-lookup-assembly.json'),leading=await readEvidence('211-sqrt-leading-zeros-assembly.json'),wheel=await readEvidence('206-wheel-template-bytes.json'),root=await readEvidence('131-sqrt-lookup-table.json');
const instructions=[init,sqrt,leading].flatMap(evidence=>evidence.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid instruction: ${line}`);return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};}));
const machine=new BoundedX86(instructions,{tables:[wheel.normalized_result,root.normalized_result]}),state=initializeVehicleContacts();
const initialRadii=[0,state.baseRadiusQ8,state.bodyRadiusQ8,30000];let instructionSteps=0;
for(const initialRadius of initialRadii) {
 machine.reset();const bytes=machine.bytes,body=0x1000,queries=0x4000,aggregate=queries+7*0x48;bytes.fill(0xa5,body,body+0x400);bytes[body+0x10c]=5;bytes[body+0x145]=7;bytes.writeUInt32LE(queries,0x91e79c);bytes.writeInt32LE(initialRadius,aggregate+0x40);
 const expected=Buffer.from(bytes.subarray(body,body+0x400));expected.writeInt32LE(state.wheelRangeQ8,0x320);
 state.descriptors.forEach((descriptor,index)=>{const p=0x180+index*28;descriptor.positionQ8.forEach((value,axis)=>expected.writeInt16LE(value,p+axis*2));descriptor.directionQ8.forEach((value,axis)=>expected.writeInt16LE(value,p+8+axis*2));expected.writeInt32LE(index,p+0x10);});
 machine.r.ECX=body;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);instructionSteps+=machine.run();
 if(!bytes.subarray(body,body+0x400).equals(expected)||bytes.readInt32LE(aggregate+0x40)!==Math.max(initialRadius,state.wheelRadiusQ8))throw Error(`Wheel initializer mismatch for radius ${initialRadius}.`);
}
const report={method:'Bounded interpretation of retained wheel initialization, lookup-root and leading-zero instructions with original verified table bytes. Compares descriptor writes, range and aggregate radius for four initial radii. No helper stubs or original process execution.',evidence:[init.evidence_id,sqrt.evidence_id,leading.evidence_id],instructions:instructions.length,fixtures:initialRadii.length,instructionSteps,wheelRadiusQ8:state.wheelRadiusQ8,matched:true};
await writeFile('analysis/wheel-initializer-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
