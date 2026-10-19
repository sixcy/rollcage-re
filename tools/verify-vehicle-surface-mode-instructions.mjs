import {readFile,writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readVehicleSurfaceMode} from '../src/wheel-drive.mjs';
const reply=JSON.parse(await readFile('analysis/scene/results/219-wheel-surface-override-assembly.json','utf8')),evidence=reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);
const instructions=evidence.normalized_result.trim().split('\n').map(line=>{const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());if(!match)throw Error(`Invalid instruction: ${line}`);return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(value=>value.trim())??[]};});
const machine=new BoundedX86(instructions),data=Buffer.alloc(0x200),scene={segments:[{columns:2,rows:1,verticesOffset:0x100}]},histogram={0:0,1:0,2:0};let fixtures=0,instructionSteps=0;
for(const lowerBound of [0,300,975,976,1008,1023,65535])for(let code=0;code<1024;code++) {
 machine.reset();const bytes=machine.bytes,body=0x1000,table=0x2000,sector=0x3000,vertices=0x4000,cellRef=(Math.floor((code%6)/3)<<16)|((code%3)<<8);
 data.writeUInt16LE(lowerBound,0x66);for(let i=0;i<6;i++){data.writeUInt32LE(((code<<22)|0x12345)>>>0,0x100+i*8+4);bytes.writeUInt32LE(data.readUInt32LE(0x100+i*8+4),vertices+i*8+4);}
 bytes.writeInt32LE(cellRef,body+0x11c);bytes.writeUInt32LE(table,0x909240);bytes.writeUInt32LE(sector,table);bytes.writeInt32LE(2,sector+8);bytes.writeUInt32LE(vertices,sector+0x20);bytes.writeUInt16LE(lowerBound,0x90929c);
 machine.r.ECX=body;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);instructionSteps+=machine.run();
 const result=readVehicleSurfaceMode(data,scene,cellRef);if(machine.r.EAX!==result)throw Error(`Surface mode mismatch: ${JSON.stringify({lowerBound,code,cellRef,native:machine.r.EAX,port:result})}`);fixtures++;histogram[result]++;
}
machine.reset();machine.r.ECX=0x1000;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x111c);machine.bytes.writeUInt32LE(0xffffffff,0x9000);instructionSteps+=machine.run();if(machine.r.EAX!==readVehicleSurfaceMode(null,null,-1))throw Error('Absent-cell classification mismatch.');fixtures++;histogram[0]++;
const report={method:'Bounded interpretation of all retained vehicle surface classifier instructions. All 1024 vertex codes with seven lower bounds, varied grid coordinates and absent-cell sentinels. No helper stubs or original process execution.',evidence:evidence.evidence_id,instructions:instructions.length,fixtures,instructionSteps,histogram,matched:true};
await writeFile('analysis/vehicle-surface-mode-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
