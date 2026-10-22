import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram, REDUX_SHA256} from './lib/retained-native-program.mjs';
import {createRawScriptFixture} from './lib/raw-scripted-motion-fixtures.mjs';
import {filterScriptedCollision, emitScriptedCollisionDebris, createScriptedCollisionFilter} from '../src/scripted-collision-filter.mjs';
import {releaseRawScriptedBody} from '../src/raw-scripted-motion.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {filterCollisionEvent} from '../src/collision-events.mjs';
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);

export async function readScriptedFilterInstructions() {
  const carrier = JSON.parse(await readFile('analysis/scripted-collision-filter-instructions.json', 'utf8'));
  assert.equal(carrier.targetSha256, REDUX_SHA256);
  const bytesRecord = JSON.parse(await readFile('analysis/native-simulation/results/1285-script-filter-bytes.json', 'utf8')).structuredContent;
  assert.equal(bytesRecord.subject.digest.sha256, REDUX_SHA256);
  const bytes = Buffer.from(bytesRecord.normalized_result.bytes_hex, 'hex'), instructions = [], evidence = [];
  assert.equal(carrier.start, 0x46e470); let expectedAddress = carrier.start;
  for (const reference of carrier.evidence) {
    const record = JSON.parse(await readFile(reference.path, 'utf8')).structuredContent, n = record.normalized_result;
    assert.equal(record.evidence_id, reference.evidence); assert.equal(record.operation, 'inspect_native_instruction'); assert.equal(record.subject.digest.sha256, REDUX_SHA256); assert.equal(n.status, 'decoded');
    const address = Number(n.address); assert.equal(address, expectedAddress); assert(Number.isInteger(n.length) && n.length > 0); expectedAddress += n.length;
    assert.equal(bytes.subarray(address - carrier.start, address - carrier.start + n.length).toString('hex'), n.bytes.toLowerCase());
    instructions.push({address, op: n.mnemonic.toUpperCase(), args: n.operands.map(item => item.raw)}); evidence.push(record.evidence_id);
  }
  assert.equal(instructions[0].address, 0x46e470); assert.equal(instructions.at(-1).op, 'RET'); assert.equal(instructions.length, 34); assert.equal(expectedAddress, 0x46e4d5);
  for (const instruction of instructions) if (instruction.op.startsWith('J')) assert(instructions.some(item => item.address === Number(instruction.args[0])), 'Every filter branch lands on an admitted boundary.');
  return {instructions, evidence: [...evidence, bytesRecord.evidence_id]};
}

