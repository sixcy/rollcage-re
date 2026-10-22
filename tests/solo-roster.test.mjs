import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {RollcageArchive} from '../src/archive.mjs';
import {createSession} from '../src/solo-session.mjs';
import profileTables from '../src/vehicle-contact-profile-tables.json' with {type: 'json'};
import {buildViewerBundle} from '../tools/lib/track-viewer-bundle.mjs';

const installation = 'C:/Program Files (x86)/Psygnosis/Rollcage';
const installed = {skip: !existsSync(`${installation}/IDXData/Rollcage.idx`)};
const plain = value => JSON.parse(JSON.stringify(value));
const vehicleTypes = [0, 1, 2, 3, 4, 5];
const legacyFields = ['position', 'rotation', 'parts', 'quaternion', 'speed', 'route', 'point', 'checkpoint',
  'checkpointCount', 'checkpointTransitions', 'laps', 'lapTime', 'bestLap', 'recoveries', 'physics'];

async function withTrack(run, resource = 30) {
  const archive = await RollcageArchive.open(installation);
  try {
    const {data} = await archive.readResource(resource), {data: textures} = await archive.readResource(resource + 1);
    await run(data, textures);
  } finally {await archive.close();}
}

function assertCar(car, index, vehicleType) {
  assert.equal(car.index, index); assert.equal(car.vehicleType, vehicleType);
  assert.ok(Object.isFrozen(car)); assert.ok(Object.isFrozen(car.parts));
  assert.equal(car.parts.length, 5);
  assert.equal(car.position.length, 3); assert.equal(car.rotation.length, 9); assert.equal(car.quaternion.length, 4);
  for (const values of [car.position, car.rotation, car.quaternion, ...car.parts.flatMap(part => [part.position, part.rotation])]) {
    assert.ok(Object.isFrozen(values)); assert.ok(values.every(Number.isFinite));
  }
  assert.ok(Number.isFinite(car.speed));
  for (const name of ['route', 'point', 'checkpoint', 'checkpointCount', 'checkpointTransitions', 'laps', 'recoveries']) {
    assert.ok(Number.isInteger(car[name]) && car[name] >= 0, `${index}/${name}`);
  }
  assert.ok(car.checkpoint < car.checkpointCount);
  assert.ok(Number.isFinite(car.lapTime) && car.lapTime >= 0);
  assert.ok(car.bestLap === null || Number.isFinite(car.bestLap) && car.bestLap >= 0);
  assert.ok(Object.isFrozen(car.physics)); assert.ok(Object.isFrozen(car.physics.wheelContacts));
  assert.equal(car.physics.wheelContacts.length, 4);
  assert.ok(car.physics.wheelContacts.every(value => typeof value === 'boolean'));
}

function assertLegacy(snapshot) {
  for (const name of legacyFields) assert.deepEqual(snapshot[name], snapshot.cars[0][name], `First-car compatibility: ${name}`);
}

// Independent expected packed policy from retained2340 table bytes and the
// actual41ebb0 difficulty-two lane stores, rather than a tuned speed bonus.
function expertProfile(vehicleType) {
  const bytes = Buffer.from(profileTables.bytesHex, 'hex');
  let first = bytes.readUInt32LE(vehicleType * 8) & 0x3fffffff;
  let second = bytes.readUInt32LE(vehicleType * 8 + 4) & 0xffffff;
  const primary = first >>> 3 & 7, recovery = second >>> 9 & 7;
  first = (first & ~(7 << 3) | (primary <= 3 ? 6 : 7) << 3) >>> 0;
  if (recovery < 7) second = (second & ~(7 << 9) | (recovery + (recovery < 3 ? 2 : 1)) << 9) >>> 0;
  return [first, second];
}

test('roster and difficulty options admit only native participant and selector domains', () => {
  for (const types of [[], Array(7).fill(0), Array(1), [0, , 2], [-1], [7], [0.5], [NaN], [Infinity], ['1'], [null], null, '012345']) {
    assert.throws(() => createSession(Buffer.alloc(0), Buffer.alloc(0), {vehicleTypes: types}), /vehicleTypes/);
  }
  for (const aiDifficulty of [-1, 3, 0.5, NaN, Infinity, '2', null]) {
    assert.throws(() => createSession(Buffer.alloc(0), Buffer.alloc(0), {aiDifficulty}), /aiDifficulty/);
  }
  assert.throws(() => createSession(Buffer.alloc(0), Buffer.alloc(0), {onCollisionDispatch: 1}), /onCollisionDispatch/);
});

