import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {RollcageArchive} from '../src/archive.mjs';
import {createSession} from '../src/solo-session.mjs';
import {getGame} from '../src/track-games.mjs';
import {buildViewerBundle} from './lib/track-viewer-bundle.mjs';

const [output, installation = 'C:/Program Files (x86)/Psygnosis/Rollcage', count = '300', scope = 'all'] = process.argv.slice(2);
if (!output) throw Error('Usage: node tools/check-solo-vehicles.mjs NEW_REPORT_JSON [INSTALLATION] [TICKS=300] [all|level1]');
const ticks = Number(count);
if (!Number.isInteger(ticks) || ticks < 1 || ticks > 10000 || !['all', 'level1'].includes(scope)) throw Error('Expected1..10000 ticks and scope all or level1.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bundle = await buildViewerBundle('src/solo-session.mjs');
const browserCreate = runInNewContext(bundle, {btoa, atob, TextEncoder, TextDecoder}).createSession;
const tracks = getGame('rollcage').tracks.filter(track => !/\/LEV(?:16|17)\.BLP$/.test(track.name) && (scope === 'all' || track.name === 'LOW/LEV1.BLP'));
assert.equal(tracks.length, scope === 'all' ? 36 : 1);
const archive = await RollcageArchive.open(installation), cases = [];
try {
  for (const track of tracks) {
    const {data} = await archive.readResource(track.index), {data: textures} = await archive.readResource(track.textureIndex);
    const sourceHash = hash(data), textureHash = hash(textures), lookup = data.readUInt32LE(0x84);
    for (let vehicleType = 0; vehicleType < 7; vehicleType++) {
      let session, browser;
      try {
        session = createSession(data, textures, {vehicleType});
        const initial = session.snapshot, modelIndex = data.readInt16LE(lookup + (20 + vehicleType * 2) * 2);
        assert.equal(session.assets.modelIndices[0], modelIndex);
        if (track.name === 'LOW/LEV1.BLP') browser = browserCreate(data, textures, {vehicleType});
        const trajectory = createHash('sha256');
        for (let tick = 0; tick < ticks; tick++) {
          const state = session.step();
          assert.ok([...state.position, ...state.rotation, ...state.quaternion].every(Number.isFinite));
          assert.equal(state.ticks, tick + 1);
          if (browser) assert.equal(JSON.stringify(state), JSON.stringify(browser.step()), `Browser parity ${track.name}/type${vehicleType}/tick${tick + 1}`);
          trajectory.update(JSON.stringify(state));
        }
        const final = session.snapshot;
        assert.deepEqual(session.reset(), initial);
        assert.equal(session.assets.modelIndices[0], modelIndex);
        if (browser) assert.equal(JSON.stringify(browser.reset()), JSON.stringify(initial));
        cases.push({track: track.name, vehicleType, passed: true, ticks, modelIndex, modelIndices: session.assets.modelIndices, sourceHash, textureHash,
          browserParityTicks: browser ? ticks : 0, trajectoryHash: trajectory.digest('hex'), final});
      } catch (error) {cases.push({track: track.name, vehicleType, passed: false, error: error.stack});}
      finally {session?.dispose(); browser?.dispose();}
    }
    assert.equal(hash(data), sourceHash); assert.equal(hash(textures), textureHash);
    console.log(JSON.stringify({track: track.name, completed: cases.length, failed: cases.filter(row => !row.passed).length}));
  }
  const report = {method: 'Installed reconstruction matrix: native session+1c vehicle selectors0..6, unchanged session/AI/gravity/precision defaults, real authored body/linked-animation/wheel models and recovered physics. Reset retains each selection. LOW/LEV1 additionally compares Node with the fresh bundled browser runtime at every tick; no original executable execution or trajectory-equivalence claim.',
    limits: 'A bounded smoke matrix does not establish completed laps, all native vehicle modes or original-process trajectory equivalence. The separate strict three-lap zero-recovery check remains unchanged.',
    ticks, tracks: tracks.length, vehicleTypes: 7, bundleHash: hash(bundle), excluded: ['LOW/LEV16.BLP', 'HIGH/LEV16.BLP', 'LOW/LEV17.BLP', 'HIGH/LEV17.BLP'],
    matched: cases.every(row => row.passed), cases};
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  console.log(JSON.stringify({matched: report.matched, tracks: tracks.length, cases: cases.length, passed: cases.filter(row => row.passed).length, browserParityCases: cases.filter(row => row.browserParityTicks).length, output}));
  if (!report.matched) process.exitCode = 1;
} finally {await archive.close();}
