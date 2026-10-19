import {readFile,writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {solveWheelTraction} from '../src/wheel-physics.mjs';
const readEvidence=async name=>{const reply=JSON.parse(await readFile(`analysis/scene/results/${name}`,'utf8'));return reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);};
const evidence=await Promise.all(['144-wheel-traction-assembly.json','223-wheel-spin-assembly.json','152-vector-length-assembly.json','220-wheel-drive-dot-assembly.json','217-wheel-capacity-curve-assembly.json','221-fixed-sqrt-assembly.json'].map(readEvidence));
const instructions=evidence.flatMap(value=>value.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid instruction: ${line}`);return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};}));
let effectCalls=0;const machine=new BoundedX86(instructions,{externalCalls:new Map([[0x483b90,()=>{effectCalls++;}]])});
let seed=0x41c720ab,instructionSteps=0;const fixtures=4000,histogram={lowSlip:0,limited:0,skidding:0,spinClamped:0,scaledTime:0,exemptTime:0};
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;};
for(let fixture=0;fixture<fixtures;fixture++) {
 machine.reset();const bytes=machine.bytes,wheelAddress=0x1000,slipAddress=0x2000,output=0x3000;bytes.fill(0xa5,wheelAddress,wheelAddress+200);
 const slip=fixture%8===0?[0,0,0]:[0,1,2].map(()=>random(80*65536)-40*65536),capacity=1+random(50000),reduction=random(33)-1,driveInput=random(2000000)-1000000;
 const wheel={spin:random(8000000)-4000000,angle:random(0xffffffff)|0,driveDirection:[[65536,0,0],[0,0,65536],[46340,0,46340]][random(3)]},originalSpin=wheel.spin;
 const time={timeScaleActive:!!random(2),timeScaleExempt:!!random(2),timeScaleQ16:random(2*65536)};
 wheel.driveDirection.forEach((value,axis)=>bytes.writeInt32LE(value,wheelAddress+0x34+axis*4));bytes.writeInt32LE(wheel.spin,wheelAddress+0x58);bytes.writeInt32LE(wheel.angle,wheelAddress+0x78);bytes[wheelAddress+0x9c]=0;
 bytes.writeInt32LE(time.timeScaleActive?1:0,0x811180);bytes.writeInt32LE(17,0x811184);bytes.writeInt32LE(time.timeScaleExempt?17:19,0x909300);bytes.writeInt32LE(time.timeScaleQ16,0x81118c);
 const expected=Buffer.from(bytes.subarray(wheelAddress,wheelAddress+200)),result=solveWheelTraction(wheel,slip,capacity,reduction,driveInput,time);
 expected.writeInt32LE(wheel.spin,0x58);expected.writeInt32LE(wheel.angle,0x78);expected.writeInt32LE(wheel.slipSpeed,0x7c);slip.forEach((value,axis)=>bytes.writeInt32LE(value,slipAddress+axis*4));
 machine.r.ECX=driveInput;machine.r.EDX=wheelAddress;machine.r.ESP=0x9000;
 [0xffffffff,slipAddress,output,0x12345678,capacity,reduction].forEach((value,index)=>bytes.writeUInt32LE(value>>>0,0x9000+index*4));instructionSteps+=machine.run();
 if(!bytes.subarray(wheelAddress,wheelAddress+200).equals(expected)||result.correction.some((value,axis)=>bytes.readInt32LE(output+axis*4)!==value)||machine.r.EAX!==(result.skidding?1:0))throw Error(`Traction mismatch: ${JSON.stringify({fixture,slip,capacity,reduction,driveInput,time,wheel,result,nativeSpin:bytes.readInt32LE(wheelAddress+0x58),nativeSlip:bytes.readInt32LE(wheelAddress+0x7c)})}`);
 histogram[result.measuredSpeed<(result.effectiveCapacity<<3)?'lowSlip':'limited']++;if(result.skidding)histogram.skidding++;if(originalSpin&&wheel.spin===0)histogram.spinClamped++;if(time.timeScaleActive){histogram[time.timeScaleExempt?'exemptTime':'scaledTime']++;}
}
const report={method:'Bounded interpretation of retained traction, spin, vector length, fixed root, dot and Q16 division instructions. Compares all 200 wheel bytes, correction and skid return on declared synthetic inputs. Effect helper 0x483b90 is explicitly omitted as a no-op in the compared arithmetic model; its sound/particle/state behavior is not verified. No original process execution.',evidence:evidence.map(value=>value.evidence_id),instructions:instructions.length,fixtures,instructionSteps,effectCalls,histogram,matched:true};
await writeFile('analysis/wheel-traction-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
