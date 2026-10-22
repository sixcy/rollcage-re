import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {createRawScriptFixture} from './lib/raw-scripted-motion-fixtures.mjs';
import {filterVehicleCollision, applyRawActiveVehicleEffect} from '../src/vehicle-collision-filter.mjs';
import {addVehicleContactScore, subtractVehicleContactScore, updateVehicleContactForObject, triggerVehicleContactRecovery} from '../src/vehicle-contact-state.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {filterCollisionEvent} from '../src/collision-events.mjs';
import {createVehicleCollisionFilter} from '../src/vehicle-collision-filter.mjs';
const put = (memory, address, value) => memory.writeInt32LE(value | 0, address);
const word = (memory, address, value) => memory.writeUInt16LE(value & 65535, address);
export const vehicleFilterAddresses = {event: 0x70000, session: 0x80000, profile: 0x81000, state: 0x82000, lookup: 0x83000, bodies: [0x100000, 0x140000, 0x150000, 0x160000]};

export function createVehicleFilterFixture(fixture, memory = Buffer.alloc(0xa00000)) {
  const f = createRawScriptFixture({memory, freeCount: fixture % 7 ? 16 : 0}), a = vehicleFilterAddresses;
  put(memory, 0x5ecb1c, a.session); memory[a.session + 0x54d] = 4;
  put(memory, 0x91f6a0, a.profile); put(memory, 0x713180, a.lookup);
  for (let index = 0; index < 8; index++) memory[a.profile + index] = index * 31;
  for (let index = 0; index < 64; index++) memory[a.lookup + index] = (index * 11 + fixture) & 255;
  for (const [index, body] of a.bodies.entries()) {
    put(memory, 0x909300 + index * 0x30c, body); put(memory, body, 3); word(memory, body + 0x65e, index);
    memory[body + 0x718] = (fixture + index) % 3 ? 8 : 1;
    memory[body + 0x6c9] = (fixture >> index) & 1; memory[body + 0x6db] = fixture % 4 ? 0 : 255;
    memory[body + 0x6f3] = index > 1 ? 1 : 255;
    put(memory, body + 0x6f8, ((fixture + index) % 8) << 12 | ((fixture * 3 + index) % 8) << 9);
    for (let other = 0; other < 4; other++) word(memory, body + 0x6fc + other * 2, [0, 1, 149, 150, 499, 1000, 65534, 65535][(fixture + index * 3 + other) % 8]);
    put(memory, body + 0x6bc, fixture % 3 ? a.state : -1);
    for (let lane = 0; lane < 9; lane++) word(memory, body + 0xc4 + lane * 2, fixture % 4 ? (lane % 4 ? 0 : 4096) : (fixture * (lane + 1) * 173) & 65535);
  }
  const body = f.body, event = fixture % 13 === 0 ? body + 0x20 : fixture % 19 === 0 ? 0x5ec8fc : a.event, other = a.bodies[1];
  put(memory, other, [3, 12, 17, 7][Math.floor(fixture / 8) % 4]); put(memory, other + 0x194, a.bodies[2]); put(memory, other + 0x180, a.bodies[2]);
  memory[body + 0x64f] = fixture % 2; memory[body + 0x66f] = fixture % 5 ? 0 : 255;
  memory[body + 0x671] = 0; word(memory, body + 0x668, [0, 3, 4, 127, 32767, 65535][fixture % 6]);
  word(memory, body + 0x6c4, fixture % 5 ? 0 : 1); memory[body + 0x6b4] = fixture % 3;
  put(memory, 0x5ea4d8, fixture % 4 - 1); put(memory, 0x5ea4d4, fixture * 31337); put(memory, 0x5ec958, fixture * 67 + 1);
  memory[a.state] = Math.floor(fixture / 8) % 2; memory[a.state + 1] = fixture & 255; memory[a.state + 8] = fixture % 3 ? 0 : 10;
  put(memory, event + 4, fixture % 2 ? body : other); put(memory, event + 8, other);
  for (let lane = 0; lane < 3; lane++) {
    put(memory, body + 0x34 + lane * 4, (fixture % 13 - 6 + lane) * 65536);
    put(memory, body + 0x40 + lane * 4, (fixture % 17 - 8 + lane) * 0x100000);
    put(memory, body + 0x68 + lane * 4, (fixture % 11 - 5 + lane) * 65536);
    put(memory, event + 0x2c + lane * 4, (fixture % 7 - 3 + lane) * 256);
    put(memory, event + 0x38 + lane * 4, lane === fixture % 3 ? (fixture % 2 ? -65536 : 65536) : 0);
    put(memory, event + 0x5c + lane * 4, Math.floor(fixture / 8) % 11 === 0 ? 0x700000 : [0, 65536, 0x80000, 0x180000, 0x400000][(fixture + lane) % 5]);
    put(memory, body + 0x674 + lane * 4, lane ? 0 : 65536);
  }
  if (fixture % 17 === 0) {
    memory.copy(memory, body + 0x66e, a.state, a.state + 265); put(memory, body + 0x6bc, body + 0x66e);
  }
  if (fixture % 23 === 0) put(memory, 0x713180, body + 0x674);
  return {...f, event, other};
}

