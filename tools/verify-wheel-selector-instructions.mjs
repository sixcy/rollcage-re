import {readFile,writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {selectWheelHits} from '../src/placed-model-query.mjs';
const reply=JSON.parse(await readFile('analysis/scene/results/192-wheel-hit-selector-assembly.json','utf8')),evidence=reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);
const instructions=evidence.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid instruction: ${line}`);return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};});
const writeHit=(bytes,out,hit)=>{bytes.writeInt32LE(hit.flags,out+28);if(hit.flags){hit.pointQ8.forEach((value,i)=>bytes.writeInt32LE(value,out+i*4));hit.normalQ16.forEach((value,i)=>bytes.writeInt32LE(value,out+12+i*4));bytes.writeInt32LE(hit.distanceQ8,out+24);bytes.writeInt32LE(hit.cellRef,out+32);}};
let terrain,models,order;
const externalCalls=new Map([[0x568162,()=>{}],...[['t',0x424ff0],['m',0x423ab0]].map(([kind,address])=>[address,machine=>{
 const index=(machine.r.EDX-0x7132e0)/0x48;if(!Number.isInteger(index)||index<0||index>3)throw Error('Unexpected wheel query address.');
 const hit=(kind==='t'?terrain:models)[index],out=machine.bytes.readUInt32LE(machine.r.ESP);order.push(`${kind}${index}`);writeHit(machine.bytes,out,hit);machine.r.EAX=hit.fractionQ16|0;
}])]);
const machine=new BoundedX86(instructions,{externalCalls});
let seed=0x488ecafe;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;};
const fixtures=2000;let instructionSteps=0;
for(let fixture=0;fixture<fixtures;fixture++) {
 machine.reset();order=[];
 const hit=()=>{const flags=random(3)?1:0;return {flags,fractionQ16:flags?random(65537):random(2)?65536:0x1010000,...(flags?{pointQ8:[0,1,2].map(()=>random(10000)),normalQ16:[0,1,2].map(()=>random(131073)-65536),distanceQ8:random(2000),cellRef:random(2)?-4:256}:{})};};
 terrain=Array.from({length:4},hit);models=Array.from({length:4},hit);machine.bytes.fill(0xa5,0x713400,0x7134a0);
 const expected=Buffer.from(machine.bytes.subarray(0x713400,0x7134a0));
 const results=selectWheelHits(Array.from({length:4},(_,index)=>({query:{index}})),{terrainQuery:query=>terrain[query.index],modelQuery:query=>models[query.index]});
 results.forEach((result,index)=>writeHit(expected,index*0x28,result));
 // Even when restored flags are zero, farther model writes remain in memory.
 results.forEach((result,index)=>{if(!result.flags&&models[index].flags){const p=index*0x28;writeHit(expected,p,models[index]);expected.writeInt32LE(0,p+28);}});
 machine.r.ECX=0x1000;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);machine.bytes.writeUInt32LE(0,0x9004);machine.bytes.writeUInt32LE(0x3000,0x9008);
 instructionSteps+=machine.run();
 if(!machine.bytes.subarray(0x713400,0x7134a0).equals(expected))throw Error(`Wheel selector result buffers differ at fixture ${fixture}.`);
 for(let i=0;i<4;i++)if(machine.bytes.readInt32LE(0x3000+i*4)!==results[i].fractionQ16)throw Error(`Wheel selector fraction differs at fixture ${fixture}, wheel ${i}.`);
 if(order.join(',')!=='t0,t1,t2,t3,m0,m1,m2,m3')throw Error('Native selector call order differs.');
}
const report={method:'Bounded interpretation of retained wheel selector with declared mocked terrain/model query outputs. Security-cookie check stubbed. Compares shared result buffers, selected fractions and query order; no original process execution.',evidence:evidence.evidence_id,instructions:instructions.length,fixtures,instructionSteps,matched:true};
await writeFile('analysis/wheel-selector-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
