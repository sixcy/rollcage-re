import assert from 'node:assert/strict';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';
import {writeRouteDirection} from '../src/autonomous-route-geometry.mjs';
import {scaleContactVector} from '../src/body-contact-friction.mjs';
import {planAutonomousRoute} from '../src/autonomous-route-planner.mjs';
import {createConnectedPlannerFixture, connectedAddresses} from './verify-autonomous-route-planner-connected-instructions.mjs';

const game = process.argv[2] ?? 'C:/Program Files (x86)/Psygnosis/Rollcage', limit = Number(process.argv[3] ?? Infinity), output = process.argv[4] ?? 'analysis/autonomous-route-planner-probes-20261021.json';
if (!(limit > 0)) throw Error('Arguments: [gameDirectory] [maxResources] [newReportPath].');
const hash = data => createHash('sha256').update(data).digest('hex');
const sourceNames = (await readdir('src')).filter(name => /^autonomous-.*\.(?:mjs|json)$/.test(name) || ['fixed-integer.mjs', 'body-contact-friction.mjs', 'sqrt-table.json', 'yaw-table.json', 'respawn-routes.mjs', 'archive.mjs', 'collision-grid.mjs'].includes(name));
const sourceHashes = Object.fromEntries(await Promise.all(sourceNames.map(async name => [name, hash(await readFile('src/' + name))])));
const toolHashes = Object.fromEntries(await Promise.all(['tools/probe-autonomous-route-planner.mjs', 'tools/verify-autonomous-route-planner-connected-instructions.mjs'].map(async name => [name, hash(await readFile(name))])));
const {body: BODY, pack: PACK, session: SESSION, resource: SCENE, registry: REGISTRY, stack: STACK} = connectedAddresses;
const RESOURCE = 0x100000, RECORDS = 0x909300, memory = Buffer.alloc(0xa00000), U = 65536;
const word = (p, value) => memory.writeUInt16LE(value & 65535, p), put = (p, value) => memory.writeInt32LE(value | 0, p), vector = (p, values) => values.forEach((value, axis) => put(p + axis * 4, value));
const profiles = [
  {name: 'basic-sparse', skill: 0, speed: 60, units: 4, policy: 0x463, world: false, clock: 349, difficulty: 0, item: 255},
  {name: 'traffic-skilled', skill: 2, speed: 280, units: 12, policy: 0x463, world: true, clock: 1000, difficulty: 1, item: 255, closeLateralOpponent: true},
  {name: 'expert-special-sources', skill: 4, speed: 350, units: 16, policy: 0xc6f, world: true, clock: 5000, difficulty: 2, item: 255},
  {name: 'threshold-101-traffic', skill: 3, speed: 101, units: 8, policy: 0xc6f, world: true, clock: 350, difficulty: 0, item: 255, behindOpponent: true},
  {name: 'last-lap-item4-events', skill: 3, speed: 500, units: 24, policy: 0xc6f, world: true, clock: 5000, difficulty: 2, item: 4, lastLap: true},
  {name: 'early-100-events', skill: 1, speed: 100, units: 6, policy: 0xc6f, world: true, clock: 349, difficulty: 1, item: 255},
];
const bases = profiles.map((profile, index) => createConnectedPlannerFixture(index).memory);
const summary = {resources: 0, groups: 0, forwardGroups: 0, reverseGroups: 0, openGroups: 0, cyclicGroups: 0, scenarios: 0, authoredEndpointScenarios: 0, ordinarySelections: 0, specialSelections: 0, fallbackSelections: 0, invalidSelections: 0, progressionFallbacks: 0, populatedBodyLists: 0, populatedObstacleLists: 0, eventScenarios: 0, specialSourceScenarios: 0, candidateGroups: 0, disabledCandidates: 0, authoredLinkedCandidates: 0, sourceAndMappedChecks: 0};
const profileCounts = Object.fromEntries(profiles.map(profile => [profile.name, {scenarios: 0, ordinary: 0, special: 0, fallback: 0, bodyLists: 0, obstacleLists: 0, candidateTypes: Array(6).fill(0), selectedTypes: Array(6).fill(0)}]));
const resources = [], samples = [], failures = [], selectedTypes = Array(6).fill(0), candidateTypes = Array(6).fill(0);

