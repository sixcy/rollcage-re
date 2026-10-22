import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationRuntimeFixture} from '../tools/lib/simulation-runtime-fixtures.mjs';
import {queryRawRespawnPlacement} from '../src/raw-respawn-query.mjs';
import {queryTerrainSphere} from '../src/terrain-sphere-query.mjs';
import {queryTerrainRay} from '../src/terrain-query.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {createRawTerrainGrid} from '../src/raw-terrain-query.mjs';

const program = await loadRetainedNativeProgram();
function fixture(index = 1, {models = false} = {}) {
  const f = createSimulationRuntimeFixture(program, index, {count: 1, models, extraBodyStorage: [{address: 0x70f130, length: 0x3e78}]}), {memory} = f;
  memory.writeUInt32LE(f.addresses.regions, memory.readUInt32LE(0x90b98c) + 0x80);
  const runtime = {memory, views: f.views, grid: f.context.nativeTerrain.grid, models: f.models, modelPointersFor: f.candidateMapping.modelPointersFor, scratchBase: 0x9000, roundingMode: 'nearest-even'};
  return {...f, runtime, position: 0x74000, quaternion: 0x74020, output: 0x74040, body: f.bodies[0].address};
}
function position(f, values) {values.forEach((value, index) => f.memory.writeInt32LE(value * 65536, f.position + index * 4));}
function query(f, mode, quaternion = 0) {return queryRawRespawnPlacement(f.body, f.position, quaternion, f.body + 0xc4, mode, f.output, f.runtime);}

test('actual aggregate geometry rejects floor contact while mode0 skips its sole shape', () => {
  const f = fixture(); position(f, [2, 0, 2]);
  assert.equal(query(f, 0), 1); assert.equal(query(f, 1), 0);
  assert.notEqual(f.memory.readInt32LE(f.output), -1, 'real terrain selection publishes a nearest reference');
});

test('temporary shape allocations are returned to the live pool while their cached bytes remain', () => {
  const f = fixture(), pool = f.views.shapePool, before = [pool.freeTop, pool.activeTop, pool.allocatedCount], sourceAggregate = f.memory[f.body + 0x141], originalRadius = pool.records.readInt32LE(sourceAggregate * 72 + 64);
  position(f, [2, 0, 2]); query(f, 2);
  assert.deepEqual([pool.freeTop, pool.activeTop, pool.allocatedCount], before);
  const temporaryAggregate = f.memory[0x70f271]; assert.notEqual(temporaryAggregate, sourceAggregate);
  assert.equal(pool.records.readInt32LE(temporaryAggregate * 72 + 64), 8000); assert.equal(pool.records.readInt32LE(sourceAggregate * 72 + 64), originalRadius);
  assert.equal(f.views.bodyAt(0x70f130).bytes.buffer, f.memory.buffer);
});

test('nonnull quaternion writes the source rotation before the full vehicle copy', () => {
  const f = fixture(); f.memory.writeInt32LE(0x1803, f.body); f.memory[f.body + 0x3e70] = 123;
  [65536, 0, 0, 0].forEach((value, index) => f.memory.writeInt32LE(value, f.quaternion + index * 4)); f.memory.fill(0, f.body + 0xc4, f.body + 0xd6);
  position(f, [10000, -6, 2]); assert.equal(query(f, 1, f.quaternion), 0);
  assert.deepEqual(Array.from({length: 9}, (_, index) => f.memory.readInt16LE(f.body + 0xc4 + index * 2)), [4096, 0, 0, 0, 4096, 0, 0, 0, 4096]);
  assert.equal(f.memory[0x70f130 + 0x3e70], 123); assert.equal(f.memory.readInt32LE(f.output), -1);
});

test('uncapped respawn candidates preserve actual private-arena writes into the clone', () => {
  const f = fixture(3); position(f, [2, -6, 2]);
  for (const region of f.grid.regions) {region.rows = 6; f.memory.writeUInt16LE(region.columns << 12 | region.rows << 8 | region.padding, f.addresses.regions + region.index * 6 + 4);}
  query(f, 2);
  assert.equal(f.memory.readUInt16LE(0x70f28c), 72);
  assert.notEqual(f.memory.readInt32LE(0x70f130), f.memory.readInt32LE(f.body), 'candidate64 writes the clone flags rather than being silently capped');
});

test('ordinary pure terrain workflows retain their default64 bound', () => {
  const candidates = Array(65).fill({});
  assert.throws(() => queryTerrainSphere({}, candidates, {radiusQ8: 1}), /bound/);
  assert.throws(() => queryTerrainRay({}, candidates, {radiusQ8: 0}), /bound/);
});

