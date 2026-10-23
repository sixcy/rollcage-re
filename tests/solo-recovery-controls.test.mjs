import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {RollcageArchive} from '../src/archive.mjs';
import {createSession} from '../src/solo-session.mjs';
import {buildViewerBundle} from '../tools/lib/track-viewer-bundle.mjs';

const installation = 'C:/Program Files (x86)/Psygnosis/Rollcage';
const installed = {skip: !existsSync(`${installation}/IDXData/Rollcage.idx`)};
const plain = value => JSON.parse(JSON.stringify(value));

async function withTrack(run) {
  const archive = await RollcageArchive.open(installation);
  try {
    const {data} = await archive.readResource(30), {data: textures} = await archive.readResource(31);
    await run(data, textures);
  } finally {await archive.close();}
}

function assertFinitePose(snapshot) {
  assert.equal(snapshot.position.length, 3);
  assert.equal(snapshot.rotation.length, 9);
  assert.equal(snapshot.quaternion.length, 4);
  assert.equal(snapshot.parts.length, 5);
  for (const values of [snapshot.position, snapshot.rotation, snapshot.quaternion,
    ...snapshot.parts.flatMap(part => [part.position, part.rotation])]) {
    assert.ok(values.every(Number.isFinite), 'Car and four wheel poses remain finite.');
  }
  assert.ok(Number.isFinite(snapshot.speed));
}

function assertDiagnostics(snapshot) {
  const physics = snapshot.physics;
  assert.ok(Object.isFrozen(physics));
  assert.ok(Object.isFrozen(physics.wheelContacts));
  assert.equal(physics.wheelContacts.length, 4);
  assert.ok(physics.wheelContacts.every(value => typeof value === 'boolean'));
  assert.equal(typeof physics.recoveryPending, 'boolean');
  for (const name of ['collisionEvents', 'terrainHits', 'modelHits']) {
    assert.ok(Number.isInteger(physics[name]) && physics[name] >= 0, name);
  }
  assert.throws(() => {physics.recoveryPending = !physics.recoveryPending;}, TypeError);
  assert.throws(() => {physics.wheelContacts[0] = !physics.wheelContacts[0];}, TypeError);
}

