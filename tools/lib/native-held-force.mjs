import {readFile, writeFile, link, unlink, realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createCapturedMemory} from './captured-memory.mjs';
import {traceNativeFrameDispatches} from './native-frame-event-trace.mjs';
import {forceAlongBorderNormal, cloneNativeFrameWithForce} from '../check-native-chassis-border-preflight.mjs';
import {REDUX_SHA256} from '../prepare-native-physics-capture.mjs';

export const heldForceProtocol = 'ROLLCAGE_HELD_FORCE_V1';
export const heldForceBounds = Object.freeze({maxHoldMs: 20000, maxAttempts: 24, maxForce: 0x1000000, maxPendingBytes: 128 * 1024 * 1024});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => {throw Error(`Held force: ${message}`);};
const integer = (v, min, max, label) => {if (!Number.isSafeInteger(v) || v < min || v > max) fail(label); return v;};
const hex = (v, n) => typeof v === 'string' && new RegExp(`^[0-9a-f]{${n * 2}}$`).test(v);
function livePlan(snapshot, baseline, base, memory) {
  const attempts = [];
  for (let participantIndex=0;participantIndex<6;participantIndex++) {
    const bodyAddress = memory.readUInt32LE(base+0x509300+participantIndex*0x30c);
    if ((memory.readUInt32LE(bodyAddress)&511)!==3 || baseline.memory.readUInt32LE(0x909300+participantIndex*0x30c)!==bodyAddress) fail('live participant type/root');
    const body = baseline.views.bodyAt(bodyAddress), count = body.terrainWord15c, pointer = baseline.memory.readUInt32LE(bodyAddress+0x154), seen = new Set();
    integer(count,0,64,'generated candidate bound');
    for(let i=0;i<count;i++) {
      const c=baseline.views.candidateAt(pointer+i*16); if(![6,7].includes(c.type))continue;
      const normalQ16=c.normalQ8.map(v=>v<<8),key=normalQ16.join(','); if(seen.has(key)||seen.size>=4)continue;seen.add(key);
      const sector=baseline.geometry.grid.sectors[c.sector];
      const border={candidateAddress:c.address,candidateHex:c.bytes.toString('hex'),type:c.type,cellId:c.id|0,sector:c.sector,row:c.row,column:c.column,planePoint:sector.vertices[c.vertexBase+c.pointOffset].slice(0,3),normalQ16,
        provenance:'Source-only counterfactual candidate generation from this held actual input and captured geometry; no native counterfactual output observed.'};
      for(const magnitude of [4,16,64])for(const sign of [-1,1]) {
        if(attempts.length===24)return attempts;
        const signedScalarQ16=sign*magnitude*65536;
        attempts.push({index:attempts.length,participantIndex,bodyAddress,border,signedScalarQ16,incrementQ16:forceAlongBorderNormal(normalQ16,signedScalarQ16)});
      }
    }
  }
  return attempts;
}
export function validateHeldForceRequest(request, snapshot) {
  if (request.schemaVersion !== 1 || request.kind !== 'held-chassis-force-input' || request.targetSha256 !== REDUX_SHA256 || !hex(request.token, 16)) fail('request identity');
  integer(request.pid, 1, 0xffffffff, 'PID'); integer(request.tid, 1, 0xffffffff, 'TID');
  if (request.maxHoldMs !== 20000 || request.maxAttempts !== 24 || request.maxPendingBytes !== heldForceBounds.maxPendingBytes) fail('request bounds');
  const base = Number(request.moduleBaseAddress), m = createCapturedMemory([...snapshot.ranges.values()]).memory;
  if (Number(snapshot.registers.eip) !== base + 0x749e0 || snapshot.tid !== request.tid || snapshot.observedDebugEventOrdinal !== request.observedDebugEventOrdinal || snapshot.contextSha256 !== sha(snapshot.context)) fail('actual entry context');
  for (const [name, offset] of [['edi',156],['esi',160],['ebx',164],['edx',168],['ecx',172],['eax',176],['ebp',180],['eip',184],['eflags',192],['esp',196]]) if (snapshot.context.readUInt32LE(offset) !== Number(snapshot.registers[name])) fail(`raw CONTEXT ${name}`);
  const session = m.readUInt32LE(base + 0x1ecb1c), esp = Number(snapshot.registers.esp);
  if (m.readUInt32LE(session + 0x57c) !== 4 || m[session + 0x54d] !== 6 || m.readUInt32LE(esp) !== base + 0x51017 || m.readUInt32LE(base + 0x50a548) !== request.clock) fail('live phase/roster/clock/caller');
  if (snapshot.breakpointId !== 'held-force-pre-input' || snapshot.observedBreakpointId !== 'native-frame-before' || snapshot.capturePhase !== 'held-pre-input-before-original-instruction') fail('pre-input role');
  return {memory: m, base};
}

