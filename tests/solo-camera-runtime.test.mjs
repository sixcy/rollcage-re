import test from 'node:test';
import assert from 'node:assert/strict';
import {createSoloCameraRuntime, initializeSoloCameraConstants} from '../src/solo-camera-runtime.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationVehicleFixture} from '../tools/lib/simulation-vehicle-fixtures.mjs';
import {createVehicleRuntimeViews} from '../src/vehicle-runtime-views.mjs';
import {createVehicleCollisionFilter} from '../src/vehicle-collision-filter.mjs';
import {removeBodySpatial} from '../src/body-retirement.mjs';
import {registerRawBodySpatial} from '../src/raw-body-construction.mjs';
import {loadRetainedListing} from '../tools/lib/retained-listing-program.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

const programPromise = loadRetainedNativeProgram();
const put = (m, p, v) => m.writeInt32LE(v | 0, p);

async function fixture(count = 1) {
  const program = await programPromise;
  const f = createSimulationVehicleFixture(program, 1, {vehicleCount: count, models: false,
    extraBodyStorage: [{address: 0x6f9a20, length: 0x1000}, {address: 0x70f130, length: 0x3e78}]});
  const m = f.memory, session = f.extraAddresses.session, config = 0x295000, log = [];
  let cursor = 0x350000;
  const allocate = size => {const address = cursor; cursor += size + 127 & ~127; assert.ok(cursor < 0x500000); m.fill(0, address, cursor); log.push(['allocate', size, address]); return address;};
  initializeSoloCameraConstants(m);
  assert.equal(m.toString('ascii', 0x5d043c, 0x5d0446), program.initializeMemory(Buffer.alloc(0xa00000)).toString('ascii', 0x5d043c, 0x5d0446));
  put(m, 0x5ecefc, config); m.writeUInt16LE(640, config + 0x42c); m.writeUInt16LE(480, config + 0x42e);
  m[session + 0x54d] = count; m[session + 0x551] = 1; m[session + 0x552] = 0; m[session + 0x58c] = 0;
  put(m, 0x70dcf4, 0x230000); put(m, 0x909288, 0x271000); put(m, 0x5ec958, 13);
  put(m, 0x9092b0, 0x272000); m.writeInt16LE(256, 0x272010);
  put(m, m.readUInt32LE(0x90b98c) + 0x1c, f.addresses.normals);
  for (let index = 0; index < count; index++) {
    const body = f.bodies[index].address;
    put(m, 0x909300 + index * 0x30c, body); m[session + index] = 8; m[body + 0x718] = 8;
    put(m, body + 0x664, 0x140000); m.writeInt16LE(350, body + 0x668); put(m, body + 0x68, 0x30000);
    m.writeUInt16LE(index, body + 0x65e);
  }
  const runtime = {...f, memory: m, scratchBase: 0x9000, grid: f.context.nativeTerrain.grid,
    modelPointersFor: f.candidateMapping.modelPointersFor, roundingMode: 'nearest-even',
    handlers: {allocate, free: address => log.push(['free', address]), registerExit: address => log.push(['exit', address]),
      dynamicCast(application, offset, sourceType, targetType, flags) {
        assert.equal(application, 0x715470); assert.equal(m.readUInt32LE(application), 0x570308);
        assert.deepEqual([offset, sourceType, targetType, flags], [0, 0x6e213c, 0x6e20a4, 0]);
        log.push(['dynamicCast', application]); return application;
      },
      formatCameraName(output, format, index) {assert.equal(m.toString('ascii', format, format + 10), '%d Player\0'); m.write(`${index} Player\0`, output);},
      projectionMath(operation, value) {assert.ok(['atan', 'sin', 'cos'].includes(operation)); return Math.fround(Math[operation](value));},
      projectionInteger(value) {return !Number.isFinite(value) || value < -(2 ** 63) || value >= 2 ** 63 ? -(1n << 63n) : BigInt(Math.trunc(value));}},
    services: {rendererMath(operation, value, precision) {
      assert.ok(['sqrt', 'atan', 'tan', 'sin', 'cos'].includes(operation));
      const result = Math[operation](value); return precision === 32 ? Math.fround(result) : result;
    }, platformCall(name, args) {
      assert.ok(['InitializeCriticalSectionAndSpinCount', 'EnterCriticalSection', 'LeaveCriticalSection', 'GetCurrentThreadId'].includes(name));
      log.push([name, ...args]); return name === 'GetCurrentThreadId' ? 1 : 1;
    }}};
  const camera = createSoloCameraRuntime(runtime);
  //Both actual renderer517720 and Application402a20 constructors run. Only
  //genuine CRT/OS interfaces have supplied behavior; no game callbacks do.
  camera.initializeViewportRuntime(allocate(56)); camera.initializeViewSelection(); camera.initializeProjection();
  camera.beginParticipants();
  for (let index = 0; index < count; index++) camera.constructParticipant(index);
  const rawBodies = new Map(f.addresses.bodies.map(address => [address, {address, bytes: m.subarray(address, address + 0x4000)}]));
  for (const [address, length] of [[0x6f9a20, 0x1000], [0x70f130, 0x3e78]]) rawBodies.set(address, {address, bytes: m.subarray(address, address + length)});
  const views = createPhysicsRuntimeViews({memory: m, bodyAt: address => camera.bodyAt(address) ?? rawBodies.get(address),
    bodyLists: [{address: f.addresses.list, capacity: 96}, ...Array.from({length: 65}, (_, i) => ({address: f.extraAddresses.groupLists + i * 132, capacity: 33}))],
    bucketAt: f.bucketAt, candidateMapping: f.candidateMapping,
    collisionFilters: new Map([[0x41e080, createVehicleCollisionFilter({memory: m, scratchBase: 0x9000 - 52})]])});
  const vehicleViews = createVehicleRuntimeViews({memory: m, bodyAt: views.bodyAt});
  const vehicles = f.bodies.slice(0, count).map(body => vehicleViews.vehicleFor(body.address));
  const context = {...f.context, records: views.records, queue: views.queue, candidateArena: views.candidateArena, candidateGroups: views.candidateGroups,
    vehiclePreparationStateFor: body => vehicleViews.stateFor(body),
    nativeTerrain: {...f.context.nativeTerrain, views}, nativePhysicsStack: {...f.context.nativePhysicsStack, views},
    environment: {...f.context.environment, wheelRuntime: {...f.context.environment.wheelRuntime, views},
      effectRuntime: {...f.context.environment.effectRuntime, views: vehicleViews}},
    handlers: {removeSpatial: body => removeBodySpatial(body.address, {memory: m}), insertSpatial: body => registerRawBodySpatial(body.address, {memory: m})}};
  return {...f, memory: m, session, runtime, camera, views, log, vehicles, context, getAllocationCursor: () => cursor};
}