test('installed recovery requests use the next real postframe, coalesce and match browser ByteBuffer execution', installed, async () => {
  await withTrack(async (data, textures) => {
    const frames = [], browserFrames = [];
    const session = createSession(data, textures, {onDebugFrame: frame => frames.push(frame)});
    const browserExports = runInNewContext(await buildViewerBundle('src/solo-session.mjs'), {btoa, atob, TextEncoder, TextDecoder});
    const browser = browserExports.createSession(data, textures, {onDebugFrame: frame => browserFrames.push(frame)});
    try {
      const initial = session.snapshot;
      assertDiagnostics(initial); assertDiagnostics(browser.snapshot);
      assert.deepEqual(initial.physics, {collisionEvents: 0, terrainHits: 0, modelHits: 0,
        recoveryPending: false, driveQ16: 0x60000, baseDriveQ16: 0x60000, wheelContacts: [false, false, false, false]});
      for (let tick = 0; tick < 50; tick++) {session.step(); browser.step();}
      const before = session.snapshot;
      assert.equal(before.recoveries, 0);
      for (const candidate of [session, browser]) {
        assert.equal(candidate.requestRecovery(), undefined);
        assert.equal(candidate.requestRecovery(), undefined);
        assert.equal(candidate.snapshot.ticks, 50);
        assert.equal(candidate.snapshot.recoveries, 0);
        assert.equal(candidate.snapshot.physics.recoveryPending, true);
      }
      assert.deepEqual(session.snapshot.position, before.position, 'Queuing does not move the car.');
      assert.deepEqual(session.snapshot.stats, before.stats, 'Queuing does not run physics.');
      assert.deepEqual(plain(browser.snapshot), plain(session.snapshot));
      session.step(); browser.step();
      const recovered = session.snapshot;
      assert.equal(recovered.ticks, 51);
      assert.equal(recovered.recoveries, 1, 'The actual raw recovery query/application succeeded.');
      assert.equal(recovered.physics.recoveryPending, false);
      const postframe = frames.at(-1);
      assert.equal(postframe.stage, 'after-postframe');
      assert.equal(postframe.respawnedBodies, 1);
      assert.deepEqual(postframe.linearVelocityQ16, [0, 0, 0]);
      assert.notDeepEqual(recovered.position, before.position);
      assertFinitePose(recovered); assertDiagnostics(recovered);
      assert.deepEqual(plain(browser.snapshot), plain(recovered));
      for (let tick = 0; tick < 10; tick++) {
        session.step(); browser.step();
        assert.equal(session.snapshot.recoveries, 1, 'Repeated requests produced only one recovery.');
        assertFinitePose(session.snapshot);
        assert.deepEqual(plain(browser.snapshot), plain(session.snapshot));
      }
      assert.deepEqual(plain(browserFrames), plain(frames));
      for (const candidate of [session, browser]) {
        candidate.requestRecovery();
        assert.equal(candidate.snapshot.physics.recoveryPending, true);
        assert.deepEqual(plain(candidate.reset()), plain(initial), 'Reset clears queued recovery and all diagnostics.');
        candidate.step();
        assert.equal(candidate.snapshot.recoveries, 0, 'Reset discarded the queued request.');
        candidate.dispose(); candidate.dispose();
        assert.throws(() => candidate.requestRecovery(), /disposed/);
        assert.throws(() => candidate.step(), /disposed/);
        assert.throws(() => candidate.reset(), /disposed/);
        assert.throws(() => candidate.snapshot, /disposed/);
      }
    } finally {session.dispose(); browser.dispose();}
  });
});

test('installed physics diagnostics reflect real per-frame reports and wheel flags without changing the trajectory', installed, async () => {
  await withTrack(async (data, textures) => {
    const frames = [];
    const observed = createSession(data, textures, {onDebugFrame: frame => frames.push(frame)});
    const baseline = createSession(data, textures);
    try {
      const totals = {events: 0, terrainHits: 0, modelHits: 0};
      for (let tick = 1; tick <= 150; tick++) {
        observed.step(); baseline.step();
        const snapshot = observed.snapshot, physics = snapshot.physics;
        assertDiagnostics(snapshot); assertFinitePose(snapshot);
        const afterPhysics = frames.at(-2), afterPostframe = frames.at(-1);
        assert.equal(afterPhysics.stage, 'after-physics');
        assert.equal(afterPostframe.stage, 'after-postframe');
        assert.equal(afterPhysics.tick, tick);
        assert.equal(physics.collisionEvents, afterPhysics.processedEvents);
        assert.equal(physics.terrainHits, afterPhysics.terrainHits);
        assert.equal(physics.modelHits, afterPhysics.modelHits);
        assert.deepEqual(physics.wheelContacts, afterPostframe.wheelFlags.map(flags => Boolean(flags & 1)));
        assert.equal(physics.recoveryPending, false);
        totals.events += physics.collisionEvents;
        totals.terrainHits += physics.terrainHits;
        totals.modelHits += physics.modelHits;
        assert.deepEqual(observed.snapshot, snapshot, 'Reading diagnostics has no side effects.');
      }
      const final = observed.snapshot;
      assert.equal(final.recoveries, 0);
      assert.ok(final.stats.wheelContacts > 0, 'The real suspension contacted terrain.');
      assert.equal(final.stats.events, totals.events);
      assert.equal(final.stats.terrainHits, totals.terrainHits);
      assert.equal(final.stats.modelHits, totals.modelHits);
      assert.deepEqual(final, baseline.snapshot, 'Debug observation and repeated diagnostic reads preserve native source execution.');
    } finally {observed.dispose(); baseline.dispose();}
  });
});
