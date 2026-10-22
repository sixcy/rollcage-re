import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {initializeRaceInputLatches, initializeRaceQuadStorage, initializeRacePolygonStorage, initializeVehicleTrailStorage, initializeVehicleExecutionModes, initializeRacePhasePresentation, initializeRacePairedStripStorage, initializeRaceRadialStorage, applyRaceLightingTint, initializeRaceContactPrimitiveStorage} from '../src/race-startup-storage.mjs';

const ledger = JSON.parse(await readFile('analysis/race-startup-callee-evidence.json', 'utf8'));
const cases = [[0x42a600, initializeRaceInputLatches], [0x495320, initializeRaceQuadStorage], [0x43f130, initializeRacePolygonStorage], [0x494060, initializeVehicleTrailStorage], [0x42a670, initializeVehicleExecutionModes], [0x47f8c0, initializeRacePhasePresentation], [0x43f870, initializeRacePairedStripStorage], [0x412bb0, initializeRaceRadialStorage], [0x497790, applyRaceLightingTint], [0x483a00, initializeRaceContactPrimitiveStorage]];
const names = cases.map(([address]) => ledger.find(e => e.address === address.toString(16) && e.operation === 'procedure_assembly').path.split('/').pop());
const own = await readInstructionEvidence([...names, '3145-object-stage-407190-assembly.json'], {directory: 'analysis/native-simulation/results'});
const machine = new BoundedX86(own.instructions), reached = new Set(); machine.onInstruction = address => reached.add(address);
const STACK = 0x9000, SESSION = 0x20000, ALLOC = 0x5a0100;
const put = (m, p, v) => m.writeInt32LE(v | 0, p);
let steps = 0, nullAllocations = 0, aliases = 0;
const fixtures = Number(process.argv[2] ?? 1200);
for (let fixture = 0; fixture < fixtures; fixture++) {
  for (const [entry, reference] of cases) {
    machine.reset(); const native = machine.bytes; native.fill(0x36); native.fill(0, STACK - 256, STACK + 32);
    put(native, 0x5ecb1c, SESSION); native[SESSION + 0x54d] = fixture % 7;
    native[0x91e6c1] = fixture % 2 ? 0x80 : 0x7f; native[0x91e701] = fixture % 3 ? 0x80 : 0xff;
    put(native, 0x56e258, ALLOC);
    put(native, 0x5ecefc, 0x5b0000); native[0x5b002c] = fixture % 4;
    put(native, 0x90b990, 0x590000); put(native, 0x90b988, 0x591000); native.writeUInt16LE(fixture % 16, 0x59002e); put(native, 0x920b30, 0x580000);
    native[SESSION + 0x553] = fixture % 3; put(native, 0x59004c, fixture % 7 ? 0x5a0000 : 0x5a2000); put(native, 0x6f96e0, 0x5a2000); put(native, 0x6f96f8, 0x5a6000); put(native, 0x6f96f4, 0x5a8000); put(native, 0x6f96f0, 0x5aa000); put(native, 0x920b24, fixture % 3); put(native, 0x920b20, fixture % 5);
    for (let i = 0; i < 256; i++) {native.writeUInt16LE((i * 997 + fixture * 113) & 65535, 0x580000 + i * 2); native.writeUInt16LE((i * 353 + fixture * 701) & 65535, 0x5ed030 + i * 2);}
    for (let i = 0; i < 4096; i++) native[0x591000 + i] = (i * 73 + (i >> 3) * 7 + fixture * 131) & 255;
    for (let i = 0; i < 6; i++) {put(native, 0x909300 + i * 0x30c, 0x300000 + i * 0x4000); native[SESSION + i] = [0, 7, 8, 9, 10, 255][(i + fixture) % 6];}
    if (entry === 0x42a670 && fixture % 11 === 0) {put(native, 0x909300, SESSION - 0x708); aliases++;}
    const source = Buffer.from(native), sourceLog = [], nativeLog = [];
    const allocate = (m, log, size) => {const p = fixture % 17 === 0 ? 0 : fixture % 19 === 0 ? 0x591000 : fixture % 13 === 0 ? 0x7f0000 : 0x500000; log.push([size, p]); return p;};
    const expected = reference({memory: source, scratchBase: STACK, allocate: size => allocate(source, sourceLog, size)});
    machine.externalCalls.set(ALLOC, state => {state.r.EAX = allocate(native, nativeLog, native.readUInt32LE(state.r.ESP));});
    machine.externalCalls.set(0x568a50, state => {const p = native.readUInt32LE(state.r.ESP), value = native.readInt32LE(state.r.ESP + 4), size = native.readUInt32LE(state.r.ESP + 8); native.fill(value & 255, p, p + size); state.r.EAX = p;});
    machine.entry = entry; machine.r.ESP = STACK; put(native, STACK, -1);
    try {
      steps += machine.run(); if (expected !== undefined) assert.equal(machine.r.EAX, expected, 'defined EAX');
      assert.deepEqual(nativeLog, sourceLog, 'allocation'); assert.deepEqual(native.subarray(0x10000), source.subarray(0x10000), 'all mapped bytes>=10000h');
      assert.deepEqual(native.subarray(0, STACK - 256), source.subarray(0, STACK - 256), 'low/null allocation outputs');
      assert.deepEqual(native.subarray(STACK + 32, 0x10000), source.subarray(STACK + 32, 0x10000), 'low/null allocation outputs above scratch');
    } catch (error) {console.error({fixture, entry: entry.toString(16)}); throw error;}
    nullAllocations += nativeLog.filter(row => !row[1]).length;
  }
}
const report = {method: 'Ten actual race-startup storage/tint algorithms versus retained original instructions, with actual407190 packed-color child and no game callbacks. CRT malloc/memset are explicit library services. All mapped bytes outside declared native private stack and defined EAX compare; null allocations retain original unconditional writes, globals may alias allocated backing storage, authored modes can alias the body clear destination, palette/effect rows may overlap. UV quadrants, signed/wrapped coordinate doubling, trig-byte ring mapping, paired-strip ownership and exact150/300 contact primitive quality policy are actual algorithms. Synthetic fixture proof, not original-process execution.', evidence: own.evidence.map(e => e.evidence_id), fixtures, calls: fixtures * cases.length, aliases, nullAllocations, instructions: own.instructions.length, instructionsReached: reached.size, instructionSteps: steps, matched: true};
await writeFile('analysis/race-startup-storage-instruction-check.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
