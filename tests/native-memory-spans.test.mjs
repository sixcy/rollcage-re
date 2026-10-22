import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {registerNativeMemorySpans,nativeMemorySpan,nativeMemoryAddress,resolveNativeMemoryAddress,sharesNativeMemorySpan,copyToNativeMemory,nativeCodeAddress} from '../src/native-memory-spans.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {createVehicleRuntimeViews} from '../src/vehicle-runtime-views.mjs';
import {buildBodyCandidateGroups} from '../src/body-candidate-groups.mjs';

test('only explicit code symbols use the observed module base and preserve unsigned x86 addresses', () => {
  assert.equal(nativeCodeAddress(0x46e470), 0x46e470);
  assert.equal(nativeCodeAddress(0x46e470, {moduleBaseAddress: 0x6e0000}), 0x74e470);
  assert.equal(nativeCodeAddress(0x46e470, {moduleBaseAddress: 0xf0000000}), 0xf006e470);
  assert.throws(() => nativeCodeAddress(0x46e470, {moduleBaseAddress: 0xffffff00}), /Invalid explicit/);
  assert.throws(() => nativeCodeAddress(0x1000), /Invalid explicit/);
});

test('native span ownership preserves sliced Buffer offsets and rejects detached copies', () => {
  const backing = Buffer.alloc(100), memory = backing.subarray(20, 80), bytes = memory.subarray(10, 18);
  assert.equal(nativeMemoryAddress(memory, bytes), 10);
  assert.equal(resolveNativeMemoryAddress(memory, 10, 8), 10);
  assert.equal(sharesNativeMemorySpan(memory, bytes, 10, 8), true);
  assert.equal(sharesNativeMemorySpan(memory, bytes, 11, 8), false);
  assert.equal(sharesNativeMemorySpan(memory, Buffer.from(bytes), 10, 8), false);
  assert.equal(nativeMemoryAddress(memory, backing.subarray(19, 21)), null);
  assert.throws(() => nativeMemorySpan(memory, 59, 2), /exceeds/);
  assert.throws(() => nativeMemorySpan(memory, -1, 1), /exceeds/);
});

test('sparse spans resolve only declared aliases and keep overlapping copies within real bounded storage', () => {
  const source = Buffer.from([1,2,3,4,5,6,7,8]), address = 0xf1234000;
  const {memory} = createCapturedMemory([{address, bytes: source}, {address: address + 0x100, bytes: Buffer.alloc(8)}], {aliases: [{address: 0x902be0, targetAddress: address, length: 8}]});
  const bytes = nativeMemorySpan(memory, 0x902be0, 8);
  assert.equal(nativeMemoryAddress(memory, bytes), address);
  assert.equal(resolveNativeMemoryAddress(memory, 0x902be3, 4), address + 3);
  assert.equal(sharesNativeMemorySpan(memory, bytes, address, 8), true);
  assert.equal(sharesNativeMemorySpan(memory, bytes, 0x902be0, 8), true);
  assert.equal(nativeMemoryAddress(memory, source), null);
  copyToNativeMemory(memory, address + 1, bytes.subarray(0, 7));
  assert.deepEqual([...bytes], [1,1,2,3,4,5,6,7]);
  copyToNativeMemory(memory, address + 0x100, bytes);
  assert.deepEqual(nativeMemorySpan(memory, address + 0x100, 8), bytes);
  assert.throws(() => resolveNativeMemoryAddress(memory, 0x902be5, 4), /alias boundary/);
  assert.throws(() => copyToNativeMemory(memory, address + 0x107, bytes), /Uncaptured/);
  assert.throws(() => memory.buffer, /Unsupported/);
  assert.deepEqual([...source], [1,2,3,4,5,6,7,8]);
});

test('sparse ownership registration cannot assert an unrelated or ambiguous backing span', () => {
  const memory = Buffer.alloc(32);
  assert.throws(() => registerNativeMemorySpans(memory, [{address: 0, bytes: Buffer.alloc(8)}]), /actual live/);
  assert.throws(() => registerNativeMemorySpans(memory, [{address: 0, bytes: memory.subarray(0, 8)}, {address: 4, bytes: memory.subarray(4, 12)}]), /overlap/);
  registerNativeMemorySpans(memory, [{address: 0, bytes: memory}]);
  assert.throws(() => registerNativeMemorySpans(memory, [{address: 0, bytes: memory}]), /one explicit/);
});