export async function loadHeldForceRequest(directory) {
  const root = await realpath(directory), raw = await readFile(path.join(root, 'held-force-request.json'));
  if (raw.length > 1024 * 1024) fail('request manifest bound');
  const request = JSON.parse(raw), row = request.snapshot, ranges = new Map();
  let footprint = 716;
  async function blob(file, hash, length) {
    if (typeof file !== 'string' || path.basename(file) !== file || /[\\/]/.test(file)) fail('unsafe blob');
    const resolved = await realpath(path.join(root, file)); if (path.dirname(resolved) !== root) fail('blob escapes output');
    const bytes = await readFile(resolved); if (bytes.length !== length || sha(bytes) !== hash) fail('blob length/hash'); return bytes;
  }
  for (const r of row?.ranges ?? []) {
    if (typeof r.id !== 'string' || ranges.has(r.id)) fail('duplicate range');
    integer(r.length, 1, 64 * 1024 * 1024, 'range length'); footprint += r.length;
    if (footprint > heldForceBounds.maxPendingBytes) fail('snapshot footprint');
    ranges.set(r.id, {...r, bytes: await blob(r.file, r.sha256, r.length)});
  }
  const snapshot = {...row, context: await blob(row.contextFile, row.contextSha256, 716), ranges, moduleBaseAddress: Number(request.moduleBaseAddress)};
  validateHeldForceRequest(request, snapshot);
  return {request, snapshot, requestSha256: sha(raw), directory: root};
}

export function planHeldForceInput(held, {now = () => performance.now(), deadlineMs = 15000} = {}) {
  const started = now(), {request, snapshot} = held;
  integer(deadlineMs, 1, 15000, 'planner deadline'); validateHeldForceRequest(request, snapshot);
  const stack = snapshot.ranges.get('frame-stack'), before = Number(snapshot.registers.esp) - Number(stack?.address);
  if (!Number.isInteger(before) || before < 4096 || before > 65536 || stack.bytes.length !== before + 4) fail('declared stack');
  const options = {stackBytesBefore: before, stackBytesAfter: 4, attachmentWindowBytes: snapshot.ranges.get('attachment-queue')?.length};
  const originals = [...snapshot.ranges.values()].map(r => sha(r.bytes));
  const baseline = traceNativeFrameDispatches(snapshot, options), input = validateHeldForceRequest(request,snapshot), plan = livePlan(snapshot,baseline,input.base,input.memory), attempts = [];
  const report = {schemaVersion: 1, authority: 'source-only-held-input-forecast', token: request.token, requestSha256: held.requestSha256,
    nativeCounterfactualCompared: false, nativeControlledExperimentPerformed: false, baselineComplete: true, options, attempts, selected: null};
  for (const spec of plan) {
    if (now() - started > deadlineMs) fail('offline planner deadline');
    const row = {index: spec.index, participantIndex: spec.participantIndex, sourceComplete: false}; attempts.push(row);
    try {
      const clone = cloneNativeFrameWithForce(snapshot, spec), replay = traceNativeFrameDispatches(clone.snapshot, options);
      row.sourceComplete = true;
      row.events = replay.dispatchEvents.filter(e => e.before.kind === 1 && e.before.object1?.type === 3 && e.before.object1.address === spec.bodyAddress && e.classification.category === 'terrain-border' && ['swept-contact','penetration-contact','sliding-contact'].includes(e.classification.response) && e.classification.matchingPlaneTypes.length && e.classification.matchingPlaneTypes.every(t => t === 6 || t === 7) && e.before.field44 === spec.border.cellId && e.before.normalQ16.every((v,i) => v === spec.border.normalQ16[i]));
      if (row.events.length && (!report.selected || Math.abs(spec.signedScalarQ16) < Math.abs(report.selected.signedScalarQ16))) report.selected = {...spec, inputProof: clone.proof, eventIndices: row.events.map(e => e.index)};
    } catch (error) {row.failure = error.message;}
  }
  if (![...snapshot.ranges.values()].every((r,i) => sha(r.bytes) === originals[i])) fail('original input mutated');
  report.originalInputBytesUnchanged = true; report.elapsedMs = now() - started;
  if (report.elapsedMs > deadlineMs) fail('offline planner deadline');
  return report;
}

