import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRawScriptFixture} from './lib/raw-scripted-motion-fixtures.mjs';
import * as guidance from '../src/projectile-guidance.mjs';
import {normalizeRawFloatVector, normalizeRawFixedVector, rawVectorLength} from '../src/raw-vector-normalization.mjs';

export async function verifyProjectileGuidance({fixtures = 6000, output = 'analysis/projectile-guidance-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {};
  const entries = [0x46bad0, 0x44c210, 0x44bff0, 0x422c70, 0x492cc0, 0x41c9c0], watched = new Set([...entries, 0x46b070, 0x491f40, 0x492d10]);
  let steps = 0, aliases = 0, seed = 0x46bad0ab;
  const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
  machine.onInstruction = p => {reached.add(p); if (watched.has(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  for (let i = 0; i < fixtures; i++) {
    const runtime = createRawScriptFixture({memory: program.initializeMemory(Buffer.alloc(0xa00000))}), m = runtime.memory, put = (p, v) => m.writeInt32LE(v | 0, p), word = (p, v) => m.writeUInt16LE(v & 65535, p);
    runtime.roundingMode = ['nearest-even', 'toward-zero', 'down', 'up'][Math.floor(i / 6) % 4];
    const body = 0x180000, target = 0x190000, point = 0x1a0000, group = 0x1b0000, points = 0x1b1000, direction = 0x1c0000, outputVector = 0x1d0000;
    m.fill(0x69, body - 0x1000, body + 0x3000); m.fill(i * 13 & 255, 0x8000, 0x9100);
    const scenario = Math.floor(i / 6), entry = entries[i % 6];
    for (const o of [0x34, 0x38, 0x3c, 0x40, 0x44, 0x48, 0x19c, 0x1a0, 0x1a4]) put(body + o, random());
    put(body + 0x198, scenario % 3 ? target : 0); put(body + 0x188, [0, 1, 2, 32][scenario % 4]); put(body + 0x6cc, group); word(body + 0x6d0, [-1, 0, 1][scenario % 3]); put(group + 8, points);
    put(target, scenario % 2 ? 3 : 26);
    for (let j = 0; j < 3; j++) {put(target + 0x34 + j * 4, m.readInt32LE(body + 0x34 + j * 4) + [0, 1, 0x7fffff, 0x800000, 0x1000000, -0x1000000, -2147483648][(scenario + j) % 7]); put(direction + j * 4, random()); word(point + j * 2, random());}
    m[point + 7] = [0, 179, 180, 235, 236, 255][scenario % 6];
    for (const p of [point, points - 16, points, points + 16]) {put(p + 8, (1 + scenario % 3) << 20 | (1 + scenario % 2) << 23); put(p + 12, (1 + scenario % 3) << 28);}
    let ecx = body, edx = 0, args = [], expected, fn;
    if (entry === 0x46bad0) {
      if (scenario % 11 === 0) {put(body + 0x198, body + 0x168); aliases++;}
      fn = () => guidance.updateProjectileHoming(body, runtime);
    } else if (entry === 0x44c210) {
      ecx = point; edx = body + 0x34;
      const out = [outputVector, point, point + 8, point + 12, body + 0x34, body + 0x38][scenario % 6]; if (out !== outputVector) aliases++;
      args = [out, scenario % 3]; fn = () => guidance.computeProjectileRouteVector(ecx, edx, ...args, runtime);
    } else if (entry === 0x44bff0) {
      edx = [direction, body + 0x40, body + 0x44, body + 0x1a8][scenario % 4]; if (edx !== direction) aliases++;
      args = [scenario % 3 ? point : 0, scenario % 3 - 1]; fn = () => guidance.updateProjectileRouteMotion(body, edx, ...args, runtime);
    } else if (entry === 0x422c70) {
      ecx = [direction, 0x91d45c, 0x91d458, 0x5dc774, 0x5dca88][scenario % 5];
      if (ecx === direction) for (let j = 0; j < 3; j++) put(ecx + j * 4, [0, 1, -1, 4096, -2147483648, 0x7fffffff][(scenario + j * 2) % 6]);
      edx = [outputVector, ecx, ecx + 4, 0x91d45c, 0x5dc774][Math.floor(scenario / 5) % 5]; aliases += ecx !== direction || edx !== outputVector ? 1 : 0;
      fn = () => {expected = normalizeRawFloatVector(ecx, edx, runtime);};
    } else if (entry === 0x492cc0) {
      ecx = scenario % 4 ? direction : 0x91d45c; if (ecx !== direction) aliases++;
      for (let j = 0; j < 3; j++) put(ecx + j * 4, [65536, -65536, 0x230000, 0x230001, -0x230001, 0x1200000][(scenario + j) % 6]);
      fn = () => normalizeRawFixedVector(ecx, runtime);
    } else {
      ecx = scenario % 3 ? direction : 0x91d458; if (ecx !== direction) aliases++;
      for (let j = 0; j < 3; j++) put(ecx + j * 4, scenario % 4 ? random() : [0, -2147483648, 0x7fffffff, -1][(scenario + j) % 4]);
      fn = () => {expected = rawVectorLength(ecx, runtime);};
    }
    machine.reset(); machine.fpuRounding = runtime.roundingMode; m.copy(machine.bytes); fn();
    machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = runtime.scratchBase; machine.bytes.writeInt32LE(-1, runtime.scratchBase); args.forEach((v, j) => machine.bytes.writeInt32LE(v | 0, runtime.scratchBase + 4 + j * 4));
    steps += machine.run(200000); if (expected !== undefined) assert.equal(machine.r.EAX, expected);
    const a = machine.bytes.subarray(0x10000), b = m.subarray(0x10000);
    if (!a.equals(b)) {const p = a.findIndex((v, j) => v !== b[j]); assert.fail(`fixture${i}/${entry.toString(16)} diff${(p + 0x10000).toString(16)} native${a[p]} JS${b[p]}`);}
  }
  const report = {method: 'Actual46bad0 homing/44c210 authored route vector/44bff0 curvature-damped motion and46b070 orientation; raw422c70 float and492cc0 fixed normalization, real root/division/cross descendants. All mapped memory>=10000h, four rounding modes, signed overflow/reduction thresholds, input/output/global/constant aliases and coherent route/body identities. No game mocks, services or original execution. Private incoming stack is explicit synthetic storage.', targetSha256: program.sha256, fixtures, calls: fixtures, aliases, executedInstructions: reached.size, instructionSteps: steps, visits, matched: true, evidence: program.references.map(r => r.evidence)};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await verifyProjectileGuidance({fixtures: Number(process.argv[2] ?? 6000)});
