// Read-only corpus validation and reconstructed native consumers. No game launch.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createCheckpointTopologyDraft, compileCheckpointTopology, insertCheckpointAfter, removeCheckpoint, setFinishCheckpoint, setCheckpointTimingMarker} from '../src/checkpoint-topology.mjs';
import {parseCheckpointProgression, transitionCheckpoint, findNearestRespawnCheckpoint} from '../src/respawn-progress.mjs';
import {finishRaceProgress} from '../src/race-completion.mjs';
import {updateLapAdvance} from '../src/lap-timing.mjs';

const [output, installation = 'C:/Program Files (x86)/Psygnosis/Rollcage'] = process.argv.slice(2);
if (!output) throw Error('Usage: node tools/validate-checkpoint-topology.mjs NEW_REPORT.json [INSTALLATION]');
const archive = await RollcageArchive.open(installation), rows = [], sha = data => createHash('sha256').update(data).digest('hex');

function cycleChecks(data) {
  const pack = parseCheckpointProgression(data), memory = Buffer.alloc(0x600000), address = 0x10000, bodyAddress = 0x20000, session = 0x30000;
  memory.writeUInt32LE(bodyAddress, address); memory.writeUInt32LE(session, 0x5ecb1c); memory[session + 0x58c] = 1;
  const record = {bytes: memory.subarray(address, address + 0x30c), body00: {bytes: memory.subarray(bodyAddress, bodyAddress + 0x66e)}};
  Object.defineProperty(record.body00, 'position', {get: () => [0x34, 0x38, 0x3c].map(offset => record.body00.bytes.readInt32LE(offset))});
  record.bytes[0x21] = pack.checkpointCount44 - 1;
  const runtime = {pack, session: {mode579: 0}, clock90a548: 60}; let finishes = 0, splits = 0, expectedSplits = 0;
  const options = {trackBasis: () => [65536, 0, 0], advanceLap: row => {splits++; updateLapAdvance(row.bytes, {body: row.body00, clock90a548: 60});},
    finishProgress: () => {finishes++; finishRaceProgress(address, {memory, scratchBase: 0x40000});}};
  for (let cycle = 0; cycle < 3; cycle++) for (let order = 0; order < pack.checkpointCount44; order++) {
    assert.equal(record.bytes[0x20], order);
    const cp = pack.checkpoints70.subarray(pack.checkpointIds90[order * 4] * 20);
    if (cp[18] & 1) expectedSplits++;
    for (let axis = 0; axis < 3; axis++) {
      const anchor = cp.readInt16LE(4 + axis * 2), sign = Math.sign(cp.readInt16LE(12 + axis * 2));
      record.body00.bytes.writeInt16LE(Math.max(-32768, Math.min(32767, anchor + sign)), 0x36 + axis * 4);
    }
    transitionCheckpoint(record, 0, runtime, options);
    const nearest = findNearestRespawnCheckpoint(record, pack); assert.ok(nearest.checkpoint[1] < pack.checkpointCount44);
  }
  assert.equal(finishes, 3); assert.equal(record.bytes[0x1c], 3); assert.equal(record.bytes[0x20], 0); assert.equal(splits, expectedSplits);
  return {cycles: 3, forwardTransitions: pack.checkpointCount44 * 3, finishes, splits, nearestRespawnOrdersValid: true};
}

try {
  for (let level = 1; level <= 20; level++) for (const quality of ['LOW', 'HIGH']) {
    const track = getGame('rollcage').tracks.find(row => row.name === `${quality}/LEV${level}.BLP`), data = (await archive.readResource(track.index)).data;
    const hash = sha(data), base = createCheckpointTopologyDraft(data), identity = compileCheckpointTopology(data, base, {level});
    assert.deepEqual(identity.data, data); const topologyLocked = [12, 13].includes(level); let edited = base, insertedId = null;
    if (topologyLocked) {
      assert.throws(() => compileCheckpointTopology(data, setFinishCheckpoint(base, base.checkpoints[1].id), {level}), /hardcodes checkpoint stages/);
    } else {
      for (const row of base.checkpoints) {
        try {edited = insertCheckpointAfter(data, base, row.id, {level}); insertedId = edited.checkpoints[edited.checkpoints.findIndex(cp => cp.id === row.id) + 1].id; break;}
        catch (error) {if (!/intersect covered terrain/.test(error.message)) throw error;}
      }
      assert.ok(insertedId, `${quality}/LEV${level} covered insertion`);
      const inserted = compileCheckpointTopology(data, edited, {level}); assert.equal(inserted.info.checkpointCount, base.checkpoints.length + 1);
      const removed = compileCheckpointTopology(data, removeCheckpoint(edited, insertedId), {level}); assert.deepEqual(removed.data, data);
      edited = setFinishCheckpoint(edited, insertedId);
    }
    const serialized = compileCheckpointTopology(data, edited, {level}), parsed = parseCheckpointProgression(serialized.data);
    if (!topologyLocked) for (let order = 0; order < parsed.checkpointCount44; order++) for (const id of parsed.checkpointIds90.subarray(order * 4, order * 4 + 4)) if (id !== 255) {
      assert.equal(parsed.checkpoints70[id * 20 + 1], order); assert.equal(parsed.checkpoints70.readUInt16LE(id * 20 + 2), Math.floor(order * 65536 / parsed.checkpointCount44));
    }
    const startsOffset = data.readUInt32LE(0x74), startsLength = data[0x78] * 8;
    assert.deepEqual(serialized.data.subarray(startsOffset, startsOffset + startsLength), data.subarray(startsOffset, startsOffset + startsLength));
    const markerModes = [];
    for (const enabled of [false, true]) {
      let marked = structuredClone(edited); for (const row of marked.checkpoints) marked = setCheckpointTimingMarker(marked, row.id, enabled);
      const result = compileCheckpointTopology(data, marked, {level}); markerModes.push({enabled, ...cycleChecks(result.data)});
    }
    assert.equal(sha(data), hash);
    const row = {level, quality, sourceSha256: hash, sourceCheckpoints: base.checkpoints.length, sourcePlaneCount: new Set(base.checkpoints.flatMap(row => row.planes.filter(Boolean).map(plane => plane.id))).size,
      noEditIdentity: true, topologyLocked, insertedId, outputCheckpoints: parsed.checkpointCount44, startingSlotsUnchanged: true, startingGridDirection: serialized.startingGridDirection, markerModes};
    rows.push(row); console.log(JSON.stringify({level, quality, passed: true, topologyLocked, outputCheckpoints: row.outputCheckpoints}));
  }
} finally {await archive.close();}
await writeFile(output, JSON.stringify({passed: true, evidenceScope: 'Read-only installed corpus and synthetic crossings through reconstructed 449d40/449760/44a560. No original-process or driven complete-race claim.', progressPolicy: 'Preserve authored values for plane/timing edits; equal logical intervals after topology changes.', rows}, null, 2) + '\n', {flag: 'wx'});
