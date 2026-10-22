import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createSimulationRuntimeFixture} from './lib/simulation-runtime-fixtures.mjs';
import {buildFrameCandidates} from '../src/frame-candidates.mjs';
import {updateProjectileMasterGroundVelocity, updateSatelliteMaster, updateSatelliteProjectile} from '../src/projectile-satellites.mjs';
import {initializeWheelEffectTables} from '../src/wheel-effects.mjs';

export async function verifyProjectileSatellites({fixtures = 6000, output = 'analysis/projectile-satellites-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}; let steps = 0, queries = 0, hits = 0;
  const watched = new Set([0x42f950, 0x42fce0, 0x430780, 0x424ff0, 0x46aba0, 0x474600, 0x474850, 0x4334b0, 0x484bb0]); machine.onInstruction = p => {reached.add(p); if (watched.has(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1; if (p === 0x424ff0) queries++;};
  machine.externalCalls.set(0x568162, x => assert.equal(x.r.ECX >>> 0, x.bytes.readUInt32LE(0x5e8890)));
  for (let i = 0; i < fixtures; i++) {
    const f = createSimulationRuntimeFixture(program, i, {count: 1}), m = f.memory, body = f.bodies[0].address, satellite = 0x180000, owner = 0x190000, put = (p, v) => m.writeInt32LE(v | 0, p), word = (p, v) => m.writeUInt16LE(v & 65535, p), runtime = {...f.context.nativeTerrain, scratchBase: 0x9000, roundingMode: 'nearest-even'}, scenario = Math.floor(i / 3), entry = [0x430780, 0x42fce0, 0x42f950][i % 3]; initializeWheelEffectTables(m);
    m.fill(i * 17 & 255, 0x8000, 0x9100); put(body + 0x34, [0, 20, -20, 2000][scenario % 4] << 16); put(body + 0x38, [-100, -81, -80, -79, -40, -1, 0, 1, 40][Math.floor(scenario / 4) % 9] << 16); put(body + 0x3c, 0);
    put(body + 0x68, [0, 20, -20, 60][Math.floor(scenario / 9) % 4] << 16); put(body + 0x70, [0, 10, -10, 60][Math.floor(scenario / 36) % 4] << 16); put(body + 0x44, [0, -1, 65536, 0x7fffffff, -2147483648][scenario % 5]);
    buildFrameCandidates(f.bodies, {...f.options, records: f.views.records, arena: f.views.candidateArena, spatialStateFor: f.context.spatialStateFor});
    put(satellite + 0x194, body); put(body + 0x180, owner); put(body + 0x190, scenario % 5 ? i - 1 : i); put(body + 0x194, [0, 1, 2, 16][scenario % 4]); put(body + 0x198, [1, 2, 10, 31][Math.floor(scenario / 4) % 4]);
    word(body + 0x1a8, [0, 240, 255, 256, 32767, 65535][scenario % 6]); word(body + 0x1aa, [0, 127, 128, 129, 137, 138, 32767, 32768, 65535][scenario % 9]);
    for (const [offset, value] of [[0x40, [0, 4096, 4097, -4097, 0x7fffffff, -2147483648][scenario % 6]], [0x48, [0, -4096, -4097, 4097, -2147483648, 0x7fffffff][scenario % 6]], [0x19c, scenario * 1727341], [0x1a4, scenario * -713381]]) put(body + offset, value);
    m[owner + 0x6b4] = scenario % 2; m[owner + 0x70b] = 1; m[owner + 0x71e] = scenario % 20;
    for (let j = 0; j < 3; j++) {const s = satellite + j * 0x4000; m.fill(0x69, s, s + 0x1000); put(body + 0x184 + j * 4, s); put(s + 0x194, body); put(s + 0x184, 2); put(s + 0x188, scenario % 2 && j ? 0 : 2); put(s + 4, 0); put(s + 12, f.addresses.nodes); word(s + 0x18c, scenario % 32); m[s + 0x18e] = [0, 1, 2, 3, 31, 32, 127, 128, 255][scenario % 9]; m[s + 0x18f] = j; for (let k = 0; k < 3; k++) put(s + 0x34 + k * 4, 0);}
    machine.reset(); machine.fpuRounding = 'nearest-even'; m.copy(machine.bytes); if (entry === 0x430780) updateProjectileMasterGroundVelocity(body, runtime); else if (entry === 0x42fce0) updateSatelliteMaster(satellite, runtime); else updateSatelliteProjectile(satellite, runtime);
    machine.entry = entry; machine.r.ECX = entry === 0x430780 ? body : satellite; machine.r.ESP = 0x9000; machine.bytes.writeInt32LE(-1, 0x9000); steps += machine.run(1000000); if (m.readInt32LE(0x9000 - 140 + 0x34)) hits++;
    const a = machine.bytes.subarray(0x10000), b = m.subarray(0x10000); if (!a.equals(b)) {const p = a.findIndex((v, j) => v !== b[j]); assert.fail(`fixture${i}/${entry.toString(16)} diff${(p + 0x10000).toString(16)} native${a[p]} JS${b[p]}`);}
  }
  const report = {method: 'Actual42f950 full satellite tick/orientation/spatial/trails and42fce0 master update-once clock/countdown/orbit/radius/damping→430780 two-ray ground control→actual424ff0 full rawterrain query. Coherent candidate bytes prepared by actual source4287f0 defaults (independently verified); explicit synthetic terrain/session/body/model roots. Allmappedmemory>=10000h, overflow velocities/momentum, phase/radius signedwidths,hit/miss and clock gates. Only cookie service,no game mocks or original execution. This checks full satellite/master state and real terrain consumer; launch and integrated native candidate-producer prefix remain separate.', targetSha256: program.sha256, fixtures, calls: fixtures, executedInstructions: reached.size, instructionSteps: steps, queries, hits, visits, matched: true, evidence: program.references.map(r => r.evidence)};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await verifyProjectileSatellites({fixtures: Number(process.argv[2] ?? 6000)});
