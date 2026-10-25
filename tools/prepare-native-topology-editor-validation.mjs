// New isolated native loader/construction fixture. Never launches the game.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile, rename, stat, copyFile, constants} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {prepareNativePhysicsCapture} from './prepare-native-physics-capture.mjs';
import {createNativePickupEditorValidationConfig, writePickupArchiveParts} from './prepare-native-pickup-editor-validation.mjs';
import {buildNativeSceneryObservation} from './lib/native-scenery-editor-fixture.mjs';
import {RollcageArchive} from '../src/archive.mjs';
import {buildEditedArchive} from '../src/archive-write.mjs';
import {getGame} from '../src/track-games.mjs';
import {createSceneryDraft, inspectScenery, instantiateSceneryAssembly, compileSceneryEdits} from '../src/scenery-editor.mjs';
import {inspectRaceLayout} from '../src/race-layout-editor.mjs';
import {createRaceRouteTopology, insertRaceRoutePoint, cloneRaceRouteGroup, connectRaceRoutePoints, compileRaceRouteTopology} from '../src/race-route-topology.mjs';
import {createCheckpointTopologyDraft, insertCheckpointAfter, setFinishCheckpoint, setCheckpointTimingMarker, compileCheckpointTopology} from '../src/checkpoint-topology.mjs';
import {parseRespawnRoutes} from '../src/respawn-routes.mjs';
import {parseCheckpointProgression} from '../src/respawn-progress.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {parseModelCollision, readPlacementCollision} from '../src/model-collision.mjs';

