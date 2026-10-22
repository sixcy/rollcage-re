import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSession} from '../src/solo-session.mjs';
import {buildViewerBundle} from './lib/track-viewer-bundle.mjs';

const [output, installation = 'C:/Program Files (x86)/Psygnosis/Rollcage', ticksText = '300', longText = '3000', parityText = '150', scope = 'all'] = process.argv.slice(2);
if (!output) throw Error('Usage: node tools/check-solo-roster.mjs NEW_REPORT_JSON [INSTALLATION] [MATRIX_TICKS=300] [LEV1_TICKS=3000] [BROWSER_TICKS=150] [all|level1]');
if (existsSync(output)) throw Error('Roster report already exists; choose a new output filename.');
const ticks = Number(ticksText), longTicks = Number(longText), parityTicks = Number(parityText);
for (const [name, count] of [['matrix', ticks], ['long', longTicks], ['browser', parityTicks]]) {
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw Error(`Expected ${name} ticks in1..10000.`);
}
if (longTicks < ticks || parityTicks > longTicks || !['all', 'level1'].includes(scope)) throw Error('Long run must include matrix/browser windows; scope must be all or level1.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const vehicleTypes = [0, 1, 2, 3, 4, 5], options = {vehicleTypes, aiDifficulty: 2};
const tracks = getGame('rollcage').tracks.filter(track => !/\/LEV(?:16|17)\.BLP$/.test(track.name) && (scope === 'all' || track.name === 'LOW/LEV1.BLP'));
assert.equal(tracks.length, scope === 'all' ? 36 : 1);
const bundle = await buildViewerBundle('src/solo-session.mjs');
const browserCreate = runInNewContext(bundle, {btoa, atob, TextEncoder, TextDecoder}).createSession;
const archive = await RollcageArchive.open(installation), cases = [];

function validate(state, tick) {
  assert.equal(state.ticks, tick); assert.equal(state.aiDifficulty, 2); assert.equal(state.cars.length, 6);
  for (const [index, car] of state.cars.entries()) {
    assert.equal(car.index, index); assert.equal(car.vehicleType, vehicleTypes[index]);
    assert.equal(car.parts.length, 5);
    for (const vector of [car.position, car.rotation, car.quaternion, ...car.parts.flatMap(part => [part.position, part.rotation])]) {
      assert.ok(vector.every(Number.isFinite), `Finite pose tick${tick}/car${index}`);
    }
    assert.ok(Number.isFinite(car.speed)); assert.ok(car.checkpoint >= 0 && car.checkpoint < car.checkpointCount);
    assert.equal(car.physics.wheelContacts.length, 4);
    assert.ok(car.physics.wheelContacts.every(flag => typeof flag === 'boolean'));
  }
  assert.deepEqual(state.position, state.cars[0].position);
}

try {
  for (const track of tracks) {
    const {data} = await archive.readResource(track.index), {data: textures} = await archive.readResource(track.textureIndex);
    const sourceHash = hash(data), textureHash = hash(textures), level1 = track.name === 'LOW/LEV1.BLP';
    let session, browser, firstDebug, pairContacts = 0, staticContacts = 0, firstPairTick = null, currentTick = 0;
    const encounteredPairs = new Set(), trajectory = createHash('sha256');
    try {
      session = createSession(data, textures, {...options,
        onDebugFrame(frame) {if (!firstDebug && frame.stage === 'after-controls') firstDebug = frame;},
        onCollisionDispatch(event) {
          if (event.stage !== 'before') return;
          if (event.kind === 1) staticContacts++;
          if (event.kind === 0 && event.object1?.type === 3 && event.object2?.type === 3) {
            pairContacts++; firstPairTick ??= currentTick;
            encounteredPairs.add([event.object1.address, event.object2.address].sort((a, b) => a - b).join(':'));
          }
        }});
      const initial = session.snapshot, modelLookup = data.readUInt32LE(0x84);
      for (const [index, type] of vehicleTypes.entries()) {
        assert.equal(session.assets.cars[index].modelIndices[0], data.readInt16LE(modelLookup + (20 + type * 2) * 2));
      }
      if (level1) browser = browserCreate(data, textures, options);
      let matrixFinal, replay12, matrixContactCounts;
      const targetTicks = level1 ? longTicks : ticks;
      for (let tick = 1; tick <= targetTicks; tick++) {
        currentTick = tick;
        const state = session.step(); validate(state, tick);
        trajectory.update(JSON.stringify(state));
        if (browser && tick <= parityTicks) assert.equal(JSON.stringify(browser.step()), JSON.stringify(state), `Browser roster parity ${tick}`);
        if (tick === 12) replay12 = state;
        if (tick === ticks) {matrixFinal = state; matrixContactCounts = {pairContacts, staticContacts};}
      }
      assert.equal(firstDebug.aiDifficulty5ea4d8, 2);
      assert.equal(new Set(firstDebug.cars.map(car => car.bodyAddress)).size, 6);
      firstDebug.cars.forEach((car, index) => assert.equal(car.recordAddress, 0x909300 + index * 0x30c));
      for (const [index, car] of matrixFinal.cars.entries()) assert.notDeepEqual(car.position, initial.cars[index].position, `${track.name}/car${index} translates.`);
      const final = session.snapshot;
      const longRun = level1 ? {ticks: targetTicks, firstPairTick, pairContacts, staticContacts, uniqueCarPairs: encounteredPairs.size,
        trajectoryHash: trajectory.digest('hex'), final} : null;
      // Retain a failed long-run result rather than silently replacing this
      // requirement with finite poses or successful browser agreement.
      if (level1) {
        assert.ok(pairContacts > 0, 'The long run must include naturally generated car/car responses.');
        assert.ok(final.cars.every(car => car.laps > 0), 'Every AI car must finish a lap during the bounded LEV1 long run.');
      }
      assert.deepEqual(session.reset(), initial);
      if (browser) assert.equal(JSON.stringify(browser.reset()), JSON.stringify(initial));
      if (replay12) {
        for (let tick = 0; tick < 12; tick++) session.step();
        assert.deepEqual(session.snapshot, replay12, 'Reset reconstructs all six AI and their shared random stream.');
      }
      assert.equal(hash(data), sourceHash); assert.equal(hash(textures), textureHash);
      cases.push({track: track.name, passed: true, ticks, sourceHash, textureHash,
        browserParityTicks: level1 ? parityTicks : 0, ...matrixContactCounts, final: matrixFinal, longRun});
    } catch (error) {
      cases.push({track: track.name, passed: false, sourceHash, textureHash, ticksReached: currentTick,
        pairContacts, staticContacts, firstPairTick, error: error.stack, final: session?.snapshot ?? null});
    } finally {session?.dispose(); browser?.dispose();}
    console.log(JSON.stringify({track: track.name, passed: cases.at(-1).passed, completed: cases.length, failures: cases.filter(row => !row.passed).length}));
  }
  const report = {method: 'Installed-data reconstructed six-car Expert race: actual41dbb0 constructors,410060/41ebb0 difficulty2 policies, recovered full-roster AI/input/progression/physics and world lifecycles; natural collision dispatches observed without injected poses, events or query answers. LOW/LEV1 compares the fresh ByteBuffer browser bundle for the declared initial window and continues its real AI state through the long window. Reset and original resource hashes checked.',
    limits: 'Source/installed-data integration only; no original process, native Expert trajectory or complete weapons/timing/destruction/terrain scenario equivalence. No zero-recovery assertion is removed or weakened by this separate multi-car report.',
    matched: cases.every(row => row.passed), vehicleTypes, aiDifficulty: 2, scope, tracks: tracks.length, ticks, longTicks, parityTicks,
    bundleHash: hash(bundle), excluded: ['LOW/LEV16.BLP', 'HIGH/LEV16.BLP', 'LOW/LEV17.BLP', 'HIGH/LEV17.BLP'], cases};
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  console.log(JSON.stringify({matched: report.matched, passed: cases.filter(row => row.passed).length, tracks: cases.length, output}));
  if (!report.matched) process.exitCode = 1;
} finally {await archive.close();}
