import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSession} from '../src/solo-session.mjs';
import {compilePickupEdits, parsePickupPlacements, validatePickupSourcePair, createPickupProject} from '../src/pickup-editor.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const archive = await RollcageArchive.open('C:/Program Files (x86)/Psygnosis/Rollcage');
const resources = [];
const templateIndex = Number(process.argv[2] ?? 0), suffix = `template-${templateIndex}`;
function run(data, textures, draft, captureRoute = false) {
  const edited = compilePickupEdits(data, draft), events = [], route = [], firstPlacements = {};
  const session = createSession(edited, textures, {vehicleTypes: [0, 1, 2, 3, 4, 5], aiDifficulty: 2, weaponsEnabled: true});
  try {
    let previous = session.snapshot;
    for (let tick = 1; tick <= 600; tick++) {
      const current = session.step(), from = previous.weapons.pickups[15].state & 127, to = current.weapons.pickups[15].state & 127;
      if (from !== to) events.push({tick, from, to, position: current.weapons.pickups[15].position});
      current.weapons.pickups.forEach((row, i) => {if ([1, 3].includes(row.state & 127)) firstPlacements[i] ??= tick;});
      if (captureRoute) route.push({tick, positions: current.cars.map(car => car.position)});
      previous = current;
    }
    const firstPlacement = events.find(row => [1, 3].includes(row.to))?.tick ?? null;
    const firstCollection = events.find(row => row.to === 2)?.tick ?? null;
    const firstRespawnAfterCollection = firstCollection === null ? null : events.find(row => row.tick > firstCollection && [1, 3].includes(row.to))?.tick ?? null;
    return {editedHash: hash(edited), events, firstPlacements, firstPlacement, firstCollection, firstRespawnAfterCollection, ...(captureRoute ? {route} : {})};
  } finally {session.dispose();}
}

try {
  for (const quality of ['LOW', 'HIGH']) {
    const track = getGame('rollcage').tracks.find(row => row.name === `${quality}/LEV1.BLP`);
    const {data} = await archive.readResource(track.index), {data: textures} = await archive.readResource(track.textureIndex);
    resources.push({quality, data, textures, sourceHash: hash(data)});
  }
  validatePickupSourcePair(resources[0].data, resources[1].data);
  const original = parsePickupPlacements(resources[0].data), far = original.records[8].position;
  if (!Number.isInteger(templateIndex) || templateIndex < 0 || templateIndex >= original.count) throw Error('Unknown original template.');
  const draft = Array.from({length: 16}, (_, i) => ({id: i ? `clone-${i}` : 'original-0', templateIndex: i === 0 ? 0 : templateIndex, position: [...(i === 15 ? original.records[0].position : far)]}));
  const probe = run(resources[0].data, resources[0].textures, draft, true);
  const {route: unusedRoute, ...probeSummary} = probe;
  await writeFile(`analysis/pickup-editor-level1-index15-probe-${suffix}-20261024.json`, `${JSON.stringify({method: 'Source-only original0 moved plus15 authentic original-template clones; no runtime writes/native process.', templateIndex, draft, probe: probeSummary}, null, 2)}\n`, {flag: 'wx'});
  if (probe.firstPlacement === null || probe.firstPlacement >= 599) throw Error('Authentic template0 does not place target15 early enough for source route fixture.');
  const route = probe.route.find(row => row.tick === probe.firstPlacement + 1);
  const selectedPosition = route.positions[0].map(Math.round);
  if (selectedPosition.some(n => n < -32768 || n > 32767)) throw Error('Source route candidate exceeds authored coordinate width.');
  draft[15].position = selectedPosition;
  const cases = resources.map(({quality, data, textures, sourceHash}) => {
    const result = run(data, textures, draft);
    console.log(JSON.stringify({quality, ...result}));
    return {quality, sourceHash, ...result};
  });
  const project = createPickupProject({indexSha256: hash(archive.indexData), levels: [{level: 1, sourceHashes: {LOW: resources[0].sourceHash, HIGH: resources[1].sourceHash}, pickups: draft}]});
  const report = {method: 'Source-only static authored layout fixture. Retain/move original0 to original template8 far coordinate, delete remaining original draft rows, add15 immutable template0 clones, then place only target15 at rounded natural car0 route position from a prior source run one update after its first placement. All game children run normally; no runtime memory writes, flags, inventory grants or native process.',
    selection: {templateIndex, nonTargetPositionFromOriginalTemplate: 8, probeFirstPlacement: probe.firstPlacement, routeTick: route.tick, sourceCar: 0, selectedPosition}, probeTargetEvents: probe.events, project, cases,
    matchedWithin600: cases.every(row => row.firstCollection !== null && row.firstRespawnAfterCollection !== null), limits: ['This fixture is designed using reconstructed source trajectory and authentic template metadata; it does not predict an identical original-game race trajectory or guarantee native collection.', 'Both qualities use identical draft XYZ/template references and their own original template bytes. Native validation remains separate.']};
  await writeFile(`analysis/pickup-editor-level1-index15-fixture-${suffix}-20261024.json`, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  await writeFile(`analysis/pickup-editor-level1-index15-project-${suffix}-20261024.json`, `${JSON.stringify(project, null, 2)}\n`, {flag: 'wx'});
} finally {await archive.close();}