function setScene(routes, route, initialIndex, profile, profileIndex) {
  const point = route.pointAt(initialIndex), origin = point.position.map((value, axis) => (value + [-24, 8, -24][axis]) << 16);
  vector(BODY + 0x34, origin); word(BODY + 0x6c0, route.index); word(BODY + 0x6c2, initialIndex);
  writeRouteDirection(STACK + 32, route.index, initialIndex, {memory, scratchBase: STACK - 0x800});
  const direction = [0, 4, 8].map(offset => memory.readInt32LE(STACK + 32 + offset));
  const lateral = scaleContactVector([direction[2], 0, -direction[0]], U);
  const descriptor = routes.groups[route.byte05]?.count >= 2 ? route : routes.groups.find(group => routes.groups[group.byte05]?.count >= 2);
  assert(descriptor, 'No valid authored progression descriptor.'); if (descriptor !== route) summary.progressionFallbacks++;
  const progressGroup = routes.groups[descriptor.byte05], progressIndex = Math.min(initialIndex, progressGroup.count - 1);
  const at = (along, side = 0) => origin.map((value, axis) => (value + Math.imul(direction[axis], along) + Math.imul(lateral[axis], side)) | 0);
  const matrix = [lateral[0] >> 4, 0, direction[0] >> 4, lateral[1] >> 4, 4096, direction[1] >> 4, lateral[2] >> 4, 0, direction[2] >> 4];
  for (let index = 0; index < 6; index++) {
    const vehicle = BODY + index * 0x4000, record = RECORDS + index * 0x30c;
    vector(vehicle + 0x34, index ? at(index * 65, index & 1 ? 20 : -20) : origin); vector(vehicle + 0x68, direction.map(value => Math.imul(value, profile.units + index)));
    word(vehicle + 0x6c0, route.index); word(vehicle + 0x6c2, initialIndex); word(vehicle + 0x668, profile.speed + index * 5); put(vehicle + 0x664, (profile.units + index) * U);
    matrix.forEach((value, axis) => word(vehicle + 0xc4 + axis * 2, value)); memory[vehicle + 0x718] = index ? 10 : 8; put(vehicle + 0x6bc, 0); put(vehicle + 0x3d00, index % 3);
    put(record + 0x54, RESOURCE + descriptor.offset); word(record + 0x58, progressIndex); memory[record + 0x1c] = profile.lastLap ? 4 : 1; put(record + 0x24, index * 1000); memory[record + 0x249] = 0;
    memory[REGISTRY + index * 8 + 4] = profile.world && index !== 0 ? 1 : 0;
  }
  for (let index = 6; index < 36; index++) {
    const object = memory.readUInt32LE(REGISTRY + index * 8);
    vector(object + 0x34, at(80 + (index - 6) * 28, (index % 3 - 1) * 20)); memory[REGISTRY + index * 8 + 4] = profile.world ? 1 : 0;
  }
  put(BODY + 0x6ec, profile.policy); memory[BODY + 0x6f1] = profile.skill; memory[BODY + 0x6f0] = profileIndex; put(BODY + 0x6f8, profileIndex * 0x49249); memory[BODY + 0x68c] = profile.item; memory[BODY + 0x68d] = 255;
  memory[BODY + 0x6c9] = 0; memory[BODY + 0x6ca] = 31; memory[BODY + 0x6cb] = profile.closeLateralOpponent ? 0 : 3;
  if (profile.closeLateralOpponent || profile.behindOpponent) {
    const other = BODY + 0x4000;
    vector(other + 0x34, at(profile.behindOpponent ? -60 : 0, profile.behindOpponent ? 20 : 40));
    vector(other + 0x68, direction.map(value => Math.imul(value, profile.units)));
    word(other + 0x668, 300); put(other + 0x664, profile.units * U);
  }
  memory[SESSION + 0x54d] = profile.world ? 6 : 1; memory[SESSION + 0x586] = 4; memory[SESSION + 0x553] = profileIndex & 1; memory[SESSION + 0x58c] = profileIndex % 3; put(SESSION + 0x57c, 4);
  put(0x5ea4d8, profile.difficulty); put(0x90a548, profile.clock);
  put(0x6e6514, profile.world ? 4 : 0);
  const count = profile.world ? 12 : 0; put(0x902024, count); put(0x82e904, count); memory[SCENE + 0xf5] = count;
  const forward = route.reverseByte2 ? -1 : 1;
  for (let index = 0; index < 12; index++) {
    let routeIndex = initialIndex + index * forward;
    routeIndex = route.bytes[4] ? ((routeIndex % route.count) + route.count) % route.count : Math.max(0, Math.min(route.count - 1, routeIndex));
    const position = at(400 + index * 45, index % 2 ? 20 : -20).map(value => value >> 16), object = 0xb0000 + index * 0x200, row = 0xb5000 + index * 20, marker = 0xb6000 + index * 20;
    vector(object + 0x34, position.map(value => value << 16)); word(object + 0x18c, route.index); word(object + 0x18e, routeIndex);
    position.forEach((value, axis) => word(row + 8 + axis * 2, value)); word(row + 16, routeIndex); memory[row + 18] = route.index;
    position.forEach((value, axis) => word(marker + axis * 2, value)); word(marker + 16, routeIndex); memory[marker + 18] = route.index;
  }
  memory[SCENE + 0xf6] = profile.world ? 4 : 0;
  for (let index = 0; index < 4; index++) {
    const event = 0xbd000 + index * 8;
    if (index === 0) put(event, 0); else {word(event, route.index); word(event + 2, Math.max(0, Math.min(route.count - 1, initialIndex + (index - 2) * forward)));}
    memory[event + 4] = index === 0 ? 1 : index % 2 ? 4 : 2; memory[event + 5] = profile.lastLap ? 1 : 0; memory[event + 6] = index === 2 ? 255 : 4;
  }
  return {origin, direction, descriptor, progressGroup, progressIndex};
}

