import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSession} from '../src/solo-session.mjs';

const [output, installation = 'C:/Program Files (x86)/Psygnosis/Rollcage'] = process.argv.slice(2);
if (!output) throw Error('Usage: node tools/check-solo-world-sessions.mjs NEW_REPORT_JSON [INSTALLATION]');
const archive = await RollcageArchive.open(installation), cases = [];
try {
  for (const track of getGame('rollcage').tracks.filter(track => !/\/LEV(?:16|17)\.BLP$/.test(track.name))) {
    const {data} = await archive.readResource(track.index), {data: textures} = await archive.readResource(track.textureIndex);
    let session;
    try {
      session = createSession(data, textures);
      for (let tick = 0; tick < 600; tick++) session.step();
      const state = session.snapshot;
      assert.ok(state.position.every(Number.isFinite)); assert.equal(state.ticks, 600);
      cases.push({track: track.name, passed: true, ticks: state.ticks, laps: state.laps, recoveries: state.recoveries, brokenPlacements: state.brokenPlacements});
    } catch (error) {cases.push({track: track.name, passed: false, error: error.stack});}
    finally {session?.dispose();}
  }
  const report = {method: 'Installed-asset reconstruction smoke check: native ordinary/nonordinary placements, scripted motion/object filters, lights, damage/break/destruction and physical fragment pools/stages, AI/input/physics for 600 ticks on each allowed LOW/HIGH variant. No original process or completed-lap equivalence.',
    excluded: ['LOW/LEV16.BLP', 'HIGH/LEV16.BLP', 'LOW/LEV17.BLP', 'HIGH/LEV17.BLP'], cases};
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  console.log(JSON.stringify({tracks: cases.length, passed: cases.filter(row => row.passed).length, failed: cases.filter(row => !row.passed), output}));
  if (cases.some(row => !row.passed)) process.exitCode = 1;
} finally {await archive.close();}
