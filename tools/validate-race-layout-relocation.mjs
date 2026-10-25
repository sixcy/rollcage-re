// Wider source/corpus relocation checks. No original game process is launched.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {inspectRaceLayout, createRaceLayoutDraft, emptyRaceLayoutDraft, compileRaceLayoutEdits, raceLayoutMoveConstraint, raceLayoutCheckpointConstraint} from '../src/race-layout-editor.mjs';
import {findRaceLayoutTerrainSupport} from '../src/race-layout-spatial.mjs';
import {createSession} from '../src/solo-session.mjs';

const [output, installation = 'C:/Program Files (x86)/Psygnosis/Rollcage'] = process.argv.slice(2);
if (!output) throw Error('Usage: node tools/validate-race-layout-relocation.mjs NEW_REPORT.json [INSTALLATION]');
const archive = await RollcageArchive.open(installation), rows = [], sha = bytes => createHash('sha256').update(bytes).digest('hex');
const distance = (a, b) => Math.hypot(...a.map((n, i) => n - b[i]));
let stage = 'initialization', failure;
try {
  for (let level = 1; level <= 20; level++) for (const quality of ['LOW', 'HIGH']) {
    stage = `${quality}/LEV${level}`;
    const t = getGame('rollcage').tracks.find(t => t.name === `${quality}/LEV${level}.BLP`), data = (await archive.readResource(t.index)).data;
    const hash = sha(data), info = inspectRaceLayout(data), full = createRaceLayoutDraft(data), originalRoute = full.routes[0], originalCheckpoint = info.checkpoints[0], originalStart = full.starts[0];
    assert.deepEqual(compileRaceLayoutEdits(data), data); assert.deepEqual(compileRaceLayoutEdits(data, full), data);
    let planeAudits = 0;
    for (const checkpoint of info.checkpoints) {
      const plane = raceLayoutCheckpointConstraint(info, checkpoint, checkpoint);
      assert.equal(plane.supportSector, checkpoint.sector); assert.ok(plane.intersectionSegments.length); planeAudits++;
      assert.ok([[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]].some(([axis, delta]) => {
        const position = [...checkpoint.position]; position[axis] += delta; return raceLayoutCheckpointConstraint(info, checkpoint, {...checkpoint, position}).allowed;
      }), 'Each original plane admits a small legitimate anchor move');
    }
    const candidates = full.routes.filter(r => r.group === originalRoute.group && r.point > 1 && r.point < info.groups[r.group].count - 1)
      .map(r => ({...originalRoute, position: [r.position[0] + 1, r.position[1], r.position[2]]})).sort((a, b) => distance(b.position, originalRoute.position) - distance(a.position, originalRoute.position));
    const originalSupport = findRaceLayoutTerrainSupport(info, originalStart.position), clearance = originalSupport ? originalStart.position[1] - originalSupport.point[1] : 0;
    let selected, draft, compiled; const rejected = [];
    for (const route of candidates) {
      const constraint = raceLayoutMoveConstraint(info, originalRoute.position, route.position); if (!constraint.allowed || distance(originalRoute.position, route.position) <= 256) continue;
      const support = findRaceLayoutTerrainSupport(info, route.position); if (!support) continue;
      const start = {...originalStart, position: [route.position[0], Math.round(support.point[1] + clearance), route.position[2]]};
      if (!raceLayoutMoveConstraint(info, originalStart.position, start.position).allowed || distance(originalStart.position, start.position) <= 256) continue;
      draft = {...emptyRaceLayoutDraft(), routes: [route], starts: [start]};
      const planes = full.checkpoints.filter(c => c.id !== originalCheckpoint.id).map(c => ({id: originalCheckpoint.id, position: [...c.position], direction: [...c.direction]}));
      planes.sort((a, b) => distance(b.position, originalCheckpoint.position) - distance(a.position, originalCheckpoint.position));
      const changedSector = planes.find(p => {const c = raceLayoutCheckpointConstraint(info, originalCheckpoint, p); return c.allowed && c.supportSector !== originalCheckpoint.sector;});
      const checkpoint = changedSector ?? planes.find(p => raceLayoutCheckpointConstraint(info, originalCheckpoint, p).allowed); assert.ok(checkpoint); draft.checkpoints = [checkpoint];
      try {compiled = compileRaceLayoutEdits(data, draft); selected = {route, start, checkpoint}; break;}
      catch (error) {rejected.push(error.message);}
    }
    assert.ok(selected, `${stage}: no supported distant route/grid move: ${rejected.slice(0, 3).join('; ')}`);
    const after = inspectRaceLayout(compiled);
    for (const row of after.fallback.nodes) {const before = info.fallback.nodes[row.node]; assert.equal(row.group, before.group); assert.deepEqual(row.models, before.models);}
    for (const node of after.spatial.nodes) {assert.equal(node.referenceWord, info.spatial.nodes[node.index].referenceWord); assert.equal(node.boundsWord & 0x3fffff, info.spatial.nodes[node.index].boundsWord & 0x3fffff);}
    const checkpointSector = raceLayoutCheckpointConstraint(info, originalCheckpoint, selected.checkpoint).supportSector;
    assert.equal(after.checkpoints.find(c => c.id === originalCheckpoint.id).sector, checkpointSector);
    let race = null;
    if (![16, 17].includes(level)) {
      const textures = (await archive.readResource(t.textureIndex)).data, session = createSession(compiled, textures, {vehicleTypes: [0, 1, 2], aiDifficulty: 2, weaponsEnabled: true});
      try {for (let i = 0; i < 90; i++) session.step(); race = {ticks: session.snapshot.ticks, cars: session.snapshot.cars.length};}
      finally {session.dispose();}
    }
    assert.equal(sha(data), hash);
    const row = {level, quality, sourceSha256: hash, emptyIdentity: true, fullIdentity: true, planeAudits,
      routeDistance: distance(originalRoute.position, selected.route.position), startDistance: distance(originalStart.position, selected.start.position),
      checkpointSectorBefore: originalCheckpoint.sector, checkpointSectorAfter: checkpointSector,
      changedFallbackNodes: after.fallback.nodes.filter(r => r.word !== info.fallback.nodes[r.node].word).length,
      fallbackGroupsAndModelsPreserved: true, spatialLayersPreserved: true, rejected, draft, race};
    rows.push(row); console.log(JSON.stringify({level, quality, passed: true, routeDistance: Math.round(row.routeDistance), startDistance: Math.round(row.startDistance), changedFallbackNodes: row.changedFallbackNodes, checkpointSector, race}));
  }
} catch (error) {failure = {stage, error: error.stack}; process.exitCode = 1;}
finally {
  await archive.close();
  await writeFile(output, JSON.stringify({passed: !failure, scope: 'Read-only installed-data, offline editor reconstruction and source runtime. Not original-process or complete-race equivalence.', failure, rows}, null, 2) + '\n', {flag: 'wx'});
}
if (failure) console.error(JSON.stringify(failure));
