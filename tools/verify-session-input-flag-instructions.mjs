import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {setSessionInputFlag} from '../src/session-input-flag.mjs';
const {evidence,instructions}=await readInstructionEvidence(['180-race-end-state-assembly.json'],{directory:'analysis/native-simulation/results'}),machine=new BoundedX86(instructions),memory=Buffer.alloc(0xa00000),fixtures=5000;
let seed=0x41a670bc,steps=0,clears=0,skips=0;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed|0;};
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();memory.fill(0xa5,0x849480,0x849590);memory.writeInt32LE(random(),0x91ce90);memory.writeInt32LE(fixture%3===0?14:random(),0x91ff80);const mode=random();
 memory.copy(machine.bytes,0x849480,0x849480,0x849590);memory.copy(machine.bytes,0x91ce90,0x91ce90,0x91ce94);memory.copy(machine.bytes,0x91ff80,0x91ff80,0x91ff84);
 setSessionInputFlag(mode,{memory});machine.entry=0x41a670;machine.r.ECX=mode;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);steps+=machine.run();
 assert.deepEqual(machine.bytes.subarray(0x849480,0x849590),memory.subarray(0x849480,0x849590));assert.equal(machine.bytes.readInt32LE(0x91ce90),memory.readInt32LE(0x91ce90));assert.equal(machine.bytes.readInt32LE(0x91ff80),memory.readInt32LE(0x91ff80));
 if(!(mode&1)){if(memory.readInt32LE(0x91ff80)===14)skips++;else clears++;}
}
const report={method:'Complete41a670 with no mocked calls. Full four input-word neighborhoods and both globals compared, including AX-only stores, low-bit masking, bit1 preservation and mode14 clear suppression. Synthetic caller-owned native memory, no original process execution.',evidence:evidence.map(value=>value.evidence_id),instructions:instructions.length,fixtures,clears,skips,instructionSteps:steps,matched:true};await writeFile('analysis/session-input-flag-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