test('camera adapter constructs actual physical controllers and keeps native view count distinct from AI count', async () => {
  const f = await fixture(3), {memory: m, camera} = f;
  assert.equal(camera.controllers.length, 3); assert.equal(camera.snapshot.viewCount, 1);
  assert.equal(new Set(camera.controllers.map(row => row.bodyAddress)).size, 3);
  assert.equal(f.views.physicalGroup.count, 6);
  for (const row of camera.controllers) {
    assert.equal(row.controllerAddress, 0x909060 + row.index * 0x4c);
    assert.equal(m.readUInt32LE(row.recordAddress + 0x18), row.controllerAddress);
    assert.equal(m.readUInt32LE(row.controllerAddress), row.bodyAddress);
    assert.equal(m.readUInt32LE(row.controllerAddress + 4), row.trackedBodyAddress);
    assert.equal(m.readUInt32LE(row.bodyAddress), 0x804);
    assert.equal(camera.bodyAt(row.bodyAddress).bytes.length, 384);
    assert.equal(f.views.bodyAt(row.bodyAddress).address, row.bodyAddress);
  }
  m[f.session + 0x552] = 1;
  assert.equal(camera.step({views: f.views}), 2, 'The native two-view loop is independent of three AI participants.');
  assert.deepEqual([0, 1, 2].map(index => m.readUInt16LE(0x91ff80 + index * 0x184 + 0x32)), [1, 1, 0]);
  for (const [selection, expected] of [[0, 1], [1, 2], [2, 2], [3, 3], [4, 4], [5, 1], [255, 1]]) {
    m[f.session + 0x552] = selection; assert.equal(camera.snapshot.viewCount, expected);
  }
  assert.throws(() => camera.constructParticipant(0), /already constructed/);
  assert.throws(() => camera.constructParticipant(6), /index/);
  assert.equal(camera.bodyAt(0x12345678), null);
  assert.ok(f.log.some(entry => entry[0] === 'InitializeCriticalSectionAndSpinCount'));
});

