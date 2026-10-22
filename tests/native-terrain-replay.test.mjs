import test from 'node:test';
import assert from 'node:assert/strict';
import {replayNativeTerrain} from '../tools/lib/native-terrain-replay.mjs';
import sqrt from '../src/sqrt-table.json' with {type: 'json'};

// Synthetic ABI/alias fixture, separate from original-process evidence.
function fixture() {
  const ranges = new Map(), delta = 0x2e0000;
  const add = (id, address, length, extra = {}) => {
    const row = {id, address: `0x${address.toString(16)}`, bytes: Buffer.alloc(length), length, ...extra};
    ranges.set(id, row); return row.bytes;
  };
  const global = (id, address, length) => add(id, address + delta, length, {rootRva: `0x${(address - 0x400000).toString(16)}`, dereferenceOffsets: [], offset: '0'});
  const geometry = add('geometry-region', 0x13000000, 4096);
  geometry.writeUInt32LE(0x13000200, 0x100);
  geometry.writeUInt32LE(1, 0x208); geometry.writeUInt32LE(1, 0x20c); geometry.writeUInt32LE(0x13000300, 0x220);
  [[0,0,0],[32,0,0],[0,0,-32],[32,0,-32]].forEach((v,i) => v.forEach((x,j) => geometry.writeInt16LE(x, 0x300+i*8+j*2)));
  global('terrain-globals', 0x90b970, 32).writeUInt32LE(0x909240 + delta, 0x1c);
  add('terrain-pack', 0x909240 + delta, 0xa0).writeUInt32LE(0x13000100);
  const body = add('body', 0x14000000, 384); body.writeUInt32LE(3); body.writeUInt32LE(0x14100000, 0x154); body.writeUInt16LE(1, 0x15c);
  const candidates = add('candidates', 0x14100000, 1024); candidates[0] = 0xa0; candidates[3] = 1;
  candidates.writeUInt32LE((768 << 10) >>> 0, 8); candidates.writeUInt32LE(0x13000300, 12);
  const query = add('query', 0x14200000, 72);
  [4096,-8192,-4096].forEach((v,i) => query.writeInt32LE(v, 8+i*4)); query.writeInt32LE(16384, 24);
  add('output', 0x14300000, 40).fill(0xa5);
  const stack = add('entry-stack', 0x14400000, 12); stack.writeUInt32LE(0x14300000, 4); stack.writeInt32LE(65536, 8);
  add('terrain-local-stack', 0x143ffefc, 0x104);
  global('cross-scratch', 0x91d360, 0x104); global('plane-scratch', 0x91e7a0, 2560); global('border-scratch', 0x911c00, 40); global('clock', 0x90a548, 4);
  const roots = global('sqrt-table', 0x5eb290, 384); sqrt.values.forEach((v,i) => roots.writeUInt16LE(v,i*2));
  global('normalization-one', 0x5dc774, 4).writeFloatLE(1);
  global('normalization-scale', 0x5dca88, 4).writeFloatLE(4096);
  return {registers: {fpuControlWord: '0x007f', mxcsr: '0x1f80'}, ranges};
}

test('native terrain adapter uses captured high-address vertices and coherent global aliases', () => {
  const input = fixture(), result = replayNativeTerrain(input), output = result.span(0x14300000, 40);
  assert.equal(result.fraction, 32768);
  assert.deepEqual([0,4,8].map(p => output.readInt32LE(p)), [4096,0,-4096]);
  assert.deepEqual([12,16,20].map(p => output.readInt32LE(p)), [0,-65536,0]);
  assert.equal(output.readInt32LE(28), 1);
  assert.equal(result.memory[0x14100000], 0xb0);
  assert.ok(result.vertexReads.length >= 4);
  assert.equal(input.ranges.get('candidates').bytes[0], 0xa0);
  assert.equal(output.readUInt32LE(36), 0xa5a5a5a5);
});

test('native terrain adapter fails on missing geometry and unsupported numerical context', () => {
  const input = fixture(); input.ranges.delete('geometry-region');
  assert.throws(() => replayNativeTerrain(input), /Uncaptured/);
  const changed = fixture(); changed.registers.mxcsr = '0x9f80';
  assert.throws(() => replayNativeTerrain(changed), /numerical context/);
});

test('captured sphere input reaches an earlier plane contact than its centre ray', () => {
  const input = fixture(); input.ranges.get('query').bytes.writeInt32LE(512, 64);
  const result = replayNativeTerrain(input), output = result.span(0x14300000, 40);
  assert.equal(result.radiusQ8, 512);
  assert.equal(result.fraction, 30720);
  assert.equal(output.readInt32LE(28), 1);
  assert.deepEqual([0,4,8].map(p => output.readInt32LE(p)), [4096,0,-4096]);
  assert.equal(result.memory.readInt32LE(0x91e7a0 + 36), 30720, 'The source writes the aliased native plane record.');
});
