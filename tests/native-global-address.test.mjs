import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeExplicitGlobalDomain, nativeExplicitGlobalDomains, nativeGlobalAddress, registerNativeGlobalAddresses} from '../src/native-global-address.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createNativeFrameMemory} from '../tools/lib/native-frame-memory.mjs';

//Synthetic byte patterns at the actual conflicting V4 addresses. This tests
//address roles, not an original-process arithmetic or full-parent match.
const cloneAddress = 0x008feb00;
const cloneLength = 0x44a8;
const queueAddress = 0x902040;
const poolAddress = 0x902b7c;
const moduleDelta = 0x1f0000;

test('V5 actual stack and fixed type2/light globals retain separate roles across the second migrated domain',()=>{
  const domain=nativeExplicitGlobalDomains[0],delta=0x540000,stack=Buffer.alloc(24608,0x57),globals=Buffer.alloc(domain.end-domain.start,0x22);
  stack.writeUInt32LE(0x12345678,0x80f210-0x809a10);globals.writeUInt32LE(0x80f210,0x80f210-domain.start);
  const {memory,span}=createNativeFrameMemory([{address:0x809a10,bytes:stack},{address:domain.start+delta,bytes:globals}],{aliases:[{address:domain.start,targetAddress:domain.start+delta,length:globals.length}]});
  assert.equal(memory.readUInt32LE(0x80f210),0x12345678);
  const pointer=memory.readUInt32LE(nativeGlobalAddress(memory,0x80f210));assert.equal(pointer,0x80f210);assert.equal(memory.readUInt32LE(pointer),0x12345678);
  memory.writeUInt32LE(0xdeadbeef,nativeGlobalAddress(memory,0x80f210));assert.equal(memory.readUInt32LE(0x80f210),0x12345678);
  assert.equal(span(0x809a10,24608).length,24608);assert.equal(globals.readUInt32LE(0x80f210-domain.start),0x80f210,'Original observation remains immutable');
  assert.throws(()=>memory.readUInt32LE(0x900000),/Uncaptured/);
});

function collisionFixture() {
  const rows = [
    {address: cloneAddress, bytes: Buffer.alloc(cloneLength, 0x11)},
    {address: queueAddress + moduleDelta, bytes: Buffer.alloc(1024, 0x22)},
    {address: poolAddress + moduleDelta, bytes: Buffer.alloc(0x374, 0x33)}
  ];
  const aliases = [
    {address: queueAddress, targetAddress: queueAddress + moduleDelta, length: 1024},
    {address: poolAddress, targetAddress: poolAddress + moduleDelta, length: 0x374}
  ];
  return {rows, aliases};
}

test('ordinary buffers and unregistered legacy aliases retain their existing address contract', () => {
  const ordinary = Buffer.alloc(32);
  assert.equal(nativeGlobalAddress(ordinary, queueAddress), queueAddress);
  assert.equal(nativeGlobalAddress(ordinary, 12), 12);
  const {memory} = createCapturedMemory([{address: 0x20000000, bytes: Buffer.alloc(8, 7)}], {
    aliases: [{address: queueAddress, targetAddress: 0x20000000, length: 8}]
  });
  assert.equal(nativeGlobalAddress(memory, queueAddress), queueAddress);
  assert.equal(memory.readUInt32LE(nativeGlobalAddress(memory, queueAddress)), 0x07070707);
  memory.writeUInt32LE(123, nativeGlobalAddress(memory, queueAddress));
  assert.equal(memory.readUInt32LE(0x20000000), 123);
});

