import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createGameImageServices, bindGameImageServices} from './lib/game-image-fixtures.mjs';
import {createGameImageAsyncFixtures} from './lib/game-image-async-fixtures.mjs';
import {setGameImageMasks} from '../src/game-image-format.mjs';
import {constructGameImageTask, appendGameImageJob, waitGameImageJobs, releaseGameImageJobs} from '../src/game-image-jobs.mjs';

export async function verifyGameImageJobs({fixtures = 240, output = 'analysis/game-image-jobs-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), instructions = program.instructions.filter(i => i.address !== 0x4bde50), machine = new BoundedX86(instructions), worker = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000), S = 0x9000, SOURCE = 0x100000, TARGET = 0x110000, FUTURE = 0x130000, FUNCTION = 0x130010, THIS = 0x130014, PARAMETERS = 0x131000, VECTOR = 0x140000; let steps = 0, operations = 0, workerCalls = 0; const reached = new Set(); machine.onInstruction = worker.onInstruction = address => reached.add(address); worker.bytes = machine.bytes;
  const put = (m, p, v) => m.writeInt32LE(v | 0, p);
  for (let fixture = 0; fixture < fixtures; fixture++) {
    memory.fill(0); program.initializeMemory(memory); memory.fill(0x36, 0x1000, S + 128); put(memory, FUNCTION, 0x4bd770); put(memory, THIS, SOURCE);
    for (const [image, data, bits] of [[SOURCE, 0x200000, 32], [TARGET, 0x300000, fixture & 1 ? 16 : 32]]) {put(memory, image + 4, data); put(memory, image + 8, 8); put(memory, image + 12, 4); put(memory, image + 0x44, bits); setGameImageMasks(image, -1, -1, -1, -1, {memory, scratchBase: S});}
    for (let i = 0; i < 128; i++) memory[0x200000 + i] = i * 19 + fixture & 255;
    machine.reset(); machine.fs0 = 0; memory.copy(machine.bytes); const nativeCrt = createGameImageServices(machine.bytes); bindGameImageServices(machine, nativeCrt); machine.bytes.copy(memory); const crt = createGameImageServices(memory), sourceAsync = createGameImageAsyncFixtures(memory), runtime = {memory, scratchBase: S, services: {...crt, ...sourceAsync}};
    const nativeAsync = createGameImageAsyncFixtures(machine.bytes, {execute(captured, stack) {worker.r = Object.fromEntries(['EAX', 'EBX', 'ECX', 'EDX', 'EBP', 'ESI', 'EDI', 'ESP'].map(r => [r, 0])); worker.scalars = {}; worker.doubleScalars.clear(); worker.integerVectors.clear(); worker.zeroVectors.clear(); worker.qwords.clear(); worker.x87 = []; worker.entry = captured.functionAddress; worker.r.ECX = captured.thisAddress; worker.r.ESP = stack; put(worker.bytes, stack, -1); captured.arguments.forEach((v, i) => put(worker.bytes, stack + 4 + i * 4, v)); steps += worker.run(1000000); workerCalls++;}});
    machine.externalCalls.set(0x4bde50, m => {const fnPointer = m.bytes.readUInt32LE(m.r.ESP), sourcePointer = m.bytes.readUInt32LE(m.r.ESP + 4), parameters = m.bytes.readUInt32LE(m.r.ESP + 8); nativeAsync.stlAsyncConstruct({futureAddress: m.r.ECX >>> 0, functionAddress: m.bytes.readUInt32LE(fnPointer), thisAddress: m.bytes.readUInt32LE(sourcePointer), arguments: Array.from({length: 9}, (_, i) => m.bytes.readInt32LE(parameters + i * 4))}, {scratchBase: m.r.ESP - 4}); m.r.EAX = m.r.ECX;});
    machine.externalCalls.set(nativeAsync.WAIT, m => {nativeAsync.stlFutureWait({stateAddress: m.r.ECX >>> 0, thisAddress: m.r.ECX >>> 0, virtualAddress: nativeAsync.WAIT}, {scratchBase: m.r.ESP - 4});});
    machine.externalCalls.set(nativeAsync.DESTROY, m => {nativeAsync.stlFutureDestroy({stateAddress: m.r.ECX >>> 0, thisAddress: m.r.ECX >>> 0, virtualAddress: nativeAsync.DESTROY, argument: m.bytes.readUInt32LE(m.r.ESP)}, {scratchBase: m.r.ESP - 4}); m.r.ESP += 4;});
    const compare = label => {const native = machine.bytes.subarray(0x10000), actual = memory.subarray(0x10000); if (!native.equals(actual)) {const offset = native.findIndex((v, i) => v !== actual[i]); assert.fail(`fixture${fixture}/${label} diff0x${(offset + 0x10000).toString(16)} native${native[offset]} source${actual[offset]}`);}};
    const run = (entry, ecx, args = []) => {machine.entry = entry; machine.r.ECX = ecx; machine.r.ESP = S; put(machine.bytes, S, -1); args.forEach((v, i) => put(machine.bytes, S + 4 + i * 4, v)); steps += machine.run(2000000); operations++; compare(entry.toString(16));};
    for (let index = 0; index < fixture % 4 + 1; index++) {
      const args = [11, 22, 8, 4, index, 1, 2, 0, TARGET]; args.forEach((v, i) => {put(memory, PARAMETERS + i * 4, v); put(machine.bytes, PARAMETERS + i * 4, v);}); constructGameImageTask(FUTURE, FUNCTION, THIS, PARAMETERS, runtime); run(0x4bddf0, FUTURE, [FUNCTION, THIS, PARAMETERS]); appendGameImageJob(VECTOR, FUTURE, runtime); run(0x4bdbc0, VECTOR, [FUTURE]);
    }
    put(memory, PARAMETERS + 16, 99); put(machine.bytes, PARAMETERS + 16, 99); waitGameImageJobs(VECTOR, runtime); run(0x4c1310, VECTOR); releaseGameImageJobs(VECTOR, runtime); run(0x4bdc60, VECTOR); assert.deepEqual(sourceAsync.calls, nativeAsync.calls, `fixture${fixture} orderedSTLservices`);
  }
  const report = {fixtures, operations, workerCalls, instructionSteps: steps, reachedInstructions: reached.size, matched: true, admittedLibraryRoots: ['4bde50 std::async/future construction', 'opaqueSTLfuture virtualawait/destruction'], schedule: 'Explicit serialized fixture schedule at await, with actual captured4bd770 callbacks and separateprivateworkerESP4000. Not original concurrent runtime evidence.'}; if (output) await writeFile(output, JSON.stringify(report, null, 2)); return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyGameImageJobs()));
