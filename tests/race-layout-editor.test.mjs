import test from 'node:test';
import assert from 'node:assert/strict';
import {raceLayoutFixture} from './lib/race-layout-fixture.mjs';
import {emptyRaceLayoutDraft, createRaceLayoutDraft, inspectRaceLayout, validateRaceLayoutDraft, compileRaceLayoutEdits, raceLayoutMoveConstraint, raceLayoutCheckpointConstraint} from '../src/race-layout-editor.mjs';
import {selectFinishRoute} from '../src/finish-bookkeeping.mjs';
import {rebuildRaceLayoutFallback} from '../src/race-layout-spatial.mjs';

test('race layout inspects existing native-width fields and no-edit drafts preserve every byte', () => {
  const source = raceLayoutFixture(), info = inspectRaceLayout(source);
  assert.equal(info.groups.length, 2); assert.equal(info.routes.length, 3); assert.equal(info.checkpoints.length, 2); assert.equal(info.starts.length, 2);
  assert.deepEqual(info.routes[0].position, [64, -20, -32]); assert.equal(info.routes[0].targetSpeed, 180);
  assert.deepEqual(info.checkpoints[0].direction, [0, 0, -16384]); assert.equal(info.checkpoints[0].sector, 0);
  assert.deepEqual(compileRaceLayoutEdits(source), source); assert.deepEqual(compileRaceLayoutEdits(source, createRaceLayoutDraft(source)), source);
});

test('combined route, checkpoint and start edits preserve opaque flags, links, IDs, progress and metadata', () => {
  const source = raceLayoutFixture(), before = Buffer.from(source), snapshot = createRaceLayoutDraft(source);
  const draft = {routes: [snapshot.routes[0]], checkpoints: [snapshot.checkpoints[0]], starts: [snapshot.starts[0]]};
  draft.routes[0].position[0]++; draft.routes[0].minSpeed = 255; draft.routes[0].targetSpeed = 0;
  draft.checkpoints[0].position[0]++; draft.checkpoints[0].direction = [1024, 0, -16352]; draft.starts[0].position[0]++;
  const output = compileRaceLayoutEdits(source, draft), allowed = new Set([...[...Array(8).keys()].map(i => 0x1900 + i), ...[...Array(6).keys()].map(i => 0x1b04 + i), ...[...Array(6).keys()].map(i => 0x1b0c + i), ...[...Array(6).keys()].map(i => 0x1a00 + i), 0x1b00, 0x96, 0x97, 0xac, 0xad, 0xae, 0xaf, ...[...Array(4).keys()].flatMap(i => [0x1120 + i, 0x112c + i])]);
  for (let i = 0; i < source.length; i++) if (!allowed.has(i)) assert.equal(output[i], source[i], `Unexpected byte change at ${i.toString(16)}`);
  assert.equal(output.readUInt32LE(0x1908), 0x12345678); assert.equal(output.readUInt32LE(0x190c), 0x0c0a0201);
  assert.equal(output.readUInt16LE(0x1a06), 0xbeef); assert.equal(output.readUInt16LE(0x1b0a), 0xdead); assert.equal(output.readUInt16LE(0x1b12), 0xab01);
  assert.deepEqual(source, before);
});

test('covered terrain permits cell, layer and sector moves; outside or unsupported destinations reject before output', () => {
  const source = raceLayoutFixture(), info = inspectRaceLayout(source), draft = createRaceLayoutDraft(source);
  assert.equal(raceLayoutMoveConstraint(info, draft.routes[0].position, [65, -20, -32]).allowed, true);
  assert.equal(raceLayoutMoveConstraint(info, draft.routes[0].position, [300, -20, -32]).allowed, true);
  assert.equal(raceLayoutMoveConstraint(info, draft.routes[0].position, [64, 1, -32]).allowed, true);
  assert.equal(raceLayoutMoveConstraint(info, draft.checkpoints[0].position, [192, -20, -64]).supportSector, 1);
  for (let i = 0; i < 9; i++) source.writeInt16LE(source.readInt16LE(0x12c4 + i * 8) - 128, 0x12c4 + i * 8);
  const checkpoint = {...draft.checkpoints[0], position: [192, -20, -192]}, moved = compileRaceLayoutEdits(source, {...emptyRaceLayoutDraft(), checkpoints: [checkpoint]});
  assert.equal(moved[0x1b00], 1); assert.equal(moved[0x1b01], source[0x1b01]);
  const before = Buffer.from(source); draft.routes[0].position = [5000, -20, -32];
  assert.throws(() => compileRaceLayoutEdits(source, draft), /no populated native spatial cell/); assert.deepEqual(source, before);
  assert.equal(raceLayoutMoveConstraint(info, [64, -20, -32], [64, -2000, -32]).allowed, false);
});

