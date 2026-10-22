import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverGameRootName} from '../src/root-name-discovery.mjs';

function fixture(platformCall) {
  const memory = Buffer.alloc(0xa00000), calls = [];
  memory.writeUInt32LE(0x12345678, 0x5e8890);
  const services = {platformCall(name, args) {calls.push([name, ...args]); return platformCall(name, args, memory);}, crtCall(name, args) {
    if (name === 'isprint') return args[0] >= 32 && args[0] <= 126 ? 1 : 0;
    assert.equal(name, '__security_check_cookie'); assert.equal(args[0], 0x12345678); return 0;
  }};
  return {memory, calls, services, scratchBase: 0x9000};
}
const text = (memory, address) => memory.toString('ascii', address, memory.indexOf(0, address));

test('an already supplied root bypasses file discovery and preserves the fallback buffer', () => {
  const f = fixture(() => assert.fail('no file service should run'));
  f.memory.write('LOW/LEV1\0', 0x6e6660); f.memory.write('retained\0', 0x6e6b50);
  assert.equal(discoverGameRootName(f), 0x6e6660);
  assert.equal(text(f.memory, 0x6e6b50), 'retained'); assert.deepEqual(f.calls, []);
});

test('discovery closes an invalid find, falls back to the rooted path, and stops at CR', () => {
  let searches = 0;
  const f = fixture((name, args, memory) => {
    if (name === 'FindFirstFileA') {assert.equal(args[1], 0x9000 - 332); return searches++ ? 17 : -1;}
    if (name === 'FindClose' || name === 'CloseHandle') return 1;
    if (name === 'CreateFileA') {assert.equal(args[0], 0x5d3478); assert.equal(args[1], -2147483648); return 0x1234;}
    if (name === 'ReadFile') {assert.equal(args[2], 80); assert.equal(args[3], 0x9000 - 360); memory.write('LOW/LEV7\r\n', args[1]); memory.writeUInt32LE(10, args[3]); return 1;}
    assert.fail(`unexpected ${name}`);
  });
  assert.equal(discoverGameRootName(f), 0x6e6b50);
  assert.equal(text(f.memory, 0x6e6b50), 'LOW/LEV7');
  assert.deepEqual(f.calls.filter(([name]) => name === 'FindClose'), [['FindClose', 0xffffffff], ['FindClose', 17]]);
  assert.equal(f.calls.filter(([name]) => name === 'ReadFile').length, 1);
});

test('three absent files leave the previous buffer untouched and still close all find handles', () => {
  const f = fixture(name => {assert(['FindFirstFileA', 'FindClose'].includes(name)); return name === 'FindFirstFileA' ? -1 : 0;});
  f.memory.write('previous-name\0', 0x6e6b50);
  assert.equal(discoverGameRootName(f), 0x6e6b50); assert.equal(text(f.memory, 0x6e6b50), 'previous-name');
  assert.equal(f.calls.filter(([name]) => name === 'FindClose').length, 3);
});

test('a failed short read retains printable old tail bytes before closing the file', () => {
  const f = fixture((name, args, memory) => {
    if (name === 'FindFirstFileA') return 0;
    if (name === 'FindClose' || name === 'CloseHandle') return 1;
    if (name === 'CreateFileA') return 0x1234;
    if (name === 'ReadFile') {memory.write('GO', args[1]); memory.writeUInt32LE(2, args[3]); return 0;}
    assert.fail(`unexpected ${name}`);
  });
  f.memory.write('prefix-tail\0', 0x6e6b50);
  discoverGameRootName(f);
  assert.equal(text(f.memory, 0x6e6b50), 'GOefix-tail');
  assert.deepEqual(f.calls.at(-1), ['CloseHandle', 0x1234]);
});
