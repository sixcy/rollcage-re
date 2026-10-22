import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRawScriptFixture} from './lib/raw-scripted-motion-fixtures.mjs';
import {initializeWheelEffectTables} from '../src/wheel-effects.mjs';
import {updateGroundProjectile} from '../src/projectile-ground.mjs';

export async function verifyProjectileGround({fixtures = 4000, output = 'analysis/projectile-ground-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}; let steps = 0, seed = 0x44b240ab;
  const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
  const watched = new Set([0x44b240, 0x44c210, 0x44bff0, 0x44bc30, 0x44b970, 0x432e70, 0x46aba0, 0x436870, 0x484ce0, 0x484cb0]); machine.onInstruction = p => {reached.add(p); if (watched.has(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;}; machine.externalCalls.set(0x568162, x => assert.equal(x.r.ECX >>> 0, x.bytes.readUInt32LE(0x5e8890)));
  machine.externalCalls.set(0x568a48, x => {const p = x.bytes.readUInt32LE(x.r.ESP), input = x.bytes.readUInt32LE(x.r.ESP + 4), n = x.bytes.readUInt32LE(x.r.ESP + 8); x.bytes.copy(x.bytes, p, input, input + n); x.r.EAX = p;});
  for (let i = 0; i < fixtures; i++) {
    const f = createRawScriptFixture({memory: program.initializeMemory(Buffer.alloc(0xa00000))}), m = f.memory, body = 0x180000, target = 0x190000, owner = 0x195000, pack = 0x60000, groups = 0x61000, points = 0x62000, graph = 0x70000, session = 0x80000, put = (p, v) => m.writeInt32LE(v | 0, p), word = (p, v) => m.writeUInt16LE(v & 65535, p); initializeWheelEffectTables(m); f.roundingMode = ['nearest-even', 'toward-zero', 'down', 'up'][Math.floor(i / 11) % 4]; m.fill(i * 17 & 255, 0x8000, 0x9100);
    put(0x90b98c, pack); put(pack + 0x60, groups); put(pack + 0x94, graph); put(0x5ecb1c, session); m[session + 0x54d] = 1; m[0x90931d] = 1; put(0x909300, target); put(0x909354, groups + (i % 3) * 12); put(0x909358, i % 8);
    for (let j = 0; j < 4; j++) {const g = groups + j * 12, ps = points + j * 0x1000; word(g, 8); m[g + 2] = (j + i) % 2; m[g + 4] = i % 3 ? 0 : 1; m[g + 5] = j; put(g + 8, ps); put(graph + j * 8, 1 << (j + 1) % 4); for (let k = 0; k < 8; k++) {const p = ps + k * 16; word(p, (k - 4) * 300); word(p + 2, k * 20); word(p + 4, j * 100); m[p + 7] = (k * 37 + i) & 255; put(p + 8, 1 << 20 | 2 << 23); put(p + 12, 1 << 28 | ((j + 1) % 4) | 2 << 5);}}
    put(body, 0x1c0c); put(body + 0x184, 0); put(body + 0x188, [0, 1, 2, 3, 16, 64, 65, 128, 129, 256, -1][i % 11]); put(body + 0x180, [0, 1, 2, 10, 35, 44, 45, 0x7fffffff, -2147483648][Math.floor(i / 11) % 9]); put(body + 0x194, i % 5 ? owner : target); put(body + 0x198, target);
    put(body + 0x6cc, groups); put(body + 0x6d4, groups + (i % 2) * 12); word(body + 0x6d0, i % 8); word(body + 0x6d8, (i + 1) % 8); word(body + 0x6d2, [-32768, -2, -1, 0, 1, 2, 32767][Math.floor(i / 11) % 7]); m.fill(255, body + 0x6bc, body + 0x6c6);
    word(body + 0x18c, i % 32); m[body + 0x18e] = m.readInt32LE(body + 0x188) === 16 ? [0, 1, 2, 127, 128, 255][i % 6] : [0, 1, 2, 3, 31, 32][i % 6]; put(0x90a548, i); put(0x811180, i % 3 ? 0 : 1);
    for (let j = 0; j < 3; j++) {put(body + 0x34 + j * 4, i % 7 ? ((i + j * 3) % 2000 - 1000) << 16 : random()); put(body + 0x40 + j * 4, random()); put(body + 0x68 + j * 4, random()); put(target + 0x34 + j * 4, i % 7 ? ((i * 2 + j * 3) % 2000 - 1000) << 16 : random()); put(target + 0x68 + j * 4, random());}
    for (let j = 0; j < 9; j++) word(body + 0xc4 + j * 2, j % 4 ? 0 : 4096); m[owner + 0x6b4] = i % 4; m[owner + 0x70b] = 1; m[owner + 0x71e] = i % 20;
    machine.reset(); machine.fpuRounding = f.roundingMode; m.copy(machine.bytes); updateGroundProjectile(body, f); machine.entry = 0x44b240; machine.r.ECX = body; machine.r.ESP = 0x9000; machine.bytes.writeInt32LE(-1, 0x9000); steps += machine.run(1000000);
    const a = machine.bytes.subarray(0x10000), b = m.subarray(0x10000); if (!a.equals(b)) {const p = a.findIndex((v, j) => v !== b[j]); assert.fail(`fixture${i}/44b240 diff${(p + 0x10000).toString(16)} native${a[p]} JS${b[p]}`);}
  }
  const report = {method: 'Fullactual44b240 kind0 tick→44c210/44bff0/44bc30/44b970 route/math/orientation, countdown launch actualsound/particle, target lead with signed-overflow original root-prefix bytes, turnaround,trail drain. Allmappedmemory>=10000h, four rounding modes, allnative states, timing/velocity/direction/short bounds; actualgamechildren,no game mocks. Only cookie/memcpy services, empty soundbank. Explicit synthetic native route/participant/body/pool inputs,no original execution.', targetSha256: program.sha256, fixtures, calls: fixtures, executedInstructions: reached.size, instructionSteps: steps, visits, matched: true, evidence: program.references.map(r => r.evidence)};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await verifyProjectileGround({fixtures: Number(process.argv[2] ?? 4000)});
