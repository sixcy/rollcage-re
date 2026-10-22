import test from 'node:test';
import assert from 'node:assert/strict';
import {updateCameraViewportScale} from '../src/camera-viewport.mjs';

function fixture() {
  const memory = Buffer.alloc(0xa00000), application = 0x100000, head = 0x110000, name = 0x120000, log = [];
  const put = (p, v) => memory.writeInt32LE(v | 0, p); let cursor = 0x140000;
  put(application + 0x7c, head); for (const offset of [0, 4, 8]) put(head + offset, head); memory[head + 12] = 1; memory[head + 13] = 1;
  memory.writeFloatLE(0.05, 0x5dc664); memory.writeFloatLE(0.95, 0x5dc75c); memory.write('0 Player', name);
  const runtime = {memory, scratchBase: 0x9000, handlers: {allocate: size => {const p = cursor; cursor += (size + 15) & ~15; memory.fill(0xa5, p, cursor); log.push(['allocate', size]); return p;}, free: p => log.push(['free', p])}};
  return {memory, application, head, name, runtime, log, set: (value, mode = 1, key = name) => updateCameraViewportScale(application, key, mode, value, runtime), node: () => memory.readUInt32LE(head + 4)};
}

test('camera viewport assigns directly and blends the existing float with95%/5% weights', () => {
  const f = fixture(); f.set(100); assert.equal(f.memory.readFloatLE(f.node() + 72), 100);
  f.set(10, 0); assert.equal(f.memory.readFloatLE(f.node() + 72), 95.5); assert.equal(f.memory.readUInt32LE(f.application + 0x80), 1);
});

test('null and empty camera names share the actual empty map key', () => {
  const f = fixture(); f.set(3, 1, 0); f.memory[f.name] = 0; f.set(7);
  assert.equal(f.memory.readFloatLE(f.node() + 72), 7); assert.equal(f.memory.readUInt32LE(f.application + 0x80), 1);
});

test('heap-backed temporary names are released while the map retains its own name', () => {
  const f = fixture(); f.memory.write('A long camera viewport name\0', f.name); f.set(100); f.set(10, -1);
  assert.equal(f.log.filter(e => e[0] === 'free').length, 3); assert.equal(f.memory.readFloatLE(f.node() + 72), 95.5);
  assert.equal(f.memory.readUInt32LE(f.application + 0x80), 1);
});

test('direct camera scalar assignment preserves negative zero', () => {
  const f = fixture(); f.set(-0); assert.equal(f.memory.readUInt32LE(f.node() + 72), 0x80000000);
});
