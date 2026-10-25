import {inspectRaceLayout, raceLayoutCheckpointConstraint} from './race-layout-editor.mjs';
import {parseCheckpointProgression} from './respawn-progress.mjs';

// 44c2b0 publishes header95/a0/bc; 449d40 consumes lane0 and order, while
// 44a2e0 searches all four lanes. 417210/449cd0 also consume plane directions.
// IDs in this draft are editor identities, never serialized native addresses.
const clone = value => structuredClone(value);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const identity = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(value);
const vector = value => Array.isArray(value) && value.length === 3 && value.every(n => Number.isInteger(n) && n >= -32768 && n <= 32767);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const shape = value => value.checkpoints.map(row => ({id: row.id, planes: row.planes.map(plane => plane && {id: plane.id, sourceId: plane.sourceId})}));

export function createCheckpointTopologyDraft(data, legacySparseEdits = []) {
  const info = inspectRaceLayout(data), byId = new Map(info.checkpoints.map(row => [row.id, row]));
  const edits = new Map();
  for (const row of legacySparseEdits) {
    if (!exact(row, ['id', 'position', 'direction']) || !byId.has(row.id) || edits.has(row.id)) throw Error('Invalid legacy checkpoint edit.');
    edits.set(row.id, row);
  }
  const checkpoints = Array.from({length: info.checkpointCount}, (_, order) => ({id: `checkpoint-${order}`,
    planes: info.checkpointIds.slice(order * 4, order * 4 + 4).map(id => {
      if (id === 255) return null;
      const source = byId.get(id), row = edits.get(id) ?? source;
      return {id: `plane-${id}`, sourceId: id, position: [...row.position], direction: [...row.direction], timingMarker: source.lapMarker};
    })}));
  const draft = {checkpoints};
  if (legacySparseEdits.length) validateCheckpointTopologyDraft(data, draft, {info});
  return draft;
}

export function validateCheckpointTopologyDraft(data, draft, {info = inspectRaceLayout(data), level} = {}) {
  if (!exact(draft, ['checkpoints']) || !Array.isArray(draft.checkpoints) || draft.checkpoints.length < 2 || draft.checkpoints.length > 255) throw Error('Checkpoint topology requires 2–255 logical checkpoints.');
  const source = new Map(info.checkpoints.map(row => [row.id, row])), logicalIds = new Set(), planeIds = new Map();
  const checked = clone(draft), constraints = new Map(), originalOwner = new Map();
  for (let order = 0; order < info.checkpointCount; order++) for (const id of info.checkpointIds.slice(order * 4, order * 4 + 4)) if (id !== 255) originalOwner.set(`plane-${id}`, `checkpoint-${order}`);
  for (const checkpoint of checked.checkpoints) {
    if (!exact(checkpoint, ['id', 'planes']) || !identity(checkpoint.id) || logicalIds.has(checkpoint.id)
      || !Array.isArray(checkpoint.planes) || checkpoint.planes.length !== 4 || checkpoint.planes[0] === null) throw Error('Checkpoints require a unique editor ID and four plane lanes with a primary plane.');
    logicalIds.add(checkpoint.id);
    for (const plane of checkpoint.planes) {
      if (plane === null) continue;
      if (!exact(plane, ['id', 'sourceId', 'position', 'direction', 'timingMarker']) || !identity(plane.id)
        || !Number.isInteger(plane.sourceId) || !source.has(plane.sourceId) || !vector(plane.position) || !vector(plane.direction)
        || plane.direction.every(n => n === 0) || typeof plane.timingMarker !== 'boolean') throw Error('Checkpoint planes require a valid source template, editor ID, signed 16-bit vectors and timing marker.');
      const prior = planeIds.get(plane.id);
      if (prior && (prior.checkpoint !== checkpoint.id || !same(prior.plane, plane))) throw Error('A checkpoint plane cannot belong to different logical checkpoints or disagree across alternative lanes.');
      if (!prior) {
        const original = source.get(plane.sourceId), constraint = raceLayoutCheckpointConstraint(info, original, plane);
        // New planes cannot inherit the untouched-original exception for planes
        // outside covered terrain: they must actually cross the covered road.
        const isOriginal = plane.id === `plane-${plane.sourceId}` && originalOwner.get(plane.id) === checkpoint.id;
        if (!constraint.allowed || (!isOriginal && !constraint.intersectionPoint)) throw Error(constraint.reason ?? 'New checkpoint plane must intersect covered terrain.');
        constraints.set(plane.id, constraint); planeIds.set(plane.id, {checkpoint: checkpoint.id, plane});
      }
    }
  }
  if (planeIds.size > 255) throw Error('At most 255 native checkpoint planes are supported; native ID 255 is reserved.');
  if ([12, 13].includes(level) && !same(shape(checked), shape(createCheckpointTopologyDraft(data)))) throw Error(`LEV${level} checkpoint topology is locked: native 44a1c0 hardcodes checkpoint stages for terrain direction. Moving planes and toggling timing markers remain supported.`);
  return {draft: checked, info, constraints};
}

