import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createRaceObjectCollisionFixture} from './lib/race-object-collision-fixtures.mjs';
import {filterAnimatedRaceObject, filterShrinkingRaceObject, filterRetiredRaceObject, removeRaceObjectEffect, decrementAuthoredRaceObjectGroups} from '../src/race-object-collision-filters.mjs';

export async function verifyRaceObjectCollisionFilters({fixtures = 240, output} = {}) {
  const program = await loadRetainedNativeProgram({directories: ['analysis/scene/results', 'analysis/native-simulation/results', 'analysis/scripted-world-filters-elevated-20261022/results']});
  const machine = new BoundedX86(program.instructions), reached = new Set(), calls = new Map();
  let steps = 0, operations = 0;
  machine.onInstruction = address => {reached.add(address); if ([0x435ba0, 0x474850, 0x4284d0, 0x44ef90, 0x412520, 0x48abc0].includes(address)) calls.set(address, (calls.get(address) ?? 0) + 1);};
  machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX >>> 0, m.bytes.readUInt32LE(0x5e8890)));
  for (let index = 0; index < fixtures; index++) for (const [entry, implementation, kind] of [[0x40fcb0, filterAnimatedRaceObject, 25], [0x40fdb0, filterShrinkingRaceObject, 31], [0x40fe30, filterRetiredRaceObject, 35], [0x48abc0, removeRaceObjectEffect, 25], [0x412520, decrementAuthoredRaceObjectGroups, 25]]) {
    const f = createRaceObjectCollisionFixture(program, index, {kind, scripted: index % 2 === 0}), {memory, body, put, runtime} = f;
    if (index % 3 === 0) {put(0x6e6518, 0); put(0x82e888, body + 0x30000);}
    if (index % 5 === 0) memory[f.fixtureAddresses.groups + 15] = 0;
    machine.reset(); memory.copy(machine.bytes); machine.entry = entry; machine.r.ESP = runtime.scratchBase;
    machine.r.ECX = body; machine.bytes.writeInt32LE(-1, runtime.scratchBase); machine.bytes.writeInt32LE(body, runtime.scratchBase + 4);
    const result = implementation(body, runtime); steps += machine.run(3_000_000); operations++;
    if (entry < 0x410000) assert.equal(machine.r.EAX, result);
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
    if (!native.equals(source)) {const offset = native.findIndex((value, i) => value !== source[i]); assert.fail(`0x${entry.toString(16)} fixture${index} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${source[offset]}`);}
  }
  const report = {method: 'Actual40fcb0/40fdb0/40fe30 collision callbacks,48abc0 targeting-list swap removal and412520 authored-group decrement versus retained x86. Actual effect pools, shape/physical/spatial removal, attachment release, particle/debris/RNG and empty-bank sound guards; no game callbacks replaced. All mapped bytes>=10000h compared after each operation; private ABI stack excluded. Synthetic constructed native pools, not original-process execution.',
    targetSHA256: program.sha256, fixtures, operations, instructionSteps: steps, reachedInstructions: reached.size, calls: Object.fromEntries([...calls].map(([address, count]) => [`0x${address.toString(16)}`, count])),
    evidence: program.references.filter(reference => reference.path.includes('scripted-world-filters-elevated-20261022')), matched: true};
  if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [output] = process.argv.slice(2); if (!output) throw Error('Usage: node tools/verify-race-object-collision-filters.mjs NEW_REPORT_JSON');
  console.log(JSON.stringify(await verifyRaceObjectCollisionFilters({output})));
}
