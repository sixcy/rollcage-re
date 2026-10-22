import {createHash} from 'node:crypto';
import {readFile, realpath} from 'node:fs/promises';
import path from 'node:path';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const integer = (value, name) => {if (!Number.isSafeInteger(value) || value < 0) throw Error(`Invalid ${name}.`); return value;};
const sizes = {u8: 1, s8: 1, u16: 2, s16: 2, u32: 4, s32: 4, f32: 4, f64: 8, pointer: 4};
const readers = {u8: 'readUInt8', s8: 'readInt8', u16: 'readUInt16LE', s16: 'readInt16LE', u32: 'readUInt32LE', s32: 'readInt32LE', f32: 'readFloatLE', f64: 'readDoubleLE', pointer: 'readUInt32LE'};

// Validate immutable original-process blobs before any reconstruction comparison.
// This does not infer pointers, silently omit unreadable fields, or establish cadence.
export async function loadPhysicsCapture(directory, {expectedSha256} = {}) {
  const root = await realpath(directory);
  const records = (await readFile(path.join(root, 'trace.jsonl'), 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
  const header = records[0];
  if (header?.type !== 'capture' || header.schemaVersion !== 1 || !/^[0-9a-f]{64}$/i.test(header.executableSha256)) throw Error('Expected version 1 capture identity.');
  if (expectedSha256 && expectedSha256.toLowerCase() !== header.executableSha256.toLowerCase()) throw Error('Capture target hash differs.');
  if (records.some(row => row.type === 'capture-error' || row.type === 'fatal-exception')) throw Error('Capture contains a failed observation.');
  const complete = records.filter(row => row.type === 'complete');
  if (complete.length !== 1) throw Error('Capture must contain exactly one completion record.');
  const blob = async (file, sha256, length) => {
    if (typeof file !== 'string' || path.basename(file) !== file || file.includes('\\') || file === '.' || file === '..') throw Error('Capture blob must be a direct child filename.');
    const resolved = await realpath(path.join(root, file));
    if (path.dirname(resolved) !== root) throw Error('Capture blob escapes its directory.');
    const bytes = await readFile(resolved);
    if (length !== undefined && bytes.length !== integer(length, 'blob length')) throw Error(`Capture blob length differs: ${file}`);
    if (digest(bytes) !== sha256) throw Error(`Capture blob hash differs: ${file}`);
    return bytes;
  };
  const snapshots = [], keys = new Set();
  for (const row of records.filter(row => row.type === 'snapshot')) {
    const key = `${row.breakpointId}:${row.hit}`;
    if (row.ordinal !== snapshots.length + 1 || typeof row.breakpointId !== 'string' || !Number.isSafeInteger(row.hit) || row.hit < 1 || keys.has(key)) throw Error('Capture snapshot order or identity is invalid.');
    keys.add(key);
    const ranges = new Map();
    for (const range of row.ranges) {
      if (typeof range.id !== 'string' || ranges.has(range.id)) throw Error('Capture range identities must be unique per snapshot.');
      ranges.set(range.id, {...range, bytes: await blob(range.file, range.sha256, range.length)});
    }
    snapshots.push({...row, context: await blob(row.contextFile, row.contextSha256, 716), ranges});
  }
  if (!snapshots.length || complete[0].snapshots !== snapshots.length) throw Error('Capture snapshot count differs or no state was observed.');
  return {header, complete: complete[0], snapshots, interventions: records.filter(row => /intervention$/.test(row.type) || row.type === 'service-memory-write')};
}

function value(snapshot, field) {
  const range = snapshot.ranges.get(field.range);
  if (!range) throw Error(`Missing captured range: ${field.range}`);
  const offset = integer(field.offset, 'field offset'), length = field.type === 'bytes' ? integer(field.length, 'byte field length') : sizes[field.type];
  if (!length || offset + length > range.bytes.length) throw Error(`Field exceeds captured range: ${field.name}`);
  const bytes = range.bytes.subarray(offset, offset + length);
  return {bytes, value: field.type === 'bytes' ? bytes.toString('hex') : range.bytes[readers[field.type]](offset)};
}

function pointerIdentity(value, regions) {
  if (value === 0) return 'null';
  const found = regions.filter(region => {
    integer(region.address, 'pointer region address'); integer(region.length, 'pointer region length');
    return value >= region.address && value - region.address < region.length;
  });
  if (found.length !== 1 || !found[0].id) throw Error('Pointer must resolve to exactly one explicitly named region.');
  return `${found[0].id}+${value - found[0].address}`;
}

// Fields are an explicit comparison policy, chosen before seeing divergence.
// Byte/integer/floating fields are exact unless a floating tolerance is declared.
export function comparePhysicsCaptures(reference, candidate, fields, {referencePointers = [], candidatePointers = []} = {}) {
  if (!Array.isArray(fields) || !fields.length) throw Error('An explicit nonempty comparison field policy is required.');
  if (reference.header.executableSha256 !== candidate.header.executableSha256) throw Error('Cannot compare different target identities.');
  const names = new Set();
  for (const field of fields) {
    if (!field.name || names.has(field.name) || (!sizes[field.type] && field.type !== 'bytes')) throw Error('Comparison fields need unique names and supported types.');
    names.add(field.name);
    if (field.absoluteTolerance !== undefined && (!['f32', 'f64'].includes(field.type) || !Number.isFinite(field.absoluteTolerance) || field.absoluteTolerance < 0 || !field.toleranceReason)) throw Error('Floating tolerance requires a finite nonnegative bound and evidence reason.');
  }
  let compared = 0;
  const mismatch = (stage, detail) => ({matched: false, comparedFields: compared, firstDivergence: {snapshot: stage + 1, ...detail}});
  for (let index = 0; index < Math.max(reference.snapshots.length, candidate.snapshots.length); index++) {
    const left = reference.snapshots[index], right = candidate.snapshots[index];
    if (!left || !right) return mismatch(index, {kind: 'missing-stage', reference: left?.breakpointId ?? null, candidate: right?.breakpointId ?? null});
    if (left.breakpointId !== right.breakpointId || left.hit !== right.hit) return mismatch(index, {kind: 'stage-order', reference: {stage: left.breakpointId, hit: left.hit}, candidate: {stage: right.breakpointId, hit: right.hit}});
    for (const field of fields) {
      if (field.stage && field.stage !== left.breakpointId) continue;
      const a = value(left, field), b = value(right, field);
      let equal = a.bytes.equals(b.bytes), av = a.value, bv = b.value;
      if (field.type === 'pointer') {av = pointerIdentity(av, referencePointers); bv = pointerIdentity(bv, candidatePointers); equal = av === bv;}
      else if (field.absoluteTolerance !== undefined && !equal) equal = Number.isFinite(av) && Number.isFinite(bv) && Math.abs(av - bv) <= field.absoluteTolerance;
      compared++;
      if (!equal) return mismatch(index, {kind: 'field', stage: left.breakpointId, hit: left.hit, field: field.name, range: field.range, offset: field.offset, reference: av, candidate: bv, referenceBytes: a.bytes.toString('hex'), candidateBytes: b.bytes.toString('hex')});
    }
  }
  if (!compared) throw Error('Comparison policy selected no captured fields.');
  return {matched: true, snapshots: reference.snapshots.length, comparedFields: compared, firstDivergence: null, scope: 'Only declared fields and stages; no wall-clock or whole-physics equivalence implied.'};
}
