import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {createSimulationRuntimeFixture} from './lib/simulation-runtime-fixtures.mjs';
import {queryCameraBodyPose, publishCachedCameraMatrix, buildCameraBodyPose, reduceRawCameraDirection} from '../src/camera-pose-helpers.mjs';
const put = (m, p, v) => m.writeInt32LE(v | 0, p);
export async function verifyCameraPoseHelpers({fixtures = 1600, output = 'analysis/camera-pose-helpers-boundaries-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), entries = [0x417d70, 0x417e80, 0x417b50, 0x417610], reached = new Set(), visits = {};
  const own = await readInstructionEvidence(['3522-camera-child-417d70-assembly.json', '3524-camera-child-417e80-assembly.json', '3528-camera-child-417b50-assembly.json', '082-effect-direction-transform-assembly.json'], {directory: 'analysis/native-simulation/results'});
  let steps = 0, cookies = 0, acceptedQueries = 0, matrices = 0, fallbacks = 0, aliases = 0;
  machine.onInstruction = p => {steps++; reached.add(p); if ([...entries, 0x47d040, 0x4167f0, 0x4334b0].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  machine.externalCalls.set(0x568162, state => {assert.equal(state.r.ECX, state.bytes.readInt32LE(0x5e8890)); cookies++;});
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const selector = fixture % 4, f = selector === 0 ? createSimulationRuntimeFixture(program, fixture + 1, {models: fixture % 3 !== 0, extraBodyStorage: [{address: 0x70f130, length: 0x3e78}]}) : null;
    const memory = f?.memory ?? program.initializeMemory(Buffer.alloc(0xa00000)), runtime = {...f, memory, ...(f ? {grid: f.context.nativeTerrain.grid, modelPointersFor: f.candidateMapping.modelPointersFor} : {}), scratchBase: 0x9000, roundingMode: 'nearest-even'}, body = f?.bodies[0].address ?? 0x110000;
    memory.fill(0x69, 0x6000, 0xa000); let direction = 0x111000, other = 0x111020, output = 0x111040, ecx = body, edx = 0, args = [], result;
    if (selector !== 0) {
      for (let i = 0; i < 0x200; i++) memory[body + i] = (fixture + i * 17) & 255;
      for (let i = 0; i < 9; i++) memory.writeInt16LE(fixture % 9 === 2 ? [-32768, 32767, 0][i % 3] : i % 4 ? ((fixture * 31 + i * 47) % 1024) - 512 : 4096, body + 0xc4 + i * 2);
      [[0, 65536, 0], [65536, 0, 0], [0, 0, 0], [0, 0, 256], [0x10000, 100, 300]][Math.floor(fixture / 4) % 5].forEach((value, i) => put(memory, direction + i * 4, value));
      [0, 0, 65536].forEach((value, i) => put(memory, other + i * 4, value)); memory.fill(0x71, output, output + 256);
    }
    if (selector === 0) {
      if (f.grid.sectors[0].columns === 12) for (const region of f.grid.regions) {region.rows = 6; memory.writeUInt16LE(region.columns << 12 | region.rows << 8 | region.padding, f.addresses.regions + region.index * 6 + 4);}
      put(memory, memory.readUInt32LE(0x90b98c) + 0x80, f.addresses.regions); put(memory, body, memory.readInt32LE(body) & ~511 | [3, 7, 4, 21][Math.floor(fixture / 4) % 4]); edx = fixture % 8 ? 0x112000 : body + 0x34;
      if (edx !== body + 0x34) memory.copy(memory, edx, body + 0x34, body + 0x34 + 216);
      [2, [-6, 6, 64, 128][Math.floor(fixture / 16) % 4], 2].forEach((value, i) => put(memory, edx + i * 4, value * 65536));
    }
    else if (selector === 1) {
      const index = Math.floor(fixture / 4) % 5 - 1, cache = (Math.imul(index, 0x184) + 0x9200a0) >>> 0; memory.fill((fixture * 17) & 255, cache, cache + 64);
      const choice = Math.floor(fixture / 20) % 5; if (choice === 1) output = direction; else if (choice === 2) output = other; else if (choice === 3) output = cache + 16;
      if (choice) aliases++; ecx = direction; edx = other; args = [output, index];
    } else if (selector === 2) {
      if (fixture % 7 === 2) {output = body + 0x38; aliases++;} else if (fixture % 7 === 3) {output = 0x91d360; aliases++;}
      args = [0, 0, output, direction, fixture % 3];
    } else {
      direction = [0x111000, 0x91d458, 0x91d45c, 0x91d460][Math.floor(fixture / 4) % 4]; if (direction !== 0x111000) aliases++;
      const vectors = [[0, 0, 0], [1, -1, 1], [-2147483648, 0, 0], [2147483647, -2147483648, 2147483647], [0x40000, -0x40000, 0], [123456789, -987654321, 1337]];
      vectors[Math.floor(fixture / 16) % vectors.length].forEach((value, i) => put(memory, direction + i * 4, value)); ecx = direction;
    }
    machine.reset(); memory.copy(machine.bytes);
    try {
      if (selector === 0) {result = queryCameraBodyPose(ecx, edx, runtime); if (result) acceptedQueries++;}
      else if (selector === 1) {result = publishCachedCameraMatrix(ecx, edx, ...args, runtime); if (result) matrices++; else fallbacks++;}
      else if (selector === 2) result = buildCameraBodyPose(ecx, args[2], args[3], args[4], runtime);
      else result = reduceRawCameraDirection(ecx, runtime);
      machine.entry = entries[selector]; machine.r.ESP = runtime.scratchBase; machine.r.ECX = ecx; machine.r.EDX = edx; put(machine.bytes, runtime.scratchBase, -1); args.forEach((value, i) => put(machine.bytes, runtime.scratchBase + 4 + i * 4, value)); machine.run(3_000_000);
      assert.equal(machine.r.EAX, result);
      if (!memory.subarray(0x10000).equals(machine.bytes.subarray(0x10000))) {let p = 0x10000; while (memory[p] === machine.bytes[p]) p++; throw Error(`Mismatch0x${p.toString(16)} JS=${memory.subarray(p, p + 16).toString('hex')} native=${machine.bytes.subarray(p, p + 16).toString('hex')}`);}
    } catch (error) {console.error({fixture, entry: entries[selector].toString(16), direction: direction.toString(16), output: output.toString(16), visits}); throw error;}
  }
  const report = {method: 'Actual417d70 static body/pose copy and full47d040 terrain/model/shape query;417e80 cache/fallback through actual4167f0;417b50 live body-pose copy, partial local, float matrix cache,4334b0 short offset and4167f0 matrix; raw417610 including shared-global aliases. All mapped bytes>=10000h and return EAX compared. Synthetic explicit coherent raw scene/query state and camera matrix/cache inputs; compiler cookie only external. No game mocks or original execution.', targetSha256: program.sha256, evidence: own.evidence.map(v => v.evidence_id), instructions: own.instructions.length, fixtures, reachedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, cookieChecks: cookies, acceptedQueries, matrices, fallbacks, aliases, matched: true};
  if (output) {try {await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'});} catch (error) {if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), report);}} return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyCameraPoseHelpers()));
