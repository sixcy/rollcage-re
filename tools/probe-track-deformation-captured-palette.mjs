//Read-only fidelity review: allocator-side pack/count mutation at494cf3.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createTrackDeformationConstructorFixture} from './verify-track-deformation-constructor-instructions.mjs';
import {initializeTrackDeformation} from '../src/track-deformation.mjs';
export async function probeTrackDeformationCapturedPalette({output=null}={}){
  const own=await readInstructionEvidence(['1329-track-animation-constructor-assembly.json'],{directory:'analysis/native-simulation/results'}),machine=new BoundedX86(own.instructions),runtime=createTrackDeformationConstructorFixture(3),allocation=0x30000;
  machine.reset();runtime.memory.copy(machine.bytes);
  const changes=[];
  const allocate=memory=>{memory.writeUInt32LE(0,runtime.pack+16);memory.writeUInt32LE(0,0x80df00);return allocation;};
  const before=runtime.memory.subarray(runtime.colors+0xfbc,runtime.colors+0xfc0).toString('hex');
  machine.bytes.writeUInt32LE(0x720000,0x56e258);machine.externalCalls.set(0x720000,m=>{m.r.EAX=allocate(m.bytes);});
  machine.externalCalls.set(0x568a50,m=>{const p=m.bytes.readUInt32LE(m.r.ESP),n=m.bytes.readUInt32LE(m.r.ESP+8);m.bytes.fill(0,p,p+n);m.r.EAX=p;});
  initializeTrackDeformation({...runtime,handlers:{allocate:()=>allocate(runtime.memory)}});
  machine.entry=0x494c80;machine.r.ESP=runtime.scratchBase;machine.bytes.writeUInt32LE(0xffffffff,machine.r.ESP);const steps=machine.run();
  for(let offset=0;offset<0x1000;offset++)if(machine.bytes[runtime.colors+offset]!==runtime.memory[runtime.colors+offset])changes.push({offset:'0x'+offset.toString(16),native:machine.bytes[runtime.colors+offset],source:runtime.memory[runtime.colors+offset]});
  const report={method:'Actual1329 constructor instructions with declared CRT malloc/memset services. Starts existing constructorfixture3; malloc sets captured pack+16 and global80df00 tozero, returns30000. Native494cf6 skips sector loop to494f07 without494efb/f01 global reload, preserving originalEDIcount andEBXbase forpalette. This synthetic allocator mutation is a fidelity probe, not evidence originalCRT changesgamepack. No installed writes or original process.',sourceSHA256:createHash('sha256').update(await readFile('src/track-deformation.mjs')).digest('hex'),evidence:own.evidence.map(e=>e.evidence_id),fixture:3,pack:'0x'+runtime.pack.toString(16),allocation:'0x30000',mutations:[{address:'0x'+(runtime.pack+16).toString(16),value:0},{address:'0x80df00',value:0}],beforePalette:before,nativePalette:machine.bytes.subarray(runtime.colors+0xfbc,runtime.colors+0xfc0).toString('hex'),sourcePalette:runtime.memory.subarray(runtime.colors+0xfbc,runtime.colors+0xfc0).toString('hex'),nativeCount:machine.bytes.readUInt32LE(0x80df00),sourceCount:runtime.memory.readUInt32LE(0x80df00),steps,differences:changes,matched:changes.length===0};
  if(output)await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await probeTrackDeformationCapturedPalette()));
