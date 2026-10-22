import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {readStaticSpherePrimitiveEvidence} from './static-sphere-primitive-evidence.mjs';

export async function readFrameCandidateConnectedEvidence() {
  const a = await readInstructionEvidence(['054-frame-candidates-assembly.json', '665-retirement-4286e0-assembly.json', '669-retirement-4746f0-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const b = await readInstructionEvidence(['162-candidate-builder-assembly.json', '184-placed-model-candidates-assembly.json', '187-model-volume-screen-assembly.json', '205-candidate-plane-filter-assembly.json']);
  const c = await readStaticSpherePrimitiveEvidence();
  const evidence = [...a.evidence, ...b.evidence, ...c.evidence], byAddress = new Map();
  for (const item of [...a.instructions, ...b.instructions, ...c.instructions]) {const prior = byAddress.get(item.address); if (prior) assert.deepEqual(item, prior); else byAddress.set(item.address, item);}
  const instructions = [...byAddress.values()].sort((x, y) => x.address - y.address), tables = [];
  for (const name of ['198-model-yaw-table.json']) {const reply = JSON.parse(await readFile(`analysis/scene/results/${name}`, 'utf8')); const item = reply.structuredContent ?? JSON.parse(reply.content.find(v => v.type === 'text').text); evidence.push(item); tables.push(item.normalized_result);}
  const sqrt = JSON.parse(await readFile('src/sqrt-table.json', 'utf8'));
  return {evidence, instructions, initialize(memory) {for (const table of tables) Buffer.from(table.bytes_hex, 'hex').copy(memory, Number(table.address)); sqrt.values.forEach((value, index) => memory.writeUInt16LE(value, 0x5eb290 + index * 2)); memory.writeFloatLE(1, 0x5dc774); memory.writeFloatLE(4096, 0x5dca88);}};
}
