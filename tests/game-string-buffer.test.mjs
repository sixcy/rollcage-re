import test from 'node:test';
import assert from 'node:assert/strict';
import {assignGameCString, growGameStringBuffer} from '../src/game-string-buffer.mjs';

function fixture(text, heap = false) {
  const memory = Buffer.alloc(0xa00000), object = 0x100000, old = heap ? 0x110000 : object, output = 0x120000;
  const put = (p, v) => memory.writeInt32LE(v | 0, p), S = 0x9000;
  memory.write(text + '\0', old); if (heap) put(object, old);
  put(object + 16, text.length); put(object + 20, heap ? 31 : 15);
  const calls = [], runtime = {memory, scratchBase: S, services: {libraryCall(name, args) {
    calls.push([name, ...args]);
    if (name === 'operatorNew') return output;
    if (name === 'operatorDelete') return 0;
    if (name === 'memcpy' || name === 'memmove') {Buffer.from(memory.subarray(args[1], args[1] + args[2])).copy(memory, args[0]); return args[0];}
    throw Error(`Unexpected string test CRT ${name}`);
  }}};
  return {memory, object, old, output, put, S, calls, runtime};
}

test('raw C-string assignment copies an explicit byte count across embedded NULs', () => {
  const f = fixture('old'), input = 0x130000; f.memory.write('AB\0CD', input);
  assert.equal(assignGameCString(f.object, input, 5, f.runtime), f.object);
  assert.deepEqual(f.memory.subarray(f.object, f.object + 6), Buffer.from('AB\0CD\0'));
  assert.equal(f.memory.readUInt32LE(f.object + 16), 5);
});

test('raw assignment into its own heap string selects a substring without freeing ownership', () => {
  const f = fixture('0123456789abcdefghijkl', true);
  assignGameCString(f.object, f.old + 5, 4, f.runtime);
  assert.equal(f.memory.toString('ascii', f.old, f.old + 5), '5678\0');
  assert.equal(f.memory.readUInt32LE(f.object), f.old);
  assert.equal(f.memory.readUInt32LE(f.object + 16), 4);
  assert(!f.calls.some(([name]) => name === 'operatorDelete' || name === 'operatorNew'));
});

test('growth reads retained length after the allocator returns', () => {
  const f = fixture('retained'), original = f.runtime.services.libraryCall;
  f.runtime.services.libraryCall = (name, args) => {if (name === 'operatorNew') f.put(f.S + 8, 2); return original(name, args);};
  growGameStringBuffer(f.object, 32, 8, f.runtime);
  assert.equal(f.memory.toString('ascii', f.output, f.output + 3), 're\0');
  assert.equal(f.memory.readUInt32LE(f.object + 16), 2);
  assert(f.calls.some(([name, , , bytes]) => name === 'memcpy' && bytes === 2));
});

test('growth publishes its allocation local after deletion side effects', () => {
  const f = fixture('an old heap string', true), replacement = 0x140000, original = f.runtime.services.libraryCall;
  f.memory[replacement + 3] = 0x57;
  f.runtime.services.libraryCall = (name, args) => {if (name === 'operatorDelete') f.put(f.S - 24, replacement); return original(name, args);};
  growGameStringBuffer(f.object, 40, 3, f.runtime);
  assert.equal(f.memory.readUInt32LE(f.object), replacement);
  assert.equal(f.memory[replacement + 3], 0);
  assert.equal(f.memory.toString('ascii', f.output, f.output + 3), 'an ');
});
