import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createTerrainWaveFixture} from './lib/terrain-wave-fixtures.mjs';
import {updateProjectileImpulse, explodeProjectile, updateHomingProjectile} from '../src/projectile-flight.mjs';
import {applyProjectileVehicleImpact} from '../src/projectile-collisions.mjs';

export async function verifyProjectileFlight({fixtures = 8000, output = 'analysis/projectile-flight-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}; let steps = 0, stops = 0, seed = 0x46bc30ab;
  const random = () => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0;};
  const watched = new Set([0x46a900, 0x46bad0, 0x46bc30, 0x46b740, 0x46bcd0, 0x482730, 0x46aba0, 0x435ba0, 0x435f20, 0x475a10, 0x437aa0, 0x474850, 0x4284d0, 0x46b070, 0x436870, 0x484bb0]);
  machine.onInstruction = p => {reached.add(p); if (watched.has(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;}; machine.externalCalls.set(0x568162, x => assert.equal(x.r.ECX >>> 0, x.bytes.readUInt32LE(0x5e8890)));
  for (let i = 0; i < fixtures; i++) {
    const f = createTerrainWaveFixture(program, i), m = f.memory, body = f.body, put = (p, v) => m.writeInt32LE(v | 0, p), word = (p, v) => m.writeUInt16LE(v & 65535, p), scenario = Math.floor(i / 4), entry = [0x46bc30, 0x46b740, 0x46a900, 0x46bcd0][i % 4];
    f.roundingMode = ['nearest-even', 'toward-zero', 'down', 'up'][scenario % 4]; m.fill(i * 13 & 255, 0x8000, 0x9100);
    for (const offset of [0x40, 0x44, 0x48, 0x1a8, 0x1ac, 0x1b0]) put(body + offset, random());
    for (const offset of [0x1b8, 0x1ba, 0x1bc]) word(body + offset, random()); put(body + 0x180, [-2147483648, -33, -1, 0, 1, 2, 32, 33, 0x7fffffff][scenario % 9]);
    put(body + 0x184, entry === 0x46a900 ? 1 : scenario % 3); put(body + 0x188, entry === 0x46a900 ? [0, 1, 2, 3, 4, 8, 16, 32, 33][scenario % 9] : 2); word(body + 0x18c, scenario % 32); m[body + 0x18e] = scenario % 34;
    if (entry === 0x46a900) put(body + 0x180, [0, 1, 2, 10, 149, 150, 151, -1, 0x7fffffff][Math.floor(scenario / 9) % 9]); put(body + 0x194, body + 0x5000); put(body + 0x198, scenario % 2 ? body + 0x5000 : 0); put(body + 0x19c, 0x800000); put(body + 0x1a0, 0x200000); put(body + 0x1a4, -0x100000); m[body + 0x5000 + 0x70b] = 1; m[body + 0x5000 + 0x71e] = scenario % 20; m[body + 0x5000 + 0x6b4] = scenario % 2;
    const bucket = f.addresses.bucket; put(body + 4, 0); put(body + 12, bucket); word(bucket + 8, 1); put(bucket, 1 | 2 << 7 | 2 << 1); word(f.regions, 2); word(f.regions + 2, 0);
    put(0x919008, 0x200000); put(0x9153c0, 0x230000); put(0x90b980, f.palette);
    put(0x902bc0, 0x71000); word(0x902bc4, 2); put(0x71000, scenario % 2 ? body : f.addresses.body); put(0x71004, scenario % 2 ? f.addresses.body : body); put(body + 0x130, 0x72000); put(0x72000, 0x72100); word(0x72004, 1); put(0x72100, body);
    m[body + 0x10c] = scenario % 4 ? scenario % 4 - 1 : 255; put(0x91e780, 0x73000); put(0x91e78c, 0x73100); put(0x91e790, 0x73200); put(0x91e784, 7); put(0x91e794, -1); put(0x91e798, 8); for (let j = 0; j < 8; j++) {m[0x73100 + j] = j; m[0x73200 + j] = j; m[body + 0x140 + j] = j;}
    put(body + 0x5c0, [127, 0, 256, 0x74000][scenario % 4]); put(0x74000, scenario % 3 ? 0x74100 : 0); put(0x74100, 0x74200); put(0x74234, 0x7d0010);
    const vehicle=body+0x5000,event=0x76000,state=0x78000;put(vehicle,scenario%5?3:7);put(vehicle+0x6bc,scenario%3?state:-1);m[state]=scenario%2;m[state+1]=scenario%20;m[state+8]=scenario%3;put(0x713180,0x79000);for(let j=0;j<64;j++)m[0x79000+j]=j;for(const o of[0x40,0x44,0x48,0x68,0x6c,0x70,0x80,0x84,0x88])put(vehicle+o,random());put(event+0x38,random());put(event+0x40,random());
    const expectedCalls = [], actualCalls = []; f.handlers = {sourceCall: (pointer, method, args) => {expectedCalls.push([pointer, method, args]); put(0x75000, m.readInt32LE(0x75000) + 1);}};
    machine.externalCalls.set(0x7d0010, x => {actualCalls.push([x.r.ECX >>> 0, 0x34, []]); x.bytes.writeInt32LE(x.bytes.readInt32LE(0x75000) + 1, 0x75000);});
    machine.reset(); machine.fpuRounding = f.roundingMode; m.copy(machine.bytes); const mode = [0, 1, 2, -1, 3][scenario % 5]; if (entry === 0x46bc30) updateProjectileImpulse(body, f); else if (entry === 0x46b740) explodeProjectile(body, mode, f); else if(entry===0x46a900)updateHomingProjectile(body, f);else applyProjectileVehicleImpact(vehicle,event,f);
    machine.entry = entry; machine.r.ECX = entry===0x46bcd0?vehicle:body; machine.r.EDX = entry===0x46bcd0?event:mode; machine.r.ESP = f.scratchBase; machine.bytes.writeInt32LE(-1, f.scratchBase); steps += machine.run(1000000); assert.deepEqual(actualCalls, expectedCalls); stops += actualCalls.length;
    const a = machine.bytes.subarray(0x10000), b = m.subarray(0x10000); if (!a.equals(b)) {const p = a.findIndex((v, j) => v !== b[j]); assert.fail(`fixture${i}/${entry.toString(16)} diff${(p + 0x10000).toString(16)} native${a[p]} JS${b[p]}`);}
  }
  const report = {method: 'Actual46bcd0 vehicle-impact scoring/shields/feedback plus actual46a900 full homing projectile tick including countdown launch,homing,detonation,trail drain; actual46bc30 decaying impulse/orientation and46b740 explosion→trail→all mask children→particle/debris/terrain→spatial+physical teardown→sound stop. ALLmappedmemory>=10000h and ordered audio COM calls compared, four rounding modes, wrapped age shifts, populated particles/terrain/registry/free lists and controller pools. No game mocks; only security cookie and audio COM service. Explicit synthetic constructor inputs, no original execution.', targetSha256: program.sha256, fixtures, calls: fixtures, executedInstructions: reached.size, instructionSteps: steps, visits, stops, matched: true, evidence: program.references.map(r => r.evidence)};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await verifyProjectileFlight({fixtures: Number(process.argv[2] ?? 8000)});