test('V4 raw heap pointers and explicit relocated globals have distinct live backing', () => {
  const {rows, aliases} = collisionFixture();
  assert.throws(() => createCapturedMemory(rows, {aliases}), /shadows/,
    'The bare captured-memory policy still rejects a numeric alias over real heap bytes.');
  const {memory, span, mappedBytes} = createNativeFrameMemory(rows, {aliases});
  assert.equal(mappedBytes, cloneLength + 1024 + 0x374);
  assert.equal(nativeGlobalAddress(memory, queueAddress), queueAddress + moduleDelta);
  assert.equal(nativeGlobalAddress(memory, poolAddress + 4), poolAddress + moduleDelta + 4);
  assert.equal(memory.readUInt32LE(queueAddress), 0x11111111);
  assert.equal(memory.readUInt32LE(nativeGlobalAddress(memory, queueAddress)), 0x22222222);
  memory.writeUInt32LE(0x12345678, nativeGlobalAddress(memory, queueAddress));
  assert.equal(memory.readUInt32LE(queueAddress), 0x11111111);
  memory.writeUInt32LE(0xabcdef01, queueAddress);
  assert.equal(memory.readUInt32LE(nativeGlobalAddress(memory, queueAddress)), 0x12345678);
  memory.writeUInt32LE(queueAddress, nativeGlobalAddress(memory, poolAddress));
  const opaquePointer = memory.readUInt32LE(nativeGlobalAddress(memory, poolAddress));
  assert.equal(opaquePointer, queueAddress);
  assert.equal(memory.readUInt32LE(opaquePointer), 0xabcdef01,
    'A pointer value read from a global remains an actual address, without relocation.');
  const clone = span(cloneAddress, cloneLength);
  assert.equal(clone.length, cloneLength);
  assert.equal(clone.readUInt32LE(queueAddress - cloneAddress), 0xabcdef01);
  assert.equal(clone.readUInt32LE(poolAddress - cloneAddress), 0x11111111);
  clone.writeUInt32LE(0x76543210, poolAddress - cloneAddress);
  assert.equal(memory.readUInt32LE(poolAddress), 0x76543210);
  assert.equal(memory.readUInt32LE(nativeGlobalAddress(memory, poolAddress)), queueAddress);
  assert.ok(rows[0].bytes.every(value => value === 0x11), 'Input evidence is not mutated.');
  assert.ok(rows[1].bytes.every(value => value === 0x22));
  assert.ok(rows[2].bytes.every(value => value === 0x33));
});

test('only observed explicit global operands resolve, even when raw heap bytes exist there', () => {
  const {rows, aliases} = collisionFixture();
  const {memory} = createNativeFrameMemory(rows, {aliases});
  assert.equal(memory.readUInt32LE(0x902500), 0x11111111);
  assert.throws(() => nativeGlobalAddress(memory, 0x902500), /Unobserved native global/);
  assert.throws(() => nativeGlobalAddress(memory, nativeExplicitGlobalDomain.start - 1), /outside/);
  assert.throws(() => nativeGlobalAddress(memory, nativeExplicitGlobalDomain.end), /outside/);
  const emptyRoles = createNativeFrameMemory([{address: queueAddress, bytes: Buffer.alloc(4)}]);
  assert.throws(() => nativeGlobalAddress(emptyRoles.memory, queueAddress), /Unobserved/);
  assert.equal(emptyRoles.memory.readUInt32LE(queueAddress), 0);
});

test('preferred-base identity and different explicit relocations use exactly their observed targets', () => {
  for (const targetAddress of [queueAddress, queueAddress + moduleDelta, 0xf0123000]) {
    const {memory} = createNativeFrameMemory([{address: targetAddress, bytes: Buffer.alloc(8, 5)}], {
      aliases: [{address: queueAddress, targetAddress, length: 8}]
    });
    assert.equal(nativeGlobalAddress(memory, queueAddress + 4), targetAddress + 4);
    memory.writeUInt32LE(0x1234abcd, nativeGlobalAddress(memory, queueAddress + 4));
    assert.equal(memory.readUInt32LE(targetAddress + 4), 0x1234abcd);
    if (targetAddress !== queueAddress) assert.throws(() => memory.readUInt32LE(queueAddress), /Uncaptured/);
  }
});

test('a spanning alias migrates only the explicit domain and preserves strict legacy boundary behavior', () => {
  const {start, end} = nativeExplicitGlobalDomain;
  const address = start - 4, targetAddress = 0x20000000, length = end - start + 8;
  const {memory} = createNativeFrameMemory([
    {address: targetAddress, bytes: Buffer.alloc(length, 7)},
    {address: queueAddress, bytes: Buffer.alloc(4, 9)}
  ], {aliases: [{address, targetAddress, length}]});
  assert.equal(memory.readUInt32LE(address), 0x07070707);
  assert.equal(memory.readUInt32LE(end), 0x07070707);
  assert.equal(memory.readUInt32LE(queueAddress), 0x09090909);
  assert.equal(nativeGlobalAddress(memory, start), targetAddress + 4);
  assert.equal(nativeGlobalAddress(memory, end - 1), targetAddress + length - 5);
  assert.throws(() => memory.readUInt32LE(start - 2), /alias boundary/);
  assert.throws(() => memory.readUInt32LE(end - 2), /alias boundary/);
  assert.throws(() => nativeGlobalAddress(memory, end), /outside/);
});

