import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeSoloWeaponConstants, initializeSoloWeaponRuntime} from '../src/solo-weapon-runtime.mjs';
import {constructVehicle} from '../src/vehicle-construction.mjs';
import {updateVehicleSurfaceDrive} from '../src/vehicle-control-state.mjs';
import {createVehicleConstructionFixture} from '../tools/lib/vehicle-construction-fixtures.mjs';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

const STACK = 0x9000, programPromise = loadRetainedNativeProgram();
const put = (m, p, v) => m.writeInt32LE(v | 0, p);
function fixture(program, option = 0) {
  const f = createVehicleConstructionFixture(program, 0), m = f.memory, a = f.addresses;
  initializeSoloWeaponConstants(m);
  m[a.session + 0x551] = 1; m[a.session + 0xa86] = option;
  m[a.session + 0x54d] = 1; m[a.session + 0x587] = 0;
  put(m, a.session + 0x57c, 4); put(m, 0x6eafe0, 0);
  m[a.pack + 0x36] = 2; m[a.aux + 0xf7] = 1;
  //Explicit authored fixture, not original asset/session loading.
  f.runtime.roundingMode = 'nearest-even'; f.runtime.x87PrecisionBits = 24;
  return f;
}
function compare(m, machine, label) {
  const native = machine.bytes.subarray(0x10000), source = m.subarray(0x10000);
  if (!native.equals(source)) {
    const offset = native.findIndex((v, i) => v !== source[i]);
    assert.fail(`${label}:0x${(offset + 0x10000).toString(16)} native${native[offset]} source${source[offset]}`);
  }
}
function machineFor(program, f, mutateAllocation) {
  const machine = new BoundedX86(program.instructions, {fpuPrecisionBits: 24});
  machine.reset(); f.memory.copy(machine.bytes);
  let cursor = 0x400000;
  machine.externalCalls.set(0xf0000000, x => {
    const size = x.bytes.readUInt32LE(x.r.ESP), address = cursor;
    cursor += (size + 15) & ~15; mutateAllocation?.(x.bytes, size, address);
    x.r.EAX = address;
  });
  machine.externalCalls.set(0x568a50, x => {
    const p = x.bytes.readUInt32LE(x.r.ESP), n = x.bytes.readUInt32LE(x.r.ESP + 8);
    x.bytes.fill(x.bytes.readUInt32LE(x.r.ESP + 4) & 255, p, p + n); x.r.EAX = p;
  });
  machine.externalCalls.set(0x568162, x => assert.equal(x.r.ECX, x.bytes.readInt32LE(0x5e8890)));
  return machine;
}
function section(machine, entry, stop) {
  const previous = machine.onInstruction; let stopped = false;
  machine.onInstruction = address => {if (address === stop) {stopped = true; throw Error('Owned native section endpoint.');} previous?.(address);};
  machine.entry = entry;
  try {machine.run(3_000_000);} catch (error) {if (!stopped) throw error;} finally {machine.onInstruction = previous;}
  assert.equal(stopped, true);
}
function execute(machine, entry, {ecx = 0, edi = 0} = {}) {
  machine.entry = entry; machine.r.ESP = STACK; machine.r.ECX = ecx; machine.r.EDI = edi;
  put(machine.bytes, STACK, -1); machine.run(3_000_000);
}

test('actual contiguous startup matches all mapped bytes with disabled/enabled pickups and a live allocator root change', async () => {
  const program = await programPromise;
  for (const variant of [0, 1, 2]) {
    const f = fixture(program, variant === 1 ? 1 : 0), m = f.memory, a = f.addresses;
    const originalAllocate = f.runtime.handlers.allocate;
    const mutate = (bytes, size) => {
      if (variant === 2 && size === 0x800) {
        //Actual malloc may publish a changed global.47ed1e captures its
        //returned pack before the subsequent map/state stores.
        bytes.copy(bytes, 0x84000, a.pack, a.pack + 0x100);
        put(bytes, 0x90b98c, 0x84000);
      }
    };
    f.runtime.handlers.allocate = (size, context) => {const p = originalAllocate(size, context); mutate(m, size); return p;};
    const machine = machineFor(program, f, mutate), owned = initializeSoloWeaponRuntime(f.runtime);
    machine.r.ESP = STACK + 4; machine.r.EDI = 0xf0000000 | 0;
    section(machine, 0x47eccf, 0x47eda2); compare(m, machine, `startup${variant}`);
    assert.equal(m.readUInt32LE(0x902024), variant === 1 ? 2 : 0);
    assert.equal(m[a.session + 0x551], 1); assert.equal(m[a.session + 0xa86], variant === 1 ? 1 : 0);
    assert.equal(m.readUInt32LE(0x81118c), 65536);
    assert.equal(owned.bodyStorage.length, variant === 1 ? 34 : 31);
    for (const row of owned.bodyStorage) assert.equal(owned.bodyAt(row.address).bytes.buffer, m.buffer);
    assert.equal(owned.bodyAt(0), null);
    for (let i = 0; i < 6; i++) {assert.equal(m[0x8495e0 + i * 0x8c], 0); assert.equal(m.readInt32LE(0x84964c + i * 0x8c), -1);}
    const history = m.readUInt32LE(0x90cb60);
    assert.ok(m.subarray(history, history + 0x800).every(v => v === 255));
  }
});

