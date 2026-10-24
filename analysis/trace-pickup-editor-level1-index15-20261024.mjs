import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSession} from '../src/solo-session.mjs';
import {createSixteenPickupDraft} from '../tools/validate-pickup-editor.mjs';
import {compilePickupEdits, parsePickupPlacements} from '../src/pickup-editor.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const archive = await RollcageArchive.open('C:/Program Files (x86)/Psygnosis/Rollcage'), cases = [];
try {
  for (const quality of ['LOW', 'HIGH']) {
    const track = getGame('rollcage').tracks.find(row => row.name === `${quality}/LEV1.BLP`);
    const {data} = await archive.readResource(track.index), {data: textures} = await archive.readResource(track.textureIndex);
    const draft = createSixteenPickupDraft(data), edited = compilePickupEdits(data, draft), source = parsePickupPlacements(data);
    const row = {track: track.name, sourceHash: hash(data), editedHash: hash(edited), draft, originalTemplates: source.records.map(record => ({index: record.index, position: record.position, unknownBytesHex: record.raw.subarray(6).toString('hex')})), events: []};
    const session = createSession(edited, textures, {vehicleTypes: [0, 1, 2, 3, 4, 5], aiDifficulty: 2, weaponsEnabled: true});
    try {
      let previous = session.snapshot;
      for (let tick = 1; tick <= 600; tick++) {
        const current = session.step();
        current.weapons.pickups.forEach((pickup, index) => {
          const from = previous.weapons.pickups[index].state & 127, to = pickup.state & 127;
          if (from !== to) row.events.push({tick, index, from, to, position: pickup.position});
        });
        previous = current;
      }
      const target = row.events.filter(event => event.index === 15);
      row.targetEvents = target;
      row.firstPlacement = target.find(event => event.to === 1 || event.to === 3)?.tick ?? null;
      row.firstCollection = target.find(event => event.to === 2)?.tick ?? null;
      row.firstRespawnAfterCollection = row.firstCollection === null ? null : target.find(event => event.tick > row.firstCollection && (event.to === 1 || event.to === 3))?.tick ?? null;
      assert.equal(hash(data), row.sourceHash);
      console.log(JSON.stringify({track: row.track, firstPlacement: row.firstPlacement, firstCollection: row.firstCollection, firstRespawnAfterCollection: row.firstRespawnAfterCollection, targetEvents: row.targetEvents}));
    } finally {session.dispose();}
    cases.push(row);
  }
} finally {await archive.close();}
await writeFile('analysis/pickup-editor-level1-index15-trace-20261024.json', `${JSON.stringify({method: 'Source-only per-index natural transitions in the unchanged16-pickup matrix fixture; no runtime interventions or native process.', cases}, null, 2)}\n`, {flag: 'wx'});