export async function verifyScriptedCollisionFilter({fixtures = 2400, chainFixtures = 120, output = 'analysis/scripted-collision-filter-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), listing = await readScriptedFilterInstructions(), instructions = [...program.instructions, ...listing.instructions], machine = new BoundedX86(instructions), visits = new Map(), executed = new Set();
  machine.onInstruction = address => {executed.add(address); if ([0x46e4e0, 0x474b20, 0x46e470, 0x46e760, 0x475c30, 0x474670].includes(address)) visits.set(address, (visits.get(address) ?? 0) + 1);};
  let steps = 0, emitted = 0, rngSamples = 0;
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const f = createRawScriptFixture({memory: program.initializeMemory(Buffer.alloc(0xa00000)), freeCount: fixture % 4 ? 16 : 0}), {memory, body, addresses: a} = f;
    const event = fixture % 13 === 0 ? body + 0x30 : fixture % 17 === 0 ? 0x5ec8fc : 0x70000, other = fixture % 3 === 0 ? body : 0;
    for (const [index, offset] of [0x2c, 0x30, 0x34].entries()) put(memory, event + offset, (fixture % 11 - 5 + index) * 256);
    for (const [index, offset] of [0x5c, 0x60, 0x64].entries()) put(memory, event + offset, [0, 0x2ffff, 0x30000, -0x30000, -2147483648][(fixture + index) % 5]);
    put(memory, body + 0x68, (fixture % 7 - 3) * 65536); put(memory, body + 0x70, (fixture % 11 - 5) * 65536);
    const seed = [0, 1, 2, 3, 0x7fffffff, -1, 0x12345678][fixture % 7]; put(memory, 0x5ec958, seed);
    machine.reset(); memory.copy(machine.bytes);
    if (fixture % 5) {
      const expected = filterScriptedCollision(body, other, event, f); machine.entry = 0x46e470;
      put(machine.bytes, a.stack + 4, body); put(machine.bytes, a.stack + 8, other); put(machine.bytes, a.stack + 12, event);
      machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); steps += machine.run(1_000_000); assert.equal(machine.r.EAX, expected);
    } else {
      emitScriptedCollisionDebris(body, event + 12, 22, f); machine.entry = 0x46e760; machine.r.ECX = body; machine.r.EDX = event + 12; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); put(machine.bytes, a.stack + 4, 22); steps += machine.run(1_000_000);
    }
    for (const [address, length] of [[body, 0x800], [event, 0x68], [a.debris, 32 * 128], [a.free, 512], [a.bucket, 12], [0x902b7c, 20], [0x5ec958, 4]]) if (!machine.bytes.subarray(address, address + length).equals(memory.subarray(address, address + length))) {const offset = machine.bytes.subarray(address, address + length).findIndex((value, i) => value !== memory[address + i]); assert.fail(`fixture${fixture}/byte0x${(address + offset).toString(16)} native${machine.bytes[address + offset]} source${memory[address + offset]}`);}
    emitted += memory.readUInt32LE(0x902b88); if (memory.readInt32LE(0x5ec958) !== seed) rngSamples++;
  }
  for (let fixture = 0; fixture < chainFixtures; fixture++) {
    const f = createRawScriptFixture({memory: program.initializeMemory(Buffer.alloc(0xa00000))}), {memory, body, addresses: a} = f, eventAddress = 0x70000, delta = 0x71000;
    for (const [index, offset] of [0x34, 0x38, 0x3c].entries()) put(memory, body + offset, (fixture % 9 + index - 4) * 65536);
    put(memory, body + 0x118, 0); put(memory, 0x5ec958, fixture * 31 + 1);
    machine.reset(); memory.copy(machine.bytes);
    assert.equal(releaseRawScriptedBody(body, f), 1); machine.entry = 0x46e4e0; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); put(machine.bytes, a.stack + 4, body); steps += machine.run(1_000_000);
    assert.equal(memory.readUInt32LE(body + 0x148), 0x46e470); assert.equal(machine.bytes.readUInt32LE(body + 0x148), 0x46e470);
    for (const bytes of [memory, machine.bytes]) {
      put(bytes, eventAddress + 4, body); put(bytes, eventAddress + 8, 0); put(bytes, eventAddress + 0x5c, 0x30000);
      for (const [index, offset] of [0x2c, 0x30, 0x34].entries()) put(bytes, eventAddress + offset, (fixture % 7 + index - 3) * 256);
      put(bytes, delta, 65536);
    }
    const filters = new Map([[0x46e470, createScriptedCollisionFilter({...f, scratchBase: a.stack - 28})]]), views = createPhysicsRuntimeViews({memory, bodyStorage: [{address: body, length: 0x800}], bodyLists: [], collisionFilters: filters});
    assert.equal(filterCollisionEvent(views.eventAt(eventAddress), 65536), 65536);
    machine.entry = 0x474b20; machine.r.ECX = eventAddress; machine.r.EDX = delta; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); steps += machine.run(1_000_000);
    //The callback is installed by the real release and consumed through the
    //real event-filter caller; all mapped state above private stack compares.
    if (!machine.bytes.subarray(0x10000).equals(memory.subarray(0x10000))) {const offset = machine.bytes.subarray(0x10000).findIndex((value, i) => value !== memory[0x10000 + i]); assert.fail(`chain${fixture}/byte0x${(0x10000 + offset).toString(16)}`);}
  }
  const report = {method: 'Actual pointer-installed46e470 callback reconstructed from exact Listing decodes independently byte-matched to1285 (provider has no analyzed procedure), plus actual46e760 and475c30 debris/free-active/spatial descendants. Additional chains run actual46e4e0 release→pointer publication→474b20 event filter→46e470 through coherent physics views, comparing every mapped byte above private stack. No game/library calls mocked and no external services admitted. Compares event/body/debris/free-active/spatial/RNG bytes, unsigned INT_MIN impulse threshold, other-body early acceptance, RNG suppression, exhausted pool and body/event/RNG aliases. Synthetic caller-owned runtime storage and absent sound bank in release chains; no original-process or complete4749e0 claim.', targetSha256: REDUX_SHA256, evidence: [...program.references.map(item => item.evidence), ...listing.evidence], availableRetainedInstructions: instructions.length, executedInstructions: executed.size, fixtures, chainFixtures, emitted, rngSamples, instructionSteps: steps, actualGameCalls: Object.fromEntries([...visits].map(([address, count]) => [`0x${address.toString(16)}`, count])), matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {const {evidence, ...summary} = await verifyScriptedCollisionFilter(); console.log(JSON.stringify(summary));}
