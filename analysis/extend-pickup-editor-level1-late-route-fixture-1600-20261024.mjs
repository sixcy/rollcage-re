import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSession} from '../src/solo-session.mjs';
import {compilePickupEdits, parsePickupProject, validatePickupProject} from '../src/pickup-editor.mjs';

const projectPath = 'analysis/pickup-editor-level1-late-route-project-20261024.json';
const projectBytes = await readFile(projectPath), project = parsePickupProject(projectBytes.toString('utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const archive = await RollcageArchive.open('C:/Program Files (x86)/Psygnosis/Rollcage'), resources = [], cases = [];
try {
  for (const quality of ['LOW', 'HIGH']) {
    const track = getGame('rollcage').tracks.find(row => row.name === `${quality}/LEV1.BLP`);
    const {data} = await archive.readResource(track.index), {data: textures} = await archive.readResource(track.textureIndex);
    resources.push({quality, data, textures, sourceHash: hash(data)});
  }
  validatePickupProject(project, {indexSha256: hash(archive.indexData), levels: [{level: 1, sourceHashes: {LOW: resources[0].sourceHash, HIGH: resources[1].sourceHash}, lowData: resources[0].data, highData: resources[1].data}]});
  for (const {quality, data, textures, sourceHash} of resources) {
    const edited = compilePickupEdits(data, project.levels[0].pickups), events = [], carRouteEvery20Ticks = [];
    const session = createSession(edited, textures, {vehicleTypes: [0, 1, 2, 3, 4, 5], aiDifficulty: 2, weaponsEnabled: true});
    try {
      let previous = session.snapshot;
      for (let tick = 1; tick <= 1600; tick++) {
        const current = session.step(), from = previous.weapons.pickups[15].state & 127, to = current.weapons.pickups[15].state & 127;
        if (from !== to) events.push({tick, from, to, position: current.weapons.pickups[15].position});
        if (tick % 20 === 0) carRouteEvery20Ticks.push({tick, positions: current.cars.map(car => car.position)});
        previous = current;
      }
      const firstPlacement = events.find(row => [1, 3].includes(row.to))?.tick ?? null;
      const firstCollection = events.find(row => row.to === 2)?.tick ?? null;
      const firstRespawnAfterCollection = firstCollection === null ? null : events.find(row => row.tick > firstCollection && [1, 3].includes(row.to))?.tick ?? null;
      const row = {quality, sourceHash, editedHash: hash(edited), events, firstPlacement, firstCollection, firstRespawnAfterCollection, carRouteEvery20Ticks};
      cases.push(row); console.log(JSON.stringify({quality, firstPlacement, firstCollection, firstRespawnAfterCollection, events}));
      assert.equal(hash(data), sourceHash);
    } finally {session.dispose();}
  }
  const report = {method: 'Source-only1600-update extension of exactly the previously selected static LOW/HIGH keep13-plus3 project. No layout retuning or runtime interventions; real reconstructed six-Expert weapons-enabled update chain.',
    projectPath, projectSha256: hash(projectBytes), project, ticks: 1600, cases,
    matchedWithin1600: cases.every(row => row.firstCollection !== null && row.firstRespawnAfterCollection !== null),
    limits: ['The1200-update attempt remains retained and did not observe the subsequent respawn.', 'These are source forecasts in an edited layout; original-process trajectories and pickup events remain unproved until independently observed.']};
  await writeFile('analysis/pickup-editor-level1-late-route-fixture-1600-20261024.json', `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
} finally {await archive.close();}