test('model append consumes live object class changes across placement attempts', () => {
  const f = fixture(2, {models: true}); position(f, [2, -6, 2]); query(f, 0);
  assert.ok(f.memory.readUInt16LE(0x70f28e) > 0);
  for (const instance of f.models.instances.values()) {
    const {object} = f.candidateMapping.modelPointersFor({...instance, shape: instance.collision.shapes[0]}); f.memory[object + 0x19a] = 5;
  }
  query(f, 0); assert.equal(f.memory.readUInt16LE(0x70f28e), 0);
});

test('empty regions consume the shape-cache saved record before selecting an uninitialized nearest ID', () => {
  const f = fixture(1, {models: true}); position(f, [2, -6, 2]);
  for (const region of f.grid.regions) {region.rows = 0; f.memory.writeUInt16LE(region.columns << 12 | region.padding, f.addresses.regions + region.index * 6 + 4);}
  query(f, 1);
  assert.equal(f.memory.readUInt32LE(f.output), f.memory.readUInt32LE(0x91e79c) + f.memory[0x70f270] * 72);
});

test('zero-shape repeated empty queries retain the model appender local count as the next nearest ID', () => {
  const f = fixture(1, {models: true}); position(f, [2, -6, 2]); f.memory[f.body + 0x10c] = 0;
  for (const region of f.grid.regions) {region.rows = 0; f.memory.writeUInt16LE(region.columns << 12 | region.padding, f.addresses.regions + region.index * 6 + 4);}
  query(f, 1); assert.equal(f.memory.readUInt32LE(f.output), 0);
  const count = f.memory.readInt32LE(f.runtime.scratchBase - 136); assert.ok(count > 0);
  query(f, 1); assert.equal(f.memory.readUInt32LE(f.output), count);
});

test('sparse captured respawn query preserves the actual saved shape-record pointer and every semantic byte',()=>{
  const f=fixture();position(f,[2,0,2]);
  const captured=createCapturedMemory([{address:0,bytes:f.memory}]),memory=captured.memory;
  const views=createPhysicsRuntimeViews({memory,bodyStorage:[...f.addresses.bodies.map(address=>({address,length:0x4000})),{address:0x70f130,length:0x3e78}],bodyLists:[{address:f.addresses.list,capacity:8}],candidateMapping:f.candidateMapping});
  const grid=createRawTerrainGrid(f.grid,sector=>f.candidateMapping.terrainVerticesFor(sector),{memory});
  const actual=queryRawRespawnPlacement(f.body,f.position,0,f.body+0xc4,1,f.output,{...f.runtime,memory,views,grid});
  const expected=query(f,1);
  assert.equal(actual,expected);
  assert.equal(memory.readUInt32LE(f.runtime.scratchBase-136),f.memory.readUInt32LE(f.runtime.scratchBase-136));
  assert.deepEqual(captured.span(0,f.memory.length),f.memory);
});

test('relocated captured clone and private arena publish actual pointer values through explicit aliases',()=>{
  const f=fixture();position(f,[2,0,2]);
  const start=0x70eb00,end=0x712fa8,actual=0xc0000000,delta=actual-start;
  const captured=createCapturedMemory([{address:0,bytes:f.memory.subarray(0,start)},{address:actual,bytes:f.memory.subarray(start,end)},{address:end,bytes:f.memory.subarray(end)}],{aliases:[{address:start,targetAddress:actual,length:end-start}]}),memory=captured.memory;
  const views=createPhysicsRuntimeViews({memory,bodyStorage:[...f.addresses.bodies.map(address=>({address,length:0x4000})),{address:0x70f130,length:0x3e78}],bodyLists:[{address:f.addresses.list,capacity:8}],candidateMapping:f.candidateMapping});
  const grid=createRawTerrainGrid(f.grid,sector=>f.candidateMapping.terrainVerticesFor(sector),{memory});
  const result=queryRawRespawnPlacement(f.body,f.position,0,f.body+0xc4,1,f.output,{...f.runtime,memory,views,grid});
  assert.equal(result,query(f,1));assert.equal(views.bodyAt(0x70f130).address,0x70f130+delta);
  assert.equal(memory.readUInt32LE(0x70f130+0x154),0x70ed30+delta);
  const expected=Buffer.from(f.memory);for(const address of [0x70f130+0x154,0x70f130+0x158])expected.writeUInt32LE(expected.readUInt32LE(address)+delta,address);
  assert.deepEqual(captured.span(0,start),expected.subarray(0,start));assert.deepEqual(captured.span(start,end-start),expected.subarray(start,end));assert.deepEqual(captured.span(end,expected.length-end),expected.subarray(end));
});
