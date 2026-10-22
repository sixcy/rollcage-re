import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {RollcageArchive} from '../src/archive.mjs';
import {createSession} from '../src/solo-session.mjs';
import {buildViewerBundle} from './lib/track-viewer-bundle.mjs';

const [installation = 'C:/Program Files (x86)/Psygnosis/Rollcage', output = `analysis/solo-session-${Date.now()}.json`, count = '10000'] = process.argv.slice(2);
const ticks = Number(count);
if (!Number.isInteger(ticks) || ticks < 4000 || ticks > 100000) throw Error('Expected 4000..100000 simulation ticks.');
const hash = value => createHash('sha256').update(value).digest('hex');
const archive = await RollcageArchive.open(installation);
try {
  const {data} = await archive.readResource(30), {data: textures} = await archive.readResource(31), sourceHash = hash(data), textureHash = hash(textures);
  const bundle = await buildViewerBundle('src/solo-session.mjs');
  const browserCreate = runInNewContext(bundle, {btoa, atob, TextEncoder, TextDecoder}).createSession;
  const session = createSession(data, textures), browser = browserCreate(data, textures), trace = [], laps = [], trajectory = createHash('sha256');
  let previous = session.snapshot;
  for (let tick = 1; tick <= ticks; tick++) {
    const current = session.step(), browserState = browser.step();
    assert.equal(JSON.stringify(current), JSON.stringify(browserState), `Browser/Node mismatch at tick${tick}`);
    assert.ok(current.position.every(Number.isFinite)); assert.ok(current.rotation.every(Number.isFinite));
    assert.ok(current.route > 0 && current.route < data[0x79]);
    if (current.checkpoint !== previous.checkpoint) {
      assert.ok(current.checkpoint === (previous.checkpoint + 1) % current.checkpointCount || current.checkpoint === (previous.checkpoint + current.checkpointCount - 1) % current.checkpointCount || current.recoveries > previous.recoveries, 'Unexplained checkpoint skip.');
      trace.push({tick, from: previous.checkpoint, to: current.checkpoint, recoveries: current.recoveries});
    }
    if (current.laps > previous.laps) laps.push({tick, completed: current.laps, recoveries: current.recoveries});
    trajectory.update(JSON.stringify(current)); previous = current;
  }
  assert.ok(previous.laps >= 3, 'The car must complete three laps.');
  assert.ok(previous.stats.wheelContacts > 0 && previous.stats.events > 0 && previous.stats.modelHits > 0);
  assert.ok(previous.brokenPlacements.length > 0, 'Native placed-model contact must break authored scenery.');
  session.reset(); browser.reset();
  for (let i = 0; i < 150; i++) {session.step(); browser.step();}
  assert.equal(JSON.stringify(session.snapshot), JSON.stringify(browser.snapshot));
  assert.equal(hash(data), sourceHash); assert.equal(hash(textures), textureHash);
  const report = {method: 'Installed LOW/LEV1, actual vehicle/all placed-object/world-fragment constructors, native scripted motion and object collision filters, recovered AI/input/physics/checkpoint/recovery and native model damage/break/destruction/effect lifecycles; Node and bundled browser runtime compared at every tick. Recovered nominal30Hz clock and normal gravity65536. This comparison does not run the original executable.',
    limits: 'No opponents, weapons, pickups or audio. Collapsing ordinary meshes and particles/fragments are not animated or drawn. Scripted-object poses use native transforms; type20 UV animation is not replayed by the viewer. Browser service/runtime assembly and presentation are viewer features; no original-process trajectory equivalence claimed.',
    track: 'LOW/LEV1.BLP', ticks, sourceHash, textureHash, bundleHash: hash(bundle), trajectoryHash: trajectory.digest('hex'), final: previous, laps, checkpointTransitions: trace, matched: true,
    recoveryFreeFirstThreeLaps: laps[2].recoveries === 0};
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({ticks, laps: previous.laps, recoveries: previous.recoveries, matched: true, output}));
  session.dispose(); browser.dispose();
  assert.equal(laps[2].recoveries, 0, 'The first three laps must complete without respawn corrections; matched state/report retained for diagnosis.');
} finally {await archive.close();}
