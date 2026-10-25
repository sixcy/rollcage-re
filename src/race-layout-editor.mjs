import {parseRespawnRoutes} from './respawn-routes.mjs';
import {parseCheckpointProgression} from './respawn-progress.mjs';
import {parseSpatialIndex} from './spatial-index.mjs';
import {parseScene} from './scene.mjs';
import {parseCollisionGrid} from './collision-grid.mjs';
import {findRaceLayoutTerrainSupport, findRaceLayoutCheckpointSector, inspectRaceLayoutFallback, rebuildRaceLayoutFallback} from './race-layout-spatial.mjs';

// Existing-record editor, not the original offline route-map builder. Native
// anchors: 44c2b0 relocation, 41dbb0 starts, 449d40 checkpoint planes, 431750
// target speed, 421430 minimum-speed screening and 48da10 spatial fallback.
export const emptyRaceLayoutDraft = () => ({routes: [], checkpoints: [], starts: []});
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const vector = value => Array.isArray(value) && value.length === 3
  && value.every(n => Number.isInteger(n) && n >= -32768 && n <= 32767);
const equal = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);
const empty = draft => exact(draft, ['routes', 'checkpoints', 'starts'])
  && ['routes', 'checkpoints', 'starts'].every(k => Array.isArray(draft[k]) && !draft[k].length);
const coordinates = (data, offset) => [0, 2, 4].map(n => data.readInt16LE(offset + n));
const byte = value => Number.isInteger(value) && value >= 0 && value <= 255;

export function inspectRaceLayout(data) {
  if (!Buffer.isBuffer(data) || data.length < 0x120 || data.toString('ascii', 0, 4) !== 'GFXM') throw Error('Invalid GFXM race-layout header.');
  const parsedRoutes = parseRespawnRoutes(data), parsedCheckpoints = parseCheckpointProgression(data);
  const spatial = parseSpatialIndex(data), scene = parseScene(data), startsOffset = data.readUInt32LE(0x74), startCount = data[0x78];
  if (startsOffset + startCount * 8 > data.length) throw Error('Race starting-grid table exceeds resource bounds.');
  const routes = [], groups = parsedRoutes.groups.map(group => {
    const points = group.points.map((point, index) => {
      const row = {group: group.index, point: index, offset: point.offset, position: [...point.position],
        minSpeed: data[point.offset + 6], targetSpeed: data[point.offset + 7],
        flags: data.readUInt32LE(point.offset + 8), links: data.readUInt32LE(point.offset + 12)};
      routes.push(row); return row;
    });
    return {index: group.index, count: group.count, offset: group.offset, reverse: Boolean(group.reverseByte2),
      cyclic: Boolean(data[group.offset + 4]), points};
  });
  const ids = [...new Set([...parsedCheckpoints.checkpointIds90].filter(id => id !== 255))].sort((a, b) => a - b);
  const checkpoints = ids.map(id => {
    const offset = parsedCheckpoints.checkpointsOffset + id * 20;
    return {id, offset, sector: data[offset], order: data[offset + 1], progress: data.readUInt16LE(offset + 2),
      position: coordinates(data, offset + 4), direction: coordinates(data, offset + 12), lapMarker: Boolean(data[offset + 18] & 1)};
  });
  const starts = Array.from({length: startCount}, (_, index) => {
    const offset = startsOffset + index * 8;
    return {index, offset, position: coordinates(data, offset)};
  });
  const grid = parseCollisionGrid(data), fallback = inspectRaceLayoutFallback(data, spatial, groups);
  return {groups, routes, checkpoints, starts, spatial, scene, grid, fallback, checkpointCount: parsedCheckpoints.checkpointCount44,
    checkpointIds: [...parsedCheckpoints.checkpointIds90], startsOffset,
    limits: ['Existing records only; route order, graph links and checkpoint IDs stay unchanged.',
      'Position edits require populated spatial coverage and nearby covered terrain. Route movement rebuilds native fallback references with an explicit offline editor policy.',
      'Checkpoint anchors define infinite planes; sectors follow covered plane intersections. Start orientation comes from the first checkpoint, not a per-start yaw.']};
}

