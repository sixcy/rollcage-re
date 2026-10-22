import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createVehicleConstructionFixture} from './lib/vehicle-construction-fixtures.mjs';
import {initializeWormholeVisualTables} from '../src/wormhole-visuals.mjs';
import {initializeProjectileConstructionTables, initializeProjectilePools, initializeProjectileState, initializeProjectileMaterialRecords} from '../src/projectile-construction.mjs';
import {updateActiveProjectiles} from '../src/projectile-world-state.mjs';

export async function verifyProjectileConstruction({scenarios = 120, leaves = 2000, output = 'analysis/projectile-construction-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), machine = new BoundedX86(program.instructions), reached = new Set(), visits = {}; let steps = 0, calls = 0;
  const watched = new Set([0x46a420, 0x46a380, 0x495280, 0x4741c0, 0x4798d0, 0x474850, 0x49a6f0, 0x49bf10, 0x4901d0, 0x46a7f0, 0x46a900, 0x44b240, 0x42f950, 0x46b000]); machine.onInstruction = p => {reached.add(p); if (watched.has(p)) visits[p.toString(16)] = (visits[p.toString(16)] ?? 0) + 1;};
  machine.externalCalls.set(0x568162, x => assert.equal(x.r.ECX >>> 0, x.bytes.readUInt32LE(0x5e8890)));
  const run = (entry, ecx, edx) => {machine.entry = entry; machine.r.ECX = ecx ?? 0; machine.r.EDX = edx ?? 0; machine.r.ESP = 0x9000; machine.bytes.writeInt32LE(-1, 0x9000); steps += machine.run(3000000); calls++;};
  const compare = (m, label) => {const a = machine.bytes.subarray(0x10000), b = m.subarray(0x10000); if (!a.equals(b)) {const p = a.findIndex((v, j) => v !== b[j]); assert.fail(`${label} diff${(p + 0x10000).toString(16)} native${a[p]} JS${b[p]}`);}};
  for (let i = 0; i < scenarios; i++) {
    const f = createVehicleConstructionFixture(program, i), m = f.memory, put = (p, v) => m.writeInt32LE(v | 0, p), runtime = {...f.runtime, roundingMode: ['nearest-even', 'toward-zero', 'down', 'up'][i % 4]}; initializeProjectileConstructionTables(m); initializeWormholeVisualTables(m);
    m.fill(i * 17 & 255, 0x8000, 0x9100); m.fill(0x69, f.addresses.arena, f.addresses.arena + 0x40000); put(0x70dcf4, [0, 1, 2, 3, 128][i % 5]); put(0x6e6b44, [0, 480, 511, 512, 513][Math.floor(i / 5) % 5]); put(0x5ed2c8, i * 1727341); put(0x903500, -1);
    machine.reset(); machine.fpuRounding = runtime.roundingMode; m.copy(machine.bytes); initializeProjectilePools(runtime); run(0x46a420); compare(m, `pool${i}`);
    assert.equal(m.readInt32LE(0x903500), 0); for (let j = 0; j < 24; j++) {const body = m.readUInt32LE(0x9034a0 + j * 4); assert.equal(m.readInt32LE(body + 0x188), 0); assert.equal(m.readInt32LE(body + 0x184), j < 4 ? 1 : j < 22 ? 2 : 0);}
    //Actual constructor identities feed the full fixed24-slot dispatcher.
    //Retirement state is a declared producer input; full launch/tick proofs
    //are separate. This includes the final lower-trail pass after deactivation.
    for(let j=0;j<6;j++)put(m.readUInt32LE(0x903480+j*4)+0x194,16);
    for(let j=0;j<24;j++){const body=m.readUInt32LE(0x9034a0+j*4);put(body+0x188,16);m[body+0x18e]=[0,1,2,3,31,32][(i+j)%6];m.writeUInt16LE((i+j)%32,body+0x18c);}
    m.copy(machine.bytes);for(let tick=0;tick<4;tick++){for(const bytes of[m,machine.bytes])bytes.writeInt32LE(i+tick,0x90a548);updateActiveProjectiles(runtime);run(0x46a7f0);compare(m,`dispatch${i}/${tick}`);}
  }
  for (let i = 0; i < leaves; i++) {
    const f = createVehicleConstructionFixture(program, i), m = f.memory, body = f.addresses.body, put = (p, v) => m.writeInt32LE(v | 0, p); m.fill(0x69, body, body + 0x800); put(body + 0x184, [-1, 0, 1, 2, 3][i % 5]);
    if (i % 4 === 0) put(0x90b988, body + 0x5c0 - 63 * 16); const entry = i % 2 ? 0x46a380 : 0x495280;
    machine.reset(); m.copy(machine.bytes); if (entry === 0x46a380) initializeProjectileState(body, i * 1234567, f.runtime); else initializeProjectileMaterialRecords(body, f.runtime); run(entry, body, i * 1234567); compare(m, `leaf${i}`);
  }
  const report = {method: 'Actual46a420 full projectile pool constructor→4741c0/4798d0/spatial→46a380/495280, six master/18satellite identities, four homing/two ground slots, then actual49a6f0 wormhole constructor/47visual records. Four persistent46a7f0 dispatcher ticks perconstructor use actualall3childticks/lowertrail with explicitretirement producer states (launch/flight branches independentlyproved). Full mapped-memory>=10000h; low arena alignment,signed512 registration cap,stale allocator fields,materials aliases. Only security cookie service; no game mocks,no original execution. Authored resource/model/material roots and initial arena/session remain explicit fixture inputs.', targetSha256: program.sha256, scenarios, leaves, calls, executedInstructions: reached.size, instructionSteps: steps, visits, matched: true, evidence: program.references.map(r => r.evidence)};
  if (output) await writeFile(output, JSON.stringify(report, null, 2)); const {evidence, ...summary} = report; console.log(JSON.stringify(summary)); return report;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await verifyProjectileConstruction({scenarios: Number(process.argv[2] ?? 120), leaves: Number(process.argv[3] ?? 2000)});
