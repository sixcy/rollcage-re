import assert from 'node:assert/strict';
import {open, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSession} from '../src/solo-session.mjs';
import {PICKUP_EDITOR_LEVELS, createPickupDraft, compilePickupEdits, parsePickupPlacements, validatePickupSourcePair} from '../src/pickup-editor.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const options = {vehicleTypes: [0, 1, 2, 3, 4, 5], aiDifficulty: 2, weaponsEnabled: true};

export function createSixteenPickupDraft(data) {
  const originals = createPickupDraft(data);
  if (!originals.length) throw Error('Capacity validation needs an authentic same-track pickup template.');
  const draft = Array.from({length: 16}, (_, i) => ({id: `capacity-${i}`, templateIndex: i % originals.length, position: [...originals[i % originals.length].position]}));
  draft[0].position = draft[0].position.map(n => n === 32767 ? n - 1 : n + 1);
  return draft;
}

export function assertPickupCompilePreservation(original, edited, draft) {
  const before = parsePickupPlacements(original), after = parsePickupPlacements(edited);
  assert.equal(after.count, draft.length);
  for (let p = 0; p < original.length; p++) if (p < 0x90 || p > 0x94) assert.equal(edited[p], original[p], `Unrelated original byte ${p.toString(16)}`);
  if (draft.length) assert.equal(after.offset % 4, 0);
  else assert.equal(after.offset, before.offset);
  after.records.forEach((row, i) => {
    assert.deepEqual(row.position, draft[i].position);
    assert.deepEqual(row.raw.subarray(6), before.records[draft[i].templateIndex].raw.subarray(6));
  });
  return after;
}

export function assertPickupDebugCapacity(frame, expectedCount) {
  const arena = frame.bodyArena;
  assert(arena, 'Body arena must be initialized at simulation debug stages.');
  assert.equal(arena.aligned % 128, 0); assert(arena.aligned >= arena.block && arena.aligned - arena.block <= 127);
  assert(arena.requestedBytes > 0 && arena.cursor >= 0);
  assert(arena.cursor + arena.aligned - arena.block <= arena.requestedBytes, 'Body arena cursor exceeds its actual allocation.');
  assert(arena.registeredBodies >= 0 && arena.registeredBodies <= 512, 'Global body registry exceeds512.');
  assert(frame.pickupPendingCount <= 24, 'Pending pickup queue exceeds24 initialized bytes.');
  assert.equal(frame.pickupPendingIndices.length, 24);
  for (const index of frame.pickupPendingIndices.slice(0, frame.pickupPendingCount)) assert(index < expectedCount, 'Pending index is outside compiled pickup table.');
  assert(Number.isInteger(frame.pickupControllerCount) && frame.pickupControllerCount >= 0);
}

function validateSnapshot(state, expected, tick) {
  assert.equal(state.ticks, tick); assert.equal(state.aiDifficulty, 2); assert.equal(state.cars.length, 6);
  assert.equal(state.weapons.pickupCount, expected.count); assert.equal(state.weapons.authoredPickupCount, expected.count);
  assert.equal(state.weapons.pickups.length, expected.count); assert.equal(state.weapons.projectiles.length, 24);
  for (const [i, row] of state.weapons.pickups.entries()) assert.deepEqual(row.authoredPosition, expected.records[i].position);
  for (const car of state.cars) assert(car.position.every(Number.isFinite));
  for (const row of state.weapons.objects) assert(row.position.every(Number.isFinite));
}