test('wrong numeric routes outside the migrated domain still cannot shadow actual memory', () => {
  for (const address of [104, 0x5eb5e0, nativeExplicitGlobalDomain.start - 4, nativeExplicitGlobalDomain.end]) {
    assert.throws(() => createNativeFrameMemory([
      {address, bytes: Buffer.alloc(4)}, {address: 0x20000000, bytes: Buffer.alloc(4)}
    ], {aliases: [{address, targetAddress: 0x20000000, length: 4}]}), /shadows/);
  }
});

test('explicit global routes cannot invent missing or truncated target storage', () => {
  for (const bytes of [0, 3]) {
    const rows = [{address: cloneAddress, bytes: Buffer.alloc(cloneLength)}];
    if (bytes) rows.push({address: 0x20000000, bytes: Buffer.alloc(bytes)});
    assert.throws(() => createNativeFrameMemory(rows, {
      aliases: [{address: queueAddress, targetAddress: 0x20000000, length: 4}]
    }), /Uncaptured|not completely captured/);
  }
});

test('global registration validates operands, route bounds, overlap and memory identity', () => {
  const route = {address: queueAddress, targetAddress: 0x20000000, length: 8};
  const invalidRoutes = [
    {...route, address: nativeExplicitGlobalDomain.start - 1},
    {...route, address: nativeExplicitGlobalDomain.end - 4},
    {...route, address: 1.5}, {...route, length: 0}, {...route, length: -1},
    {...route, length: 1.5}, {...route, targetAddress: -1},
    {...route, targetAddress: NaN}, {...route, targetAddress: 0xffffffff}
  ];
  for (const invalid of invalidRoutes) {
    assert.throws(() => registerNativeGlobalAddresses(Buffer.alloc(1), [invalid]), /Invalid explicit/);
  }
  assert.throws(() => registerNativeGlobalAddresses({}, []), /one explicit/);
  assert.throws(() => registerNativeGlobalAddresses(Buffer.alloc(1), {}), /one explicit/);
  assert.throws(() => registerNativeGlobalAddresses(Buffer.alloc(1), [route, {...route, address: queueAddress + 4}]), /overlap/);
  const memory = Buffer.alloc(1), separate = Buffer.alloc(1);
  registerNativeGlobalAddresses(memory, [route]);
  route.targetAddress = 0x30000000;
  assert.equal(nativeGlobalAddress(memory, queueAddress + 3), 0x20000003);
  assert.equal(nativeGlobalAddress(separate, queueAddress + 3), queueAddress + 3);
  assert.throws(() => registerNativeGlobalAddresses(memory, []), /one explicit/);
  for (const address of [-1, 0x100000000, 1.5, NaN]) {
    assert.throws(() => nativeGlobalAddress(memory, address), /fixed uint32/);
  }
  assert.throws(() => nativeGlobalAddress({}, queueAddress), /fixed uint32/);
});

test('frame wrapper rejects malformed and overlapping global aliases before exposing memory', () => {
  const row = {address: 0x20000000, bytes: Buffer.alloc(32)};
  const route = {address: queueAddress, targetAddress: row.address, length: 8};
  for (const invalid of [
    {...route, address: -1}, {...route, targetAddress: -1}, {...route, length: 0},
    {...route, length: -1}, {...route, length: 1.5}, {...route, address: NaN},
    {...route, address: 0xffffffff}, {...route, targetAddress: 0xffffffff}
  ]) assert.throws(() => createNativeFrameMemory([row], {aliases: [invalid]}), /Invalid/);
  assert.throws(() => createNativeFrameMemory([row], {
    aliases: [route, {...route, address: queueAddress + 4, targetAddress: row.address + 4}]
  }), /overlap/);
});
