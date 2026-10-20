import {readFile} from 'node:fs/promises';
import {readInstructionEvidence} from './instruction-evidence.mjs';
export async function readStaticSpherePrimitiveEvidence() {
 const old=await readInstructionEvidence(['202-point-sphere-contact-assembly.json','204-edge-sphere-contact-assembly.json','377-contact-quadratic-root-assembly.json','378-contact-normalize-assembly.json','379-contact-vector-scale8-assembly.json','197-model-fraction-helper-assembly.json','133-sqrt-lookup-assembly.json','211-sqrt-leading-zeros-assembly.json']);
 const fresh=await readInstructionEvidence(['042-short-scale-transform-assembly.json'],{directory:'analysis/native-simulation/results'});
 return {evidence:[...old.evidence,...fresh.evidence],instructions:[...old.instructions,...fresh.instructions]};
}
export async function initializeStaticSpherePrimitiveTables(machine) {
 const sqrt=JSON.parse(await readFile('src/sqrt-table.json','utf8'));
 sqrt.values.forEach((value,index)=>machine.bytes.writeUInt16LE(value,0x5eb290+index*2));
 machine.bytes.writeFloatLE(1,0x5dc774);machine.bytes.writeFloatLE(4096,0x5dca88);
}