test('six installed Expert cars retain native identities, profiles, progression, collisions and browser parity', installed, async () => {
  await withTrack(async (data, textures) => {
    const sourceBefore = Buffer.from(data), textureBefore = Buffer.from(textures), frames = [], events = [];
    const options = {vehicleTypes: vehicleTypes.slice(), aiDifficulty: 2};
    const session = createSession(data, textures, {...options,
      onDebugFrame: frame => frames.push(frame), onCollisionDispatch: event => events.push(event)});
    const browserCreate = runInNewContext(await buildViewerBundle('src/solo-session.mjs'), {btoa, atob, TextEncoder, TextDecoder}).createSession;
    const browser = browserCreate(data, textures, options);
    options.vehicleTypes[0] = 6; options.aiDifficulty = 0;
    try {
      const initial = session.snapshot, assets = session.assets, lookup = data.readUInt32LE(0x84);
      assert.equal(initial.aiDifficulty, 2); assert.equal(initial.cars.length, 6);
      assert.ok(Object.isFrozen(initial.cars)); assert.ok(Object.isFrozen(assets.cars));
      assert.equal(assets.cars.length, 6);
      for (const [index, type] of vehicleTypes.entries()) {
        assertCar(initial.cars[index], index, type);
        assert.equal(assets.cars[index].index, index); assert.equal(assets.cars[index].vehicleType, type);
        assert.equal(assets.cars[index].modelIndices.length, 5);
        assert.equal(assets.cars[index].modelIndices[0], data.readInt16LE(lookup + (20 + type * 2) * 2));
      }
      assertLegacy(initial);
      assert.deepEqual(plain(browser.snapshot), plain(initial));
      for (let tick = 1; tick <= 180; tick++) {
        session.step(); browser.step();
        const snapshot = session.snapshot;
        assert.equal(snapshot.ticks, tick); assertLegacy(snapshot);
        snapshot.cars.forEach((car, index) => assertCar(car, index, vehicleTypes[index]));
        assert.deepEqual(plain(browser.snapshot), plain(snapshot), `Node/ByteBuffer roster tick ${tick}`);
      }
      const firstControls = frames.find(frame => frame.stage === 'after-controls');
      assert.equal(firstControls.aiDifficulty5ea4d8, 2, '410060 produced the actual shared Expert selector.');
      assert.equal(firstControls.cars.length, 6);
      const addresses = firstControls.cars.map(car => car.bodyAddress);
      assert.equal(new Set(addresses).size, 6, 'Each native constructor owns a distinct body.');
      for (const [index, car] of firstControls.cars.entries()) {
        assert.equal(car.index, index); assert.equal(car.recordAddress, 0x909300 + index * 0x30c);
        assert.ok(Object.isFrozen(car)); assert.ok(Object.isFrozen(car.positionQ16));
        assert.deepEqual(car.profileWords6f4, expertProfile(vehicleTypes[index]), `Native Expert policy for car ${index}`);
      }
      const progressed = session.snapshot;
      for (const [index, car] of progressed.cars.entries()) {
        assert.notDeepEqual(car.position, initial.cars[index].position, `AI ${index} translates.`);
        assert.ok(car.point !== initial.cars[index].point || car.route !== initial.cars[index].route || car.checkpointTransitions > 0,
          `AI ${index} owns independently updated authored-route progression.`);
      }
      assert.equal(new Set(progressed.cars.map(car => JSON.stringify(car.position))).size, 6);
      // Observe genuine generated contacts: no position, event or query answer
      // is injected. Keep the bounded search separate from the parity window.
      const isCarPair = event => event.stage === 'before' && event.kind === 0 && event.object1?.type === 3 && event.object2?.type === 3;
      while (!events.some(isCarPair) && session.snapshot.ticks < 1800) session.step();
      const pair = events.find(isCarPair);
      assert.ok(pair, 'The six native AI cars generate a real chassis/chassis dispatch within 1800 ticks.');
      assert.ok(addresses.includes(pair.object1.address)); assert.ok(addresses.includes(pair.object2.address));
      assert.notEqual(pair.object1.address, pair.object2.address);
      assert.ok(Object.isFrozen(pair)); assert.ok(Object.isFrozen(pair.object1));
      assert.equal(pair.eventBytesHex.length, 208);
      assert.equal(session.assets, assets, 'Stepping retains the decoded roster assets.');
      assert.deepEqual(session.reset(), initial);
      browser.reset();
      for (let tick = 0; tick < 12; tick++) {session.step(); browser.step();}
      assert.deepEqual(plain(browser.snapshot), plain(session.snapshot));
      assert.equal(session.snapshot.aiDifficulty, 2);
      assert.deepEqual(session.snapshot.cars.map(car => car.vehicleType), vehicleTypes);
      const recoveryCounts = session.snapshot.cars.map(car => car.recoveries);
      for (const candidate of [session, browser]) {
        assert.throws(() => candidate.requestRecovery(-1), /index/);
        assert.throws(() => candidate.requestRecovery(6), /index/);
        candidate.requestRecovery(5); candidate.requestRecovery(5);
        assert.deepEqual(plain(candidate.snapshot.cars.map(car => car.physics.recoveryPending)), [false, false, false, false, false, true]);
        candidate.step();
      }
      assert.deepEqual(session.snapshot.cars.map(car => car.recoveries), recoveryCounts.map((count, index) => count + (index === 5 ? 1 : 0)));
      assert.deepEqual(plain(browser.snapshot), plain(session.snapshot));
      assert.deepEqual(data, sourceBefore); assert.deepEqual(textures, textureBefore);
    } finally {session.dispose(); browser.dispose();}
    assert.throws(() => session.snapshot, /disposed/);
    assert.throws(() => session.reset(), /disposed/);
  });
});