test('checkpoint anchors are infinite-plane references and can move outside populated road cells while their plane still crosses the sector', () => {
  const source = raceLayoutFixture(), info = inspectRaceLayout(source), original = info.checkpoints[0];
  const row = {id: original.id, position: [-1000, -20, -64], direction: [...original.direction]};
  const constraint = raceLayoutCheckpointConstraint(info, original, row); assert.equal(constraint.allowed, true); assert.equal(constraint.supportSector, 0);
  assert.ok(constraint.anchorDistance > 900); assert.equal(raceLayoutMoveConstraint(info, original.position, row.position).allowed, false);
  const out = compileRaceLayoutEdits(source, {...emptyRaceLayoutDraft(), checkpoints: [row]}); assert.equal(out[original.offset], original.sector); assert.equal(out.readInt16LE(original.offset + 4), -1000);
  const missed = {...row, position: [-1000, -20, 1000]}; assert.equal(raceLayoutCheckpointConstraint(info, original, missed).allowed, false);
  assert.throws(() => compileRaceLayoutEdits(source, {...emptyRaceLayoutDraft(), checkpoints: [missed]}), /plane does not intersect/);
});

test('fallback rebuild preserves shared-node model words, layer chains and native 48da10 selection after a distant route move', () => {
  const source = raceLayoutFixture();
  for (const sector of inspectRaceLayout(source).scene.segments) for (let i = 0; i < sector.vertices.length; i++) source.writeInt16LE(sector.vertices[i][0] * 2, sector.verticesOffset + i * 8);
  source.writeUInt16LE(5, 0x180c);
  const positions = [[64, -20, -32], [450, -20, -32], [128, -20, -100], [400, -20, -80], [450, -20, -110]];
  positions.forEach((p, i) => {p.forEach((n, axis) => source.writeInt16LE(n, 0x1900 + i * 16 + axis * 2)); source.writeUInt32LE(0, 0x190c + i * 16);});
  source.writeUInt16LE(3, 0x96); source.writeUInt32LE(17, 0x1c04); source.writeUInt32LE(29, 0x1c08);
  for (const offset of [0x1120, 0x112c]) source.writeUInt32LE((source.readUInt32LE(offset) | 2 << 19) >>> 0, offset);
  const info = inspectRaceLayout(source), route = {...createRaceLayoutDraft(source).routes[0], position: [384, -20, -32]};
  const constraint = raceLayoutMoveConstraint(info, positions[0], route.position); assert.equal(constraint.allowed, true); assert.notEqual(constraint.originalBucket.column, constraint.destinationBucket.column);
  const output = compileRaceLayoutEdits(source, {...emptyRaceLayoutDraft(), routes: [route]}), after = inspectRaceLayout(output);
  assert.ok(output.length > source.length); assert.equal(after.fallback.nodes[0].group, 1); assert.equal(after.fallback.nodes[0].point, 2);
  for (const row of after.fallback.nodes) assert.deepEqual(row.models, [17, 29]);
  assert.deepEqual(after.spatial.nodes.map(n => n.referenceWord), info.spatial.nodes.map(n => n.referenceWord));
  assert.deepEqual(after.spatial.nodes.map(n => n.heightThreshold), info.spatial.nodes.map(n => n.heightThreshold));
  assert.deepEqual(output.subarray(0x1100, 0x1104), source.subarray(0x1100, 0x1104));
  const memory = Buffer.alloc(0x920000), base = 0x20000, pack = 0x10000, record = 0x18000, body = 0x19000;
  output.copy(memory, base); memory.writeUInt32LE(pack, 0x90b98c); memory.writeUInt32LE(base + 0x1800, pack + 0x60); memory.writeUInt32LE(base + output.readUInt32LE(0xac), pack + 0x7c);
  memory.writeUInt32LE(base + 0x1900, base + 0x180c + 8); memory.writeUInt32LE(body, record); memory.writeUInt32LE(base + 0x180c, record + 0x54); memory.writeUInt32LE(4, record + 0x58);
  memory.writeUInt32LE(base + 0x1120, body + 0xc); positions[2].forEach((n, axis) => memory.writeInt32LE(n * 65536, body + 0x34 + axis * 4));
  selectFinishRoute(record, {memory}); assert.equal(memory.readUInt32LE(record + 0x58), 2); assert.equal(memory.readUInt32LE(record + 0x54), base + 0x180c);
});

test('fallback rebuilding keeps an overlapping road height branch on its existing route layer', () => {
  const source = raceLayoutFixture(), positions = [[64, 20, -32], [128, 20, -32], [64, -280, -64], [128, -280, -64]];
  source.writeUInt16LE(4, 0x180c);
  positions.forEach((p, i) => {p.forEach((n, axis) => source.writeInt16LE(n, 0x1900 + i * 16 + axis * 2)); source.writeUInt32LE(0, 0x190c + i * 16);});
  source.writeUInt16LE(2, 0x96); source.writeUInt32LE(0x10002, 0x1c04); source.writeUInt32LE((source.readUInt32LE(0x112c) & 0x3fffff) | 1 << 22, 0x112c);
  source.writeUInt16LE(0x8080, 0x100 + 127 * 16); source.writeUInt16LE(0x8080, 0x100 + 128 * 16);
  const info = inspectRaceLayout(source), route = {...createRaceLayoutDraft(source).routes[0], position: [200, 20, -32]};
  const out = compileRaceLayoutEdits(source, {...emptyRaceLayoutDraft(), routes: [route]}), after = inspectRaceLayout(out);
  assert.equal(after.fallback.nodes[0].point, 1); assert.equal(after.fallback.nodes[1].point, 2);
  assert.equal(info.spatial.lookup([64 * 65536, 20 * 65536, -32 * 65536]).node.index, 0);
  assert.equal(info.spatial.lookup([64 * 65536, -280 * 65536, -64 * 65536]).node.index, 1);
});

