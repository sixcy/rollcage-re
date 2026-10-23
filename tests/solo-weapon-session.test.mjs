import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {RollcageArchive} from '../src/archive.mjs';
import {createSession} from '../src/solo-session.mjs';
import {buildViewerBundle} from '../tools/lib/track-viewer-bundle.mjs';

const installation = 'C:/Program Files (x86)/Psygnosis/Rollcage';
test('installed six-Expert sessions run native drive decay/caps, keep authored pickup gating and match browser state', {skip: !existsSync(`${installation}/IDXData/Rollcage.idx`)}, async () => {
  const archive = await RollcageArchive.open(installation);
  try {
    const {data} = await archive.readResource(30), {data: textures} = await archive.readResource(31), original = Buffer.from(data);
    const options = {vehicleTypes: [0,1,2,3,4,5], aiDifficulty: 2}, session = createSession(data, textures, options);
    const browserCreate = runInNewContext(await buildViewerBundle('src/solo-session.mjs'), {btoa, atob, TextEncoder, TextDecoder}).createSession;
    const browser = browserCreate(data, textures, options), initial = session.snapshot;
    assert.equal(initial.weapons.mode, 1);
    assert.equal(initial.weapons.pickupOption, 0);
    assert.equal(initial.weapons.authoredPickupCount, data[0x94]);
    assert.ok(initial.weapons.authoredPickupCount > 0);
    assert.equal(initial.weapons.pickupCount, 0, 'Native mode/option gating remains authoritative.');
    assert.ok(initial.weapons.poolBodyCount >= 24);
    assert.equal(initial.weapons.contactVertexCount, 42);
    const maxima = Array(6).fill(0), minimum = 0x60000;
    for (let tick = 1; tick <= 950; tick++) {
      const state = session.step();
      if (tick <= 150) assert.equal(JSON.stringify(browser.step()), JSON.stringify(state), `Complete native-stage browser parity${tick}`);
      for (const car of state.cars) {
        assert.ok(car.physics.driveQ16 <= 0xd0000, `Actual native normal cap, car${car.index}/tick${tick}`);
        assert.ok(car.physics.baseDriveQ16 <= 0xd0000);
        maxima[car.index] = Math.max(maxima[car.index], car.physics.driveQ16);
        if (tick <= 2) assert.equal(car.physics.driveQ16, tick === 1 ? minimum - 1024 : minimum, 'Native equality subtracts below the base before the next update restores it.');
      }
    }
    assert.ok(maxima.some(value => value > minimum), 'Real installed wheel surfaces exercise the drive-accumulation path.');
    assert.deepEqual(session.reset(), initial);
    assert.deepEqual(data, original);
    session.dispose(); browser.dispose();
  } finally {await archive.close();}
});
