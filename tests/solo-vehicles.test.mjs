import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {RollcageArchive} from '../src/archive.mjs';
import {createSession} from '../src/solo-session.mjs';

test('session vehicle selection rejects values outside the seven native type bytes', () => {
  for (const vehicleType of [-1, 7, 0.5, NaN, Infinity, '1', null]) {
    assert.throws(() => createSession(Buffer.alloc(0), Buffer.alloc(0), {vehicleType}), /vehicleType/);
  }
});

const installation = 'C:/Program Files (x86)/Psygnosis/Rollcage';
test('all seven installed native selectors choose their authored body and survive reset', {skip: !existsSync(`${installation}/IDXData/Rollcage.idx`)}, async () => {
  const archive = await RollcageArchive.open(installation);
  try {
    const {data} = await archive.readResource(30), {data: textures} = await archive.readResource(31);
    const lookup = data.readUInt32LE(0x84);
    let defaultInitial;
    for (let vehicleType = 0; vehicleType < 7; vehicleType++) {
      const session = createSession(data, textures, {vehicleType});
      try {
        assert.equal(session.assets.modelIndices[0], data.readInt16LE(lookup + (20 + vehicleType * 2) * 2));
        const initial = session.snapshot;
        if (vehicleType === 0) defaultInitial = initial;
        for (let i = 0; i < 12; i++) session.step();
        const after = session.snapshot;
        assert.deepEqual(session.reset(), initial);
        for (let i = 0; i < 12; i++) session.step();
        assert.deepEqual(session.snapshot, after);
        assert.equal(session.assets.modelIndices[0], data.readInt16LE(lookup + (20 + vehicleType * 2) * 2));
      } finally {session.dispose();}
    }
    const defaultSession = createSession(data, textures);
    try {assert.deepEqual(defaultSession.snapshot, defaultInitial);}
    finally {defaultSession.dispose();}
  } finally {await archive.close();}
});