const archive = await RollcageArchive.open(game), archiveIndexSHA256 = hash(archive.indexData);
try {
  for (const entry of archive.entries) {
    if (resources.length >= limit) break; const {data} = await archive.readResource(entry.index);
    if (data.toString('ascii', 0, 4) !== 'GFXM' || !parseCollisionGrid(data).available) continue;
    const routes = parseRespawnRoutes(data), usable = routes.groups.filter(group => group.count > 0), originalHash = hash(data);
    assert(usable.length); assert(RESOURCE + data.length < RECORDS);
    data.copy(memory, RESOURCE); for (const route of routes.groups) {assert.equal(memory.readUInt32LE(RESOURCE + route.offset + 8), route.pointRelativeOffset); put(RESOURCE + route.offset + 8, RESOURCE + route.pointsOffset);}
    const mapped = Buffer.from(memory.subarray(RESOURCE, RESOURCE + data.length)), mappedHash = hash(mapped);
    const resource = {resource: entry.index, bytes: data.length, sha256: originalHash, mappedSHA256: mappedHash, nonemptyGroups: usable.length, scenarios: 0, ordinary: 0, special: 0, fallback: 0, failures: 0};
    for (const route of usable) {
      summary.groups++; summary[route.reverseByte2 ? 'reverseGroups' : 'forwardGroups']++; summary[route.bytes[4] ? 'cyclicGroups' : 'openGroups']++;
      const indices = [...new Set([0, Math.floor(route.count / 2), route.count - 1])];
      for (const initialIndex of indices) for (let profileIndex = 0; profileIndex < profiles.length; profileIndex++) {
        const profile = profiles[profileIndex], detail = {resource: entry.index, route: route.index, count: route.count, initialIndex, profile: profile.name};
        try {
          bases[profileIndex].copy(memory); mapped.copy(memory, RESOURCE); put(0x90b98c, PACK); put(PACK + 0x60, RESOURCE + routes.tableOffset); put(0x9092a0, RESOURCE + routes.tableOffset);
          const scene = setScene(routes, route, initialIndex, profile, profileIndex); const beforePosition = Buffer.from(memory.subarray(BODY + 0x34, BODY + 0x40)), beforeVelocity = Buffer.from(memory.subarray(BODY + 0x68, BODY + 0x74));
          planAutonomousRoute(BODY, {memory, scratchBase: STACK});
          assert(memory.subarray(RESOURCE, RESOURCE + data.length).equals(mapped), 'Mapped authored resource changed.'); assert(memory.subarray(BODY + 0x34, BODY + 0x40).equals(beforePosition), 'Planner moved body.'); assert(memory.subarray(BODY + 0x68, BODY + 0x74).equals(beforeVelocity), 'Planner changed velocity.');
          const lowest = memory.readInt32LE(STACK - 140 + 0x18); assert(lowest >= -1 && lowest <= 19);
          let selected = -1, best = -50000;
          for (let index = 19; index > lowest; index--) {
            const row = 0x91f1e0 + index * 52, group = memory.readUInt16LE(row), type = memory[row + 37], total = (memory.readInt32LE(row + 44) + memory.readInt32LE(row + 48)) | 0;
            assert(type <= 5); candidateTypes[type]++; profileCounts[profile.name].candidateTypes[type]++;
            if (group) {summary.candidateGroups++; if (group !== route.index) summary.authoredLinkedCandidates++; assert(routes.groups[group]?.count > 0); assert(memory[row + 2] < routes.groups[group].count);}
            if (memory[row + 38]) summary.disabledCandidates++;
            if ((group || type) && total > best && !memory[row + 38]) {best = total; selected = index;}
          }
          const fallback = selected === -1; if (fallback) {selected = 19; summary.fallbackSelections++; resource.fallback++; profileCounts[profile.name].fallback++;}
          const chosen = 0x91f1e0 + selected * 52, type = memory[chosen + 37], targetIndex = memory[chosen + 2]; assert.equal(memory[BODY + 0x6c9], type);
          if (type) {
            assert(targetIndex < 20); assert(type <= 5);
            for (let axis = 0; axis < 3; axis++) assert.equal(memory.readInt32LE(BODY + 0x6cc + axis * 4), memory.readInt16LE(0x91f600 + targetIndex * 8 + axis * 2) << 16);
            summary.specialSelections++; resource.special++; profileCounts[profile.name].special++;
          } else {
            const group = memory.readUInt16LE(chosen), selectedGroup = routes.groups[group]; assert(selectedGroup?.count > 0); assert(targetIndex < selectedGroup.count);
            assert.equal(memory.readUInt16LE(BODY + 0x6c0), group); assert.equal(memory.readUInt16LE(BODY + 0x6c2), targetIndex);
            const point = selectedGroup.pointAt(targetIndex), address = RESOURCE + point.offset; assert(memory.subarray(address, address + 16).equals(point.bytes));
            summary.ordinarySelections++; resource.ordinary++; profileCounts[profile.name].ordinary++;
          }
          selectedTypes[type]++; profileCounts[profile.name].selectedTypes[type]++;
          if (memory[0x6e650e]) {summary.populatedBodyLists++; profileCounts[profile.name].bodyLists++;} if (memory.readUInt32LE(0x6e651c)) {summary.populatedObstacleLists++; profileCounts[profile.name].obstacleLists++;}
          if (profile.world) {summary.eventScenarios++; summary.specialSourceScenarios++;}
          if (initialIndex === 0 || initialIndex === route.count - 1) summary.authoredEndpointScenarios++;
          summary.scenarios++; resource.scenarios++; profileCounts[profile.name].scenarios++; summary.sourceAndMappedChecks++;
          if (samples.length < 40 || type && samples.filter(sample => sample.type === type).length < 8) samples.push({...detail, reverseByte2: route.reverseByte2, cyclicByte4: route.bytes[4], progressionDescriptor: scene.descriptor.index, progressionGroup: scene.progressGroup.index, selectedRow: selected, lowestFree: lowest, score: best, fallback, type, selectedGroup: memory.readUInt16LE(BODY + 0x6c0), selectedPoint: memory.readUInt16LE(BODY + 0x6c2), targetSlot: type ? targetIndex : null, targetXYZ: type ? [0, 4, 8].map(offset => memory.readInt32LE(BODY + 0x6cc + offset) >> 16) : null, nearbyBodies: memory[0x6e650e], nearbyObstacles: memory.readUInt32LE(0x6e651c)});
        } catch (error) {resource.failures++; summary.invalidSelections++; if (failures.length < 64) failures.push({...detail, error: error.message, stack: error.stack?.split('\n').slice(0, 5)});}
      }
    }
    assert.equal(hash(data), originalHash); summary.sourceAndMappedChecks++; resources.push(resource); console.log(JSON.stringify({resource: entry.index, packs: resources.length, scenarios: summary.scenarios, failures: summary.invalidSelections}));
  }
  assert.equal(hash(archive.indexData), archiveIndexSHA256);
} finally {await archive.close();}
summary.resources = resources.length;
for (const [name, expected] of Object.entries(sourceHashes)) assert.equal(hash(await readFile('src/' + name)), expected, `Reference source changed during probe:${name}`);
for (const [name, expected] of Object.entries(toolHashes)) assert.equal(hash(await readFile(name)), expected, `Probe dependency changed:${name}`);
if (limit === Infinity && !summary.invalidSelections) assert.equal(summary.resources, 80);
const report = {method: 'Actual planAutonomousRoute421430 default closure, no reached-handler overrides and no original process. Installed Redux GFXM copies preserve authored nonempty route groups, XYZ, flags, packed links, direction and endpoint/cyclic bytes; only group point pointers relocate and runtime pack/progression table pointers publish the mapped table. Six declared synthetic skill/speed/policy/session profiles sample every nonempty group at first/middle/last points. Synthetic runtime/model/body/registry constructors come from createConnectedPlannerFixture, with positions/route associations remapped to actual data. Five populated profiles supply six racers,36 registered bodies,four model-plane obstacles,12 pickup/object/marker associations andfour constructed events; the sparse baseline is explicit. Body/obstacle sampling, costs, modifiers, builder and final selection all use actual source defaults. Every scenario checks immutable mapped bytes, unchanged physical position/velocity and native strict-score/tie/fallback selection; ordinary outputs reference exact installed authored point bytes, special outputs equal the selected candidate target slot. This is authored-data/synthetic-world integration, not captured input,constructor recovery,physics,complete races or behavioral equivalence observed in the executable.', archiveIndexSHA256, referenceSourceSHA256: sourceHashes, probeSourceSHA256: toolHashes, profiles, summary, selectedTypes, candidateTypes, profileCounts, resources, samples, failures};
await writeFile(output, JSON.stringify(report, null, 2), {flag: 'wx'}); console.log(JSON.stringify({...summary, output})); if (summary.invalidSelections) process.exitCode = 1;
