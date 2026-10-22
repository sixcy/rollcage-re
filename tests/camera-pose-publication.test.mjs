import test from 'node:test';
import assert from 'node:assert/strict';
import {publishCameraPose} from '../src/camera-pose-publication.mjs';
import {initializeCameraProjectionConstants} from '../src/camera-projection.mjs';

function fixture(speed = 0) {
  const memory = Buffer.alloc(0xa00000); initializeCameraProjectionConstants(memory);
  memory.writeFloatLE(0.05, 0x5dc664); memory.writeFloatLE(0.95, 0x5dc75c);
  const put = (p, v) => memory.writeInt32LE(v | 0, p), word = (p, v) => memory.writeUInt16LE(v & 65535, p);
  const owner = 0x120000, control = 0x121000, body = 0x100000, target = 0x110000, pose = 0x130000, name = 0x131000, app = 0x140000, head = 0x150000;
  put(0x6e6388, 0x200000); put(0x5ecefc, 0x52000); put(0x5ecb1c, 0x50000); word(0x5242c, 640); word(0x5242e, 480);
  put(owner, target); put(owner + 0x18, control); put(control, body); put(control + 4, target); word(target + 0x668, speed);
  put(0x902eec, body); put(body + 12, 0x45000); word(0x45008, 1); put(0x909254, 0x40000); put(0x909278, 0x45000);
  for (let row = 0; row < 256; row++) {word(0x40000 + row * 16, 0xff00); word(0x40002 + row * 16, 255); put(0x4000c + row * 16, 0x43000);}
  put(0x6efb38, app); put(app + 0x7c, head); for (const offset of [0, 4, 8]) put(head + offset, head); word(head + 12, 0x101);
  let cursor = 0x180000; const log = [], runtime = {memory, scratchBase: 0x9000, handlers: {
    allocate(size) {const result = cursor; cursor += (size + 15) & ~15; log.push(['allocate', size]); return result;}, free(p) {log.push(['free', p]);}, dynamicCast() {log.push(['cast']); return app;},
    projectionMath(operation, value) {return Math.fround(Math[operation](value));}, projectionInteger(value) {return BigInt(Math.trunc(value));}
  }};
  return {memory, put, word, runtime, log, owner, control, body, target, pose, name, app, head};
}

test('camera pose publication preserves the original zero-speed scale and re-registers the camera body', () => {
  const f = fixture(); [65536, -65536, 32768].forEach((v, i) => f.put(f.body + 0x34 + i * 4, v));
  publishCameraPose(f.owner, f.body + 0x34, 0, f.name, f.runtime);
  assert.deepEqual([0, 4, 8].map(o => f.memory.readInt32LE(f.body + 0x34 + o)), [125952, -125952, 62976]);
  assert.equal(f.memory.readUInt32LE(f.body + 12), 0x45000); assert.equal(f.memory.readUInt16LE(0x45008), 1); assert.equal(f.memory.readUInt16LE(f.body + 4), 0);
  assert.deepEqual(f.log, []); assert.equal(f.memory.readFloatLE(0x91ceb0), 200);
});

test('camera pose blends controller offsets with the speed-dependent signed-short ratio', () => {
  const f = fixture(425); f.put(f.pose, 65536); f.put(f.control + 8, 16);
  publishCameraPose(f.owner, f.pose, 0, f.name, f.runtime);
  assert.equal(f.memory.readInt32LE(f.pose), 48675); assert.equal(f.memory.readFloatLE(0x91ceb0), 68);
});

test('camera named viewport gate uses the original flag and passes speed strength into actual smoothing', () => {
  const f = fixture(350); f.memory.write('0 Player\0', f.name);
  publishCameraPose(f.owner, f.pose, 1, f.name, f.runtime); assert.deepEqual(f.log, []);
  f.put(0x91ce90, 2); publishCameraPose(f.owner, f.pose, 1, f.name, f.runtime);
  assert.equal(f.log.filter(item => item[0] === 'cast').length, 1);
  const node = f.memory.readUInt32LE(f.head + 4);
  assert.equal(f.memory.readFloatLE(node + 44 + 0x1c), Math.fround(Math.fround(0.4) * Math.fround(0.05)));
  publishCameraPose(f.owner, f.pose, 0, f.name, f.runtime); assert.equal(f.memory.readFloatLE(node + 44 + 0x1c), 0);
});
