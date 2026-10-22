import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {initializeVehicleOverlayTables, initializeVehicleOverlayGrids, updateVehicleOverlayGrids, updateVehicleOverlayGrid, updateVehicleOverlayAppearance} from '../src/vehicle-overlay-grid.mjs';

const put = (m, p, value) => m.writeInt32LE(value | 0, p), word = (m, p, value) => m.writeUInt16LE(value & 65535, p);
export const vehicleOverlayAddresses = {stack: 0x9000, config: 0x10000, session: 0x11000, pack: 0x12000, materials: 0x13000, colors: 0x20000, bodies: 0x100000, controls: 0x300000, geometry: 0x82e920, blocks: 0x82eda0};
export function createVehicleOverlayFixture(fixture = 0, memory = Buffer.alloc(0xa00000)) {
  const a = vehicleOverlayAddresses, count = fixture % 7;
  initializeVehicleOverlayTables(memory); memory.fill(0x69, a.geometry, a.blocks + 16 * 0x4208); memory.fill(0x67, a.colors, a.colors + 4096); memory.fill(0x71, a.materials, a.materials + 0x6000); memory.fill(0x53, a.stack - 4096, a.stack + 64);
  put(memory, 0x5ecefc, a.config); put(memory, 0x5ecb1c, a.session); memory[a.config + 0x30] = fixture % 7 ? 1 : 0; memory[a.session + 0x54d] = count;
  put(memory, 0x90b990, a.pack); put(memory, 0x90b988, a.materials); word(memory, a.pack + 0x2e, fixture % 4); put(memory, 0x90a548, fixture); put(memory, 0x5ec958, [0, 1, -1, 0x7fffffff, fixture * 1727341 | 0][fixture % 5]);
  //Six records precede the actual90a548 clock alias; do not fabricate a
  //seventh participant pointer over that global while building fixtures.
  for (let index = 0; index < 6; index++) {
    const record = 0x909300 + index * 0x30c, body = a.bodies + index * 0x1000, control = a.controls + index * 16;
    put(memory, record, body); memory[record + 0x255] = 0x37; memory[control] = index % 3 ? 0 : 255;
    put(memory, body + 0x6bc, fixture % 4 ? index % 4 ? -1 : control : -1);
    put(memory, body + 0x664, [0, 0x39ffff, 0x3a0000, 0x3a0000 + 6399, 0x3a0000 + 6400, 0x3a0000 + 12799, 0x3a0000 + 12800, 0x3a0000 + 159 * 6400, 0x3a0000 + 160 * 6400, 0x3a0000 + 161 * 6400, -2147483648, 2147483647][(fixture + index * 3) % 12]);
    put(memory, a.blocks + index * 0x4208 + 0x4200, [-1, 0, 1, 7, 8, 9, 16][(fixture + index) % 7]);
  }
  for (let index = -16; index < 64; index++) {
    const material = a.materials + (fixture % 4 + 0x86 + index) * 16;
    const x = [0, 10, 100, 250][(fixture + index & 3)], end = [255, 42, 0, 100][(fixture * 3 + index & 3)], y = fixture * 37 + index * 71 & 255, lower = fixture * 17 + index * 11 & 255;
    put(memory, material, 0xa1b20000 | y << 8 | x); put(memory, material + 4, 0xc3d40000 | y << 8 | end); word(memory, material + 8, lower << 8 | x); word(memory, material + 10, lower << 8 | end);
  }
  return {memory, fixture, scratchBase: a.stack, count};
}