export async function verifyVehicleCollisionFilter({fixtures = 2400, chainFixtures = 120, output = 'analysis/vehicle-collision-filter-instruction-check.json'} = {}) {
  const program = await loadRetainedNativeProgram(), listing = await loadRetainedListing('analysis/vehicle-filter-listing.json', 'analysis/native-simulation/results/1454-vehicle-filter-bytes.json');
  const machine = new BoundedX86([...program.instructions, ...listing.instructions]), reached = new Set(), visits = {};
  const watched = new Set([0x41e080, 0x41f490, 0x41f410, 0x41f5f0, 0x41f630, 0x41f380, 0x46e760, 0x475c30, 0x482730, 0x484bb0, 0x40ea40]);
  machine.onInstruction = address => {reached.add(address); if (watched.has(address)) visits[address.toString(16)] = (visits[address.toString(16)] ?? 0) + 1;};
  machine.externalCalls.set(0x568162, m => assert.equal(m.r.ECX | 0, m.bytes.readInt32LE(0x5e8890)));
  let steps = 0;
  const entries = [0x41e080, 0x41e080, 0x41f490, 0x41f410, 0x41f5f0, 0x41f630, 0x41f380, 0x482730];
  for (let fixture = 0; fixture < fixtures; fixture++) {
    const f = createVehicleFilterFixture(fixture, program.initializeMemory(Buffer.alloc(0xa00000))), {memory, body, event, other, scratchBase} = f;
    const selector = fixture % entries.length, entry = entries[selector], amount = [0, 1, 12, 17, 19, 20, 127, 150, 65535, 65536][Math.floor(fixture / 8) % 10];
    let ecx = body, edx = other, args = [], expected;
    if (selector < 2) args = [body, selector ? other : 0, event];
    else if (selector < 6) args = [selector > 3 ? fixture % 2 ? 12 : 17 : amount];
    else if (selector === 6) edx = amount;
    else {put(memory, body + 0x6bc, vehicleFilterAddresses.state); edx = event + 0x38; args = [amount];}
    args.forEach((value, index) => put(memory, scratchBase + 4 + index * 4, value));
    machine.reset(); memory.copy(machine.bytes);
    if (selector < 2) expected = filterVehicleCollision(body, args[1], event, f);
    else if (selector === 2) addVehicleContactScore(body, other, amount, f);
    else if (selector === 3) subtractVehicleContactScore(body, other, amount, f);
    else if (selector < 6) updateVehicleContactForObject(body, other, args[0], selector === 4, f);
    else if (selector === 6) triggerVehicleContactRecovery(body, amount, f);
    else applyRawActiveVehicleEffect(body, edx, amount, f);
    machine.entry = entry; machine.r.ECX = ecx; machine.r.EDX = edx; machine.r.ESP = scratchBase; put(machine.bytes, scratchBase, -1);
    try {
      steps += machine.run(2000000); if (expected !== undefined) assert.equal(machine.r.EAX, expected);
      const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
      if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`fixture${fixture}/entry${entry.toString(16)}/byte${(offset + 0x10000).toString(16)} native${native[offset]} JS${source[offset]}`);}
    } catch (error) {console.error({fixture, entry: entry.toString(16)}); throw error;}
  }
  for (let fixture = 0; fixture < chainFixtures; fixture++) {
    const f = createVehicleFilterFixture(fixture, program.initializeMemory(Buffer.alloc(0xa00000))), {memory, body, event, other, scratchBase} = f, delta = 0x84000;
    put(memory, event + 4, body); put(memory, event + 8, other); put(memory, body + 0x148, 0x41e080); put(memory, other + 0x148, 0);
    put(memory, delta, 65536);
    const collisionFilters = new Map([[0x41e080, createVehicleCollisionFilter({...f, scratchBase: scratchBase - 28})]]);
    const views = createPhysicsRuntimeViews({memory, bodyStorage: vehicleFilterAddresses.bodies.map(address => ({address, length: 0x4000})), bodyLists: [], collisionFilters});
    machine.reset(); memory.copy(machine.bytes);
    assert.equal(filterCollisionEvent(views.eventAt(event), 65536), 65536);
    machine.entry = 0x474b20; machine.r.ECX = event; machine.r.EDX = delta; machine.r.ESP = scratchBase; put(machine.bytes, scratchBase, -1);
    steps += machine.run(2000000);
    const native = machine.bytes.subarray(0x10000), source = memory.subarray(0x10000);
    if (!native.equals(source)) {const offset = native.findIndex((value, index) => value !== source[index]); assert.fail(`chain${fixture}/byte${(offset + 0x10000).toString(16)}`);}
  }
  const report = {method: 'Actual41e080 vehicle collision callback from byte-checked Ghidra Listing plus actual41f490/41f410 scores,41f5f0/41f630 adapters,41f380 recovery,all numeric helpers,46e760/475c30 debris and482730/484bb0/40ea40 active effects. Additional actual474b20→installed callback→all descendants chains through coherent physics views. Empty sound bank is actual declared input, not an emitter substitution. Full mapped memory above10000h compared, private stack excluded. Event/body/RNG and state/lookup/body aliases; signed-overflow root sums use original neighboring table bytes. Synthetic vehicle/session/event/profile/state/lookup/pool producers. Compiler-cookie equality is the only reached external service. No original-process execution or complete constructor/pair-parent claim.', targetSha256: program.sha256, listingEvidence: listing.evidence, fixtures, chainFixtures, executedInstructions: reached.size, instructionSteps: steps, actualGameCalls: visits, matched: true};
  if (output) await writeFile(output, JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {const {listingEvidence, ...report} = await verifyVehicleCollisionFilter(); console.log(JSON.stringify(report));}
