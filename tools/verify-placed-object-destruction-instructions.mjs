import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createPlacedDestructionFixture} from './lib/placed-destruction-fixtures.mjs';
import {preparePlacedObjectDestruction, updatePlacedObjectDestruction} from '../src/placed-object-destruction.mjs';
import {queueDestroyedPlacedObjects} from '../src/placed-object-damage.mjs';
import {initializeWorldFragments} from '../src/world-fragment-registry.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';

export async function verifyPlacedObjectDestruction({fixtures = 64, withRaceUpdate = false, output = 'analysis/placed-object-destruction-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), STACK = 0x9000, reached = new Set(), calls = new Map();
  let steps = 0, operations = 0, completedObjects = 0, wrappedQueues = 0, dependentChains = 0, retainedFourthShortCases = 0;
  const outer = await readInstructionEvidence(['310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const contracts = withRaceUpdate ? [...new Set(outer.instructions.filter(i => i.op === 'CALL' && /^0x/.test(i.args[0])).map(i => Number(i.args[0])))].filter(p => p !== 0x415230) : [];
  const handlers = Object.fromEntries(contracts.map(p => [`call${p.toString(16)}`, () => 0])); handlers.audioManagerCall = () => 0;
  for (const p of contracts) {machine.entries.delete(p); machine.externalCalls.set(p, m => {m.r.EAX = 0;});}
  machine.externalCalls.set(0x7e0000, m => {m.r.ESP += 4; m.r.EAX = 0;});
  const prepareOuter = memory => {if (withRaceUpdate) {memory.writeInt32LE(0x5a100, 0x714b08); memory.writeInt32LE(0x5a200, 0x5a100); memory.writeInt32LE(0x7e0000, 0x5a25c);}};
  const update = runtime => withRaceUpdate ? runRaceUpdate(0, 1, {...runtime, handlers}) : updatePlacedObjectDestruction(runtime);
  machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX >>> 0, m.bytes.readUInt32LE(0x5e8890)));
  machine.externalCalls.set(0x568a50, m => {const dest = m.bytes.readUInt32LE(m.r.ESP), count = m.bytes.readUInt32LE(m.r.ESP + 8); m.bytes.fill(m.bytes[m.r.ESP + 4], dest, dest + count); m.r.EAX = dest;});
  const tracedCalls = new Set([0x415230, 0x421f60, 0x480760, 0x415190, 0x435f20, 0x475a10, 0x44f910, 0x480bf0, 0x437aa0, 0x484bb0, 0x44ef90, 0x436490, 0x474600, 0x474850, 0x432680, 0x433400, 0x4334b0, 0x492b50, 0x492c00]);
  machine.onInstruction = address => {reached.add(address); if (tracedCalls.has(address)) calls.set(address, (calls.get(address) ?? 0) + 1);};
  const execute = (entry, ecx = 0) => {machine.entry = withRaceUpdate && entry === 0x415230 ? 0x450e50 : entry; machine.r.ECX = ecx; machine.r.ESP = STACK; machine.r.EDX = 0; machine.bytes.writeInt32LE(-1, STACK); if (withRaceUpdate && entry === 0x415230) machine.bytes.writeInt32LE(1, STACK + 4); steps += machine.run(3000000); operations++;};
  const compare = (memory, label) => {const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000); if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`${label} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${source[offset]}`);}};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const f = createPlacedDestructionFixture(program, fixture), {memory, put, word} = f, row = f.destructionAddresses.auxiliary, object = 0x250000, model = 0x200000;
    put(0x91f1a4, row); put(0x91f1ac, object); put(0x91f1a8, model); put(row + 4, object); put(0x5ea4dc, 0);
    if (fixture % 8 === 0) {word(model + 6, 260); memory.fill(0xa5, f.destructionAddresses.workspace, f.destructionAddresses.workspace + 0x1000);}
    if (fixture % 3 === 0) {put(object + 0x24, f.destructionAddresses.workspace - 4); for (let index = 0; index < 300; index += 4) put(f.destructionAddresses.workspace - 4 + index, 0x12340000 + index);}
    prepareOuter(memory); machine.reset(); memory.copy(machine.bytes);
    for (let tick = 0; tick < 3; tick++) {assert.equal(preparePlacedObjectDestruction({memory}), tick === 2 ? 1 : 0); execute(0x421f60); compare(memory, `prepare${fixture}/${tick}`);}
    if (fixture % 2) {
      // Deliberately retained face flags isolate a descriptor transition whose
      // fourth short still comes from the actual480760 quaternion producer.
      const flags = memory.readUInt32LE(row + 0xa0), count = memory.readUInt16LE(model + 6);
      memory.fill(5, flags, flags + count); machine.bytes.fill(5, flags, flags + count);
      memory.writeUInt16LE(4, row + 2); machine.bytes.writeUInt16LE(4, row + 2);
      update({memory, scratchBase: STACK}); execute(0x415230); compare(memory, `retainedFourthShort${fixture}`);
      assert.equal(memory.readUInt16LE(0x91d3ea), memory.readUInt16LE(STACK - (withRaceUpdate ? 20 : 0) - 0xd2));
      retainedFourthShortCases++;
    }
  }
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const f = createPlacedDestructionFixture(program, fixture, {initialize: false}), {memory} = f, runtime = {memory, scratchBase: STACK};
    const allocate = f.allocate(); machine.externalCalls.set(0x5a000, m => {m.r.EAX = allocate(m.bytes.readUInt32LE(m.r.ESP));});
    prepareOuter(memory); machine.reset(); memory.copy(machine.bytes);
    initializeWorldFragments({...runtime, allocate: f.allocate()}); execute(0x480760); compare(memory, `constructor${fixture}`);
    memory[memory.readUInt32LE(0x5ecb1c) + 0x58c] = 2; machine.bytes[memory.readUInt32LE(0x5ecb1c) + 0x58c] = 2;
    if (fixture % 2) {
      for (let index = 0; index < 3; index++) {const current = 0x250000 + index * 0x1000, next = current + 0x1000; memory.writeUInt32LE(next, current + 0x19c); machine.bytes.writeUInt32LE(next, current + 0x19c);}
      dependentChains++;
    }
    if (fixture % 4 === 1) {wrappedQueues++; for (const address of [0x9205d8, 0x9207e1]) {memory[address] = 62; machine.bytes[address] = 62;}}
    queueDestroyedPlacedObjects(0x250000, runtime); execute(0x415190, 0x250000); compare(memory, `queue${fixture}`);
    for (let tick = 0; tick < 48; tick++) {update(runtime); execute(0x415230); compare(memory, `parent${fixture}/${tick}`);}
    const count = fixture % 2 ? 4 : 1;
    for (let index = 0; index < count; index++) {
      const row = f.destructionAddresses.auxiliary + index * 0xa8;
      assert.equal(memory.readUInt16LE(row + 2), 0, `controller${fixture}/${index} must finish`);
      assert.equal(memory.readUInt16LE(row + 0x32), 0);
      assert.equal(memory.readInt32LE(0x9205e4 + memory.readUInt16LE(row + 0x2c) * 8), 0);
      completedObjects++;
    }
  }
  const report = {
    targetSha256: program.sha256,
    method: 'JavaScript references versus retained x86 interpreted by BoundedX86; original process not executed',
    evidence: program.references.filter(reference => /\/(1202-|3001-|3013-|3015-|3016-|3020-|727-)/.test(reference.path)),
    fixtures, withRaceUpdate, otherOuterContracts: contracts.length, operations, instructionSteps: steps, reachedInstructions: reached.size,
    comparison: 'All mapped bytes [0x10000,0xa00000) after every constructor, queue, preparation and parent call. Private stack excluded; consumed stale locals retain actual producer stores.',
    variants: {preparationForwardCopyAliases: Math.ceil(fixtures / 3), faceCount260ByteClearCases: Math.ceil(fixtures / 8), retainedFourthShortCases, dependentChains, wrappedQueues, persistentTicksPerScenario: 48, completedObjects},
    calls: Object.fromEntries([...calls].map(([address, count]) => ['0x' + address.toString(16), count])),
    serviceBoundaries: ['CRT malloc at declared synthetic IAT (sizes0x120/0x2a0/0x2000)', 'CRT memset568a50', 'stack-cookie568162'],
    fixtureInputs: ['Synthetic placed-object geometry and authored config/tag/route-group tables', 'Explicit session camera mode2; separate415190 camera branches are covered by placed-object-damage verifier', 'Empty sound bank exercises actual40ea40 early guard without an audio device', 'Retained original mutable math/effect tables and static phase initializer', 'Actual480760 initialization,415190 queue production and all reached game callees'],
    limits: ['Synthetic mapped-memory execution; no original-process runtime observation', 'Does not construct the complete level loader or render/draw the resulting geometry', ...(withRaceUpdate ? ['Other41 outer game stages and its audio-manager library service are contracts; only the destruction graph and its lower game callees execute fully.'] : [])],
    matched: true,
  };
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyPlacedObjectDestruction()));
