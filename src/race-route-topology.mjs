import {parseRespawnRoutes} from './respawn-routes.mjs';
import {parseSpatialIndex} from './spatial-index.mjs';
import {inspectRaceLayoutFallback, rebuildRaceLayoutFallback} from './race-layout-spatial.mjs';
import {inspectRaceLayout, raceLayoutMoveConstraint} from './race-layout-editor.mjs';

// 47fc90 has 5-bit group/9-bit point links, but 421260 writes the point
// to candidate row byte +2. 4210b0 and the planner subsequently read that byte.
// 256 is therefore the safe editor bound, rather than the link field's 512.
export const RACE_ROUTE_LIMITS = Object.freeze({groups: 32, usableGroups: 31, pointsPerGroup: 256});
const copy = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const integer = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const identity = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(value);
const fields = (value, required, optional = []) => value && typeof value === 'object' && !Array.isArray(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const fail = message => {throw Error(message);};
const align = n => Math.ceil(n / 4) * 4;
const sourcePointId = (group, point) => `g${group}:p${point}`;
const packedLinks = word => [[word & 31, word >>> 5 & 511], [word >>> 14 & 31, word >>> 19 & 511]];

export function createRaceRouteTopology(data) {
  const routes = parseRespawnRoutes(data);
  return {version: 1, nextId: 1, groups: routes.groups.map(group => ({
    id: `g${group.index}`, sourceGroup: group.index, index: group.index, header: [...group.bytes],
    points: group.points.map((point, index) => {
      const word = point.bytes.readUInt32LE(12);
      return {id: sourcePointId(group.index, index), sourcePoint: index,
        position: [...point.position], minSpeed: point.bytes[6], targetSpeed: point.bytes[7],
        flags: point.bytes.readUInt32LE(8), linkFlags: (word & 0xf0000000) >>> 0,
        // An unused group's point bits are retained, even when its group is 0.
        emptyLinkPoints: packedLinks(word).map(([g, p]) => g ? 0 : p),
        links: packedLinks(word).map(([g, p]) => g ? {groupId: `g${g}`, pointId: sourcePointId(g, p)} : null)};
    })
  }))};
}

// A full topology is optional in legacy projects. Sparse route edits can be
// hydrated onto the stable authored identities before any index insertion.
export function hydrateRaceRouteTopology(data, draft = null, sparseRoutes = []) {
  const topology = draft == null ? createRaceRouteTopology(data) : copy(draft);
  for (const edit of sparseRoutes) {
    const group = topology.groups.find(g => g.sourceGroup === edit.group);
    const point = group?.points.find(p => p.sourcePoint === edit.point);
    if (!point) fail('Sparse route edit references a missing source point.');
    for (const key of ['position', 'minSpeed', 'targetSpeed']) if (edit[key] !== undefined) point[key] = copy(edit[key]);
  }
  const validation = validateRaceRouteTopology(data, topology, {requireConnected: false});
  if (!validation.valid) fail(validation.errors.join(' '));
  return topology;
}

function references(topology) {
  const groups = new Map(), points = new Map();
  for (const [index, group] of topology.groups.entries()) {
    groups.set(group.id, {group, index});
    for (const [point, row] of group.points.entries()) points.set(row.id, {group, index, point, row});
  }
  return {groups, points};
}

export function validateRaceRouteTopology(data, topology, {requireConnected = true, sourceBlockerCountersMayDiffer = false} = {}) {
  const errors = [], warnings = [], error = message => errors.push(message);
  let source;
  try {source = createRaceRouteTopology(data);} catch (e) {return {valid: false, errors: [e.message], warnings};}
  if (!fields(topology, ['version', 'nextId', 'groups']) || topology.version !== 1 || !Array.isArray(topology.groups) || !integer(topology.nextId, 1, Number.MAX_SAFE_INTEGER)) return {valid: false, errors: ['Invalid route topology draft.'], warnings};
  if (topology.groups.length < source.groups.length || topology.groups.length > 32) error('Route topology requires the authored groups and at most 31 usable groups; group 0 is reserved.');
  const ids = new Set(), pointIds = new Set(), sourceGroups = new Set();
  for (const [index, group] of topology.groups.entries()) {
    if (!fields(group, ['id', 'sourceGroup', 'index', 'header', 'points'], ['cloneOfGroupId']) || !identity(group.id) || ids.has(group.id)) {error('Route group fields/identities must be known, bounded and unique.'); continue;}
    ids.add(group.id);
    if (!Array.isArray(group.header) || group.header.length !== 12 || group.header.some(n => !integer(n, 0, 255))) {error(`Route group ${group.id} requires its 12-byte native header.`); continue;}
    if (!Array.isArray(group.points) || group.points.length > 256 || index !== 0 && !group.points?.length && group.sourceGroup === null) {error(`Route group ${group.id} must contain 1 to 256 points (candidate indices are bytes); authored empty groups are preserved.`); continue;}
    if (group.sourceGroup !== null) {
      if (!integer(group.sourceGroup, 0, source.groups.length - 1) || sourceGroups.has(group.sourceGroup)) {error('Authored route group identities cannot be deleted or duplicated.'); continue;}
      if (group.sourceGroup !== index) error('Authored route groups must retain their native order; scenery blocker references use these IDs.');
      sourceGroups.add(group.sourceGroup);
      if (source.groups[group.sourceGroup] && (group.id !== source.groups[group.sourceGroup].id || !equal(group.header, source.groups[group.sourceGroup].header.map((n, i) => sourceBlockerCountersMayDiffer && i === 3 ? group.header[3] : n)))) error('Authored route header metadata and stable identity must be preserved.');
      if (group.cloneOfGroupId !== undefined) error('Authored groups cannot claim clone provenance.');
    }
    if (group.index !== index) error('Route group index must match its stable serialized order.');
    const sourcePoints = new Set();
    for (const point of group.points) {
      if (!fields(point, ['id', 'sourcePoint', 'position', 'minSpeed', 'targetSpeed', 'flags', 'linkFlags', 'emptyLinkPoints', 'links'], ['anchorPointId']) || !identity(point.id) || pointIds.has(point.id)) {error('Route point fields/identities must be known, bounded and globally unique.'); continue;}
      pointIds.add(point.id);
      if (point.sourcePoint !== null) {
        if (group.sourceGroup === null || !integer(point.sourcePoint, 0, (source.groups[group.sourceGroup]?.points.length ?? 0) - 1) || sourcePoints.has(point.sourcePoint)) error('Authored route point identities cannot be deleted or duplicated.');
        sourcePoints.add(point.sourcePoint);
        const authored = source.groups[group.sourceGroup]?.points[point.sourcePoint];
        if (authored && (point.id !== authored.id || point.flags !== authored.flags || point.linkFlags !== authored.linkFlags || !equal(point.emptyLinkPoints, authored.emptyLinkPoints))) error('Authored route point identities and opaque control metadata must be preserved.');
      }
      if (point.sourcePoint === null && !identity(point.anchorPointId)) error('Added route points require a bounded anchor identity.');
      if (!Array.isArray(point.position) || point.position.length !== 3 || point.position.some(n => !integer(n, -32768, 32767))) error(`Route point ${point.id} requires signed 16-bit XYZ.`);
      if (!integer(point.minSpeed, 0, 255) || !integer(point.targetSpeed, 0, 255) || !integer(point.flags, 0, 0xffffffff) || !integer(point.linkFlags, 0, 0xffffffff) || (point.linkFlags >>> 0 & 0x0fffffff)) error(`Route point ${point.id} has invalid native speed/flag values.`);
      if (!Array.isArray(point.emptyLinkPoints) || point.emptyLinkPoints.length !== 2 || point.emptyLinkPoints.some(n => !integer(n, 0, 511))) error(`Route point ${point.id} has invalid unused link bits.`);
      if (!Array.isArray(point.links) || point.links.length !== 2) error(`Route point ${point.id} requires two outgoing link slots.`);
    }
    if (group.sourceGroup !== null && source.groups[group.sourceGroup] && sourcePoints.size !== source.groups[group.sourceGroup].points.length) error('Authored route points cannot be deleted.');
  }
  if (sourceGroups.size !== source.groups.length) error('Authored route groups cannot be deleted.');
  if (!topology.groups[0] || !equal(topology.groups[0], source.groups[0])) error('Route group 0 is reserved and must remain unchanged.');
  if (errors.length) return {valid: false, errors, warnings};
  const {groups, points} = references(topology), edges = new Map(topology.groups.map(g => [g.id, new Set()]));
  for (const group of topology.groups.filter(g => g.sourceGroup === null)) {
    const template = groups.get(group.cloneOfGroupId)?.group;
    if (!template || !template.points.length || template.header[3] || !equal(group.header, template.header.map((n, i) => i === 5 ? group.index : n))) error('Cloned route groups must preserve an unblocked template header and clone provenance.');
    let ancestor = group; const seen = new Set();
    while (ancestor?.sourceGroup === null && !seen.has(ancestor.id)) {seen.add(ancestor.id); ancestor = groups.get(ancestor.cloneOfGroupId)?.group;}
    if (!ancestor || ancestor.sourceGroup === null) error('Route clone provenance must lead to an authored group without cycles.');
    else if (source.groups[ancestor.sourceGroup].header[3]) error('A source route group controlled by scenery blockers cannot be cloned without duplicating its blocker ownership.');
  }
  for (const group of topology.groups) for (const point of group.points.filter(p => p.sourcePoint === null)) {
    const anchor = points.get(point.anchorPointId)?.row;
    if (!anchor || point.flags !== anchor.flags || point.linkFlags !== anchor.linkFlags || !equal(point.emptyLinkPoints, anchor.emptyLinkPoints) && !equal(point.emptyLinkPoints, [0, 0])) error('Added route points must preserve their anchor control metadata.');
  }
  let movementInfo;
  const originalPosition = row => {
    const seen = new Set();
    while (row && !seen.has(row.row.id)) {
      seen.add(row.row.id);
      if (row.group.sourceGroup !== null && row.row.sourcePoint !== null) return source.groups[row.group.sourceGroup].points[row.row.sourcePoint].position;
      row = points.get(row.row.anchorPointId);
    }
    return null;
  };
  for (const group of topology.groups) for (const [index, point] of group.points.entries()) {
    const prior = originalPosition(points.get(point.id));
    if (!prior) error(`New route point ${point.id} must retain its authored/inserted anchor identity.`);
    else if (!equal(prior, point.position)) {
      try {
        movementInfo ??= inspectRaceLayout(data);
        const constraint = raceLayoutMoveConstraint(movementInfo, prior, point.position);
        if (!constraint.allowed) error(`Route point ${point.id}: ${constraint.reason}`);
      } catch (e) {error(e.message);}
    }
    const next = group.points[index + 1] ?? (group.header[4] && group.points.length > 1 ? group.points[0] : null);
    if (next && equal(point.position, next.position)) {
      const before = originalPosition(points.get(next.id));
      if (!prior || !before || !equal(prior, before)) error('Route edit creates coincident adjacent points with no usable direction.');
    }
  }
  for (const group of topology.groups) for (const point of group.points) for (const link of point.links) {
    if (link === null) continue;
    const target = points.get(link?.pointId);
    if (!fields(link, ['groupId', 'pointId']) || !identity(link.groupId) || !identity(link.pointId) || !target || target.group.id !== link.groupId || target.index === 0 || !groups.has(link.groupId)) error(`Route point ${point.id} links to a missing/reserved route point.`);
    else edges.get(group.id).add(link.groupId);
  }
  const originals = topology.groups.filter(g => g.sourceGroup !== null && g.sourceGroup !== 0).map(g => g.id);
  const reaches = (start, predicate) => {
    const seen = new Set(), queue = [start];
    while (queue.length) {const id = queue.pop(); if (seen.has(id)) continue; seen.add(id); if (predicate(id)) return true; queue.push(...edges.get(id));}
    return false;
  };
  for (const group of topology.groups.filter(g => g.sourceGroup === null)) {
    const incoming = originals.some(id => reaches(id, other => other === group.id));
    const outgoing = reaches(group.id, id => originals.includes(id));
    if (!incoming || !outgoing) (requireConnected ? errors : warnings).push(`New route group ${group.id} needs an entry from and an exit to the authored network before Test/export.`);
  }
  return {valid: !errors.length, errors, warnings};
}

function fresh(topology, prefix) {
  const ids = new Set(topology.groups.flatMap(g => [g.id, ...g.points.map(p => p.id)]));
  let id; do {id = `${prefix}${topology.nextId++}`;} while (ids.has(id)); return id;
}

export function cloneRaceRouteGroup(input, groupId) {
  const topology = copy(input), group = topology.groups.find(g => g.id === groupId);
  if (!group || group === topology.groups[0]) fail('Choose an existing usable route group to clone.');
  if (!group.points.length) fail('Authored empty route groups cannot be cloned; choose a group containing points.');
  if (group.header[3]) fail('This group is controlled by scenery blockers. Cloning its blocker ownership is not yet supported.');
  if (topology.groups.length >= 32) fail('All 31 usable native route groups are occupied.');
  const clone = copy(group), pointIds = new Map(); clone.id = fresh(topology, 'new-group-'); clone.sourceGroup = null; clone.index = topology.groups.length; clone.cloneOfGroupId = group.id;
  for (const point of clone.points) {const oldId = point.id; point.id = fresh(topology, 'new-point-'); pointIds.set(oldId, point.id); point.sourcePoint = null; point.anchorPointId = oldId;}
  for (const point of clone.points) point.links = point.links.map(link => link?.groupId === groupId ? {groupId: clone.id, pointId: pointIds.get(link.pointId)} : link);
  // 47fc20/410bd0 and 47f5c0 consume this identity through progression +54.
  clone.header[5] = clone.index;
  topology.groups.push(clone);
  return {topology, groupId: clone.id, pointIds: Object.fromEntries(pointIds)};
}

export function insertRaceRoutePoint(input, groupId, pointId, {side = 'after', position} = {}) {
  const topology = copy(input), group = topology.groups.find(g => g.id === groupId), index = group?.points.findIndex(p => p.id === pointId);
  if (!group || group === topology.groups[0] || index < 0) fail('Choose an existing usable route point to extend.');
  if (group.points.length >= 256) fail('A route group is limited to 256 points because native candidate indices are bytes.');
  if (!['before', 'after'].includes(side)) fail('Route insertion side must be before or after.');
  const point = copy(group.points[index]); point.id = fresh(topology, 'new-point-'); point.sourcePoint = null;
  point.anchorPointId = pointId;
  point.position = position ? [...position] : point.position.map((n, axis) => {
    const neighbor = group.points[index + (side === 'after' ? 1 : -1)] ?? (group.header[4] ? group.points[side === 'after' ? 0 : group.points.length - 1] : null);
    return neighbor ? Math.round((n + neighbor.position[axis]) / 2) : n;
  });
  // Insertion adds sequential traversal, rather than duplicating a branch.
  point.links = [null, null]; point.emptyLinkPoints = [0, 0];
  if (group.points.some(p => equal(p.position, point.position))) fail('Choose a distinct position for the inserted route point.');
  group.points.splice(index + (side === 'after' ? 1 : 0), 0, point);
  return {topology, pointId: point.id};
}

export function connectRaceRoutePoints(input, fromPointId, slot, toPointId, {replace = false} = {}) {
  const topology = copy(input), {points} = references(topology), from = points.get(fromPointId), to = points.get(toPointId);
  if (!integer(slot, 0, 1) || !from || !to || !from.index || !to.index) fail('Route connection requires usable source/target points and slot 0 or 1.');
  const link = {groupId: to.group.id, pointId: to.row.id}, occupied = from.row.links[slot];
  if (occupied && !equal(occupied, link) && !replace) fail('Outgoing route link slot is occupied. Choose an empty slot or explicitly replace it.');
  from.row.links[slot] = link;
  return topology;
}

function encode(topology, original) {
  const {points} = references(topology);
  return topology.groups.map((group, index) => {
    const header = Buffer.from(group.header); header.writeUInt16LE(group.points.length); if (index && group.points.length) header[5] = index;
    // Earlier scenery compilation can increment/descrement this live blocker
    // counter. A topology project stores the baseline header, not that result.
    if (group.sourceGroup !== null) header[3] = original.groups[group.sourceGroup].bytes[3];
    const records = group.points.map(point => {
      const bytes = Buffer.alloc(16); point.position.forEach((n, axis) => bytes.writeInt16LE(n, axis * 2)); bytes[6] = point.minSpeed; bytes[7] = point.targetSpeed; bytes.writeUInt32LE(point.flags, 8);
      let word = point.linkFlags >>> 0;
      for (const [slot, link] of point.links.entries()) {
        const target = link && points.get(link.pointId), bits = target ? target.index | target.point << 5 : point.emptyLinkPoints[slot] << 5;
        word = (word | bits << (slot * 14)) >>> 0;
      }
      bytes.writeUInt32LE(word, 12); return bytes;
    });
    return {header, records};
  });
}

export function compileRaceRouteTopology(source, topology, {requireConnected = true} = {}) {
  const validation = validateRaceRouteTopology(source, topology, {requireConnected, sourceBlockerCountersMayDiffer: true});
  if (!validation.valid) fail(validation.errors.join(' '));
  const original = parseRespawnRoutes(source), encoded = encode(topology, original), {points} = references(topology), remap = {groups: {}, points: {}, ids: {}};
  for (const [index, group] of topology.groups.entries()) {
    if (group.sourceGroup !== null) remap.groups[group.sourceGroup] = index;
    for (const [point, row] of group.points.entries()) {
      remap.ids[row.id] = {group: index, point};
      if (group.sourceGroup !== null && row.sourcePoint !== null) remap.points[`${group.sourceGroup}:${row.sourcePoint}`] = {group: index, point};
    }
  }
  const unchanged = original.groups.length === encoded.length && original.groups.every((group, index) => {
    const header = Buffer.from(encoded[index].header); header.writeUInt32LE(group.pointRelativeOffset, 8);
    return group.bytes.equals(header) && group.points.length === encoded[index].records.length && group.points.every((p, i) => p.bytes.equals(encoded[index].records[i]));
  });
  if (unchanged) return {data: Buffer.from(source), remap, changed: false, warnings: validation.warnings};
  const table = align(source.length), pointBase = align(table + encoded.length * 12), size = encoded.reduce((n, g) => n + g.records.length * 16, pointBase);
  if (size > 128 * 1024 * 1024) fail('Route topology resource exceeds 128 MiB.');
  let out = Buffer.alloc(size); out.set(source); out[0x79] = encoded.length; out.writeUInt32LE(table, 0x8c); out.writeUInt32LE(pointBase, 0x98);
  let cursor = pointBase;
  const baselineGroups = [], baselineRoutes = [];
  for (const [index, group] of topology.groups.entries()) {
    const raw = encoded[index]; raw.header.writeUInt32LE(cursor - pointBase, 8); out.set(raw.header, table + index * 12);
    const baseline = {index, count: group.points.length, points: []}; baselineGroups.push(baseline);
    for (const [point, row] of group.points.entries()) {
      out.set(raw.records[point], cursor);
      const originalPoint = group.sourceGroup !== null && row.sourcePoint !== null ? original.groups[group.sourceGroup].points[row.sourcePoint] : null;
      const anchor = points.get(row.anchorPointId)?.row;
      const position = originalPoint?.position ?? anchor?.position ?? row.position;
      const entry = {group: index, point, offset: cursor, position: [...position]}; baseline.points.push(entry); baselineRoutes.push(entry); cursor += 16;
    }
  }
  // Rebuild complete fallback+model sequences, since starts may alias another
  // sequence's model word. Rewriting a first word in place could corrupt it.
  let spatial = parseSpatialIndex(source), fallback = inspectRaceLayoutFallback(source, spatial, original.groups);
  const changedFallback = fallback.nodes.some(row => {const ref = remap.points[`${row.group}:${row.point}`]; return ref.group !== row.group || ref.point !== row.point;});
  if (changedFallback) {
    const words = [], starts = [], sequences = new Map();
    for (const row of fallback.nodes) {
      const ref = remap.points[`${row.group}:${row.point}`], values = [(ref.group * 65536 + ref.point) >>> 0, ...row.models], key = values.join(',');
      let start = sequences.get(key); if (start === undefined) {start = words.length; sequences.set(key, start); words.push(...values);}
      if (start > 1023 || words.length > 65535) fail('Route remapping exceeds native shared fallback/model-link capacity.'); starts.push(start);
    }
    const offset = align(out.length);
    if (offset + words.length * 4 > 128 * 1024 * 1024) fail('Route fallback resource exceeds 128 MiB.');
    const expanded = Buffer.alloc(offset + words.length * 4); expanded.set(out); words.forEach((word, index) => expanded.writeUInt32LE(word, offset + index * 4));
    expanded.writeUInt32LE(offset, 0xac); expanded.writeUInt16LE(words.length, 0x96);
    for (const [index, start] of starts.entries()) expanded.writeUInt32LE(((spatial.nodes[index].boundsWord & 0x3fffff) | start << 22) >>> 0, spatial.nodes[index].offset);
    out = expanded;
  }
  spatial = parseSpatialIndex(out); fallback = inspectRaceLayoutFallback(out, spatial, baselineGroups);
  const result = rebuildRaceLayoutFallback(out, out, {groups: baselineGroups, routes: baselineRoutes, spatial, fallback});
  return {data: result.data, remap, changed: true, warnings: validation.warnings, changedFallbackNodes: result.changedNodes};
}
