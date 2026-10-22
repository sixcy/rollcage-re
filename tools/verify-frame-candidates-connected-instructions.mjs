import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readFrameCandidateConnectedEvidence} from './lib/frame-candidate-connected-evidence.mjs';
import {createConnectedFrameCandidateFixture, frameCandidateAddresses as a} from './lib/frame-candidate-runtime-fixtures.mjs';
import {buildFrameCandidates} from '../src/frame-candidates.mjs';

const program = await readFrameCandidateConnectedEvidence(), machine = new BoundedX86(program.instructions);
const fixtures = 1200; let instructionSteps = 0, terrainCandidates = 0, modelCandidates = 0, planeCalls = 0, pointCalls = 0, edgeCalls = 0, regionCalls = 0, modelCalls = 0, spatialCalls = 0, outsideState16 = 0, aliasingBodies = 0, overrunWrites = 0;
let terrainWriteCount = 0;
machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)));
machine.onInstruction = address => {if (address === 0x428aa0) regionCalls++; if (address === 0x429360) modelCalls++; if (address === 0x4286e0) spatialCalls++; if (address === 0x4292a0) planeCalls++; if (address === 0x422230) pointCalls++; if (address === 0x422680) edgeCalls++; if (address === 0x429008 || address === 0x4291e8) terrainWriteCount++;};
for (let fixture = 0; fixture < fixtures; fixture++) {
  const {memory, views, bodies, arena, options, count} = createConnectedFrameCandidateFixture(fixture); program.initialize(memory); machine.reset(); memory.copy(machine.bytes); machine.fpuRounding = 'nearest-even';
  const result = buildFrameCandidates(bodies, options); terrainWriteCount = 0;
  machine.entry = 0x4287f0; machine.r.ESP = 0x9000; machine.bytes.writeUInt32LE(0xffffffff, 0x9000);
  try {
    instructionSteps += machine.run(2000000);
    for (const [address, length] of [...a.bodies.map(address => [address, 0x4000]), [a.records, 256 * 72], [a.arena, 2048 * 16], [a.list, 32], [a.sectors, 0xd000], [0x200000, 0x60000], [0x902bc0, 8], [0x91e788, 4]]) if (!machine.bytes.subarray(address, address + length).equals(memory.subarray(address, address + length))) {const offset = machine.bytes.subarray(address, address + length).findIndex((value, index) => value !== memory[address + index]); assert.fail(`fixture${fixture}/0x${(address + offset).toString(16)} native${machine.bytes[address + offset]} JS${memory[address + offset]}`);}
  } catch (error) {console.error({fixture, count, bodyCounts: bodies.map(body => ({terrain: body.terrainWord15c, model: body.modelCandidateCount15e, terrainOffset: body.terrainCandidateOffset154, modelOffset: body.modelCandidateOffset158})), terrainWriteCount}); throw error;}
  for (const [index, body] of bodies.entries()) {terrainCandidates += body.terrainWord15c; modelCandidates += body.modelCandidateCount15e; outsideState16 += body.collisionState128 === 16; if (index + 1 < bodies.length && body.modelCandidateCount15e > (bodies[index + 1].modelCandidateOffset158 - body.modelCandidateOffset158) / 16) aliasingBodies++;}
  if (terrainWriteCount > bodies.reduce((sum, body) => sum + body.terrainWord15c, 0)) overrunWrites++;
  if (count) {const last = bodies.at(-1), delta = last.flags & 0x200 || (last.flags & 511) === 4 ? 0 : last.terrainWord15c * 16; assert.equal(result.cursor, last.modelCandidateOffset158 + delta);}
  assert.equal(arena, views.candidateArena);
}
const report = {method: 'Complete4287f0 terrain/model two-pass candidate parent on shared native body/shape/candidate views with ACTUAL4286e0/4746f0 spatial lookup,428aa0 terrain region appends,429360 model appends,429600 model acceptance,4292a0 planes and full point/edge/quadratic/normalization/root descendants. Only checked compiler-cookie service external. Actual parsed authored spatial row/map/node bytes and declared synthetic terrain/model/instance producer inputs mapped to same rawmemory. Full body/aggregate/retained candidate arena plus unchanged geometry/settings/list/roots compared; native scratch-only primitive locals/globals are not source outputs. Native model cursor advances byterrainword15c; overlaps retained. No original process execution.', evidence: program.evidence.map(item => item.evidence_id), instructions: program.instructions.length, fixtures, instructionSteps, terrainCandidates, modelCandidates, planeCalls, pointCalls, edgeCalls, regionCalls, modelCalls, spatialCalls, outsideState16, aliasingBodies, overrunWrites, matched: true};
await writeFile('analysis/frame-candidates-connected-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
