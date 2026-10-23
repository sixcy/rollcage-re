import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {RollcageArchive} from '../src/archive.mjs';
import {createSession} from '../src/solo-session.mjs';
import {buildViewerBundle} from '../tools/lib/track-viewer-bundle.mjs';
import {interpolateRacingPresentation} from '../tools/track-viewer/solo-presentation.mjs';

const installation = 'C:/Program Files (x86)/Psygnosis/Rollcage';
test('weapons opt-in requires an explicit boolean', () => {
  for (const weaponsEnabled of [1,0,null,'true',{}]) assert.throws(() => createSession(Buffer.alloc(0), Buffer.alloc(0), {weaponsEnabled}), /weaponsEnabled/);
});

test('installed LEV1 authentic pickups, weighted collection and Expert AI launch are shared with the browser and reset', {skip: !existsSync(`${installation}/IDXData/Rollcage.idx`)}, async () => {
  const archive = await RollcageArchive.open(installation);
  try {
    const {data} = await archive.readResource(30), {data: textures} = await archive.readResource(31), original = Buffer.from(data);
    const options = {vehicleTypes: [0,1,2,3,4,5], aiDifficulty: 2, weaponsEnabled: true};
    const session = createSession(data, textures, options);
    const browserCreate = runInNewContext(await buildViewerBundle('src/solo-session.mjs'), {btoa, atob, TextEncoder, TextDecoder}).createSession;
    const browser = browserCreate(data, textures, options), initial = session.snapshot;
    try {
      assert.equal(initial.weapons.mode, 0); assert.equal(initial.weapons.pickupOption, 1);
      assert.equal(initial.weapons.pickupCount, data[0x94]); assert.equal(initial.weapons.pickups.length, data[0x94]);
      assert.equal(initial.weapons.projectiles.length, 24);
      assert.equal(initial.weapons.objects.length, session.assets.weapons.modelIndices.length);
      const authored = data.readUInt32LE(0x90);
      for (const pickup of initial.weapons.pickups) {
        assert.deepEqual(pickup.authoredPosition, [0,2,4].map(offset => data.readInt16LE(authored + pickup.index * 12 + offset)));
        assert.equal(pickup.visible, false, 'Original startup waits for the actual respawn controllers.');
      }
      assert.ok(Object.isFrozen(initial.weapons.objects)); assert.ok(Object.isFrozen(initial.cars[0].inventory));
      let collection = null, launch = null, spawned = null, moved = false, retired = false, impulse = false, impulseConsumed = false, terrainWave = false;
      for (let tick = 1; tick <= 700; tick++) {
        const state = session.step(), web = browser.step();
        assert.equal(JSON.stringify(web), JSON.stringify(state), `Entire enabled state browser parity tick${tick}`);
        if (!spawned && state.weapons.pickups.some(row => row.visible)) spawned = state;
        if (!collection && state.cars.some(car => car.inventory.some(code => code !== 255))) collection = state;
        if (!launch && state.weapons.projectiles.some(row => row.visible)) launch = state;
        if (launch && state.weapons.projectiles[22].state === 2) moved ||= JSON.stringify(state.weapons.projectiles[22].position) !== JSON.stringify(launch.weapons.projectiles[22].position);
        if (state.weapons.projectiles[22].state === 16) {
          retired = true;
          assert.equal(state.weapons.projectiles[22].visible, false, 'An exploded body is hidden while its real trail drains.');
          impulse ||= state.weapons.effects.impulsePending;
        }
        if (tick === 498) impulseConsumed = !state.weapons.effects.impulsePending;
        terrainWave ||= state.weapons.effects.terrainWaveActive;
      }
      assert.equal(spawned.ticks, 51); assert.equal(collection.ticks, 343); assert.equal(collection.cars[0].inventory[1], 2);
      assert.equal(launch.ticks, 400);
      assert.equal(launch.weapons.projectiles[22].projectileKind, 0); assert.equal(launch.weapons.projectiles[22].state, 1);
      assert.deepEqual(launch.cars[2].inventory, [255,1], 'Native AI consumes the collected item0, with no injected inventory or fire command.');
      assert.equal(launch.weapons.projectiles[22].ownerAddress > 0, true);
      assert.equal(moved, true); assert.equal(retired, true); assert.equal(impulse, true); assert.equal(impulseConsumed, true); assert.equal(terrainWave, true);
      assert.equal(session.snapshot.weapons.projectiles[22].state, 0, 'The real trail update eventually releases the projectile pool slot.');
      assert.deepEqual(session.reset(), initial); assert.equal(JSON.stringify(browser.reset()), JSON.stringify(initial));
      assert.deepEqual(data, original, 'Archive bytes stay read-only.');
      const baseline = createSession(data, textures, {...options, weaponsEnabled: false});
      try {assert.equal(baseline.snapshot.weapons.mode, 1); assert.equal(baseline.snapshot.weapons.pickupCount, 0); assert.equal(baseline.snapshot.weapons.enabled, undefined); assert.equal(baseline.assets.weapons, undefined); assert.equal(baseline.snapshot.cars[0].inventory, undefined);} finally {baseline.dispose();}
    } finally {session.dispose(); browser.dispose();}
  } finally {await archive.close();}
});

test('weapon interpolation follows only an existing visible body, never respawn or launch discontinuities', () => {
  const pose = x => ({position: [x,0,0], rotation: [1,0,0,0,1,0,0,0,1]});
  const state = (x, object) => ({...pose(x), parts: [pose(x)], recoveries: 0, weapons: {enabled: true, objects: [object]}});
  const object = {...pose(10), address: 123, state: 2, visible: true};
  const before = state(0, object), after = state(10, {...object, ...pose(30)});
  assert.deepEqual(interpolateRacingPresentation(before, after, 0.5).weapons.objects[0].position, [20,0,0]);
  for (const change of [{state: 1},{visible: false},{address: 124}]) {
    const next = state(10, {...after.weapons.objects[0], ...change});
    assert.equal(interpolateRacingPresentation(before, next, 0.5).weapons.objects[0], next.weapons.objects[0]);
  }
  assert.deepEqual(before.weapons.objects[0].position, [10,0,0]);
});
