import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createRawScriptFixture} from './lib/raw-scripted-motion-fixtures.mjs';
import {findProjectileParticipantRoute, updateProjectileRoute} from '../src/projectile-routes.mjs';

export async function verifyProjectileRoutes({fixtures = 3000, output = 'analysis/projectile-routes-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}; let steps = 0;
  machine.onInstruction = p => {reached.add(p); if ([0x44b970, 0x44bc30, 0x568a48].includes(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  machine.externalCalls.set(0x568162, x => assert.equal(x.r.ECX >>> 0, x.bytes.readUInt32LE(0x5e8890)));
  machine.externalCalls.set(0x568a48, x => {const s = x.r.ESP, out = x.bytes.readUInt32LE(s), input = x.bytes.readUInt32LE(s + 4), n = x.bytes.readUInt32LE(s + 8); x.bytes.copy(x.bytes, out, input, input + n); x.r.EAX = out;});
  const results = {};
  for (let i = 0; i < fixtures; i++) {
    const runtime = createRawScriptFixture({memory: program.initializeMemory(Buffer.alloc(0xa00000))}), m = runtime.memory, put = (p, v) => m.writeInt32LE(v | 0, p), word = (p, v) => m.writeUInt16LE(v & 65535, p), body = 0x180000, target = 0x190000, pack = 0x20000, session = 0x21000, groups = 0x30000, graph = 0x40000, points = 0x50000;
    m.fill(i * 17 & 255, 0x8000, 0x9100); m.fill(0x69, body, body + 0x1000); put(0x90b98c, pack); put(pack + 0x60, groups); put(pack + 0x94, graph); put(0x5ecb1c, session); m[session + 0x54d] = 3;
    const scenario = Math.floor(i / 2), entry = i % 2 ? 0x44bc30 : 0x44b970, starts = [0, 1, 31, 32, 33, 62], start = starts[scenario % 6], destination = (start + [0, 1, 2, 3, 7, 8, 9][Math.floor(scenario / 6) % 7]) % 64;
    for (let j = 0; j < 64; j++) {
      const g = groups + j * 12, ps = points + j * 0x200; word(g, 8); m[g + 2] = (j + scenario) % 2; m[g + 4] = scenario % 3 ? 0 : 1; m[g + 5] = j; put(g + 8, ps);
      put(graph + j * 8, 0); put(graph + j * 8 + 4, 0);
      for (const v of scenario % 2 ? [(j + 1) % 64] : [j, (j + 1) % 64]) {const p = graph + j * 8 + (v >> 5) * 4; put(p, m.readInt32LE(p) | 1 << (v & 31));}
      for (let k = -2; k <= 10; k++) {const p = ps + k * 16; word(p, k * 250 + j * 2); word(p + 2, (scenario % 4) * 30); word(p + 4, 0); put(p + 12, ((j + 1) % 64 & 31) | 2 << 5 | (((j + 2) % 64 & 31) << 14) | 3 << 19);}
    }
    const selected = scenario % 4; for (let j = 0; j < 4; j++) {const r = 0x909300 + j * 0x30c; put(r, target); m[r + 0x1d] = j === selected ? 1 : 0; put(r + 0x54, groups + destination * 12); put(r + 0x58, [-1, 0, 2, 7][scenario % 4]);}
    put(body + 0x198, target); put(body + 0x6cc, groups + start * 12); put(body + 0x6d4, groups + (scenario % 5 ? start : (start + 1) % 64) * 12); word(body + 0x6d0, [0, 1, 3, 6, 7][scenario % 5]); word(body + 0x6d8, [0, 1, 2, 6, 7][Math.floor(scenario / 5) % 5]); word(body + 0x6d2, [-2, -1, 0, 1, 2, 32767, -32768][scenario % 7]);
    m.fill(255, body + 0x6bc, body + 0x6c5); m[body + 0x6bc] = [255, 1, 2, 3][scenario % 4];
    for (const [offset, value] of [[0x36, [0, 250, 750, 1500, 1750, -32768, 32767][scenario % 7]], [0x3a, [0, 30, 60, 90][scenario % 4]], [0x3e, 0]]) {word(body + offset, value); word(target + offset, scenario % 3 ? 10000 : value);}
    machine.reset(); m.copy(machine.bytes); const mode = scenario % 2, expected = entry === 0x44b970 ? findProjectileParticipantRoute(body, runtime) : updateProjectileRoute(body, mode, runtime);
    machine.entry = entry; machine.r.ECX = body; machine.r.EDX = mode; machine.r.ESP = runtime.scratchBase; machine.bytes.writeInt32LE(-1, runtime.scratchBase); steps += machine.run(1000000); assert.equal(machine.r.EAX, expected, `fixture${i} return`); results[expected] = (results[expected] ?? 0) + 1;
    const a = machine.bytes.subarray(0x10000), b = m.subarray(0x10000); if (!a.equals(b)) {const p = a.findIndex((v, j) => v !== b[j]); console.error({nativeStack:machine.bytes.subarray(0x8f84,0x8ffc).toString('hex'),sourceStack:m.subarray(0x8f84,0x8ffc).toString('hex')}); assert.fail(`fixture${i}/${entry.toString(16)} diff${(p + 0x10000).toString(16)} native${a[p]} JS${b[p]}`);}
  }
  const report = {method: 'Actual44b970 route graph search and44bc30 endpoint/packed-link/reversal update, real nested route search, only CRT memcpy/security-cookie services. All mapped bytes>=10000h and EAX compared.64 groups with low/high DWORD adjacency, depth-limit/failure/success, actual participant selection including first-unmatched record, populated links/open/closed routes, signed-short indices/directions and overflowed distance boundaries. Explicit synthetic model/session/route storage; no original execution.', targetSha256: program.sha256, fixtures, calls: fixtures, executedInstructions: reached.size, instructionSteps: steps, visits, results, matched: true, evidence: program.references.map(r => r.evidence)};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await verifyProjectileRoutes({fixtures: Number(process.argv[2] ?? 3000)});