export async function validatePickupEditor(output, {installation = 'C:/Program Files (x86)/Psygnosis/Rollcage', ticks = 600, emptyTicks = 120} = {}) {
  if (!Number.isInteger(ticks) || ticks < 600 || ticks > 10000 || !Number.isInteger(emptyTicks) || emptyTicks < 120 || emptyTicks > 10000) throw Error('Expected full ticks600..10000 and empty ticks120..10000.');
  const target = await open(output, 'wx'), journal = await open(`${output}.jsonl`, 'wx');
  let archive;
  const cases = [], sourceFiles = ['src/pickup-editor.mjs', 'src/solo-session.mjs', 'src/pickup-world-state.mjs', 'src/world-physics-pools.mjs', 'src/raw-body-construction.mjs'];
  const sourceHashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, hash(await readFile(file))])));
  const initialSourceHashes = await sourceHashes();
  try {
    archive = await RollcageArchive.open(installation);
    for (const level of PICKUP_EDITOR_LEVELS) {
      const loaded = [];
      for (const quality of ['LOW', 'HIGH']) {
        const track = getGame('rollcage').tracks.find(row => row.name === `${quality}/LEV${level}.BLP`);
        const {data} = await archive.readResource(track.index), {data: textures} = await archive.readResource(track.textureIndex);
        loaded.push({track, data, textures});
      }
      validatePickupSourcePair(loaded[0].data, loaded[1].data);
      for (const {track, data, textures} of loaded) {
        const originalHash = hash(data), textureHash = hash(textures), originalDraft = createPickupDraft(data);
        assert.deepEqual(compilePickupEdits(data, originalDraft), data);
        for (const kind of ['sixteen', 'empty']) {
          const draft = kind === 'sixteen' ? createSixteenPickupDraft(data) : [], edited = compilePickupEdits(data, draft);
          const expected = assertPickupCompilePreservation(data, edited, draft), editedHash = hash(edited), requested = kind === 'sixteen' ? ticks : emptyTicks;
          const row = {track: track.name, kind, originalHash, textureHash, editedHash, originalCount: originalDraft.length, count: draft.length, requestedTicks: requested, completedTicks: 0, passed: false,
            observations: {collections: 0, respawns: 0, initialPendingEnqueues: 0, peakPending: 0, peakRegisteredBodies: 0, peakArenaCursor: 0, debugFrames: 0}};
          let session, lastDebug;
          try {
            session = createSession(edited, textures, {...options, onDebugFrame(frame) {
              lastDebug = {stage: frame.stage, tick: frame.tick}; assertPickupDebugCapacity(frame, expected.count);
              const counts = row.observations; counts.debugFrames++; counts.peakPending = Math.max(counts.peakPending, frame.pickupPendingCount);
              counts.peakRegisteredBodies = Math.max(counts.peakRegisteredBodies, frame.bodyArena.registeredBodies);
              counts.peakArenaCursor = Math.max(counts.peakArenaCursor, frame.bodyArena.cursor);
              row.bodyArena = {...frame.bodyArena}; row.pickupControllerCount = frame.pickupControllerCount;
            }});
            let previous = session.snapshot; validateSnapshot(previous, expected, 0);
            for (let tick = 1; tick <= requested; tick++) {
              const state = session.step(); validateSnapshot(state, expected, tick); row.completedTicks = tick;
              state.weapons.pickups.forEach((pickup, i) => {
                const old = previous.weapons.pickups[i].state & 127, current = pickup.state & 127;
                if (old !== 2 && current === 2) row.observations.collections++;
                if (old === 2 && current === 4 && tick === 1) row.observations.initialPendingEnqueues++;
                if ((old === 2 || old === 4) && (current === 1 || current === 3)) row.observations.respawns++;
              });
              previous = state;
            }
            if (kind === 'sixteen') assert.equal(row.observations.initialPendingEnqueues, 16, 'All16 original constructor countdowns must naturally enter pending state.');
            row.finalPickupStates = previous.weapons.pickups.map(pickup => pickup.state);
            row.passed = true;
          } catch (error) {row.error = error.stack; row.lastDebug = lastDebug;}
          finally {
            session?.dispose(); row.originalUnchanged = hash(data) === originalHash; row.editedUnchanged = hash(edited) === editedHash; row.texturesUnchanged = hash(textures) === textureHash;
            if (!row.originalUnchanged || !row.editedUnchanged || !row.texturesUnchanged) {row.passed = false; row.error ??= 'Read-only resource mutation.';}
          }
          cases.push(row); await journal.write(`${JSON.stringify(row)}\n`);
          console.log(JSON.stringify({track: row.track, kind, passed: row.passed, ticks: row.completedTicks, observations: row.observations, ...(row.error ? {error: row.error.split('\n')[0], lastDebug: row.lastDebug} : {})}));
        }
      }
    }
    const finalSourceHashes = await sourceHashes(), sourceFilesStable = JSON.stringify(initialSourceHashes) === JSON.stringify(finalSourceHashes);
    const report = {method: 'Installed34supportedLOW/HIGH source variants: compile16same-track template-derived pickups with one edited XYZ, unchanged baseline identity, and delete-all case; actual reconstructed six-car Expert weapons-enabled constructors and full updates. No native process or capture.',
      limits: ['The16 cap is an editor policy, not a proven native format maximum. Native initialized pending storage is24bytes; enqueue has no explicit bound.', 'Collection/respawn counts are natural snapshot state transitions in modified source fixtures; events entirely within one update may be missed.', 'Cloned overlapping same-track pickup locations are deliberate capacity fixtures, not authored level design or original-process validation.', 'Global512 body registration and the independent authored respawn-controller count are distinct from pending queue capacity.'],
      options, ticks, emptyTicks, variants: 34, initialSourceHashes, finalSourceHashes, sourceFilesStable, matched: sourceFilesStable && cases.length === 68 && cases.every(row => row.passed),
      totals: {passed: cases.filter(row => row.passed).length, failed: cases.filter(row => !row.passed).length, completedTicks: cases.reduce((n, row) => n + row.completedTicks, 0), collections: cases.reduce((n, row) => n + row.observations.collections, 0), respawns: cases.reduce((n, row) => n + row.observations.respawns, 0)}, cases};
    await target.writeFile(`${JSON.stringify(report, null, 2)}\n`); return report;
  } finally {await archive?.close(); await target.close(); await journal.close();}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [output, installation] = process.argv.slice(2);
  if (!output || process.argv.length > 4) throw Error('Usage: node tools/validate-pickup-editor.mjs NEW_REPORT_JSON [INSTALLATION]');
  const report = await validatePickupEditor(output, installation ? {installation} : {});
  console.log(JSON.stringify({output, matched: report.matched, totals: report.totals}));
  if (!report.matched) process.exitCode = 1;
}