export function createRaceLayoutDraft(data) {
  const info = inspectRaceLayout(data);
  return {routes: info.routes.map(({group, point, position, minSpeed, targetSpeed}) => ({group, point, position: [...position], minSpeed, targetSpeed})),
    checkpoints: info.checkpoints.map(({id, position, direction}) => ({id, position: [...position], direction: [...direction]})),
    starts: info.starts.map(({index, position}) => ({index, position: [...position]}))};
}

export function raceLayoutMoveConstraint(info, originalPosition, position) {
  if (!vector(originalPosition) || !vector(position)) return {allowed: false, reason: 'Positions require three signed 16-bit integer coordinates.'};
  if (equal(originalPosition, position)) return {allowed: true, unchanged: true};
  if (!info.spatial.available) return {allowed: false, reason: 'Position editing requires a populated native spatial map.'};
  const original = info.spatial.lookup(originalPosition.map(n => n * 65536)), destination = info.spatial.lookup(position.map(n => n * 65536));
  const reference = value => value.found ? {node: value.node.index, row: value.selected.row, column: value.selected.column, outside: value.outside} : null;
  const details = {originalBucket: reference(original), destinationBucket: reference(destination)};
  if (!destination.found || destination.outside) return {allowed: false, ...details, reason: 'Destination has no populated native spatial cell. Place the marker over existing supported terrain.'};
  if (!info.fallback.nodes[destination.node.index]) return {allowed: false, ...details, reason: 'Destination has no readable authored route fallback.'};
  const support = findRaceLayoutTerrainSupport(info, position, destination), prior = findRaceLayoutTerrainSupport(info, originalPosition, original);
  // Preserve unusually elevated original checkpoint/route clearance while
  // rejecting arbitrarily distant or buried destinations. This is editor
  // geometry policy, not a native vehicle collision/radius constant.
  const maximumDistance = Math.max(256, prior ? Math.sqrt(prior.distanceSquared) + 64 : 256);
  if (!support || support.distanceSquared > maximumDistance * maximumDistance) return {allowed: false, ...details, reason: 'Destination is too far from covered terrain in its native height layer. Keep the marker near an existing road surface.'};
  return {allowed: true, ...details, supportSector: support.sector, supportCell: support.cell, terrainDistance: Math.sqrt(support.distanceSquared), maximumDistance};
}

export function raceLayoutCheckpointConstraint(info, original, next) {
  if (!vector(next.position) || !vector(next.direction) || next.direction.every(n => n === 0)) return {allowed: false, reason: 'Checkpoint planes require signed 16-bit coordinates and a nonzero signed 16-bit direction.'};
  const unchanged = equal(original.position, next.position) && equal(original.direction, next.direction);
  const support = findRaceLayoutCheckpointSector(info, original.sector, next.position, next.direction);
  if (!support) return unchanged ? {allowed: true, unchanged: true, supportSector: original.sector, intersectionPoint: null, intersectionSegments: []}
    : {allowed: false, reason: 'Checkpoint plane does not intersect covered terrain. Move or rotate the plane so it crosses an existing road.'};
  return {allowed: true, unchanged, supportSector: support.sector, supportCell: support.cell, intersectionPoint: support.point,
    intersectionSegments: support.segments, anchorDistance: Math.sqrt(support.distanceSquared)};
}

