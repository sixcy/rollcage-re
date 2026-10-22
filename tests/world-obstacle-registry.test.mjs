import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAutonomousObstaclePolygons, appendLoadedWorldObstacle} from '../src/world-obstacle-registry.mjs';

function fixture(count = 1, polygons = 1) {
  const memory = Buffer.alloc(0xa00000), put = (p, v) => memory.writeInt32LE(v, p);
  put(0x6e6514, count); memory.fill(0x9a, 0x6f95a0, 0x6f96a0);
  for (let index = 0; index < count; index++) {
    const object = 0x10000 + index * 0x1000, model = object + 0x400, vertices = object + 0x800, faces = object + 0x900;
    put(0x920b40 + index * 12, object); put(object + 0x10, model); put(object + 0x24, vertices); put(object + 0x28, faces); put(object + 0x194, object + 0xa00);
    memory[object + 0x10d] = 2; memory[model + 0x27] = polygons; memory.writeUInt16LE(0x80, model + 0x34);
    memory.writeInt16LE(100, vertices + 2); memory.writeInt16LE(76, vertices + 10); put(faces, 1);
    for (let polygon = 0; polygon < polygons; polygon++) {memory[model + 0x80 + polygon * 20 + 8] = 0; memory[model + 0x80 + polygon * 20 + 9] = 1;}
  }
  return memory;
}

test('obstacle producer accepts a face with a vertex strictly above highest minus24', () => {
  const memory = fixture(); buildAutonomousObstaclePolygons({memory});
  assert.equal(memory.readUInt32LE(0x6e6520), 1); assert.equal(memory.readUInt32LE(0x920b44), 1); assert.equal(memory.readUInt32LE(0x6f95a0), 0x10480);
  assert.equal(memory.readUInt32LE(0x6f95a4), 0x9a9a9a9a);
  memory.writeInt32LE(2, 0x10900); buildAutonomousObstaclePolygons({memory});
  assert.equal(memory.readUInt32LE(0x6e6520), 0); assert.equal(memory.readUInt32LE(0x920b44), 0); assert.equal(memory.readUInt32LE(0x6f95a0), 0x10480);
});

test('obstacle producer excludes metadata class4 and negative maximum height', () => {
  const memory = fixture(); memory[0x10a03] = 0xf4; buildAutonomousObstaclePolygons({memory}); assert.equal(memory.readUInt32LE(0x920b44), 0);
  memory[0x10a03] = 0; memory.writeInt16LE(-1, 0x10802); memory.writeInt16LE(-20, 0x1080a); buildAutonomousObstaclePolygons({memory}); assert.equal(memory.readUInt32LE(0x920b44), 0);
});

test('obstacle polygon capacity60 spans objects and empty rows retain current pool pointer', () => {
  const memory = fixture(3, 35); memory[0x12000 + 0x10d] = 0;
  buildAutonomousObstaclePolygons({memory});
  assert.equal(memory.readUInt32LE(0x6e6520), 60); assert.equal(memory.readUInt32LE(0x920b44), 35); assert.equal(memory.readUInt32LE(0x920b50), 25);
  assert.equal(memory.readUInt32LE(0x920b5c), 0); assert.equal(memory.readUInt32LE(0x920b60), 0x6f95a0 + 60 * 4);
});

test('empty obstacle registry resets count while preserving pool and registry tails', () => {
  const memory = fixture(0); memory.writeInt32LE(59, 0x6e6520); memory.writeInt32LE(123, 0x920b44);
  buildAutonomousObstaclePolygons({memory}); assert.equal(memory.readInt32LE(0x6e6520), 0); assert.equal(memory.readInt32LE(0x920b44), 123); assert.equal(memory[0x6f95a0], 0x9a);
});

test('loader append segment admits only category byte19a zero and preserves remaining row fields', () => {
  const memory = Buffer.alloc(0xa00000, 0x69), object = 0x10000;
  memory.writeInt32LE(2, 0x6e6514); memory[object + 0x19a] = 1;
  appendLoadedWorldObstacle(object, {memory}); assert.equal(memory.readInt32LE(0x6e6514), 2);
  memory[object + 0x19a] = 0; appendLoadedWorldObstacle(object, {memory});
  assert.equal(memory.readUInt32LE(0x920b40 + 24), object); assert.equal(memory.readInt32LE(0x6e6514), 3);
  assert.equal(memory.readUInt32LE(0x920b40 + 28), 0x69696969); assert.equal(memory.readUInt32LE(0x920b40 + 32), 0x69696969);
});
