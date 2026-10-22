import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {createSession, SOLO_STEP_SECONDS} from '../src/solo-session.mjs';
import {REDUX_INITIAL_GRAVITY_Q16} from '../src/race-clock.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {createModelCollisionContext} from '../src/model-candidates.mjs';

// Installed data + reconstructed JavaScript only. This never launches or
// attaches to the original executable, and leaves installed resources intact.
const [installation = 'C:/Program Files (x86)/Psygnosis/Rollcage', output = 'analysis/physics-recovery-20261022.json', rawTicks = '10000'] = process.argv.slice(2);
const ticks = Number(rawTicks);
if (!Number.isInteger(ticks) || ticks < 1 || ticks > 100000) throw Error('Expected 1..100000 ticks.');
const hash = value => createHash('sha256').update(value).digest('hex');
const source = await readFile(new URL('../src/solo-session.mjs', import.meta.url));
const archive = await RollcageArchive.open(installation);
try {
  const {data} = await archive.readResource(30), {data: textures} = await archive.readResource(31);
  const grid = parseCollisionGrid(data), models = createModelCollisionContext(data, textures, {spatial: grid.spatial});
  const sourceHash = hash(data), textureHash = hash(textures), before = [], observations = [], incidents = [], laps = [];
  let observedStages = 0;
  const session = createSession(data, textures, {onDebugFrame: value => {
    observedStages++;
    observations.push(JSON.parse(JSON.stringify(value)));
    if (observations.length > 720) observations.shift();
  }});
  const compact = snapshot => ({tick: snapshot.ticks, position: snapshot.position, speed: snapshot.speed,
    route: snapshot.route, point: snapshot.point, checkpoint: snapshot.checkpoint, laps: snapshot.laps,
    recoveries: snapshot.recoveries, quaternion: snapshot.quaternion, stats: snapshot.stats});
  let previous = session.snapshot;
  before.push(compact(previous));
  try {
    for (let tick = 1; tick <= ticks; tick++) {
      const current = session.step(), sample = compact(current);
      for (const incident of incidents) if (tick > incident.tick && tick <= incident.tick + 120) incident.after.push(sample);
      if (current.recoveries > previous.recoveries) incidents.push({tick, recoveryNumber: current.recoveries,
        before: before.slice(-120), recovered: sample, stageObservations: observations.filter(value => value.tick >= tick - 120 && value.tick <= tick), after: []});
      if (current.laps > previous.laps) laps.push({tick, completed: current.laps, recoveries: current.recoveries});
      before.push(sample); if (before.length > 120) before.shift();
      previous = current;
    }
    if (hash(data) !== sourceHash || hash(textures) !== textureHash) throw Error('Installed-data copies changed.');
    for (const incident of incidents) {
      const controls = incident.stageObservations.find(value => value.tick === incident.tick && value.stage === 'after-controls');
      const physics = incident.stageObservations.find(value => value.tick === incident.tick && value.stage === 'after-physics');
      if (physics && controls) incident.diagnosis = {
        reason: controls.collisionState128 !== 32 && physics.collisionState128 === 32 ? 'static collision rejection before post-frame vehicle checks' : 'requires further stage tracing',
        sourcePath: '474bb0 classification16 ->47cc20 completeRejectedCollisionBody ->47ccc0 applyRawRespawn',
        heightFailureAtPrepass: (physics.positionQ16[1] >> 16) > physics.selectedSectorHeight + 512,
        slowCounterAtPrepass: physics.recordCounter248,
        allWheelsGrounded: physics.wheelFlags.every(value => value & 1),
        limitation: 'The stage trace identifies rejection and rules out the height/slow prepass; it does not observe the individual contact-merge rejection branch.'
      };
      const position = incident.before.at(-1).position;
      incident.nearbyPlacedModels = [...models.instances.values()].map(({settings, collision}) => ({
        placementIndex: settings.placementIndex, modelIndex: settings.modelIndex, class: settings.class,
        position: settings.position, yaw: settings.yaw, shapeTypes: settings.configurations.map(value => value.type),
        shapeCount: collision.shapes.length, centerDistance: Math.hypot(...settings.position.map((value, axis) => value - position[axis]))
      })).sort((a, b) => a.centerDistance - b.centerDistance).slice(0, 5);
    }
    const report = {method: 'Installed LOW/LEV1 JavaScript session with unmodified source physics and native AI. Snapshot trace and optional immutable debug-stage observations; no original executable launched.',
      track: 'LOW/LEV1.BLP', sourceHash, textureHash, sessionSourceHash: hash(source), ticks, observedStages,
      nominalTickRateHz: 1 / SOLO_STEP_SECONDS, gravityQ16: REDUX_INITIAL_GRAVITY_Q16, laps, final: compact(previous), incidents,
      limitations: ['Deterministic reconstructed runtime, not original-process trajectory evidence.',
        'Snapshot jumps identify respawn ticks; exact state producers require debug-stage observations or native capture.',
        'Nearby placement distances identify candidates only; they do not establish which model produced a collision.']};
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
    console.log(JSON.stringify({output, ticks, observedStages, laps, recoveries: incidents.map(value => ({tick: value.tick, route: value.before.at(-1).route, point: value.before.at(-1).point, checkpoint: value.before.at(-1).checkpoint}))}));
  } finally {session.dispose();}
} finally {await archive.close();}
