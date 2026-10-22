import test from 'node:test';
import assert from 'node:assert/strict';
import {pumpManagedAudioMessages, waitForManagedAudioThread, destroyManagedAudioThread, destroyManagedAudioPollThread, releaseManagedAudioThread} from '../src/managed-audio-shutdown.mjs';
function fixture() {
  const memory = Buffer.alloc(0xa00000), object = 0x100000, S = 0x9000, calls = [], ptr = p => memory.readUInt32LE(p), put = (p, v) => memory.writeInt32LE(v | 0, p);
  put(0x714b04, 0x716dc0); put(0x716d98, 3); memory.writeBigUInt64LE(1000000n, 0x716de8);
  put(0x714afc, 0x715b30); put(0x715b08, 3);
  put(object + 24, 15); put(object + 32, 101); put(object + 40, 201); put(object + 44, 202); put(object + 48, 203);
  let clock = 0;
  const runtime = {memory, scratchBase: S, services: {platformCall(name, args) {
    calls.push([name, ...args]);
    if (name === 'QueryPerformanceCounter') {memory.writeBigUInt64LE(BigInt(clock++ * 1000000), args[0]); return 1;}
    if (name === 'PeekMessageW' || name === 'WaitForSingleObject') return 0;
    return 1;
  }, libraryCall(name, args) {calls.push([name, ...args]); return 0;}}};
  return {memory, object, S, calls, ptr, put, runtime};
}

test('timed shutdown waits for completion without terminating a signaled thread', () => {
  const f = fixture(); waitForManagedAudioThread(f.object, 5000, 123, f.runtime);
  assert.deepEqual(f.calls.filter(([name]) => name === 'WaitForSingleObject'), [['WaitForSingleObject', 202, 10]]);
  assert(!f.calls.some(([name]) => name === 'TerminateThread'));
});

test('signed negative timeout immediately selects the unresponsive-thread branch', () => {
  const f = fixture(); waitForManagedAudioThread(f.object, -1, 0, f.runtime);
  assert(!f.calls.some(([name]) => name === 'WaitForSingleObject'));
  assert.deepEqual(f.calls.at(-1), ['TerminateThread', 101, 0]);
});

test('completed thread skips stopwatch and event waits', () => {
  const f = fixture(); f.memory[f.object + 64] = 1; waitForManagedAudioThread(f.object, 5000, 0, f.runtime);
  assert.deepEqual(f.calls, []);
});

test('base destructor invalidates event fields before closing thread and separately frees both names', () => {
  const f = fixture(); f.memory[f.object + 64] = 1;
  f.put(f.object + 24, 31); f.put(f.object + 4, 0x110000); f.put(f.object + 28, 0x120000);
  const original = f.runtime.services.platformCall;
  f.runtime.services.platformCall = (name, args, r) => {
    if (name === 'CloseHandle' && args[0] === 101) {
      assert.equal(f.ptr(f.object + 40), 0xffffffff); assert.equal(f.ptr(f.object + 44), 0xffffffff); assert.equal(f.ptr(f.object + 32), 101);
    }
    return original(name, args, r);
  };
  destroyManagedAudioThread(f.object, f.runtime);
  assert.deepEqual(f.calls.filter(([name]) => name === 'CloseHandle'), [['CloseHandle', 201], ['CloseHandle', 202], ['CloseHandle', 101]]);
  assert.deepEqual(f.calls.filter(([name]) => name.startsWith('operator')), [['operatorDeleteArray', 0x120000], ['operatorDelete', 0x110000]]);
  assert.equal(f.ptr(f.object + 32), 0); assert.equal(f.ptr(f.object + 28), 0); assert.equal(f.ptr(f.object + 24), 15); assert.equal(f.memory[f.object + 4], 0);
});

test('poll destructor closes its wake event even when no thread was created', () => {
  const f = fixture(); f.put(f.object + 32, 0); destroyManagedAudioPollThread(f.object, f.runtime);
  assert.deepEqual(f.calls, [['CloseHandle', 203]]); assert.equal(f.ptr(f.object + 48), 0xffffffff);
  assert.equal(f.ptr(f.object), 0x5d39f8, 'base destructor leaves the base vtable');
});

test('deleting wrapper reads its flag after separately owned name cleanup', () => {
  const f = fixture(); f.put(f.object + 32, 0); f.put(f.object + 28, 0x120000);
  const original = f.runtime.services.libraryCall;
  f.runtime.services.libraryCall = (name, args, r) => {if (name === 'operatorDeleteArray') f.put(f.S + 4, 1); return original(name, args, r);};
  assert.equal(releaseManagedAudioThread(f.object, 0, false, f.runtime), f.object);
  assert.deepEqual(f.calls.at(-1), ['operatorDelete', f.object]);
});

test('message pump drains messages and decrements the live reentrant depth', () => {
  const f = fixture(); f.put(0x6e6d18, 4); let peeks = 0;
  f.runtime.services.platformCall = (name, args) => {
    assert(f.ptr(0x6e6d18) >= 5);
    f.calls.push([name, ...args]);
    if (name === 'PeekMessageW') return Number(peeks++ < 2);
    if (name === 'DispatchMessageW') f.put(0x6e6d18, f.ptr(0x6e6d18) + 1);
    return 1;
  };
  pumpManagedAudioMessages(f.runtime);
  assert.deepEqual(f.calls.map(([name]) => name), ['PeekMessageW', 'TranslateMessage', 'DispatchMessageW', 'PeekMessageW', 'TranslateMessage', 'DispatchMessageW', 'PeekMessageW']);
  assert.equal(f.ptr(0x6e6d18), 6);
});
