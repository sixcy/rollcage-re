// Source/corpus editor validation only. Does not launch the original game.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {inspectRaceLayout, createRaceLayoutDraft, emptyRaceLayoutDraft, compileRaceLayoutEdits, raceLayoutMoveConstraint, raceLayoutCheckpointConstraint} from '../src/race-layout-editor.mjs';
import {createSession} from '../src/solo-session.mjs';

const [output, installation = 'C:/Program Files (x86)/Psygnosis/Rollcage'] = process.argv.slice(2);
if (!output) throw Error('Usage: node tools/validate-race-layout-editor.mjs NEW_REPORT.json [INSTALLATION]');
const archive = await RollcageArchive.open(installation), rows = [], sha = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  for (let level = 1; level <= 20; level++) for (const quality of ['LOW', 'HIGH']) {
    const t = getGame('rollcage').tracks.find(t => t.name === `${quality}/LEV${level}.BLP`), data = (await archive.readResource(t.index)).data;
    const hash = sha(data), info = inspectRaceLayout(data), full = createRaceLayoutDraft(data), draft = emptyRaceLayoutDraft();
    assert.deepEqual(compileRaceLayoutEdits(data, draft), data); assert.deepEqual(compileRaceLayoutEdits(data, full), data);
    const offsetEdit = (row, options) => {
      for (const [axis, sign] of [[0, 1], [0, -1], [2, 1], [2, -1], [1, 1], [1, -1]]) {
        const position = [...row.position]; position[axis] += sign;
        const constraint = row.direction ? raceLayoutCheckpointConstraint(info, info.checkpoints.find(c => c.id === row.id), {...row, position}) : raceLayoutMoveConstraint(info, row.position, position);
        if (constraint.allowed) return {...row, position};
      }
      return null;
    };
    const route = offsetEdit(full.routes[0]); assert.ok(route, `${quality}/LEV${level} local route move`);
    route.targetSpeed = route.targetSpeed === 255 ? 254 : route.targetSpeed + 1; draft.routes.push(route);
    const cp = full.checkpoints.find(row => {
      const p = info.checkpoints.find(c => c.id === row.id); return offsetEdit(row, {sector: p.sector});
    }); assert.ok(cp, `${quality}/LEV${level} local checkpoint move`);
    draft.checkpoints.push(offsetEdit(cp, {sector: info.checkpoints.find(c => c.id === cp.id).sector}));
    const start = offsetEdit(full.starts[0]); assert.ok(start, `${quality}/LEV${level} local grid move`); draft.starts.push(start);
    const compiled = compileRaceLayoutEdits(data, draft), reparsed = inspectRaceLayout(compiled);
    assert.deepEqual(reparsed.routes.find(r => r.group === route.group && r.point === route.point).position, route.position);
    assert.deepEqual(reparsed.starts[0].position, start.position); assert.deepEqual(reparsed.checkpoints.find(c => c.id === cp.id).position, draft.checkpoints[0].position);
    let race = null;
    if (![16, 17].includes(level)) {
      const textures = (await archive.readResource(t.textureIndex)).data, session = createSession(compiled, textures, {vehicleTypes: [0, 1, 2], aiDifficulty: 2, weaponsEnabled: true});
      try {for (let i = 0; i < 90; i++) session.step(); race = {ticks: session.snapshot.ticks, cars: session.snapshot.cars.length};}
      finally {session.dispose();}
    }
    assert.equal(sha(data), hash);
    const row = {level, quality, sourceSha256: hash, emptyIdentity: true, fullIdentity: true, groupCount: info.groups.length,
      routePoints: info.routes.length, checkpoints: info.checkpoints.length, starts: info.starts.length,
      localRoute: {group: route.group, point: route.point, position: route.position}, checkpoint: draft.checkpoints[0], start, race};
    rows.push(row); console.log(JSON.stringify({level, quality, passed: true, routePoints: info.routes.length, race}));
  }
} finally {await archive.close();}
await writeFile(output, JSON.stringify({passed: true, scope: 'Read-only installed-data and reconstructed source runtime. No original-process or complete-race equivalence claim.', rows}, null, 2) + '\n', {flag: 'wx'});