test('legacy single-car defaults equal explicit Hard roster and retain selected type through reset', installed, async () => {
  await withTrack(async (data, textures) => {
    const legacy = createSession(data, textures), explicit = createSession(data, textures, {vehicleTypes: [0], aiDifficulty: 1});
    const selected = createSession(data, textures, {vehicleType: 6});
    try {
      assert.deepEqual(legacy.snapshot, explicit.snapshot);
      assert.equal(legacy.snapshot.cars.length, 1); assert.equal(legacy.snapshot.aiDifficulty, 1);
      assert.equal(selected.snapshot.cars.length, 1); assert.equal(selected.snapshot.cars[0].vehicleType, 6);
      const initial = selected.snapshot;
      for (let tick = 0; tick < 30; tick++) {legacy.step(); explicit.step(); selected.step();}
      assert.deepEqual(legacy.snapshot, explicit.snapshot); assertLegacy(legacy.snapshot);
      assert.deepEqual(selected.reset(), initial);
    } finally {legacy.dispose(); explicit.dispose(); selected.dispose();}
  });
});

test('installed LEV2 diagnostics preserve the initial sector sentinel and the unobserved six-car trajectory', installed, async () => {
  await withTrack(async (data, textures) => {
    const frames = [], options = {vehicleTypes, aiDifficulty: 2};
    const observed = createSession(data, textures, {...options, onDebugFrame: frame => frames.push(frame)});
    const baseline = createSession(data, textures, options);
    try {
      for (let tick = 0; tick < 180; tick++) {
        observed.step(); baseline.step();
        assert.deepEqual(observed.snapshot, baseline.snapshot, `LEV2 observer parity tick${tick + 1}`);
      }
      assert.equal(frames.length, 540);
      const firstControls = frames[0], firstPhysics = frames[1];
      assert.equal(firstControls.stage, 'after-controls');
      assert.equal(firstControls.closestTerrain11c & 255, 255);
      assert.equal(firstControls.selectedSectorHeight, null, 'An unselected native sector has no invented height.');
      assert.equal(firstPhysics.stage, 'after-physics');
      assert.notEqual(firstPhysics.closestTerrain11c & 255, 255);
      assert.ok(Number.isInteger(firstPhysics.selectedSectorHeight), 'The actual physics stage selected an authored sector.');
      assert.ok(Object.isFrozen(firstControls)); assert.ok(Object.isFrozen(firstControls.cars));
      assert.equal(observed.snapshot.cars.length, 6);
    } finally {observed.dispose(); baseline.dispose();}
  }, 32);
});