test('full weapon stage consumes actual surface-drive gains, native caps and the equality floor cycle over persistent frames', async () => {
  const program = await programPromise;
  let calls = 0;
  for (const extra of [0, 1]) {
    const f = fixture(program), m = f.memory, a = f.addresses, owned = initializeSoloWeaponRuntime(f.runtime);
    const body = constructVehicle(a.record, 0, f.runtime);
    m[a.session + 0x587] = extra;
    const machine = machineFor(program, f); m.copy(machine.bytes);
    const cap = extra ? 0xe0000 : 0xd0000, material = a.materials;
    put(m, body + 0x198, material); m[material + 12] = 1;
    put(m, body + 0x710, 0x40); put(m, body + 0x714, 0);
    m.copy(machine.bytes);
    for (let tick = 0; tick < 160; tick++) {
      updateVehicleSurfaceDrive(a.record, f.runtime); execute(machine, 0x48d680, {ecx: a.record});
      compare(m, machine, `surface${extra}/${tick}`); calls++;
      owned.step({scratchBase: STACK, entryRegisters: {EDI: 1}}); execute(machine, 0x48d7c0, {edi: 1});
      compare(m, machine, `stage${extra}/${tick}`); calls++;
      assert.ok(m.readInt32LE(body + 0x6a8) <= cap);
      put(m, 0x90a548, tick + 1); put(machine.bytes, 0x90a548, tick + 1);
    }
    assert.equal(m.readInt32LE(body + 0x6a8), cap);
    //No invented max(base, value-1024): equality subtracts below base once.
    m[material + 12] = 0; put(m, body + 0x6a8, 0x60000); put(m, body + 0x6ac, 0x60000); m.copy(machine.bytes);
    for (const expected of [0x5fc00, 0x60000, 0x5fc00, 0x60000]) {
      owned.step({scratchBase: STACK, entryRegisters: {EDI: 1}}); execute(machine, 0x48d7c0, {edi: 1});
      compare(m, machine, `floor${extra}/${expected}`); calls++; assert.equal(m.readInt32LE(body + 0x6a8), expected);
    }
  }
  console.log(JSON.stringify({calls, compared: 'all mapped bytes>=10000h after every actual surface-drive and complete weapon-stage call; constructed dormant projectile/pickup world'}));
});

test('fresh construction resets state reproducibly and rejects missing storage/services or invented update/callback context', async () => {
  const program = await programPromise, a = fixture(program), b = fixture(program);
  const first = initializeSoloWeaponRuntime(a.runtime), second = initializeSoloWeaponRuntime(b.runtime);
  assert.deepEqual(first.bodyStorage, second.bodyStorage); assert.deepEqual(a.memory.subarray(0x10000), b.memory.subarray(0x10000));
  assert.throws(() => initializeSoloWeaponRuntime({}), /shared native/);
  assert.throws(() => initializeSoloWeaponRuntime({...a.runtime, handlers: {}}), /CRT allocator/);
  const failed = fixture(program); failed.runtime.handlers.allocate = () => 0;
  assert.throws(() => initializeSoloWeaponRuntime(failed.runtime), /failed-allocation/);
  assert.throws(() => first.step(), /stage entry/);
  assert.throws(() => first.step({scratchBase: STACK, entryRegisters: {EDI: 1}, memory: b.memory}), /replace/);
  assert.throws(() => first.createCollisionFilters({}), /callback entry/);
  const filters = first.createCollisionFilters({scratchBase: STACK - 52});
  assert.deepEqual([...filters.keys()], [0x46b820, 0x44b6c0, 0x4302f0, 0x49ab40]);
  assert.throws(() => filters.get(0x46b820)({}, null, {}), /shared body/);
});

test('retained caller instructions establish startup and reached drive-decay ownership and stage ordering', async () => {
  const p = await readInstructionEvidence(['2457-autonomous-initializer-dispatch-assembly.json', '310-race-step-parent-assembly.json', '3201-race-stage-48d7c0-assembly.json'], {directory: 'analysis/native-simulation/results'});
  const listing = new Map(p.instructions.map(row => [row.address, row]));
  for (const [address, target] of [[0x47ece5, '0x00495320'], [0x47ecea, '0x0047b580'], [0x47ecef, '0x0046a420'], [0x47ed83, '0x004820f0'], [0x47ed94, '0x00482590'], [0x451038, '0x00443d90'], [0x45103f, '0x0048d680'], [0x451092, '0x0048d7c0'], [0x4510c2, '0x0041d2b0']]) assert.deepEqual(listing.get(address), {address, op: 'CALL', args: [target]});
  assert.deepEqual(listing.get(0x48d87d), {address: 0x48d87d, op: 'ADD', args: ['EAX', '0xfffffc00']});
  assert.ok(p.evidence.every(row => row.subject.digest.sha256 === 'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5'));
});
