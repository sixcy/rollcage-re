import test from 'node:test';
import assert from 'node:assert/strict';
import {ByteBuffer} from '../tools/track-viewer/byte-buffer.mjs';
import {existsSync} from 'node:fs';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {PICKUP_EDITOR_LEVELS, parsePickupPlacements, createPickupDraft, validatePickupDraft, compilePickupEdits, parsePickupProject, createPickupProject, validatePickupProject, validatePickupSourcePair, pickupSha256} from '../src/pickup-editor.mjs';

function fixture() {
  const data = Buffer.alloc(0x153, 0x7b);
  data.write('GFXM'); data.writeUInt32LE(0x100, 0x90); data[0x94] = 2;
  for (let i = 0; i < 2; i++) {
    [-100 + i, 200, -300].forEach((n, axis) => data.writeInt16LE(n, 0x100 + i * 12 + axis * 2));
    data.fill(0xa0 + i, 0x106 + i * 12, 0x10c + i * 12);
  }
  return data;
}
const hash = 'a'.repeat(64), hash2 = 'b'.repeat(64);
const projectFor = data => createPickupProject({indexSha256: hash, levels: [{level: 1, sourceHashes: {LOW: hash, HIGH: hash2}, pickups: createPickupDraft(data)}]});

test('unchanged draft returns identical original bytes and parsing copies records', () => {
  const data = fixture(), parsed = parsePickupPlacements(data);
  assert.equal(parsed.count, 2); assert.deepEqual(parsed.records[0].position, [-100, 200, -300]);
  parsed.records[0].raw.fill(0);
  assert.equal(data[0x106], 0xa0);
  assert.deepEqual(compilePickupEdits(data, createPickupDraft(data)), data);
  // Draft identity/template identity are UI metadata. Equal compiled records
  // still count as unchanged even after duplicating and deleting a record.
  const equivalent = Buffer.from(data); equivalent.set(equivalent.subarray(0x106, 0x10c), 0x112);
  const draft = createPickupDraft(equivalent); draft[1].templateIndex = 0;
  assert.deepEqual(compilePickupEdits(equivalent, draft), equivalent);
});

test('move, reorder and duplicate append aligned table preserving source templates', () => {
  const data = fixture(), original = Buffer.from(data), draft = createPickupDraft(data);
  draft.reverse(); draft[0].position = [-32768, 32767, 0];
  draft.push({id: 'copy', templateIndex: 1, position: [1, 2, 3]});
  const output = compilePickupEdits(data, draft), parsed = parsePickupPlacements(output);
  assert.equal(parsed.offset, 0x154); assert.equal(parsed.count, 3);
  assert.deepEqual(parsed.records.map(row => row.position), draft.map(row => row.position));
  assert.deepEqual(parsed.records[2].raw.subarray(6), data.subarray(0x112, 0x118));
  for (let i = 0; i < data.length; i++) if (i < 0x90 || i >= 0x95) assert.equal(output[i], data[i]);
  assert.deepEqual(data, original);
});

test('zero pickups retains old pointer and resource extent', () => {
  const data = fixture(), output = compilePickupEdits(data, []);
  assert.equal(output.length, data.length); assert.equal(output.readUInt32LE(0x90), 0x100); assert.equal(output[0x94], 0);
  const expected = Buffer.from(data); expected[0x94] = 0; assert.deepEqual(output, expected);
});

test('sixteen pickups supported and all invalid draft/template/coordinate inputs rejected', () => {
  const data = fixture(), rows = Array.from({length: 16}, (_, i) => ({id: `copy-${i}`, templateIndex: i % 2, position: [i, 0, 0]}));
  assert.equal(parsePickupPlacements(compilePickupEdits(data, rows)).count, 16);
  assert.throws(() => compilePickupEdits(data, [...rows, {...rows[0], id: 'extra'}]), /0..16/);
  for (const bad of [{...rows[0], templateIndex: 2}, {...rows[0], position: [0, 0, 32768]}, {...rows[0], position: [0, 0, 1.5]}, {...rows[0], raw: [0]}, {...rows[0], id: '__proto__!'}]) assert.throws(() => validatePickupDraft(data, [bad]));
  assert.throws(() => validatePickupDraft(data, [rows[0], rows[0]]), /duplicate/);
  assert.throws(() => validatePickupDraft(data, new Array(1)), /pickup/);
  assert.throws(() => validatePickupDraft(data, [{...rows[0], position: new Array(3)}]), /coordinates/);
  const empty = fixture(); empty[0x94] = 0; assert.throws(() => compilePickupEdits(empty, [rows[0]]), /template/);
});