test('camera eligibility is captured at its actual startup boundary and later count growth retains the native sentinel', async () => {
  const f = await fixture(), {memory: m, runtime} = f;
  const camera = createSoloCameraRuntime(runtime);
  assert.throws(() => camera.constructParticipant(0), /beginParticipants/);
  m[f.session + 0x54d] = 2;
  assert.equal(camera.beginParticipants(), 2, 'Capture follows earlier services instead of factory creation.');
  m[f.session + 0x54d] = 3;
  put(m, 0x909300 + 2 * 0x30c, f.bodies[0].address);
  assert.equal(camera.constructParticipant(2), null);
  assert.equal(m.readUInt32LE(0x909318 + 2 * 0x30c), 0x12345678);
  assert.throws(() => camera.updateParticipant(2), /sentinel/);
});

test('full camera lifecycle moves the real camera body and clears the constructor animation flag through native mode policy', async () => {
  const f = await fixture(), {camera, memory: m} = f, row = camera.controllers[0];
  const initial = camera.snapshot, bodyBefore = Buffer.from(camera.bodyAt(row.bodyAddress).bytes);
  assert.equal(initial.views[0].mode, 14); assert.equal(initial.animationUnconditional, true);
  const modes = new Set();
  let wheelContacts = 0;
  for (let tick = 0; tick < 300; tick++) {
    put(m, 0x90a548, tick);
    const report = stepSimulationFrame(f.views.physicalGroup, f.vehicles, f.context);
    wheelContacts += report.vehicles[0].contacts.hits;
    camera.updateParticipant(0);
    assert.equal(camera.step({views: f.views}), 1);
    const snapshot = camera.snapshot; modes.add(snapshot.views[0].mode);
    assert.ok(snapshot.views[0].positionQ16.every(Number.isInteger));
  }
  assert.ok(modes.size > 1, 'The complete native mode-policy graph runs.');
  assert.ok(wheelContacts > 0, 'Actual wheel queries supplied the camera auxiliary controller.');
  assert.equal(camera.snapshot.animationUnconditional, false, 'Actual41a170 cleared the constructor flag.');
  assert.notDeepEqual(camera.bodyAt(row.bodyAddress).bytes, bodyBefore);
  assert.equal(initial.views[0].mode, 14); assert.ok(Object.isFrozen(initial.views[0].positionQ16));
  assert.ok(f.log.some(entry => entry[0] === 'dynamicCast'), 'The actual Application map/RTTI path was reached.');
});

test('registered camera bodies remain in real physics and missing reached services fail explicitly', async () => {
  const f = await fixture(), {camera} = f;
  const report = stepSimulationFrame(f.views.physicalGroup, f.vehicles, f.context);
  assert.equal(report.preparedBodies, 2); assert.equal(f.views.physicalGroup.count, 2);
  delete f.runtime.handlers.formatCameraName;
  assert.throws(() => camera.step({views: f.views}), /CRT player-name formatting/);
});

