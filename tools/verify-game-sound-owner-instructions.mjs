import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createGameAudioCopyServices} from './lib/game-audio-copy-fixtures.mjs';
import {constructGameSoundOwner, appendGameSoundOwner, growGameSoundOwners, chooseGameSoundOwnerCapacity, reserveGameSoundOwners} from '../src/game-sound-owner.mjs';

const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), memory = Buffer.alloc(0xa00000);
const get = (m, p) => m.readInt32LE(p), ptr = (m, p) => m.readUInt32LE(p), put = (m, p, v) => m.writeInt32LE(v | 0, p);
const S = 0x1f000, INPUT = 0x110000, ARRAY = 0x160000, EXTERNAL = 0x170000, MANAGER = 0x180000;
const entries = [0x40d7d0, 0x40ec20, 0x40ee30, 0x40f170, 0x40f1b0], fixtures = Number(process.argv[2] ?? 1800), reached = new Set(), visits = {};
const returns = new Map([[0x40d8d2, 0x40d8d8], [0x40d8e8, 0x40d8ee], [0x40d909, 0x40d90f], [0x40d852, 0x40d858], [0x40d87f, 0x40d882], [0x40f1cc, 0x40f1d2], [0x40f1f5, 0x40f1fb], [0x40f213, 0x40f219]]);
machine.entries.delete(0x4a7710); //Explicit unfinished game factory contract, not a CRT import.
machine.onInstruction = address => {reached.add(address); if (entries.includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1; if (returns.has(address)) put(machine.bytes, machine.r.ESP - 4, returns.get(address));};
let steps = 0, factoryContracts = 0, nullWrappers = 0, allocations = 0, mutatingInputs = 0;
function world(m, variant, selector, object) {
  const calls = [], copies = createGameAudioCopyServices(m);
  return {calls, services: {libraryCall(name, args, context) {
    calls.push([name, ...args, context.scratchBase]);
    if (['strncpy_s', 'wcsncpy_s'].includes(name)) return copies.libraryCall(name, args, context);
    if (name === 'operatorNew') {
      put(m, EXTERNAL, variant ^ 0x12345678);
      if (selector === 0) {put(m, 0x714b08, MANAGER + 0x1000); put(m, object + 0x484, 0x76543210); if (variant % 4 === 0) return 0;}
      m.fill(0xcd, 0x300000, 0x300000 + args[0] + 16); return 0x300000;
    }
    if (name === 'operatorDelete') {if (variant % 7 === 0) {put(m, 0x6f2414, 0x150000); put(m, 0x6f2418, 0x150000);} return 0;}
    if (name === 'memmove') {Buffer.from(m.subarray(args[1], args[1] + args[2])).copy(m, args[0]); if (variant % 5 === 0) put(m, 0x6f2418, get(m, 0x6f2418) + 4); return args[0];}
    throw Error(`Unexpected sound-owner CRT ${name}`);
  }}, factory(request, context) {
    calls.push(['GAME sample factory', request.thisAddress, request.virtualAddress, request.arguments, context.scratchBase, context.entryRegisters.EBX, context.entryRegisters.ESI, context.entryRegisters.EDI]);
    put(m, 0x714b08, MANAGER); put(m, object + 0x480, 0x11112222); put(m, 0x300004, 0x33334444);
    return variant % 3 ? 0x190000 + variant * 4 : 0;
  }};
}
for (let fixture = 0; fixture < fixtures; fixture++) {
  memory.fill(0); program.initializeMemory(memory); memory.fill(0x57, S - 1024, S + 128); put(memory, S, -1);
  const selector = fixture % entries.length, variant = Math.floor(fixture / entries.length), object = [0x100000, INPUT, INPUT + 4, 0][variant % 4];
  for (let i = 0; i < 0x460; i++) memory[INPUT + i] = i + variant & 255;
  memory.write('SFX_OWNER\0', INPUT); memory.write('BANK\0', INPUT + 24); memory.write('Owner.wav\0', INPUT + 48, 'utf16le');
  for (const manager of [MANAGER, MANAGER + 0x1000]) put(memory, manager, 0x5d4190); put(memory, 0x5d41a4, 0x4a7710); put(memory, 0x714b08, MANAGER);
  const length = variant % 8, start = variant % 11 ? ARRAY : 0, end = start ? start + length * 4 : 0, capacity = end + (variant % 3 === 0 ? 8 : 0);
  put(memory, 0x6f2414, start); put(memory, 0x6f2418, end); put(memory, 0x6f241c, capacity); put(memory, EXTERNAL, 0x24681357);
  for (let i = 0; i < 12; i++) put(memory, ARRAY + i * 4, variant * 100 + i);
  if (selector === 3 && variant % 4 === 0) {put(memory, 0x6f2414, 0); put(memory, 0x6f241c, 0xfffffff8);}
  const registers = {EBX: 0x212121 + fixture, EBP: 0x323232 + fixture, ESI: 0x434343 + fixture, EDI: 0x545454 + fixture};
  let args = [], result;
  if (selector === 0) args = [0x12345678, INPUT];
  else if (selector === 1) args = [start && length && variant % 2 ? ARRAY + (variant % length) * 4 : EXTERNAL];
  else if (selector === 2) args = [end];
  else if (selector === 3) args = [[0, 1, 17, 0x3fffffff][variant % 4]];
  else args = [[0, 4, 17][variant % 3]];
  args.forEach((v, i) => put(memory, S + 4 + i * 4, v));
  for (const [slot, address] of [[0x56e220, 0x760000], [0x56e210, 0x760010], [0x56e21c, 0x760020], [0x56e47c, 0x760030], [0x56e478, 0x760040]]) put(memory, slot, address);
  machine.reset(); machine.fs0 = 0x12345678; memory.copy(machine.bytes); machine.entry = entries[selector]; machine.r.ESP = S; machine.r.ECX = object; Object.assign(machine.r, registers);
  const source = world(memory, variant, selector, object), native = world(machine.bytes, variant, selector, object);
  for (const [address, name, count] of [[0x760000, 'operatorNew', 1], [0x760010, 'operatorDelete', 1], [0x760020, 'strncpy_s', 4], [0x760030, 'wcsncpy_s', 4], [0x760040, 'memmove', 3]]) machine.externalCalls.set(address, state => {
    state.r.EAX = native.services.libraryCall(name, Array.from({length: count}, (_, i) => ptr(state.bytes, state.r.ESP + i * 4)), {scratchBase: state.r.ESP - 4});
  });
  machine.externalCalls.set(0x4a7710, state => {
    const words = Array.from({length: 7}, (_, i) => ptr(state.bytes, state.r.ESP + i * 4));
    state.r.EAX = native.factory({thisAddress: state.r.ECX >>> 0, virtualAddress: 0x4a7710, descriptor: words[0], arguments: words}, {scratchBase: state.r.ESP - 4, entryRegisters: state.r}); state.r.ESP += 28;
  });
  const runtime = {memory, scratchBase: S, entryRegisters: registers, sehWord: 0x12345678, services: source.services, handlers: {soundManagerSample: source.factory}};
  try {
    if (selector === 0) result = constructGameSoundOwner(object, ...args, runtime);
    else if (selector === 1) appendGameSoundOwner(args[0], runtime);
    else if (selector === 2) growGameSoundOwners(args[0], runtime);
    else if (selector === 3) result = chooseGameSoundOwnerCapacity(args[0], runtime);
    else reserveGameSoundOwners(args[0], runtime);
    steps += machine.run(100000); assert.equal(machine.fs0, 0x12345678); if (result !== undefined) assert.equal(machine.r.EAX >>> 0, result >>> 0); assert.deepEqual(native.calls, source.calls);
    if (!memory.equals(machine.bytes)) {const p = memory.findIndex((value, i) => value !== machine.bytes[i]); assert.fail(`byte0x${p.toString(16)} native${machine.bytes.subarray(p, p + 16).toString('hex')} source${memory.subarray(p, p + 16).toString('hex')}`);}
  } catch (error) {console.error({fixture, entry: entries[selector].toString(16), variant, object, args, source: source.calls, native: native.calls}); throw error;}
  allocations += source.calls.filter(([name]) => name === 'operatorNew').length; factoryContracts += source.calls.filter(([name]) => name === 'GAME sample factory').length;
  nullWrappers += Number(selector === 0 && variant % 4 === 0); mutatingInputs += Number(selector === 1 && source.calls.some(([name]) => name === 'operatorNew'));
}
const path = 'src/game-sound-owner.mjs', report = {matched: true, method: 'Actual40d7d0 sound-owner policy with actual40d8c0 descriptor copy and an explicitly state-mutating GAME samplefactory4a7710 contract. That constructor proof does not close the factory/device/sample graph. Actual40ec20/40ee30/40f170/40f1b0 global sound-owner vector methods execute without game contracts, using only genuine CRT allocation/copy/delete services. Whole10MiB memory includes low/null/descriptor overlap and every native stack byte; EAX, TLS restoration and ordered service/callee ESP/register/argument words compare. Fixtures mutate live append inputs, vector globals during memmove/delete, manager root during allocation and owner fields during samplefactory. Declared valid-capacity secure-copy service conventions are not original CRT internals. No original process execution.', fixtures, instructionSteps: steps, reachedInstructions: reached.size, visits, factoryContracts, nullWrappers, allocations, mutatingInputs, source: {path, sha256: createHash('sha256').update(await readFile(path)).digest('hex')}, targetSha256: program.sha256};
const output = process.argv[3] ?? 'analysis/game-sound-owner-default-factory-instruction-check.json';
try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}
console.log(JSON.stringify(report));
