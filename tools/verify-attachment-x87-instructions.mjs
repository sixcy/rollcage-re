import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {transformAttachmentPoint,ATTACHMENT_SCRATCH_BASE,ATTACHMENT_SCRATCH_LENGTH} from '../src/body-attachments.mjs';
import {REDUX_SHA256} from './lib/retained-native-program.mjs';

const {instructions,evidence}=await readInstructionEvidence(['086-attachment-transform-assembly.json'],{directory:'analysis/native-simulation/results'});
assert.equal(evidence[0].subject.digest.sha256,REDUX_SHA256);
let steps=0,cases=0,differences=0,seed=1;const examples=[];
const next=()=>{seed=(Math.imul(seed,0x41a7)+1234)&0x7fffffff;return(seed&65535)-32768;};
for(const precision of[24,53,64]){
 const machine=new BoundedX86(instructions,{fpuPrecisionBits:precision});
 for(let fixture=0;fixture<256;fixture++)for(const roundingMode of['nearest-even','toward-zero','down','up']){
  const initial=Buffer.alloc(ATTACHMENT_SCRATCH_LENGTH,0xa5),at=a=>a-ATTACHMENT_SCRATCH_BASE;
  const point=fixture===0?[2016,-26177,-9198]:Array.from({length:3},next);
  const position=fixture===0?[19529,0,0]:Array.from({length:3},next);
  const matrix=fixture===0?[-1127,0,-3938,0,4096,0,0,0,4096]:Array.from({length:9},next);
  point.forEach((v,i)=>initial.writeInt16LE(v,at(0x91d3e4)+i*2));position.forEach((v,i)=>initial.writeFloatLE(v,at(0x91cdb0)+i*4));
  matrix.forEach((v,i)=>initial.writeFloatLE(v/4096,at(0x91cdc0)+Math.floor(i/3)*16+i%3*4));
  machine.reset();initial.copy(machine.bytes,ATTACHMENT_SCRATCH_BASE);machine.fpuRounding=roundingMode;
  machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);steps+=machine.run();
  const scratch=Buffer.from(initial),result=transformAttachmentPoint(scratch,roundingMode,{x87PrecisionBits:precision});
  assert.deepEqual(scratch,machine.bytes.subarray(ATTACHMENT_SCRATCH_BASE,ATTACHMENT_SCRATCH_BASE+ATTACHMENT_SCRATCH_LENGTH));
  assert.equal(machine.x87.length,0);cases++;
  if(precision===24){const old=transformAttachmentPoint(Buffer.from(initial),roundingMode);if(result.some((v,i)=>v!==old[i]))differences++;}
  if(fixture===0&&roundingMode==='nearest-even'){const expected=precision===24?27818:27817;assert.equal(result[0],expected);examples.push({precisionBits:precision,x:result[0]});}
 }
}
assert(differences>0);
const report={method:'Actual retained432080 with explicit exact finite x87 value stacks at PC24/53/64 and all four RC modes. Source follows original z,x,y stores and translation-first FXCH/FADDP tree. Complete1700-byte scratch and drained value stack compare; no game or service substitutions. Synthetic signed-short/Q12 inputs, not captured trajectories. Shared exact arithmetic primitive is independently hardware-checked in the separate x87 fixture; this interpreter comparison validates instruction sequencing/storage and propagation, not a second independent arithmetic implementation. No native launch or status/exception equivalence claim.',targetSha256:REDUX_SHA256,evidence:evidence.map(x=>x.evidence_id),cases,instructionSteps:steps,pc24CasesDifferingFromHistorical53:differences,examples,matched:true};
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));