export async function verifyVehicleOverlayGrid({fixtures = 2400, sequences = 96, ticks = 12, output = 'analysis/vehicle-overlay-grid-connected-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), a = vehicleOverlayAddresses;
  const own = await readInstructionEvidence(['2901-race-stage-487540-assembly.json', '2903-race-stage-487790-assembly.json', '2905-grid-animation-constructor-assembly.json', '2907-grid-animation-producer-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const reached = new Set(), visits = {}, entries = new Set([0x487410, 0x487540, 0x487620, 0x487790]); let steps = 0, aliases = 0, rankedSix = 0, parentCalls = 0, calls = 0;
  machine.onInstruction = address => {steps++; reached.add(address); if (entries.has(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1; if (address === 0x4875f3 && machine.r.EBX >= 6) rankedSix++;};
  const run = (entry, ecx = 0, edx = 0) => {machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = a.stack; put(machine.bytes, a.stack, -1); machine.run(3_000_000); calls++; if (entry === 0x487540) parentCalls++;};
  const compare = (memory, label) => {const actual = machine.bytes.subarray(0x10000), expected = memory.subarray(0x10000); if (!actual.equals(expected)) {const offset = actual.findIndex((value, index) => value !== expected[index]); assert.fail(`${label}: byte 0x${(0x10000 + offset).toString(16)} native ${actual[offset]} JS ${expected[offset]}`);}};
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)), runtime = createVehicleOverlayFixture(fixture, memory), selector = fixture % 4, index = fixture % 6;
    let colors = a.colors;
    if (selector === 1 && fixture % 5 === 0) {
      memory[a.config + 0x30] = 1; memory[a.session + 0x54d] = 6;
      for (let participant = 0; participant < 6; participant++) {put(memory, a.bodies + participant * 0x1000 + 0x6bc, -1); put(memory, a.bodies + participant * 0x1000 + 0x664, 0x3a0000 + 160 * 6400);}
    }
    if (selector === 2 && fixture % 3 === 0) {colors = fixture % 2 ? a.geometry + 4 : 0x5ec958; aliases++;}
    if (selector === 3 && fixture % 3 === 0) {
      //All material fields must be captured before the first aliased UV store.
      const block = a.blocks + index * 0x4208, material = block + 0x20, phase = memory.readInt32LE(block + 0x4200), next = fixture & 1 ? phase + 1 >= 9 ? 0 : phase + 1 : phase;
      put(memory, 0x90b988, material - ((fixture % 4 + 0x86 + next) << 4));
      put(memory, material, 0xa1b2f0f8); put(memory, material + 4, 0xc3d40208); word(memory, material + 8, 0x1111); word(memory, material + 10, 0x2222); aliases++;
    }
    machine.reset(); memory.copy(machine.bytes);
    try {
      if (selector === 0) {initializeVehicleOverlayGrids(runtime); run(0x487410);}
      else if (selector === 1) {updateVehicleOverlayGrids(runtime); run(0x487540);}
      else if (selector === 2) {updateVehicleOverlayAppearance(index, colors, runtime); run(0x487620, index, colors);}
      else {updateVehicleOverlayGrid(index, runtime); run(0x487790, index);}
      compare(memory, `fixture ${fixture}/entry ${selector}`);
    } catch (error) {console.error({fixture, selector, index, colors}); throw error;}
  }
  for (let scenario = 0; scenario < sequences; scenario++) {
    const memory = program.initializeMemory(Buffer.alloc(0xa00000)), runtime = createVehicleOverlayFixture(scenario, memory); memory[a.config + 0x30] = 1; memory[a.session + 0x54d] = 6; machine.reset(); memory.copy(machine.bytes);
    initializeVehicleOverlayGrids(runtime); run(0x487410); compare(memory, `initialize sequence ${scenario}`);
    for (let tick = 0; tick < ticks; tick++) {
      put(memory, 0x90a548, scenario + tick); put(machine.bytes, 0x90a548, scenario + tick);
      updateVehicleOverlayGrids(runtime); run(0x487540); compare(memory, `grid sequence ${scenario}/${tick}`);
      for (let index = 0; index < 6; index++) {updateVehicleOverlayAppearance(index, a.colors + index * 576, runtime); run(0x487620, index, a.colors + index * 576); compare(memory, `appearance sequence ${scenario}/${tick}/${index}`);}
    }
  }
  const report = {method: 'Full 487540 outer overlay-grid stage and actual leaf 487790 with adjacent actual constructor 487410 and speed/RNG color-height producer 487620. Native unsigned phase/UV traversal, material captures, packed fields, original yaw bytes, shared geometry, status reset/rank/quota and wrapped speed arithmetic retained. All mapped data bytes >=10000h compared after each call, including all primitive gaps, records, live body/session/config/material state, RNG and output aliases. Constructor -> repeated outer stage -> six actual appearance producers share the same memory. Only explicit between-tick clock input changes; no game mocks, external services or original-process execution. Renderer submission, scene/config/model/material construction and body-speed producers are separate explicit upstream/caller interfaces.', targetSha256: program.sha256, evidence: own.evidence.map(value => value.evidence_id), instructions: own.instructions.length, fixtures, aliases, sequences, ticks, calls, parentCalls, rankedSix, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, externalCalls: [...machine.externalCalls.keys()], matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report, 'Existing report differs; choose a new path.');}}
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyVehicleOverlayGrid()));
