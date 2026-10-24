import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSession} from '../src/solo-session.mjs';
import {createSixteenPickupDraft} from '../tools/validate-pickup-editor.mjs';
import {compilePickupEdits, parsePickupPlacements, validatePickupSourcePair, createPickupProject} from '../src/pickup-editor.mjs';

const ticks = 1200, hash = bytes => createHash('sha256').update(bytes).digest('hex');
function run(data, textures, draft, captureRoute = false) {
  const edited = compilePickupEdits(data, draft), events = [], route = [];
  const session = createSession(edited, textures, {vehicleTypes: [0, 1, 2, 3, 4, 5], aiDifficulty: 2, weaponsEnabled: true});
  try {
    let previous = session.snapshot;
    for (let tick = 1; tick <= ticks; tick++) {
      const current = session.step(), from = previous.weapons.pickups[15].state & 127, to = current.weapons.pickups[15].state & 127;
      if (from !== to) events.push({tick, from, to, position: current.weapons.pickups[15].position});
      if (captureRoute) route.push({tick, cars: current.cars.map(car => ({position: car.position, inventory: car.inventory}))});
      previous = current;
    }
    const firstPlacement = events.find(row => [1, 3].includes(row.to))?.tick ?? null;
    const firstCollection = events.find(row => row.to === 2)?.tick ?? null;
    const firstRespawnAfterCollection = firstCollection === null ? null : events.find(row => row.tick > firstCollection && [1, 3].includes(row.to))?.tick ?? null;
    return {editedHash: hash(edited), events, firstPlacement, firstCollection, firstRespawnAfterCollection, ...(captureRoute ? {route} : {})};
  } finally {session.dispose();}
}

const archive = await RollcageArchive.open('C:/Program Files (x86)/Psygnosis/Rollcage'), resources = [];
try {
  for (const quality of ['LOW', 'HIGH']) {
    const track = getGame('rollcage').tracks.find(row => row.name === `${quality}/LEV1.BLP`);
    const {data} = await archive.readResource(track.index), {data: textures} = await archive.readResource(track.textureIndex);
    resources.push({quality, data, textures, sourceHash: hash(data)});
  }
  validatePickupSourcePair(resources[0].data, resources[1].data);
  const original = parsePickupPlacements(resources[0].data), draft = createSixteenPickupDraft(resources[0].data);
  draft[13].position = [...original.records[8].position]; draft[14].position = [...original.records[8].position];
  const probe = run(resources[0].data, resources[0].textures, draft, true);
  const {route, ...probeSummary} = probe;
  await writeFile('analysis/pickup-editor-level1-late-route-probe-20261024.json', `${JSON.stringify({method: 'Source-only1200-update keep13plus3 probe; no runtime interventions.', draft, probe: probeSummary, carRouteEvery20Ticks: route.filter(row => row.tick % 20 === 0)}, null, 2)}\n`, {flag: 'wx'});
  assert(probe.firstPlacement !== null, 'Index15 never placed in extended source probe.');
  const candidates = [];
  for (const frame of route) {
    if (frame.tick <= probe.firstPlacement || frame.tick > 1000) continue;
    for (const [carIndex, car] of frame.cars.entries()) {
      if (!car.inventory.includes(255)) continue;
      const sourceHighWords = car.position.map(Math.floor);
      for (const record of original.records) {
        const delta = record.position.map((n, axis) => n - sourceHighWords[axis]), distanceSquared = delta.reduce((n, x) => n + x * x, 0);
        if (distanceSquared < 0x1000) candidates.push({tick: frame.tick, carIndex, originalCoordinateIndex: record.index, position: record.position, carSourceHighWords: sourceHighWords, inventory: car.inventory, distanceSquared});
      }
    }
  }
  candidates.sort((a, b) => a.tick - b.tick || a.distanceSquared - b.distanceSquared || a.carIndex - b.carIndex || a.originalCoordinateIndex - b.originalCoordinateIndex);
  assert(candidates.length, 'No original pickup coordinate meets natural free-inventory car route before1000.');
  const selected = candidates[0]; draft[15].position = [...selected.position];
  const cases = [];
  for (const {quality, data, textures, sourceHash} of resources) {
    const result = run(data, textures, draft); cases.push({quality, sourceHash, ...result});
    console.log(JSON.stringify({quality, ...result}));
  }
  const project = createPickupProject({indexSha256: hash(archive.indexData), levels: [{level: 1, sourceHashes: {LOW: resources[0].sourceHash, HIGH: resources[1].sourceHash}, pickups: draft}]});
  const report = {method: 'Source-only static edited layout: preserve13 original immutable template references, move original0 XYZ by1, append3 clones;13/14 use original8 far-coordinate XYZ; target15 uses an original coordinate selected quantitatively from a prior natural sourcecar route. No runtime writes or game timing/flag/stat edits.',
    ticks, variant: 'keep13-plus3-late-route', selection: selected, probeTargetEvents: probe.events, candidatesBefore1000: candidates.length, project, cases,
    matchedWithin1200: cases.every(row => row.firstCollection !== null && row.firstRespawnAfterCollection !== null),
    limits: ['Reconstructed-source route forecast is not original-process runtime evidence and does not guarantee the same native race trajectory.', 'Both qualities use identical draft positions/template references, compiled against their own original bytes6..11.']};
  await writeFile('analysis/pickup-editor-level1-late-route-fixture-20261024.json', `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  await writeFile('analysis/pickup-editor-level1-late-route-project-20261024.json', `${JSON.stringify(project, null, 2)}\n`, {flag: 'wx'});
} finally {await archive.close();}