function sparseWorld() {
  const body = 0x135b1700, lists = 0x13800000, shapes = 0x13900000, candidates = 0x13a00000, bucket = 0x13b00000;
  const moduleDelta = 0x2e0000, globals = 0x902ba0, globalsLength = 0x350;
  const ranges = [
    {address: globals + moduleDelta, bytes: Buffer.alloc(globalsLength)},
    {address: 0x91e780 + moduleDelta, bytes: Buffer.alloc(32)},
    {address: body, bytes: Buffer.alloc(0x3e78)},
    {address: lists, bytes: Buffer.alloc(0x200)},
    {address: shapes, bytes: Buffer.alloc(144)},
    {address: candidates, bytes: Buffer.alloc(32)},
    {address: bucket, bytes: Buffer.alloc(12)}
  ];
  const aliases = [{address: globals, targetAddress: globals + moduleDelta, length: globalsLength}, {address: 0x91e780, targetAddress: 0x91e780 + moduleDelta, length: 32}];
  const {memory} = createCapturedMemory(ranges, {aliases}), put = (address, value) => memory.writeUInt32LE(value >>> 0, address);
  put(0x902bc0, lists); put(lists, body); memory.writeUInt16LE(1, 0x902bc4);
  put(0x902be0, lists + 0x40); put(0x902bec, lists + 0xc4); put(0x902ee0, lists + 0x148);
  put(0x91e79c, shapes); put(0x91e788, candidates);
  put(body, 0x1807); put(body + 12, bucket); memory.writeUInt16LE(1, bucket + 8);
  const options = {memory, bodyStorage: [{address: body, length: 0x3e78}], bodyLists: [{address: lists, capacity: 8}, {address: lists + 0x40, capacity: 33}, {address: lists + 0xc4, capacity: 33}, {address: lists + 0x148, capacity: 2}], groupCapacity: 2, shapeCapacity: 2, candidateCapacity: 2};
  return {memory, options, body, lists, candidates, moduleDelta};
}

test('relocated native group headers have one identity and preserve actual pointer writes and refresh classification', () => {
  const f = sparseWorld(), views = createPhysicsRuntimeViews(f.options), body = views.bodyAt(f.body);
  const first = views.candidateGroups.groups[0], refresh = views.candidateGroups.refreshGroup;
  assert.equal(first.address, 0x902be0 + f.moduleDelta);
  assert.equal(views.groupAt(0x902be0), first);
  assert.equal(views.groupAt(first.address), first);
  assert.equal(views.groupAt(0x902ee0 + f.moduleDelta), refresh);
  assert.equal(refresh.isRefreshGroup, true); assert.equal(first.isRefreshGroup, false);
  buildBodyCandidateGroups([body], views.candidateGroups);
  assert.equal(body.collisionGroup130, first);
  assert.equal(f.memory.readUInt32LE(f.body + 0x130), first.address);
  assert.equal(first.bodies[0], body);
  body.collisionGroup130 = refresh;
  assert.equal(body.collisionGroup130, refresh);
  assert.equal(f.memory.readUInt32LE(f.body + 0x130), refresh.address);
  assert.equal(refresh.bodies.length, 2, 'Actual refresh list capacity stays two pointers.');
  assert.throws(() => {refresh.bodies[2] = body;}, /fixed span/);
  const vehicleViews = createVehicleRuntimeViews({memory: f.memory, bodyAt: views.bodyAt});
  assert.equal(vehicleViews.bodyAt(f.body), body);
  vehicleViews.stateFor(body).wheels[0].spin = 1234;
  assert.equal(f.memory.readInt32LE(f.body + 0x37c), 1234);
});

test('sparse candidate copies preserve opaque bytes while detached bodies and missing declared storage fail', () => {
  const f = sparseWorld(), views = createPhysicsRuntimeViews(f.options);
  const bytes = f.memory.subarray(f.candidates, f.candidates + 16);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i * 7;
  views.candidateArena.entries[1] = views.candidateArena.entries[0];
  assert.deepEqual(f.memory.subarray(f.candidates + 16, f.candidates + 32), bytes);
  assert.throws(() => createPhysicsRuntimeViews({...f.options, bodyAt: address => ({address, bytes: Buffer.alloc(0x3e78)})}).bodyAt(f.body), /alias supplied memory/);
  assert.throws(() => createPhysicsRuntimeViews({...f.options, bodyStorage: [{address: f.body, length: 0x3e79}]}), /Uncaptured/);
  assert.throws(() => createVehicleRuntimeViews({memory: f.memory, bodyAt: address => ({address, bytes: Buffer.alloc(0x3e78)})}).bodyAt(f.body), /alias the supplied/);
  assert.throws(() => createPhysicsRuntimeViews({...f.options, bodyLists: [{address: f.lists, capacity: 129}]}), /Uncaptured/);
});