export function validateRaceLayoutDraft(data, draft = emptyRaceLayoutDraft(), info = inspectRaceLayout(data)) {
  if (!exact(draft, ['routes', 'checkpoints', 'starts']) || !['routes', 'checkpoints', 'starts'].every(k => Array.isArray(draft[k]))) throw Error('Invalid race-layout draft.');
  const routes = new Map(info.routes.map(row => [`${row.group}:${row.point}`, row])), checkpoints = new Map(info.checkpoints.map(row => [row.id, row])), starts = new Map(info.starts.map(row => [row.index, row]));
  const checked = emptyRaceLayoutDraft(), seen = new Set();
  const movement = (original, row) => {
    const constraint = raceLayoutMoveConstraint(info, original.position, row.position);
    if (!constraint.allowed) throw Error(constraint.reason);
  };
  for (const row of draft.routes) {
    if (!exact(row, ['group', 'point', 'position', 'minSpeed', 'targetSpeed']) || !Number.isInteger(row.group) || !Number.isInteger(row.point)
      || !vector(row.position) || !byte(row.minSpeed) || !byte(row.targetSpeed)) throw Error('Route edits require an existing point, signed 16-bit XYZ and unsigned byte speeds.');
    const id = `${row.group}:${row.point}`, original = routes.get(id);
    if (!original || seen.has(id)) throw Error('Missing or duplicate route point.'); seen.add(id); movement(original, row);
    checked.routes.push({...row, position: [...row.position]});
  }
  seen.clear();
  for (const row of draft.checkpoints) {
    if (!exact(row, ['id', 'position', 'direction']) || !Number.isInteger(row.id) || !vector(row.position) || !vector(row.direction) || row.direction.every(n => n === 0)) throw Error('Checkpoint edits require an existing ID, signed 16-bit XYZ and a nonzero signed 16-bit direction.');
    const original = checkpoints.get(row.id);
    if (!original || seen.has(row.id)) throw Error('Missing or duplicate checkpoint.'); seen.add(row.id);
    const constraint = raceLayoutCheckpointConstraint(info, original, row); if (!constraint.allowed) throw Error(constraint.reason);
    checked.checkpoints.push({...row, position: [...row.position], direction: [...row.direction]});
  }
  seen.clear();
  for (const row of draft.starts) {
    if (!exact(row, ['index', 'position']) || !Number.isInteger(row.index) || !vector(row.position)) throw Error('Start edits require an existing grid slot and signed 16-bit XYZ.');
    const original = starts.get(row.index);
    if (!original || seen.has(row.index)) throw Error('Missing or duplicate starting-grid slot.'); seen.add(row.index); movement(original, row);
    checked.starts.push({...row, position: [...row.position]});
  }
  // New coincident adjacent route points can make 491d80/4915e0 normalize a
  // zero direction. Existing authored duplicates, if any, remain readable.
  const edited = new Map(checked.routes.map(row => [`${row.group}:${row.point}`, row]));
  for (const group of info.groups) for (let i = 0; i < group.count; i++) {
    const next = i + 1 < group.count ? i + 1 : group.cyclic && group.count > 1 ? 0 : null;
    if (next === null) continue;
    const a = edited.get(`${group.index}:${i}`) ?? group.points[i], b = edited.get(`${group.index}:${next}`) ?? group.points[next];
    if (equal(a.position, b.position) && !equal(group.points[i].position, group.points[next].position)) throw Error('Route edit creates coincident adjacent points with no usable direction.');
  }
  checked.routes.sort((a, b) => a.group - b.group || a.point - b.point);
  checked.checkpoints.sort((a, b) => a.id - b.id); checked.starts.sort((a, b) => a.index - b.index);
  return checked;
}

export function compileRaceLayoutEdits(source, draft = emptyRaceLayoutDraft()) {
  if (empty(draft)) return Buffer.from(source);
  const info = inspectRaceLayout(source), checked = validateRaceLayoutDraft(source, draft, info), writes = new Map();
  const put = (offset, bytes) => {
    for (let i = 0; i < bytes.length; i++) {
      if (writes.has(offset + i) && writes.get(offset + i) !== bytes[i]) throw Error('Aliased race-layout records have conflicting edits.');
      writes.set(offset + i, bytes[i]);
    }
  };
  const xyz = position => {const bytes = Buffer.alloc(6); position.forEach((n, i) => bytes.writeInt16LE(n, i * 2)); return bytes;};
  for (const row of checked.routes) {
    const original = info.groups[row.group].points[row.point];
    put(original.offset, xyz(row.position)); put(original.offset + 6, Buffer.from([row.minSpeed, row.targetSpeed]));
  }
  for (const row of checked.checkpoints) {
    const original = info.checkpoints.find(c => c.id === row.id);
    put(original.offset + 4, xyz(row.position)); put(original.offset + 12, xyz(row.direction));
    if (!equal(original.position, row.position) || !equal(original.direction, row.direction)) put(original.offset, Buffer.from([raceLayoutCheckpointConstraint(info, original, row).supportSector]));
  }
  for (const row of checked.starts) put(info.starts[row.index].offset, xyz(row.position));
  const out = Buffer.from(source); for (const [offset, value] of writes) out[offset] = value;
  return rebuildRaceLayoutFallback(source, out, info).data;
}