export function encodeHeldForceDecision(held, report, reportSha256) {
  validateHeldForceRequest(held.request, held.snapshot);
  if (report.authority !== 'source-only-held-input-forecast' || report.token !== held.request.token || report.requestSha256 !== held.requestSha256 || report.nativeCounterfactualCompared !== false || !report.baselineComplete || !report.originalInputBytesUnchanged || report.elapsedMs > 15000 || !hex(reportSha256,32)) fail('forecast proof identity');
  const s = report.selected;
  if (!s || report.attempts.length > 24 || !report.attempts.some(r => r.index === s.index && r.sourceComplete && r.events?.length && r.events.some(e => s.eventIndices.includes(e.index)))) fail('no complete planned-plane forecast');
  integer(s.participantIndex, 0, 5, 'selected participant');
  const {memory: m, base} = validateHeldForceRequest(held.request, held.snapshot), p = s.inputProof;
  const body = m.readUInt32LE(base + 0x509300 + s.participantIndex * 0x30c), bytes = m.subarray(body, body + 0x3e78);
  if (s.bodyAddress !== body || p.bodyAddress !== body || p.originalBodySha256 !== sha(bytes) || p.originalForceHex !== bytes.subarray(0x74,0x80).toString('hex') || !hex(p.experimentalForceHex,12)) fail('selected body/preimage');
  const next = Buffer.from(p.experimentalForceHex,'hex'), normal = s.border.normalQ16, scalar = s.signedScalarQ16;
  if (!Array.isArray(normal) || normal.length !== 3 || !normal.some(Boolean) || normal.some(v => !Number.isInteger(v) || Math.abs(v) > 65536) || ![4,16,64].some(v => Math.abs(scalar) === v * 65536)) fail('force normal/scalar');
  for (let i=0;i<3;i++) {const delta = Number((BigInt(normal[i]) * BigInt(scalar)) >> 16n), value = bytes.readInt32LE(0x74+i*4) + delta; if (!Number.isSafeInteger(value) || Math.abs(value)>heldForceBounds.maxForce || next.readInt32LE(i*4)!==value) fail('force arithmetic');}
  return [heldForceProtocol,held.request.token,held.requestSha256,String(s.participantIndex),String(body),sha(bytes),p.originalForceHex,p.experimentalForceHex,normal.join(','),String(scalar),reportSha256,''].join('\n');
}

export async function prepareHeldForceDecision(directory) {
  const held = await loadHeldForceRequest(directory), report = planHeldForceInput(held);
  const bytes = Buffer.from(`${JSON.stringify(report,null,2)}\n`);
  await writeFile(path.join(held.directory,'held-force-plan.json'),bytes,{flag:'wx'});
  const decision = encodeHeldForceDecision(held,report,sha(bytes));
  const temporary = path.join(held.directory,'held-force-decision.pending');
  await writeFile(temporary,decision,{flag:'wx'});
  await link(temporary,path.join(held.directory,'held-force-decision.txt'));
  await unlink(temporary);
  return {requestSha256: held.requestSha256, selected: report.selected.index, elapsedMs: report.elapsedMs, sourceOnlyForecast: true};
}
