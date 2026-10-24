import test from 'node:test';
import assert from 'node:assert/strict';
import {runNativeRaceDispatch} from '../src/native-race-dispatch.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';

//Constructed initialized image and synthetic CRT/QPC outcomes, not a native
//process observation. Every reached game child uses its production default.
async function fixture({background = 0, foreground = 1} = {}) {
  const {memory: m} = await loadRelocatedAudioFixture(0x400000);
  const O = 0x190000, application = 0x100000, head = 0x110000, session = 0x120000, config = 0x121000;
  const put = (p, value) => m.writeUInt32LE(value >>> 0, p), calls = [], clock = [], external = [];
  let cursor = 0x180000;
  const numericalContext = decodePhysicsNumericalContext({x87ControlWord: 0x7f, mxcsr: 0x1f80});
  numericalContext.x87.statusWord = 0x5800;
  put(O, 0x440cd5); put(0x6efb38, application);
  put(application + 0x7c, head); put(application + 0x80, 0);
  for (const offset of [0, 4, 8]) put(head + offset, head);
  m.writeUInt16LE(0x101, head + 12);
  put(0x5ecb1c, session); m[session + 0x552] = 0; put(session + 0x57c, 4);
  put(0x5ecefc, config); m[config + 0x25] = 1;
  put(0x91ce90, 4); put(0x6e6b4c, background); put(0x6e6b1c, 0);
  put(0x6e66f8, 100); put(0x6e66e4, 9); put(0x6eafe0, 0); put(0x6e6c8c, 1);
  put(0x56e0fc, 0x1700000); put(0x56e114, 0x1700010);
  m.writeBigUInt64LE(0n, 0x6e66b0); m.writeBigInt64LE(1000000n, 0x7135a4); m.writeBigInt64LE(0n, 0x7135ac);
  put(0x90a548, 288); put(0x6e675c, 0xffffffff);
  const runtime = {memory: m, scratchBase: O, moduleBaseAddress: 0x400000, numericalContext,
    entryRegisters: {ECX: foreground, EBX: 0x6e66b0, EBP: 0x87654321, ESI: 0xabcdef01, EDI: 0xfedcba98},
    observeNativeDispatch(event) {calls.push(event); return {eax: 0};},
    observeNativeClock(event) {clock.push(event); return 999;},
    handlers: {
      allocate(size) {const p = cursor; cursor = (cursor + size + 15) & ~15; m.fill(0x93, p, cursor); external.push({name: 'allocate', size, address: p}); return p;},
      free(address) {external.push({name: 'free', address});},
      dynamicCast(object, delta, sourceType, targetType, reference) {
        external.push({name: 'dynamicCast', object, delta, sourceType, targetType, reference});
        assert.deepEqual([object, delta, sourceType, targetType, reference], [application, 0, 0x6e213c, 0x6e20a4, 0]);
        return application;
      }
    },
    services: {platformCall(name, [output]) {
      external.push({name, output}); assert.equal(name, 'QueryPerformanceCounter');
      m.writeBigInt64LE(3500000n, output); return 1;
    }}};
  const records = () => {
    const found = [];
    const visit = node => {
      if (node === head) return;
      visit(m.readUInt32LE(node));
      const key = node + 16, size = m.readUInt32LE(key + 16), bytes = m.readUInt32LE(key + 20) >= 16 ? m.readUInt32LE(key) : key;
      found.push({name: m.subarray(bytes, bytes + size).toString('ascii'), enabled: m[node + 44 + 0x34]});
      visit(m.readUInt32LE(node + 8));
    };
    visit(m.readUInt32LE(head + 4)); return found;
  };
  return {m, O, runtime, calls, clock, external, records};
}

