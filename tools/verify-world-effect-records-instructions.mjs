import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {updateWorldEffectRecords} from '../src/world-effect-records.mjs';
const {evidence,instructions}=await readInstructionEvidence(['069-external-world-assembly.json'],{directory:'analysis/native-simulation/results'}),machine=new BoundedX86(instructions,{entry:0x413fc0});
let seed=0x413fc0ab,instructionSteps=0,updatedRecords=0,skippedGates=0,zeroCounts=0,negativeStatuses=0,wrappedPositiveStatuses=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0xffffffff)|0;
const fixtures=5000,recordBase=0x920800;
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();const bytes=machine.bytes,length=(fixture%33)*16,count=random(length/16+1),records=Buffer.alloc(length),originS16=Array.from({length:3},()=>[0,-32768,32767,random(65536)-32768][random(4)]),strength=[0,1,-1,65535,65536,-65536,-2147483648,2147483647,signed()][fixture%9],effectFlag=[0,1,2,-1,-2147483648,2147483647][fixture%6];
 for(let p=0;p<records.length;p++)records[p]=random(256);
 for(let index=0;index<length/16;index++){
  for(let axis=0;axis<3;axis++)records.writeInt16LE(fixture%5===0?originS16[axis]:random(65536)-32768,index*16+axis*2);
  records[index*16+6]=[0,1,127,128,255,random(256)][random(6)];if(index<count&&records[index*16+6]>=128)negativeStatuses++;
 }
 bytes.fill(0xa5,recordBase-16,recordBase+length+32);records.copy(bytes,recordBase);const before=Buffer.from(bytes.subarray(recordBase-16,recordBase+length+32)),expected=Buffer.from(before);
 bytes.writeInt32LE(effectFlag,0x91cd90);bytes.writeInt32LE(count,0x9207e4);bytes.writeInt32LE(strength,0x91cd8c);originS16.forEach((value,index)=>bytes.writeInt16LE(value,0x91cd82+index*4));
 updatedRecords+=updateWorldEffectRecords(records,{count,effectFlag,originS16,strength});records.copy(expected,16);
 machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);instructionSteps+=machine.run();
 assert.ok(bytes.subarray(recordBase-16,recordBase+length+32).equals(expected),`record and guard bytes fixture${fixture}`);
 assert.equal(bytes.readInt32LE(0x91cd90),effectFlag);assert.equal(bytes.readInt32LE(0x9207e4),count);assert.equal(bytes.readInt32LE(0x91cd8c),strength);originS16.forEach((value,index)=>assert.equal(bytes.readInt16LE(0x91cd82+index*4),value));
 if(!effectFlag)skippedGates++;if(!count)zeroCounts++;
 for(let index=0;index<count;index++)if(before[16+index*16+6]>0&&before[16+index*16+6]<128&&records[index*16+6]>=128)wrappedPositiveStatuses++;
}
const report={method:'All retained413fc0 instructions, no calls or arithmetic stubs. Compares every byte of full caller record storage including records beyond count, prefix/suffix guards and unchanged globals. Any-nonzero gate, zero counts, signed status skips, signed-short extremes, exact/coarse-coincident origin, wrapped shift/add and positive-to-negative byte truncation. All declared signed-short coordinate and signed32 strength inputs have positive max-square divisor after zero replacement, so IDIV is nonzero and quotient fits. No original process execution.',evidence:evidence.map(value=>value.evidence_id),instructions:instructions.length,fixtures,updatedRecords,skippedGates,zeroCounts,negativeStatuses,wrappedPositiveStatuses,instructionSteps,matched:true};
await writeFile('analysis/world-effect-records-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
