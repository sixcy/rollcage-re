import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createSimulationRuntimeFixture} from './lib/simulation-runtime-fixtures.mjs';
import {constructCameraController} from '../src/camera-construction.mjs';
import {initializeCameraCurveFactorials} from '../src/camera-curve.mjs';
import {updateCamera} from '../src/camera-update.mjs';
import {runRaceUpdate} from '../src/race-update.mjs';

const program = await loadRetainedNativeProgram(), listing = await loadRetainedListing('analysis/camera-mode-listing.json', 'analysis/native-simulation/results/3518-full-camera-code-bytes.json');
const instructions = new Map(program.instructions.map(i => [i.address, i])); for (const i of listing.instructions) instructions.set(i.address, i);
const machine = new BoundedX86([...instructions.values()].sort((a, b) => a.address - b.address)), reached = new Set(), modes = {}, dispatchModes = {}, visits = {};
const STACK = 0x9000, CONTROL = 0x270000, SPAWNS = 0x271000, APP = 0x280000, HEAD = 0x281000, EVENT = 0x290000, TRIGGER = 0x294000, CFG = 0x295000;
const put = (m, p, v) => m.writeInt32LE(v | 0, p), word = (m, p, v) => m.writeUInt16LE(v & 65535, p);
const withRaceUpdate = process.argv.includes('--outer');
const boundaryDomain = process.argv.includes('--boundaries');
const boundaries = [];
if (withRaceUpdate) {
  //Select direct calls from450e50's original procedure alone, not a numeric
  //range that might admit another function's calls.
  const {readInstructionEvidence} = await import('./lib/instruction-evidence.mjs');
  const outer = await readInstructionEvidence(['310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'});
  boundaries.length = 0; boundaries.push(...[...new Set(outer.instructions.filter(i => i.op === 'CALL' && /^0x/.test(i.args[0])).map(i => Number(i.args[0])))].filter(address => address !== 0x4180a0 && address !== 0x41bef0));
  for (const address of boundaries) {machine.entries.delete(address); machine.externalCalls.set(address, state => {state.r.EAX = 0;});}
}
let steps = 0, retryVisits = 0;
machine.onInstruction = (address, state) => {reached.add(address); if (address === 0x418180) retryVisits++; if (address === 0x418335) dispatchModes[state.r.EAX] = (dispatchModes[state.r.EAX] ?? 0) + 1; if ([0x4180a0, 0x417ee0, 0x417930, 0x41a170, 0x41a6c0, 0x417d70, 0x47d040, 0x417720, 0x4167f0].includes(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX, m.bytes.readInt32LE(0x5e8890)));
machine.externalCalls.set(0x568a48, m => {const dest = m.bytes.readUInt32LE(m.r.ESP), from = m.bytes.readUInt32LE(m.r.ESP + 4), size = m.bytes.readUInt32LE(m.r.ESP + 8); Buffer.from(m.bytes.subarray(from, from + size)).copy(m.bytes, dest); m.r.EAX = dest;});
for (const address of [0x569330, 0x56934e, 0x56933c, 0x568a60, 0x56932a]) machine.entries.delete(address);
const turns = Number(process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4] : 16), fixtures = Number(process.argv[2] ?? 340), selectedMode = process.argv[3] === undefined || process.argv[3].startsWith('--') ? null : Number(process.argv[3]);
for (let fixture = 0; fixture < fixtures; fixture++) {
  const count = 1 + Math.floor(fixture / 51) % 4, index = Math.floor(fixture / 17) % count, participant = (index + (fixture % 3 === 0 ? 1 : 0)) % count, camera = 0x91ff80 + index * 0x184;
  const f = createSimulationRuntimeFixture(program, fixture + 1, {count, models: boundaryDomain && fixture % 7 === 0, extraBodyStorage: [{address: 0x6f9a20, length: 0x1000}, {address: 0x70f130, length: 0x3e78}]});
  const m = f.memory, body = f.bodies[participant].address, session = f.extraAddresses.session;
  if (f.grid.sectors[0].columns === 12) for (const region of f.grid.regions) {region.rows = 6; word(m, f.addresses.regions + region.index * 6 + 4, region.columns << 12 | region.rows << 8 | region.padding);}
  put(m, m.readUInt32LE(0x90b98c) + 0x80, f.addresses.regions);
  put(m, 0x5ecefc, CFG); word(m, CFG + 0x42c, 640); word(m, CFG + 0x42e, 480); m[CFG + 0x31] = fixture % 2;
  put(m, 0x70dcf4, 0x230000); put(m, 0x909288, SPAWNS);
  for (let p = 0; p < count; p++) {const target = f.bodies[p].address, control = CONTROL + p * 256; constructCameraController(p, target, control, {memory: m, scratchBase: STACK}); put(m, 0x909300 + p * 0x30c, target); put(m, 0x909318 + p * 0x30c, control); put(m, 0x5ec120 + p * 4, p);}
  m[session + 0x54d] = count; m[session + 0x552] = fixture % 5 === 0 ? count === 4 ? 4 : count === 3 ? 3 : count === 2 ? 1 : 0 : 0; m[session + 0x58c] = 0;
  if (withRaceUpdate) m[session + 0x552] = count === 4 ? 4 : count === 3 ? 3 : count === 2 ? 1 : 0;
  const mode = selectedMode ?? fixture % 17, age = boundaryDomain ? [59, 60, 160, 170, 199, 200, 201, -1, 32767, -32768, 0, 1][Math.floor(fixture / 17) % 12] : Math.floor(fixture / 17) % 3 === 0 ? 0 : Math.floor(fixture / 17) % 3 === 1 ? 1 : 35;
  put(m, camera, mode); word(m, camera + 0x32, age); word(m, camera + 0x34, 200); word(m, camera + 0x3a, 100); word(m, camera + 0x36, participant); word(m, camera + 0x38, 0); put(m, camera + 0x3c, mode === 11 ? 3 : mode === 12 ? 2 : mode === 13 ? 4 : 0); put(m, camera + 0x20, 2); put(m, camera + 0x28, 700);
  put(m, 0x90a548, 10); put(m, 0x5ec958, fixture + 1); put(m, 0x91ce90, fixture % 2 ? 2 : 0); word(m, camera + 0x2c, fixture * 31); word(m, camera + 0x2e, fixture % 5 - 2); m.writeFloatLE(200, 0x91ceb0);
  put(m, body + 0x664, 0x140000 + (fixture % 2 ? 0x10000 : 0)); word(m, body + 0x668, 350); put(m, body + 0x68, 0x30000); m[body + 0x718] = 10;
  if (fixture % 4 === 0) {const diagonal = [4096, -4096, -4096]; for (let axis = 0; axis < 3; axis++) word(m, body + 0xc4 + axis * 8, diagonal[axis]); put(m, body + 0x58, 0); put(m, body + 0x5c, 65536);}
  m[body + 0x64f] = fixture % 3 === 0 ? 1 : 0; for (let p = 0; p < count; p++) m[CONTROL + p * 256 + 0x39] = 0x20;
  put(m, 0x6e6550, 0); put(m, camera + 0x174, TRIGGER); put(m, camera + 0x140, EVENT);
  for (const table of [0x9034a0, 0x903480, 0x80b5e0]) put(m, table, EVENT);
  put(m, EVENT + 0x188, 2); put(m, EVENT + 0x194, 2); put(m, EVENT + 0x198, body);
  for (const [axis, value] of [2, -6, 2].entries()) {put(m, EVENT + 0x34 + axis * 4, value * 65536); put(m, TRIGGER + 4 + axis * 4, (value - (axis === 0 ? 200 : 0)) * 65536); put(m, TRIGGER + 0x10 + axis * 4, (value + (axis === 0 ? 200 : 0)) * 65536);}
  put(m, TRIGGER + 0x34, 0x40000000);
  if (boundaryDomain) {
    put(m, 0x90a548, 6000); word(m, camera + 0x3a, [-1, 0, 1, 100][fixture % 4]);
    if (fixture % 13 === 0) put(m, session + 0x57c, 6);
    if (fixture % 5 === 0) put(m, EVENT + 0x188, 0x42); else if (fixture % 11 === 0) put(m, EVENT + 0x188, 1);
    if (fixture % 3 === 0) put(m, camera + 0x20, 1);
    if (fixture % 7 === 0) put(m, camera + 0x3c, 0);
    if (fixture % 9 === 0) {put(m, EVENT + 0x188, 16); put(m, camera + 0x20, 0);}
    for (const [axis, offset] of [0, 4, 8].entries()) {
      const value = m.readInt32LE(body + 0x34 + offset) + (axis === 1 && fixture % 3 === 1 ? 2000 * 65536 : 0);
      put(m, TRIGGER + 4 + offset, value - (axis === 0 ? 1024 * 65536 : 0)); put(m, TRIGGER + 16 + offset, value + (axis === 0 ? 1024 * 65536 : 0));
    }
    put(m, TRIGGER + 0x34, 0x2800000);
    const linked = EVENT + 0x1000, meta = EVENT + 0x1800; put(m, EVENT + 0x1b0, linked); put(m, linked + 0x10, meta); word(m, meta + 0x22, fixture % 2 ? 50 : 650);
    for (let i = 0; i < 54; i++) put(m, linked + 0x34 + i * 4, m.readInt32LE(body + 0x34 + i * 4));
    if (fixture % 2 === 0) {
      put(m, 0x6e6550, 1); const row = 0x91f6c0; put(m, row, 1);
      for (const [axis, offset] of [0, 4, 8].entries()) {const value = m.readInt32LE(body + 0x34 + offset); put(m, row + 4 + offset, value - (axis === 0 ? 10 * 65536 : 0)); put(m, row + 16 + offset, value + (axis === 0 ? 1024 * 65536 : 0));}
      put(m, row + 0x34, 0x40000000); put(m, body + 0x68, 0x90000);
    }
  }
  initializeCameraCurveFactorials({memory: m});
  for (let point = 0; point < 5; point++) for (let axis = 0; axis < 3; axis++) put(m, 0x6f98f0 + index * 60 + point * 12 + axis * 4, (axis === 2 ? point * 10 : 0));
  for (const address of [0x6f9880, 0x6f98b0]) for (let axis = 0; axis < 3; axis++) put(m, address + index * 12 + axis * 4, m.readInt32LE(body + 0x34 + axis * 4));
  put(m, 0x6f9854 + index * 12, -65536); put(m, 0x6f99e0 + index * 4, 1000); put(m, 0x6f99f0 + index * 4, 436);
  if (boundaryDomain && age !== 0) {put(m, 0x6f9854 + index * 12, 0); put(m, 0x6f9858 + index * 12, -65536); put(m, 0x6f99e0 + index * 4, 65535); put(m, 0x6f9720 + index * 4, 9);}
  put(m, 0x6e6388, 0x296000); put(m, 0x6efb3c, 0); put(m, 0x6efb38, APP); put(m, APP + 0x7c, HEAD); for (const offset of [0, 4, 8]) put(m, HEAD + offset, HEAD); word(m, HEAD + 12, 0x101);
  put(m, 0x56e220, 0x5a000); put(m, 0x56e210, 0x5a010); put(m, 0x56e470, 0x5a010); put(m, 0x56e224, 0x5a020);
  m.fill(0x36, STACK - 4096, STACK + 128);
  const sourceLog = [], nativeLog = [], allocator = (memory, log) => {let cursor = 0x300000; return size => {const address = cursor; cursor += (size + 15) & ~15; memory.fill(0xa5, address, cursor); log.push(['allocate', size, address]); return address;};};
  const sourceAllocate = allocator(m, sourceLog), nativeAllocate = allocator(machine.bytes, nativeLog);
  const format = (memory, output, fmt, index, log) => {assert.equal(memory.toString('latin1', fmt, fmt + 9), '%d Player'); const value = `${index} Player`; memory.write(value + '\0', output, 'latin1'); log.push(['format', output, fmt, index]); return value.length;};
  const math = (operation, value, log) => {const result = Math.fround(Math[operation](value)); log.push([operation, value, result]); return result;};
  const integer = (value, log) => {const result = !Number.isFinite(value) || value < -(2 ** 63) || value >= 2 ** 63 ? -(1n << 63n) : BigInt(Math.trunc(value)); log.push(['integer', value, result.toString()]); return result;};
  const runtime = {...f, memory: m, grid: f.context.nativeTerrain.grid, modelPointersFor: f.candidateMapping.modelPointersFor, scratchBase: STACK, roundingMode: 'nearest-even', handlers: {allocate: sourceAllocate, free: p => sourceLog.push(['free', p]), dynamicCast: (...args) => {sourceLog.push(['dynamicCast', ...args.slice(0, 5)]); return APP;}, formatCameraName: (output, fmt, i) => format(m, output, fmt, i, sourceLog), projectionMath: (operation, value) => math(operation, value, sourceLog), projectionInteger: value => integer(value, sourceLog)}};
  if (withRaceUpdate) {
    for (const address of boundaries) runtime.handlers[`call${address.toString(16)}`] = () => 0;
    runtime.handlers.audioManagerCall = () => 0;
    put(m, 0x714b08, 0x298000); put(m, 0x298000, 0x298100); put(m, 0x29815c, 0x5a030);
    machine.externalCalls.set(0x5a030, state => {state.r.ESP += 4; state.r.EAX = 0;});
  }
  machine.externalCalls.set(0x5a000, state => {state.r.EAX = nativeAllocate(state.bytes.readUInt32LE(state.r.ESP));}); machine.externalCalls.set(0x5a010, state => nativeLog.push(['free', state.bytes.readUInt32LE(state.r.ESP)]));
  machine.externalCalls.set(0x5a020, state => {state.r.EAX = format(state.bytes, ...[0, 4, 8].map(o => state.bytes.readUInt32LE(state.r.ESP + o)), nativeLog);});
  machine.externalCalls.set(0x56932a, state => {nativeLog.push(['dynamicCast', ...[0, 4, 8, 12, 16].map(o => state.bytes.readInt32LE(state.r.ESP + o))]); state.r.EAX = APP;});
  for (const [address, operation] of [[0x569330, 'atan'], [0x56934e, 'sin'], [0x56933c, 'cos']]) machine.externalCalls.set(address, state => {const result = math(operation, state.floatFromBits(state.lowFloatBits('XMM0')), nativeLog); state.scalarBits.delete('XMM0'); state.qwords.delete('XMM0'); state.scalars.XMM0 = result;});
  machine.externalCalls.set(0x568a60, state => {const result = integer(state.floatFromBits(state.lowFloatBits('XMM0')), nativeLog); state.r.EAX = Number(BigInt.asIntN(32, result)); state.r.EDX = Number(BigInt.asIntN(32, result >> 32n));});
  machine.reset(); machine.fs0 = 0; m.copy(machine.bytes);
  for (let turn = 0; turn < turns; turn++) {
  machine.entry = withRaceUpdate ? 0x450e50 : 0x4180a0; machine.r.ECX = index; machine.r.EDX = 0; machine.r.ESP = STACK; put(machine.bytes, STACK, -1); if (withRaceUpdate) put(machine.bytes, STACK + 4, 1);
  let sourceError, nativeError; try {if (withRaceUpdate) runRaceUpdate(0, 1, runtime); else updateCamera(index, runtime);} catch (error) {sourceError = error;}
  try {steps += machine.run(5_000_000);} catch (error) {nativeError = error;}
  if (sourceError || nativeError) {console.error({fixture, turn, mode, age, index, count, participant, sourceError: sourceError?.message, nativeError: nativeError?.message}); throw sourceError ?? nativeError;}
  assert.equal(machine.fs0, 0, 'Thread exception chain restored'); modes[mode] = (modes[mode] ?? 0) + 1;
  const native = machine.bytes.subarray(0x10000), source = m.subarray(0x10000);
  if (!native.equals(source)) {const offset = native.findIndex((v, i) => v !== source[i]); console.error({fixture, mode, age, visits, retryVisits}); assert.fail(`byte${(offset + 0x10000).toString(16)} native${native.subarray(offset, offset + 24).toString('hex')} JS${source.subarray(offset, offset + 24).toString('hex')}`);}
  assert.deepEqual(sourceLog, nativeLog, `${fixture}/${turn} ordered CRT services`);
  }
}
const report = {method: 'Complete original4180a0 parent Listing and actual retained descendants. All mapped bytes>=10000h and ordered declared genuine CRT services compare; explicit synthetic TLS chain restored. Starting scene/body/controller/resource state is synthetic and the camera constructor has its own separate comparison. Initial requested modes and actual native jump-table dispatch counts are separate. Finite projection library outputs are declared, not original CRT bit evidence. Parent integration and domain coverage remain under expansion; no original process execution.', boundaryDomain, outerScope: withRaceUpdate ? 'Actual450e50→4180a0 and live41bef0 loop bounds. Other40 direct stages and final audio-manager virtual remain explicit contracts.' : null, fixtures, turns, calls: fixtures * turns, modes, dispatchModes, retryVisits, visits, ownInstructions: listing.instructions.length, ownInstructionsReached: listing.instructions.filter(i => reached.has(i.address)).length, ownInstructionsUnreached: listing.instructions.filter(i => !reached.has(i.address)).map(i => '0x' + i.address.toString(16)), executedInstructions: reached.size, instructionSteps: steps, evidence: [...program.references.map(r => r.evidence), ...listing.evidence], matched: true};
await writeFile(`analysis/${withRaceUpdate ? 'race-camera-connected' : 'camera-update'}${boundaryDomain ? '-boundaries' : ''}-instruction-check.json`, JSON.stringify(report, null, 2)); const {evidence, ownInstructionsUnreached, ...summary} = report; console.log(JSON.stringify(summary));