test('connected physics, physical-camera auxiliary forces and full camera modes match retained instructions', async () => {
  const f = await fixture(), program = await programPromise;
  const cameraListing = await loadRetainedListing('analysis/camera-mode-listing.json', 'analysis/native-simulation/results/3518-full-camera-code-bytes.json');
  const vehicleListing = await loadRetainedListing('analysis/vehicle-filter-listing.json', 'analysis/native-simulation/results/1454-vehicle-filter-bytes.json');
  const instructions = [...new Map([...program.instructions, ...cameraListing.instructions, ...vehicleListing.instructions].map(row => [row.address, row])).values()].sort((a, b) => a.address - b.address);
  const machine = new BoundedX86(instructions, {fpuPrecisionBits: 24});
  const m = f.memory;
  for (const [address, value] of [[0x56e220, 0x5a000], [0x56e210, 0x5a010], [0x56e470, 0x5a010], [0x56e224, 0x5a020]]) put(m, address, value);
  machine.reset(); machine.fs0 = 0; machine.fpuRounding = 'nearest-even'; m.copy(machine.bytes);
  let cursor = f.getAllocationCursor();
  machine.externalCalls.set(0x568162, state => assert.equal(state.r.ECX >>> 0, state.bytes.readUInt32LE(0x5e8890)));
  machine.externalCalls.set(0x5a000, state => {
    const size = state.bytes.readUInt32LE(state.r.ESP), address = cursor; cursor += size + 127 & ~127;
    state.bytes.fill(0, address, cursor); state.r.EAX = address;
  });
  machine.externalCalls.set(0x5a010, () => {});
  machine.externalCalls.set(0x5a020, state => {
    const [output, format, index] = [0, 4, 8].map(offset => state.bytes.readUInt32LE(state.r.ESP + offset));
    assert.equal(state.bytes.toString('ascii', format, format + 10), '%d Player\0');
    const text = `${index} Player`; state.bytes.write(text + '\0', output); state.r.EAX = text.length;
  });
  machine.entries.delete(0x56932a);
  machine.externalCalls.set(0x56932a, state => {
    assert.deepEqual([0, 4, 8, 12, 16].map(offset => state.bytes.readUInt32LE(state.r.ESP + offset)), [0x715470, 0, 0x6e213c, 0x6e20a4, 0]);
    state.r.EAX = 0x715470;
  });
  machine.externalCalls.set(0x568a48, state => {
    const [output, input, length] = [0, 4, 8].map(offset => state.bytes.readUInt32LE(state.r.ESP + offset));
    Buffer.from(state.bytes.subarray(input, input + length)).copy(state.bytes, output); state.r.EAX = output;
  });
  for (const [address, operation] of [[0x569330, 'atan'], [0x56934e, 'sin'], [0x56933c, 'cos']]) {
    machine.entries.delete(address);
    machine.externalCalls.set(address, state => {
      const value = state.floatFromBits(state.lowFloatBits('XMM0'));
      state.scalarBits.delete('XMM0'); state.qwords.delete('XMM0'); state.scalars.XMM0 = Math.fround(Math[operation](value));
    });
  }
  machine.entries.delete(0x568a60);
  machine.externalCalls.set(0x568a60, state => {
    const value = state.floatFromBits(state.lowFloatBits('XMM0'));
    const integer = !Number.isFinite(value) || value < -(2 ** 63) || value >= 2 ** 63 ? -(1n << 63n) : BigInt(Math.trunc(value));
    state.r.EAX = Number(BigInt.asIntN(32, integer)); state.r.EDX = Number(BigInt.asIntN(32, integer >> 32n));
  });
  const run = (entry, stack, ecx) => {
    machine.entry = entry; machine.r.ESP = stack; machine.r.ECX = ecx; put(machine.bytes, stack, -1); machine.run(5_000_000);
    assert.equal(machine.fs0, 0, 'The explicit synthetic thread chain is restored.');
    const source = m.subarray(0x10000), native = machine.bytes.subarray(0x10000);
    const different = native.equals(source) ? -1 : native.findIndex((value, index) => value !== source[index]);
    assert.equal(different, -1, `Native0x${entry.toString(16)} first mapped difference0x${(different + 0x10000).toString(16)}`);
  };
  let contacts = 0;
  for (let tick = 0; tick < 12; tick++) {
    put(m, 0x90a548, tick); put(machine.bytes, 0x90a548, tick);
    contacts += stepSimulationFrame(f.views.physicalGroup, f.vehicles, f.context).vehicles[0].contacts.hits;
    run(0x4749e0, 0x9000, 0);
    f.camera.updateParticipant(0); run(0x416400, 0x9000 - 20, 0x909300);
    f.camera.step({views: f.views}); run(0x4180a0, 0x9000 - 20, 0);
  }
  assert.ok(contacts > 0);
  //The remaining comparison is explicitly camera-only: hold the observed
  //physical state while its own age/policy runs past the startup camera.
  //It does not claim180 connected physics ticks.
  for (let tick = 12; tick < 180; tick++) {
    put(m, 0x90a548, tick); put(machine.bytes, 0x90a548, tick);
    f.camera.step({views: f.views}); run(0x4180a0, 0x9000 - 20, 0);
  }
  assert.equal(f.camera.snapshot.animationUnconditional, false);
});
