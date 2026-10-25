// Read-only installed-data checks and reconstructed runtime; no game launch.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';
import {parseSpatialIndex} from '../src/spatial-index.mjs';
import {inspectRaceLayoutFallback} from '../src/race-layout-spatial.mjs';
import {createSession} from '../src/solo-session.mjs';
import {createRaceRouteTopology, validateRaceRouteTopology, cloneRaceRouteGroup,
  insertRaceRoutePoint, connectRaceRoutePoints, compileRaceRouteTopology} from '../src/race-route-topology.mjs';

const [report, installation = 'C:/Program Files (x86)/Psygnosis/Rollcage'] = process.argv.slice(2);
if (!report) throw Error('Usage: node tools/validate-route-topology.mjs NEW_REPORT.json [INSTALLATION]');
const archive = await RollcageArchive.open(installation), rows = [], pairs = new Map();
const sha = data => createHash('sha256').update(data).digest('hex');
try {
  for (let level = 1; level <= 20; level++) for (const quality of ['LOW', 'HIGH']) {
    const track = getGame('rollcage').tracks.find(t => t.name === `${quality}/LEV${level}.BLP`);
    const source = (await archive.readResource(track.index)).data, sourceSha256 = sha(source), topology = createRaceRouteTopology(source);
    assert.deepEqual(compileRaceRouteTopology(source, topology).data, source);
    const eligible = topology.groups.find((g, index) => index > 0 && !g.header[3] && g.points.length > 1);
    assert.ok(eligible, `${track.name}: route group suitable for cloning`);
    let insertion;
    for (const point of eligible.points) {
      for (const axis of [0, 2, 1]) {
        const position = [...point.position]; position[axis] += position[axis] < 32767 ? 1 : -1;
        if (eligible.points.some(p => p.position.every((n, i) => n === position[i]))) continue;
        const candidate = insertRaceRoutePoint(topology, eligible.id, point.id, {position});
        if (validateRaceRouteTopology(source, candidate.topology).valid) {insertion = candidate; break;}
      }
      if (insertion) break;
    }
    assert.ok(insertion, `${track.name}: supported route insertion`);
    const cloned = cloneRaceRouteGroup(insertion.topology, eligible.id);
    const draftValidation = validateRaceRouteTopology(source, cloned.topology, {requireConnected: false});
    assert.equal(draftValidation.valid, true); assert.ok(draftValidation.warnings.length);
    assert.equal(validateRaceRouteTopology(source, cloned.topology).valid, false);
    const entry = eligible.points[0].id, cloneEntry = cloned.pointIds[entry];
    let connected = connectRaceRoutePoints(cloned.topology, entry, 1, cloneEntry, {replace: true});
    connected = connectRaceRoutePoints(connected, cloneEntry, 1, entry, {replace: true});
    const compiled = compileRaceRouteTopology(source, connected), routes = parseRespawnRoutes(compiled.data);
    assert.equal(routes.groups.length, topology.groups.length + 1);
    assert.equal(routes.groups[eligible.index].count, eligible.points.length + 1);
    assert.equal(routes.groups.at(-1).byte05, routes.groups.length - 1);
    const fallback = inspectRaceLayoutFallback(compiled.data, parseSpatialIndex(compiled.data), routes.groups);
    const beforeFallback = inspectRaceLayoutFallback(source, parseSpatialIndex(source), parseRespawnRoutes(source).groups);
    assert.deepEqual(fallback.nodes.map(n => n.models), beforeFallback.nodes.map(n => n.models));
    // Every native link names an extant point after the count/index remap.
    let linkCount = 0;
    for (const group of routes.groups) for (const point of group.points) {
      const word = point.bytes.readUInt32LE(12);
      for (const [g, p] of [[word & 31, word >>> 5 & 511], [word >>> 14 & 31, word >>> 19 & 511]]) if (g) {assert.ok(routes.groups[g]?.points[p]); linkCount++;}
    }
    const paired = {remap: compiled.remap, points: routes.groups.map(g => g.points.map(p => [...p.bytes])), metadata: routes.groups.map(g => [...g.bytes.subarray(0, 8)])};
    if (quality === 'LOW') pairs.set(level, paired); else assert.deepEqual(paired, pairs.get(level), `LEV${level} paired topology`);
    let race = null;
    // LEV16/17 route assets are checked, but their Racing Test remains disabled.
    if (![16, 17].includes(level)) {
      const texture = (await archive.readResource(track.textureIndex)).data, session = createSession(compiled.data, texture, {vehicleTypes: [0, 1, 2], aiDifficulty: 2, weaponsEnabled: true});
      try {for (let tick = 0; tick < 90; tick++) session.step(); race = {ticks: session.snapshot.ticks, cars: session.snapshot.cars.length};}
      finally {session.dispose();}
    }
    assert.equal(sha(source), sourceSha256);
    const row = {level, quality, sourceSha256, sourceIdentity: true, sourceGroups: topology.groups.length, sourcePoints: topology.groups.reduce((n, g) => n + g.points.length, 0),
      insertedPoint: insertion.pointId, clonedGroup: cloned.groupId, outputGroups: routes.groups.length, linksValidated: linkCount,
      fallbackNodes: fallback.nodes.length, modelReferencesPreserved: true, draftDisconnectedRejected: true, pairedCompatible: true, race};
    rows.push(row); console.log(JSON.stringify({level, quality, passed: true, outputGroups: row.outputGroups, race}));
  }
} finally {await archive.close();}
await writeFile(report, JSON.stringify({passed: true, scope: 'Read-only corpus and reconstructed 90-tick runtime. No original-process or long-race parity claim.', nativePointBound: 256, rows}, null, 2) + '\n', {flag: 'wx'});