test('malformed source bounds and headers rejected without accepting project patches', () => {
  assert.throws(() => parsePickupPlacements(Buffer.alloc(0x97)));
  const data = fixture(); data.writeUInt32LE(0xfffffff0, 0x90); assert.throws(() => parsePickupPlacements(data), /bounds/);
  data.writeUInt32LE(4, 0x90); assert.throws(() => parsePickupPlacements(data), /bounds/);
});

test('project roundtrip binds original index, both source hashes, supported levels and template bounds', () => {
  const data = fixture(), project = projectFor(data), sources = {indexSha256: hash, levels: [{level: 1, sourceHashes: {LOW: hash, HIGH: hash2}, lowData: data, highData: data}]};
  assert.deepEqual(parsePickupProject(JSON.stringify(project)), project);
  assert.deepEqual(validatePickupProject(project, sources), project);
  assert.throws(() => validatePickupProject(project, {...sources, indexSha256: hash2}), /index hash/);
  assert.throws(() => validatePickupProject(project, {...sources, levels: []}), /missing/);
  const altered = structuredClone(project); altered.levels[0].sourceHashes.HIGH = hash; assert.throws(() => validatePickupProject(altered, sources), /source hash/);
  altered.levels[0].sourceHashes.HIGH = hash2; altered.levels[0].pickups[0].templateIndex = 100; assert.throws(() => validatePickupProject(altered, sources), /template/);
  for (const level of [0, 15, 21]) assert.throws(() => parsePickupProject({...project, levels: [{...project.levels[0], level}]}), /Unsupported/);
  assert.throws(() => parsePickupProject({...project, patch: {offset: 1}}), /fields/);
  assert.throws(() => parsePickupProject({...project, levels: [project.levels[0], project.levels[0]]}), /duplicate/);
  assert.throws(() => parsePickupProject({...project, levels: new Array(1)}), /project level/);
});

test('LOW/HIGH pairing checks original count and coordinates while preserving per-quality metadata', () => {
  const low = fixture(), high = fixture(); high[0x106] = 0x55;
  validatePickupSourcePair(low, high);
  const draft = createPickupDraft(low); draft[0].position[0]++;
  assert.equal(parsePickupPlacements(compilePickupEdits(high, draft)).records[0].raw[6], 0x55);
  high.writeInt16LE(77, 0x100); assert.throws(() => validatePickupSourcePair(low, high), /differ/);
});

test('SHA helper digests bytes using Web Crypto', async () => {
  assert.equal(await pickupSha256(new Uint8Array()), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('compiler works with viewer ByteBuffer without Node Buffer APIs', () => {
  const data = ByteBuffer.from(fixture()), hostBuffer = globalThis.Buffer;
  try {
    globalThis.Buffer = ByteBuffer;
    const draft = createPickupDraft(data); draft[0].position[2] = 1234;
    const output = compilePickupEdits(data, draft);
    assert(output instanceof ByteBuffer); assert.equal(parsePickupPlacements(output).records[0].position[2], 1234);
    assert.deepEqual(Array.from(compilePickupEdits(data, createPickupDraft(data))), Array.from(data));
  } finally {globalThis.Buffer = hostBuffer;}
});

const installation = 'C:/Program Files (x86)/Psygnosis/Rollcage';
test('installed supported LOW/HIGH pairs preserve unchanged resources and all template metadata', {skip: !existsSync(`${installation}/IDXData/Rollcage.idx`)}, async () => {
  const archive = await RollcageArchive.open(installation);
  try {
    for (const level of PICKUP_EDITOR_LEVELS) {
      const pair = [];
      for (const quality of ['LOW', 'HIGH']) {
        const track = getGame('rollcage').tracks.find(row => row.name === `${quality}/LEV${level}.BLP`);
        const {data} = await archive.readResource(track.index), draft = createPickupDraft(data);
        assert.deepEqual(compilePickupEdits(data, draft), data);
        if (draft.length) {
          draft[0].position[0] += draft[0].position[0] === 32767 ? -1 : 1;
          const edited = parsePickupPlacements(compilePickupEdits(data, draft)), original = parsePickupPlacements(data);
          assert.deepEqual(edited.records[0].position, draft[0].position);
          for (let i = 0; i < draft.length; i++) assert.deepEqual(edited.records[i].raw.subarray(6), original.records[i].raw.subarray(6));
        }
        pair.push(data);
      }
      validatePickupSourcePair(...pair);
    }
  } finally {await archive.close();}
});