test('fallback splitting rejects native table offset overflow without truncating bits or mutating the source', () => {
  const source = Buffer.alloc(0x7000); raceLayoutFixture().copy(source);
  source.writeUInt32LE(256, 0xc); source.writeUInt32LE(0x3000, 0x68); source.writeUInt32LE(0x4000, 0x6c); source.writeUInt32LE(0x5000, 0xac); source.writeUInt16LE(1024, 0x96);
  for (let z = 0; z < 256; z++) {source.writeUInt16LE(0xff, 0x100 + z * 16); source.writeUInt32LE(0, 0x10c + z * 16);}
  source.writeUInt16LE(0xff00, 0x100 + 127 * 16); source.writeUInt16LE(0xff, 0x102 + 127 * 16); source.writeUInt32LE(1, 0x10c + 127 * 16);
  for (let i = 0; i < 256; i++) {
    source.writeUInt16LE(i * 12, 0x4000 + i * 2); source.writeUInt32LE((((i % 128) * 8) << 22 | 7 << 19) >>> 0, 0x3000 + i * 12);
  }
  for (let i = 0; i < 128; i++) {source.writeUInt32LE(0x10000, 0x5000 + i * 32); for (let m = 1; m <= 7; m++) source.writeUInt32LE(i * 7 + m, 0x5000 + i * 32 + m * 4);}
  const positions = [[0, 0, -128], [-20000, 0, -128], [20000, 0, -128], [100, 0, -128], [-100, 0, -128]]; source.writeUInt16LE(5, 0x180c);
  positions.forEach((p, i) => p.forEach((n, axis) => source.writeInt16LE(n, 0x1900 + i * 16 + axis * 2)));
  const info = inspectRaceLayout(source), before = Buffer.from(source), edited = Buffer.from(source); edited.writeInt16LE(5000, 0x1900);
  assert.throws(() => rebuildRaceLayoutFallback(source, edited, info), /native shared model-link table capacity/); assert.deepEqual(source, before);
});

test('invalid fields, signed widths, duplicate IDs and zero checkpoint directions fail closed', () => {
  const source = raceLayoutFixture(), original = createRaceLayoutDraft(source);
  const mutation = fn => {const d = structuredClone(original); fn(d); return () => compileRaceLayoutEdits(source, d);};
  assert.throws(mutation(d => d.routes[0].position[0] = 32768), /signed 16-bit/);
  assert.throws(mutation(d => d.routes[0].targetSpeed = 256), /unsigned byte/);
  assert.throws(mutation(d => d.routes.push(d.routes[0])), /duplicate/);
  assert.throws(mutation(d => d.checkpoints[0].direction = [0, 0, 0]), /nonzero/);
  assert.throws(mutation(d => d.checkpoints[0].sector = 1), /Checkpoint edits/);
  assert.throws(mutation(d => d.starts[0].yaw = 1024), /Start edits/);
  assert.throws(() => validateRaceLayoutDraft(source, {...emptyRaceLayoutDraft(), patches: []}), /Invalid race-layout/);
});

test('new coincident route neighbors and conflicting aliased records fail atomically', () => {
  const source = raceLayoutFixture(), original = createRaceLayoutDraft(source), draft = {routes: [original.routes[0]], checkpoints: [], starts: []};
  draft.routes[0].position = [...original.routes[1].position]; assert.throws(() => compileRaceLayoutEdits(source, draft), /coincident adjacent/);
  // Two distinct group records can legitimately reference the same point bytes.
  source[0x79] = 3; source.writeUInt16LE(3, 0x1818); source[0x181c] = 1;
  const full = createRaceLayoutDraft(source); full.routes[0].targetSpeed = 100; full.routes[3].targetSpeed = 101;
  assert.throws(() => compileRaceLayoutEdits(source, full), /Aliased race-layout/);
});

test('short and malformed authored tables reject without fabricating routes or starts', () => {
  assert.throws(() => inspectRaceLayout(Buffer.alloc(256)), /Invalid GFXM/);
  const data = raceLayoutFixture(); data.writeUInt32LE(data.length - 1, 0x74); assert.throws(() => inspectRaceLayout(data), /starting-grid table/);
  const noRoutes = raceLayoutFixture(); noRoutes[0x79] = 0;
  assert.deepEqual(inspectRaceLayout(noRoutes).routes, []); assert.deepEqual(createRaceLayoutDraft(noRoutes).routes, []);
});