export function insertCheckpointAfter(data, draft, selectedId, {id, level} = {}) {
  const next = clone(draft), index = next.checkpoints.findIndex(row => row.id === selectedId);
  if (index < 0) throw Error('Selected checkpoint is missing.');
  const ids = new Set(next.checkpoints.map(row => row.id));
  if (id === undefined) {let n = 1; do {id = `added-checkpoint-${n++}`;} while (ids.has(id));}
  if (!identity(id) || ids.has(id)) throw Error('New checkpoint requires a unique editor ID.');
  const copied = clone(next.checkpoints[index]), planeIds = new Map(); copied.id = id;
  copied.planes = copied.planes.map((plane, lane) => {
    if (!plane) return null;
    if (planeIds.has(plane.id)) return clone(planeIds.get(plane.id));
    const row = {...plane, id: `${id}-plane-${lane}`, timingMarker: false}; planeIds.set(plane.id, row); return row;
  });
  next.checkpoints.splice(index + 1, 0, copied);
  return validateCheckpointTopologyDraft(data, next, {level}).draft;
}

export function removeCheckpoint(draft, id) {
  const next = clone(draft), index = next.checkpoints.findIndex(row => row.id === id);
  if (index < 0) throw Error('Selected checkpoint is missing.');
  if (next.checkpoints.length <= 2) throw Error('At least two logical checkpoints must remain.');
  // Removing slot0 naturally chooses the next remaining checkpoint as finish.
  next.checkpoints.splice(index, 1); return next;
}

export function setFinishCheckpoint(draft, id) {
  const next = clone(draft), index = next.checkpoints.findIndex(row => row.id === id);
  if (index < 0) throw Error('Selected checkpoint is missing.');
  next.checkpoints = [...next.checkpoints.slice(index), ...next.checkpoints.slice(0, index)]; return next;
}

export function setCheckpointTimingMarker(draft, id, enabled) {
  if (typeof enabled !== 'boolean') throw Error('Timing marker requires a boolean.');
  const next = clone(draft), row = next.checkpoints.find(row => row.id === id);
  if (!row) throw Error('Selected checkpoint is missing.');
  for (const plane of row.planes) if (plane) plane.timingMarker = enabled;
  return next;
}

export function compileCheckpointTopology(data, draft = createCheckpointTopologyDraft(data), {level} = {}) {
  const {draft: checked, info, constraints} = validateCheckpointTopologyDraft(data, draft, {level}), baseline = createCheckpointTopologyDraft(data);
  const topologyChanged = !same(shape(checked), shape(baseline)), changed = !same(checked, baseline);
  const startingGridDirection = [...checked.checkpoints[0].planes[0].direction];
  if (!changed) return {data: Buffer.from(data), draft: checked, info, changed: false, topologyChanged: false, startingGridDirection};
  const parsed = parseCheckpointProgression(data), planes = new Map(), nativeIds = new Map(), bySource = new Map(info.checkpoints.map(row => [row.id, row]));
  for (const checkpoint of checked.checkpoints) for (const plane of checkpoint.planes) if (plane && !planes.has(plane.id)) {nativeIds.set(plane.id, topologyChanged ? planes.size : plane.sourceId); planes.set(plane.id, plane);}
  const ids = Buffer.alloc(checked.checkpoints.length * 4, 255), records = topologyChanged ? Buffer.alloc(planes.size * 20) : Buffer.from(data.subarray(parsed.checkpointsOffset, parsed.checkpointsOffset + (Math.max(...nativeIds.values()) + 1) * 20));
  checked.checkpoints.forEach((checkpoint, order) => checkpoint.planes.forEach((plane, lane) => {
    if (!plane) return;
    const nativeId = nativeIds.get(plane.id), offset = nativeId * 20, original = bySource.get(plane.sourceId);
    ids[order * 4 + lane] = nativeId;
    data.copy(records, offset, original.offset, original.offset + 20);
    if (topologyChanged) {records[offset + 1] = order; records.writeUInt16LE(Math.floor(order * 65536 / checked.checkpoints.length), offset + 2);}
    const originalIdentity = baseline.checkpoints.find(row => row.id === checkpoint.id)?.planes.some(row => row?.id === plane.id && row.sourceId === plane.sourceId);
    if (!originalIdentity || !same(plane.position, original.position) || !same(plane.direction, original.direction)) records[offset] = constraints.get(plane.id).supportSector;
    plane.position.forEach((n, axis) => records.writeInt16LE(n, offset + 4 + axis * 2));
    plane.direction.forEach((n, axis) => records.writeInt16LE(n, offset + 12 + axis * 2));
    records[offset + 18] = (records[offset + 18] & 0xfe) | Number(plane.timingMarker);
  }));
  let output;
  if (topologyChanged) {
    const recordsOffset = (data.length + 3) & ~3, idsOffset = recordsOffset + records.length;
    output = Buffer.alloc(idsOffset + ids.length); data.copy(output); records.copy(output, recordsOffset); ids.copy(output, idsOffset);
    output[0x95] = checked.checkpoints.length; output.writeUInt32LE(recordsOffset, 0xa0); output.writeUInt32LE(idsOffset, 0xbc);
  } else {output = Buffer.from(data); records.copy(output, parsed.checkpointsOffset);}
  return {data: output, draft: checked, info: inspectRaceLayout(output), changed, topologyChanged, startingGridDirection,
    nativeIds: Object.fromEntries(nativeIds), progressPolicy: topologyChanged ? 'equal-logical-intervals' : 'preserved-authored'};
}
