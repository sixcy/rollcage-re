import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {activateRawPersistentEmitter} from '../src/attachment-effects.mjs';

export async function checkPersistentEmitterSetup() {
 const {instructions,evidence}=await readInstructionEvidence(['1076-persistent-emitter-setup-assembly.json'],{directory:'analysis/native-simulation/results'}),machine=new BoundedX86(instructions),memory=Buffer.alloc(0xa00000),fixtures=4000;
 let steps=0,aliases=0,wraps=0;
 for(let fixture=0;fixture<fixtures;fixture++) {
  const cursor=[0,1,2,3,4,5,6,7,8,9,10,15,0xffffffff][fixture%13],record=(0x6ff140+Math.imul(cursor,20))>>>0;
  memory.fill(0x69,0x6fb000,0x6ff400);memory.fill(0x93,0x10000,0x10040);memory.writeUInt32LE(cursor,0x6fbb14);
  const position=fixture%3===0?record+[-4,0,2,4,6][Math.floor(fixture/3)%5]:0x10000;
  if(position!==0x10000)aliases++;if(((cursor+1)>>>0)>=10)wraps++;
  for(let i=0;i<12;i++)memory[position+i]=(fixture*37+i*11)&255;
  machine.reset();memory.copy(machine.bytes);activateRawPersistentEmitter(position,{memory});
  machine.r.ECX=position;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);steps+=machine.run();
  assert.deepEqual(machine.bytes.subarray(0x6fb000,0x6ff400),memory.subarray(0x6fb000,0x6ff400),`fixture ${fixture}`);
  assert.deepEqual(machine.bytes.subarray(0x10000,0x10040),memory.subarray(0x10000,0x10040),`input ${fixture}`);
 }
 const report={method:'Actual44f910 ten-slot persistent-emitter activation: capture cursor, cadence before sequential source high-word reads/stores, original color/duration/interval/flags and unsigned32 increment/comparison. No callbacks/callees. Full emitter/cursor/neighbouring bytes and source position compared, including overlapping source/destination, cursor9/10/15 and unsigned wrap. Inputs are declared readable native memory; no original-process execution.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,fixtures,aliases,wraps,instructionSteps:steps,matched:true};
 await writeFile('analysis/persistent-emitter-setup-instruction-check.json',JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await checkPersistentEmitterSetup()));