const [output, quality = 'LOW', installation = 'analysis/pickup-editor-native-baseline-20261024/installation'] = process.argv.slice(2);
if (!output || !['LOW', 'HIGH'].includes(quality)) throw Error('Usage: node tools/prepare-native-topology-editor-validation.mjs NEW_DIRECTORY LOW|HIGH [PRISTINE_INSTALLATION]');
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), root = path.resolve(output), game = getGame('rollcage'), level = 1;
const archive = await RollcageArchive.open(path.resolve(installation)), pair = {}, compiled = {};
try {
  for (const q of ['LOW', 'HIGH']) {
    const track = game.tracks.find(t => t.name === `${q}/LEV1.BLP`);
    pair[q] = {geometry: (await archive.readResource(track.index)).data, texture: (await archive.readResource(track.textureIndex)).data};
  }
  const original = createSceneryDraft(pair.LOW.geometry, pair.LOW.texture, level), sceneInfo = inspectScenery(pair.LOW.geometry, pair.LOW.texture);
  const scripted = sceneInfo.find(p => p.kind === 'animated' && p.bodyType === 25 && p.linkedIndices.length === 1 && p.editable), particle = sceneInfo.find(p => p.kind === 'particle' && p.bodyType === 2);
  assert.ok(scripted && particle);
  const anchor = original.find(p => p.id === 'original-31'), sceneryByQuality = {};
  let command;
  for (const shift of [[512, -1, 0], [-512, -1, 0], [0, -1, 512], [0, -1, -512], [1024, -1, 0], [0, -1, 1024], [0, -1, 0]]) {
    const proposed = instantiateSceneryAssembly(pair.LOW, 31, {id: 'native-clone', level, position: anchor.position.map((n, axis) => n + shift[axis]), yaw: anchor.yaw}).command;
    try {
      for (const q of ['LOW', 'HIGH']) sceneryByQuality[q] = compileSceneryEdits(pair[q], original, {level, quality: q, assemblies: [proposed]});
      command = proposed; break;
    } catch (error) {if (!/7 static models/.test(error.message)) throw error;}
  }
  assert.ok(command, 'A bounded static-model cell supports the native assembly fixture.');
  let routes = createRaceRouteTopology(pair.LOW.geometry);
  const sourceGroup = routes.groups.find((g, i) => i > 0 && !g.header[3] && g.points.length > 1), first = sourceGroup.points[0], position = [...first.position]; position[0]++;
  const inserted = insertRaceRoutePoint(routes, sourceGroup.id, first.id, {position}), cloned = cloneRaceRouteGroup(inserted.topology, sourceGroup.id);
  routes = connectRaceRoutePoints(cloned.topology, first.id, 1, cloned.pointIds[first.id], {replace: true});
  routes = connectRaceRoutePoints(routes, cloned.pointIds[first.id], 1, first.id, {replace: true});
  let checkpoints = createCheckpointTopologyDraft(pair.LOW.geometry);
  const initialCheckpoint = checkpoints.checkpoints[0], timingBefore = initialCheckpoint.planes[0].timingMarker;
  checkpoints = insertCheckpointAfter(pair.LOW.geometry, checkpoints, initialCheckpoint.id, {level});
  const added = checkpoints.checkpoints[1];
  for (const plane of added.planes) if (plane) plane.position[0]++;
  checkpoints = setCheckpointTimingMarker(checkpoints, initialCheckpoint.id, !timingBefore);
  checkpoints = setFinishCheckpoint(checkpoints, checkpoints.checkpoints[2].id);
  for (const q of ['LOW', 'HIGH']) {
    const scenery = sceneryByQuality[q];
    const checkpoint = compileCheckpointTopology(scenery.geometry, checkpoints, {level}), route = compileRaceRouteTopology(checkpoint.data, routes);
    compiled[q] = {...scenery, geometry: route.data, routeRemap: route.remap};
  }
  const selected = compiled[quality], selectedAssembly = selected.assemblies[0], indices = [...selectedAssembly.sourceMemberIndices, ...selectedAssembly.memberIndices];
  assert.deepEqual(selectedAssembly.sourceMemberIndices, [31, 32]); assert.equal(indices.length, 4);
  const observed = buildNativeSceneryObservation(selected.geometry, selected.texture, indices.map(index => ({index})), {allowedClasses: [0]});
  const gfxm = parseGFXM(selected.geometry), placements = parsePlacements(selected.texture, gfxm.models), scriptPlacement = placements.records[scripted.index], particlePlacement = placements.records[particle.index], layout = inspectRaceLayout(selected.geometry);
  Object.assign(observed, {scriptPlacementIndex: scripted.index, scriptBodyType: 25, scriptModelOffset: gfxm.models[scripted.modelIndex].offset, scriptIndex: scriptPlacement.raw[38], spawnIndex: scriptPlacement.raw[39], scriptPosition: scriptPlacement.position,
    particlePlacementIndex: particle.index, particleType: 2, particlePosition: particlePlacement.position, startPositions: layout.starts.map(p => p.position), startsOffset: layout.startsOffset});
  for (const expected of observed.placements) {
    const placement = placements.records[expected.index], collision = parseModelCollision(selected.geometry, gfxm.models[placement.modelIndex]), settings = readPlacementCollision(selected.geometry, placement, collision);
    const chain = selectedAssembly.sourceMemberIndices.includes(expected.index) ? selectedAssembly.sourceMemberIndices : selectedAssembly.memberIndices, at = chain.indexOf(expected.index);
    Object.assign(expected, {configurationBytes: settings.configurations.length * 4, groupId: placement.raw.readUInt16LE(6), previousIndex: chain[at - 1] ?? -1, nextIndex: chain[at + 1] ?? -1,
      attachmentCount: Array.from({length: 5}, (_, slot) => placement.raw.readUInt16LE(46 + slot * 2)).filter(handle => handle >>> 12).length});
  }
  const nativeRoutes = parseRespawnRoutes(selected.geometry), nativeCheckpoints = parseCheckpointProgression(selected.geometry), cpIds = nativeCheckpoints.checkpointIds90, planeCount = Math.max(...[...cpIds].filter(id => id !== 255)) + 1;
  const block = (id, group) => ({id: `topology-points-${id}`, offset: group.pointsOffset, length: group.count * 16, expectedHex: selected.geometry.subarray(group.pointsOffset, group.pointsOffset + group.count * 16).toString('hex')});
  const topologyObservation = {routeCount: nativeRoutes.groups.length, routeTableOffset: nativeRoutes.tableOffset, pointBaseOffset: nativeRoutes.pointBaseOffset,
    routeHeadersHex: selected.geometry.subarray(nativeRoutes.tableOffset, nativeRoutes.tableOffset + nativeRoutes.groups.length * 12).toString('hex'),
    pointSpans: [block('extended', nativeRoutes.groups[sourceGroup.index]), block('cloned', nativeRoutes.groups.at(-1))],
    checkpointCount: nativeCheckpoints.checkpointCount44, checkpointOffset: nativeCheckpoints.checkpointsOffset, checkpointIdsOffset: selected.geometry.readUInt32LE(0xbc),
    checkpointRecordsHex: selected.geometry.subarray(nativeCheckpoints.checkpointsOffset, nativeCheckpoints.checkpointsOffset + planeCount * 20).toString('hex'), checkpointIdsHex: cpIds.toString('hex')};
  await prepareNativePhysicsCapture(path.resolve(installation), root); await mkdir(path.join(root, 'original-archives'));
  for (const ext of ['img', 'idx']) await rename(path.join(root, `installation/IDXData/Rollcage.${ext}`), path.join(root, `original-archives/Rollcage.${ext}`));
  const replacements = new Map(); for (const q of ['LOW', 'HIGH']) {const track = game.tracks.find(t => t.name === `${q}/LEV1.BLP`); replacements.set(track.index, compiled[q].geometry); replacements.set(track.textureIndex, compiled[q].texture);}
  const image = path.join(root, 'original-archives/Rollcage.img'), plan = buildEditedArchive(archive.indexData, (await stat(image)).size, replacements);
  const written = await writePickupArchiveParts(image, path.join(root, 'installation/IDXData/Rollcage.img'), plan);
  await writeFile(path.join(root, 'installation/IDXData/Rollcage.idx'), plan.index, {flag: 'wx'});
  const config = createNativePickupEditorValidationConfig(root, {kind: 'baseline', quality, compiledData: selected.geometry, indexSha256: sha(plan.index), imageSha256: written.sha256, frontendLevel: level});
  config.sceneryEditorObservation = observed; config.topologyEditorObservation = topologyObservation;
  config.breakpoints.push({id: 'pickup-scenery-world', rva: '0x4d120', ranges: []}, {id: 'pickup-scenery-contact', rva: '0x25e2b', ranges: []}, {id: 'pickup-scripted-built', rva: '0x4cc5b', ranges: []}, {id: 'pickup-particle-two-built', rva: '0x4cff1', ranges: []}, {id: 'pickup-particle-thirteen-built', rva: '0x4d078', ranges: []}, {id: 'pickup-car-spawned', rva: '0x1dc96', ranges: []});
  await writeFile(path.join(root, 'scenery-capture-config.json'), JSON.stringify(config, null, 2) + '\n', {flag: 'wx'});
  const expected = {profile: 'topology-assembly', nativePurpose: 'existing-track-editor-original-validation', quality, level, models: original, assemblyCommand: command, assembly: selectedAssembly, routes, checkpoints,
    changes: {insertedRoutePoint: inserted.pointId, clonedRouteGroup: cloned.groupId, newCheckpoint: added.id, finishCheckpoint: checkpoints.checkpoints[0].id, toggledTimingCheckpoint: initialCheckpoint.id, special: 31, scripted: scripted.index, particle: particle.index, start: 0},
    probe: observed, topologyProbe: topologyObservation, sourceHashes: Object.fromEntries(['LOW', 'HIGH'].map(q => [q, {geometry: sha(pair[q].geometry), texture: sha(pair[q].texture)}])), resourceSha256: sha(selected.geometry), textureSha256: sha(selected.texture),
    scope: 'Native rebuilt route/checkpoint table relocation and metadata, explicit finish ordering/timing flags, original31/32 and duplicated assembly chain/configuration/particle identities, constructors and first pickup tick only. Actual lap/timing transitions, natural destruction and speed-pad contact require the separate lifecycle profile.'};
  await writeFile(path.join(root, 'scenery-expected.json'), JSON.stringify(expected, null, 2) + '\n', {flag: 'wx'});
  await copyFile('tools/lib/topology-editor-native-debugger.cs', path.join(root, 'observer-source.cs'), constants.COPYFILE_EXCL);
  await copyFile('tools/native-topology-editor-capture.ps1', path.join(root, 'observer-wrapper.ps1'), constants.COPYFILE_EXCL);
  console.log(JSON.stringify({root, quality, level, sourceMembers: selectedAssembly.sourceMemberIndices, clonedMembers: selectedAssembly.memberIndices, routes: topologyObservation.routeCount, checkpoints: topologyObservation.checkpointCount, spans: observed.spans.length, pointBytes: topologyObservation.pointSpans.reduce((n, s) => n + s.length, 0), gameExecuted: false}));
} finally {await archive.close();}
