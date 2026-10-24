// Authored pickup table: GFXM +90h DWORD offset, +94h BYTE count,
// 12-byte records (44c2b0 publishes this byte to runtime pack+36h).
// The editor changes signed source XYZ only. Bytes 6..11 always come from
// the immutable source record, including when a pickup is duplicated.
export const PICKUP_EDITOR_LIMIT = 16;
export const PICKUP_EDITOR_LEVELS = Object.freeze(Array.from({length: 20}, (_, i) => i + 1).filter(n => ![15, 16, 17].includes(n)));

function bytes(data) {
  if (!Buffer.isBuffer(data) || data.length < 0x98 || data.toString('ascii', 0, 4) !== 'GFXM') throw new Error('Invalid pickup GFXM resource.');
}
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`Invalid ${label}.`);
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) throw new Error(`Unexpected or missing ${label} fields.`);
}
function position(value) {
  if (!Array.isArray(value) || value.length !== 3 || Array.from(value).some(n => !Number.isInteger(n) || n < -32768 || n > 32767)) throw new RangeError('Pickup position requires three signed i16 source coordinates.');
  return [...value];
}
function draftRows(pickups, templateCount) {
  if (!Array.isArray(pickups) || pickups.length > PICKUP_EDITOR_LIMIT) throw new RangeError('Pickup draft count must be 0..16.');
  const ids = new Set();
  return Array.from(pickups, row => {
    object(row, ['id', 'templateIndex', 'position'], 'pickup');
    if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(row.id) || ids.has(row.id)) throw new Error('Invalid or duplicate pickup id.');
    ids.add(row.id);
    if (!Number.isInteger(row.templateIndex) || row.templateIndex < 0 || row.templateIndex >= templateCount) throw new RangeError('Invalid original pickup template index.');
    return {id: row.id, templateIndex: row.templateIndex, position: position(row.position)};
  });
}

export function parsePickupPlacements(data) {
  bytes(data);
  const offset = data.readUInt32LE(0x90), count = data[0x94];
  if (count && (offset < 0x98 || offset + count * 12 > data.length)) throw new RangeError('Pickup table exceeds resource bounds.');
  return {offset, count, records: Array.from({length: count}, (_, index) => {
    const p = offset + index * 12;
    return {index, position: [0, 2, 4].map(n => data.readInt16LE(p + n)), raw: Buffer.from(data.subarray(p, p + 12))};
  })};
}

export function createPickupDraft(data) {
  const source = parsePickupPlacements(data);
  return validatePickupDraft(data, source.records.map(row => ({id: `original-${row.index}`, templateIndex: row.index, position: row.position})));
}

export function validatePickupDraft(data, pickups) {
  return draftRows(pickups, parsePickupPlacements(data).count);
}

export function compilePickupEdits(data, pickups) {
  const source = parsePickupPlacements(data), rows = draftRows(pickups, source.count);
  const unchanged = rows.length === source.count && rows.every((row, i) =>
    row.position.every((n, axis) => n === source.records[i].position[axis]) &&
    source.records[row.templateIndex].raw.subarray(6).every((n, j) => n === source.records[i].raw[6 + j]));
  if (unchanged) return Buffer.from(data);
  const offset = Math.ceil(data.length / 4) * 4;
  if (offset + rows.length * 12 >= 0x80000000) throw new RangeError('Edited resource exceeds native signed offset range.');
  const output = Buffer.alloc(rows.length ? offset + rows.length * 12 : data.length);
  output.set(data);
  output[0x94] = rows.length;
  if (rows.length) {
    output.writeUInt32LE(offset, 0x90);
    rows.forEach((row, index) => {
      const p = offset + index * 12;
      output.set(source.records[row.templateIndex].raw, p);
      row.position.forEach((n, axis) => output.writeInt16LE(n, p + axis * 2));
    });
  }
  return output;
}

function hashes(value) {
  object(value, ['LOW', 'HIGH'], 'source hashes');
  for (const hash of Object.values(value)) if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) throw new Error('Invalid SHA-256 hash.');
  return {...value};
}

export function parsePickupProject(value) {
  const project = typeof value === 'string' ? JSON.parse(value) : value;
  object(project, ['schemaVersion', 'game', 'indexSha256', 'levels'], 'pickup project');
  if (project.schemaVersion !== 1 || project.game !== 'rollcage' || typeof project.indexSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(project.indexSha256)) throw new Error('Unsupported pickup project or index hash.');
  if (!Array.isArray(project.levels) || project.levels.length > PICKUP_EDITOR_LEVELS.length) throw new Error('Invalid project levels.');
  const seen = new Set();
  const levels = Array.from(project.levels, row => {
    object(row, ['level', 'sourceHashes', 'pickups'], 'project level');
    if (!PICKUP_EDITOR_LEVELS.includes(row.level) || seen.has(row.level)) throw new Error('Unsupported or duplicate project level.');
    seen.add(row.level);
    // A project cannot prove a template exists without its original resource.
    const pickups = draftRows(row.pickups, 255);
    return {level: row.level, sourceHashes: hashes(row.sourceHashes), pickups};
  });
  return {schemaVersion: 1, game: 'rollcage', indexSha256: project.indexSha256, levels};
}

export function createPickupProject({indexSha256, levels}) {
  return parsePickupProject({schemaVersion: 1, game: 'rollcage', indexSha256, levels});
}

export function validatePickupSourcePair(lowData, highData) {
  const low = parsePickupPlacements(lowData), high = parsePickupPlacements(highData);
  if (low.count !== high.count || low.records.some((row, i) => row.position.some((n, axis) => n !== high.records[i].position[axis]))) throw new Error('LOW/HIGH original pickup tables differ in count or coordinates.');
  return {low, high};
}

// Source hashes here are caller-computed digests of the immutable original bytes.
// Parsing a project alone never grants permission to compile unknown templates.
export function validatePickupProject(value, sources) {
  const project = parsePickupProject(value);
  if (!sources || sources.indexSha256 !== project.indexSha256 || !Array.isArray(sources.levels)) throw new Error('Project archive index hash mismatch.');
  for (const row of project.levels) {
    const matches = sources.levels.filter(source => source.level === row.level);
    if (matches.length !== 1) throw new Error('Project original level source is missing or ambiguous.');
    const source = matches[0];
    if (row.sourceHashes.LOW !== source.sourceHashes?.LOW || row.sourceHashes.HIGH !== source.sourceHashes?.HIGH) throw new Error('Project level source hash mismatch.');
    validatePickupSourcePair(source.lowData, source.highData);
    validatePickupDraft(source.lowData, row.pickups);
    validatePickupDraft(source.highData, row.pickups);
  }
  return project;
}

export async function pickupSha256(data) {
  if (!(data instanceof Uint8Array)) throw new TypeError('SHA-256 requires bytes.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}