test('real viewport/map, timer/conversion and attachment defaults execute the sample-only route without a physics tick', async () => {
  const f = await fixture(), originalContext = structuredClone(f.runtime.numericalContext);
  const result = runNativeRaceDispatch(f.runtime);
  assert.deepEqual(result.registers, {eax: 1, edi: 0xfedcba98, esi: 0xabcdef01, ebp: 0x87654321,
    ebx: 0x6e66b0, ecx: 1, esp: f.O + 4, eip: 0x440cd5});
  assert.equal(result.route, 'sample-only'); assert.equal(result.scheduledCount, 1); assert.equal(result.iterations, 0);
  assert.deepEqual(f.records(), [{name: 'Cinematic Window', enabled: 1}, {name: 'Rear View Mirror', enabled: 1}]);
  assert.equal(f.m.readUInt32LE(0x6e66f8), 101);
  assert.equal(f.m.readUInt32LE(0x6e675c), 0, 'Background/sample advancement wraps independently of the physics clock.');
  assert.equal(f.m.readUInt32LE(0x90a548), 288);
  assert.equal(f.external.filter(e => e.name === 'dynamicCast').length, 2);
  assert.equal(f.external.filter(e => e.name === 'QueryPerformanceCounter').length, 1);
  assert.deepEqual(f.calls.filter(e => e.stage === 'call').map(e => e.targetAddress),
    [0x402d10, 0x406b80, 0x402d10, 0x406b80, 0x441c70, 0x44f3a0]);
  assert.equal(f.clock.find(e => e.stage === 'scale').value, 104.99999999999999);
  assert.equal(result.numericalContext.sse.mxcsr, 0x1fa0);
  assert.equal(result.numericalContext.x87.statusWord, 0x5800);
  assert.deepEqual(f.runtime.numericalContext, originalContext, 'Derived numerical state is carried, not written into the caller context.');
  assert.equal(f.runtime.calls, undefined, 'No game-child outcomes were supplied.');
});

test('genuine pause policy rejects an unknown manager method instead of accepting a supplied pause answer', async () => {
  const f = await fixture({background: 1});
  f.m.writeUInt32LE(0, 0x9020a0); f.m.writeUInt16LE(0, 0x6e6bd8);
  f.m.writeUInt32LE(0x130000, 0x714b08); f.m.writeUInt32LE(0x140000, 0x130000);
  f.m.writeUInt32LE(0x4a0000, 0x14000c);
  assert.throws(() => runNativeRaceDispatch(f.runtime), /manager virtual0c target.*not the recovered setter/);
  assert.equal(f.m.readUInt32LE(0x6e66f8), 101);
  assert.equal(f.m.readUInt32LE(0x6e675c), 0xffffffff);
  assert.equal(f.m.readUInt32LE(0x90a548), 288);
  assert.equal(f.calls.filter(e => e.stage === 'call').at(-1).targetAddress, 0x477730);
});

test('real pause and manager setter clear the mode word before the first unavailable physics entry', async () => {
  const f = await fixture({background: 1}), manager = 0x130000, vtable = 0x140000;
  f.m.writeUInt32LE(0, 0x9020a0); f.m.writeUInt16LE(0, 0x6e6bd8);
  f.m.writeUInt32LE(manager, 0x714b08); f.m.writeUInt32LE(vtable, manager); f.m.writeUInt32LE(0x4a60d0, vtable + 12);
  f.m[manager + 0x821] = 0x7e;
  let entry;
  f.runtime.calls = {call450e50(request) {entry = request; throw Error('Stop at unavailable physics-entry fixture.');}};
  assert.throws(() => runNativeRaceDispatch(f.runtime), /Stop at unavailable physics-entry fixture/);
  assert.equal(f.m[manager + 0x821], 0); assert.equal(f.m.readUInt32LE(0x6e6b4c), 0);
  assert.equal(f.m.readUInt32LE(0x6e66f8), 101); assert.equal(f.m.readUInt32LE(0x90a548), 288);
  assert.equal(f.m.readUInt32LE(0x6e675c), 0xffffffff);
  assert.equal(entry.runtime.scratchBase, f.O - 28);
  assert.equal(entry.runtime.memory.readUInt32LE(f.O - 28), 0x450e38);
  assert.deepEqual(entry.args, [1]); assert.equal(entry.edx, 0);
  assert.equal(entry.entryRegisters.ESI, 0); assert.equal(entry.entryRegisters.EDI, 1);
  assert.equal(entry.runtime.numericalContext.sse.mxcsr, 0x1fa0);
});

test('missing genuine viewport CRT outcome cannot be replaced by the application pointer or observer return', async () => {
  const f = await fixture(); delete f.runtime.handlers.dynamicCast;
  assert.throws(() => runNativeRaceDispatch(f.runtime), /requires CRT dynamicCast/);
  assert.equal(f.external.filter(e => e.name === 'QueryPerformanceCounter').length, 0);
  assert.equal(f.m.readUInt32LE(0x6e66f8), 100);
});
