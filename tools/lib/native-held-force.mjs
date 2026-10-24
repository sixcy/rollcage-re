import {readFile, writeFile, link, unlink, realpath, lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createCapturedMemory} from './captured-memory.mjs';
import {traceNativeFrameDispatches} from './native-frame-event-trace.mjs';
import {forceAlongBorderNormal, cloneNativeFrameWithForce} from '../check-native-chassis-border-preflight.mjs';
import {REDUX_SHA256} from '../prepare-native-physics-capture.mjs';
import {verifyNativeEventFrameConfiguration} from '../check-native-event-frame-replay.mjs';
import {bindCapturedNativeThreadEnvironment} from './native-frame-sound.mjs';
import {createReduxCaptureConfig} from './redux-capture-config.mjs';
import {validateControlledRaceSettingsConfiguration} from './native-controlled-race-settings.mjs';
import {verifyContainedRangeStorage,verifyHeldRangeStorageDiagnostic,loadContainedRangeBlobs} from './native-held-range-storage.mjs';
import {isDeepStrictEqual} from 'node:util';

export const heldForceProtocol = 'ROLLCAGE_HELD_FORCE_V1';
export const heldForceBounds = Object.freeze({maxHoldMs: 20000, maxAttempts: 24, maxForce: 0x1000000, maxPendingBytes: 128 * 1024 * 1024});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const completedForecasts = new WeakMap();
const fail = message => {throw Error(`Held force: ${message}`);};
const integer = (v, min, max, label) => {if (!Number.isSafeInteger(v) || v < min || v > max) fail(label); return v;};
const hex = (v, n) => typeof v === 'string' && new RegExp(`^[0-9a-f]{${n * 2}}$`).test(v);
function bankVectorDescriptor(r) {
  return r.id==='active-sound-bank-storage'&&Number(r.rva)===0x2f2414&&r.vectorStorage===true&&r.maxVectorBytes===65536&&!r.address&&!r.baseRegister&&!(r.dereferenceOffsets?.length)&&Number(r.offset??0)===0&&Number(r.length??0)===0&&!r.readableRegion&&Number(r.maxRegionBytes??0)===0&&!r.dereferenceMinimumValues;
}
export function validateHeldBankVector(snapshot,base) {
  const r=snapshot.ranges.get('active-sound-bank-storage');if(!r)return null;
  const header=snapshot.ranges.get('sound-owner-vector-roots'),address=base+0x2f2414;
  if(!header||Number(header.address)!==address||header.bytes.length!==12||Number(r.vectorHeaderAddress)!==address||Number(r.requestedResolvedRoot)!==address||r.vectorHeaderHex!==header.bytes.toString('hex')||r.rangeMode!=='vector-storage'||r.maxVectorBytes!==65536)fail('bank vector independent header proof');
  const [begin,end,capacity]=[0,4,8].map(o=>header.bytes.readUInt32LE(o));
  if(begin===0&&(end!==0||capacity!==0)||begin>end||end>capacity||begin%4||(end-begin)%4||(capacity-begin)%4||capacity-begin>65536||Number(r.address)!==begin||r.length!==capacity-begin||r.bytes.length!==r.length||Number(r.vectorBegin)!==begin||Number(r.vectorEnd)!==end||Number(r.vectorCapacity)!==capacity)fail('bank vector header/order/capacity/storage');
  return {headerAddress:address,begin,end,capacity,storageBytes:r.length};
}
export function validateHeldForceConfiguration(o) {
  if(o.controlledRaceSettings) {
    validateControlledRaceSettingsConfiguration(o);
    if(o.heldForceInput?.shareContainedRanges!==undefined&&typeof o.heldForceInput.shareContainedRanges!=='boolean')fail('contained sharing flag must be explicit boolean');
    const heldForceInput={...o.heldForceInput};delete heldForceInput.shareContainedRanges;
    const legacy={...o,heldForceInput,maxSnapshots:70,breakpoints:o.breakpoints.slice(0,-1)};delete legacy.controlledRaceSettings;
    return validateHeldForceConfiguration(legacy);
  }
  const p=o.heldForceInput,f=o.pendingFrameObserver;
  if(!p||Object.keys(p).filter(k=>k!=='shareContainedRanges').sort().join(',')!=='breakpointId,maxHoldMs'||p.shareContainedRanges!==undefined&&p.shareContainedRanges!==false||p.breakpointId!=='native-frame-before'||p.maxHoldMs!==20000||o.maxDurationMs!==90000||o.maxSnapshots!==70||o.maxEvents!==1000000||o.captureThreadEnvironment!==true||o.observationActivation||o.ownedWorkerObservation||o.ownedWorkerGainPair||o.ownedWorkerGainWindow||!f||f.maxCandidateFrames!==1||f.maxEventSnapshots!==64||f.maxPendingBytes!==heldForceBounds.maxPendingBytes)fail('configuration policy/bounds');
  verifyNativeEventFrameConfiguration(o);
  const startup=createReduxCaptureConfig('policy-only','hidden-idle','unused-policy-output');
  if(JSON.stringify(o.breakpoints.map(b=>b.id))!==JSON.stringify([...startup.breakpoints.slice(0,3).map(b=>b.id),'native-frame-before','native-frame-after','native-dispatch-entry'])||JSON.stringify(o.breakpoints.slice(0,3))!==JSON.stringify(startup.breakpoints.slice(0,3))||JSON.stringify(o.phaseActions)!==JSON.stringify(startup.phaseActions))fail('exact startup/site/write whitelist');
  const before=o.breakpoints.find(b=>b.id==='native-frame-before'),after=o.breakpoints.find(b=>b.id==='native-frame-after'),event=o.breakpoints.find(b=>b.id==='native-dispatch-entry');
  if(Number(before?.rva)!==0x749e0||Number(after?.rva)!==0x74b1e||before.stopAfterHits>0||after.stopAfterHits!==1||before.skipMatchingHits!==after.skipMatchingHits||!Number.isInteger(before.skipMatchingHits)||before.skipMatchingHits<0||event.captureWhen)fail('configuration entry/return');
  for(const b of [before,after]) {
    const g=b.captureWhen,s=b.ranges.find(r=>r.id==='frame-stack');
    if(g?.equalsBytesHex!=='04000000'||Number(g.range?.rva)!==0x1ecb1c||JSON.stringify(g.range.dereferenceOffsets)!=='["0"]'||Number(g.range.offset)!==0x57c||g.range.length!==4||g.range.address||g.range.baseRegister||g.range.readableRegion)fail('configuration phase guard');
    if(s?.baseRegister!=='esp'||Number(s.offset)!==-4096||s.length!==4100||s.readableRegion||s.address||s.rva||s.dereferenceOffsets?.length)fail('configuration stack');
    const banks=b.ranges.filter(r=>['active-sound-bank-storage','active-sound-bank-region'].includes(r.id));
    if(banks.length!==1)fail('exactly one sound-bank transport');
    if(banks[0].id==='active-sound-bank-storage'&&!bankVectorDescriptor(banks[0]))fail('exact sound-bank vector descriptor');
    if(banks[0].id==='active-sound-bank-region'&&(Number(banks[0].rva)!==0x2f2414||banks[0].readableRegion!==true||banks[0].maxRegionBytes!==67108864||JSON.stringify(banks[0].dereferenceOffsets)!=='["0"]'||banks[0].vectorStorage))fail('legacy bank transport descriptor');
    for(const r of [...(o.ranges??[]),...b.ranges])if(r.dereferenceMinimumValues||r.vectorStorage&&!bankVectorDescriptor(r))fail('held profile forbids other vectors/guarded transports');
  }
  for(const [id,root,length] of [['dispatch-candidate-arena',0x51e788,0x8000],['dispatch-body-header',null,0x180]]) {
    const r=event.ranges.find(r=>r.id===id);
    if(!r||r.length!==length||r.readableRegion||r.vectorStorage||r.dereferenceMinimumValues||Number(r.offset??0)!==0||r.address||(root===null?(r.baseRegister!=='ecx'||r.rva||JSON.stringify(r.dereferenceOffsets)!=='["4"]'):(Number(r.rva)!==root||r.baseRegister||JSON.stringify(r.dereferenceOffsets)!=='["0"]')))fail('configuration dispatcher/candidate input');
  }
  if(o.phaseActions?.some(a=>['native-frame-before','native-frame-after','native-dispatch-entry'].includes(a.breakpointId)))fail('configuration observer writes');
  return true;
}
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
  integer(request.clock,0,0xffffffff,'clock'); integer(request.observedDebugEventOrdinal,1,0x7fffffff,'debug ordinal');
  if (request.maxHoldMs !== 20000 || request.maxAttempts !== 24 || request.maxPendingBytes !== heldForceBounds.maxPendingBytes) fail('request bounds');
  const base = integer(Number(request.moduleBaseAddress),1,0xffffffff-0x51ffff,'module base'), m = createCapturedMemory([...snapshot.ranges.values()]).memory;
  for(const r of snapshot.ranges.values())if(!Buffer.isBuffer(r.bytes)||r.bytes.length!==r.length||sha(r.bytes)!==r.sha256)fail('held input span length/hash changed');
  if (!Buffer.isBuffer(snapshot.context) || snapshot.context.length !== 716) fail('actual CONTEXT extent');
  if (Number(snapshot.registers.eip) !== base + 0x749e0 || snapshot.tid !== request.tid || snapshot.observedDebugEventOrdinal !== request.observedDebugEventOrdinal || snapshot.contextSha256 !== sha(snapshot.context)) fail('actual entry context');
  for (const [name, offset] of [['edi',156],['esi',160],['ebx',164],['edx',168],['ecx',172],['eax',176],['ebp',180],['eip',184],['cs',188],['eflags',192],['esp',196],['ss',200],['mxcsr',228]]) if (snapshot.context.readUInt32LE(offset) !== Number(snapshot.registers[name])) fail(`raw CONTEXT ${name}`);
  for (const [name,offset] of [['fpuControlWord',28],['fpuStatusWord',32]]) if ((snapshot.context.readUInt32LE(offset)&65535)!==Number(snapshot.registers[name])) fail(`raw CONTEXT ${name}`);
  const session = m.readUInt32LE(base + 0x1ecb1c), esp = Number(snapshot.registers.esp);
  if (m.readUInt32LE(session + 0x57c) !== 4 || m[session + 0x54d] !== 6 || m.readUInt32LE(esp) !== base + 0x51017 || m.readUInt32LE(base + 0x50a548) !== request.clock) fail('live phase/roster/clock/caller');
  if (snapshot.breakpointId !== 'held-force-pre-input' || snapshot.observedBreakpointId !== 'native-frame-before' || snapshot.capturePhase !== 'held-pre-input-before-original-instruction') fail('pre-input role');
  validateHeldBankVector(snapshot,base);
  return {memory: m, base};
}

export async function loadHeldForceRequest(directory) {
  const root = await realpath(directory), raw = await readFile(path.join(root, 'held-force-request.json'));
  const configuration=JSON.parse(await readFile(path.join(root,'configuration.json'),'utf8'));validateHeldForceConfiguration(configuration);
  if (raw.length > 1024 * 1024) fail('request manifest bound');
  const request = JSON.parse(raw), row = request.snapshot, ranges = new Map();
  let footprint = 716;
  async function blob(file, hash, length) {
    if (typeof file !== 'string' || path.basename(file) !== file || /[\\/]/.test(file)) fail('unsafe blob');
    const resolved = await realpath(path.join(root, file)); if (path.dirname(resolved) !== root) fail('blob escapes output');
    const bytes = await readFile(resolved); if (bytes.length !== length || sha(bytes) !== hash) fail('blob length/hash'); return bytes;
  }
  const shared=configuration.heldForceInput.shareContainedRanges===true;
  if(shared){const storage=verifyContainedRangeStorage(row,row.rangeStorage);if(storage.retainedSnapshotBytes>heldForceBounds.maxPendingBytes)fail('physical snapshot footprint');
    const text=await readFile(path.join(root,'trace.jsonl'),'utf8'),complete=text.endsWith('\n')?text:text.slice(0,text.lastIndexOf('\n')+1),records=complete.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse),owners=records.filter(r=>r.type==='owned-process'),observed=records.filter(r=>r.type==='snapshot'&&r.ordinal===row.ordinal);
    if(owners.length!==1||owners[0].pid!==request.pid||owners[0].tid!==request.tid||observed.length!==1||!isDeepStrictEqual(observed[0],row))fail('actual shared request/owned snapshot differs');
    verifyHeldRangeStorageDiagnostic(row,records,{pid:request.pid,role:'held-pre-input'});
  }
  const sharedRows=shared?await loadContainedRangeBlobs((row?.ranges??[]).filter(r=>r.id!=='thread-seh-head'),root):null;
  for (const r of row?.ranges ?? []) {
    if (typeof r.id !== 'string' || ranges.has(r.id)) fail('duplicate range');
    integer(r.length, r.id==='active-sound-bank-storage'&&r.rangeMode==='vector-storage'?0:1, 64 * 1024 * 1024, 'range length'); footprint += r.length+(r.rangeMode==='vector-storage'?12:0);
    if (!shared&&footprint > heldForceBounds.maxPendingBytes) fail('snapshot footprint');
    ranges.set(r.id, shared&&r.id!=='thread-seh-head'?sharedRows.get(r.id):{...r, bytes: await blob(r.file, r.sha256, r.length)});
  }
  const snapshot = {...row, context: await blob(row.contextFile, row.contextSha256, 716), ranges, moduleBaseAddress: Number(request.moduleBaseAddress)};
  const {memory,base}=validateHeldForceRequest(request, snapshot);
  if(!snapshot.threadEnvironment)fail('held live snapshot lacks the actual stopped-thread environment');
  bindCapturedNativeThreadEnvironment(snapshot,{memory});
  const expected=[...(configuration.ranges??[]),...configuration.breakpoints.find(b=>b.id==='native-frame-before').ranges];
  if(ranges.size!==expected.length+1)fail('configured range count');
  for(const d of expected) {
    const r=ranges.get(d.id);if(!r)fail('configured range absent');
    for(const [name,actual,wanted] of [['rootRva',r.rootRva,d.rva],['rootAddress',r.rootAddress,d.address],['baseRegister',r.baseRegister,d.baseRegister],['offset',r.offset,d.offset??'0']])if(String(actual??'')!==String(wanted??''))fail(`configured ${name}`);
    if(JSON.stringify(r.dereferenceOffsets)!==JSON.stringify(d.dereferenceOffsets??[]))fail('configured pointer chain');
    let resolved=d.rva?base+Number(d.rva):d.address?Number(d.address):Number(snapshot.registers[d.baseRegister]);
    for(const offset of d.dereferenceOffsets??[])resolved=memory.readUInt32LE(resolved+Number(offset));
    resolved+=Number(d.offset??0);
    if(d.vectorStorage) {
      if(!bankVectorDescriptor(d))fail('unapproved vector descriptor');validateHeldBankVector(snapshot,base);
    } else if(d.readableRegion) {
      if(r.rangeMode!=='readable-region'||Number(r.requestedResolvedRoot)!==resolved||Number(r.regionBaseAddress)!==Number(r.address)||Number(r.regionSize)!==r.length||r.length>d.maxRegionBytes||r.maxRegionBytes!==d.maxRegionBytes||resolved<Number(r.address)||resolved>=Number(r.address)+r.length)fail('configured readable region');
    } else if(Number(r.address)!==resolved||r.length!==d.length||r.rangeMode)fail('configured fixed range');
  }
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
    } catch (error) {row.sourceComplete = false; delete row.events; row.failure = error.message;}
  }
  if (![...snapshot.ranges.values()].every((r,i) => sha(r.bytes) === originals[i])) fail('original input mutated');
  report.originalInputBytesUnchanged = true; report.elapsedMs = now() - started;
  if (report.elapsedMs > deadlineMs) fail('offline planner deadline');
  completedForecasts.set(report,{requestSha256:held.requestSha256,digest:sha(Buffer.from(JSON.stringify(report)))});
  return report;
}

export function encodeHeldForceDecision(held, report, reportSha256) {
  validateHeldForceRequest(held.request, held.snapshot);
  const issued=completedForecasts.get(report);
  if(!issued||issued.requestSha256!==held.requestSha256||issued.digest!==sha(Buffer.from(JSON.stringify(report))))fail('forecast was not completed by this planner or changed afterward');
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

export function validateHeldForceTransition(held, post, intervention, forecast, sourcePlanSha256) {
  const {request,snapshot:pre}=held;
  encodeHeldForceDecision(held,forecast,sourcePlanSha256);
  const s=forecast.selected,p=s.inputProof;
  if(!post||post.breakpointId!=='native-frame-before'||post.heldForceInputPhase!=='post-input'||post.heldForcePreInputOrdinal!==pre.ordinal||post.tid!==pre.tid||post.observedDebugEventOrdinal!==pre.observedDebugEventOrdinal||post.rawHit!==pre.rawHit||post.matchingHit!==pre.matchingHit||post.contextSha256!==pre.contextSha256||!post.context.equals(pre.context)||JSON.stringify(post.registers)!==JSON.stringify(pre.registers)||post.ranges.size!==pre.ranges.size||post.observedElapsedMs<pre.observedElapsedMs||post.observedElapsedMs-pre.observedElapsedMs>=20000)fail('post-input entry context/identity/order');
  if(!intervention||intervention.type!=='held-force-intervention'||intervention.pid!==request.pid||intervention.tid!==request.tid||intervention.observedDebugEventOrdinal!==request.observedDebugEventOrdinal||intervention.preInputOrdinal!==pre.ordinal||intervention.token!==request.token||intervention.requestSha256!==held.requestSha256||intervention.sourcePlanSha256!==sourcePlanSha256||intervention.participantIndex!==s.participantIndex||Number(intervention.bodyAddress)!==s.bodyAddress||Number(intervention.address)!==s.bodyAddress+0x74||intervention.length!==12||intervention.originalBytesHex!==p.originalForceHex||intervention.replacementBytesHex!==p.experimentalForceHex||intervention.originalBodySha256!==p.originalBodySha256||JSON.stringify(intervention.normalQ16)!==JSON.stringify(s.border.normalQ16)||intervention.signedScalarQ16!==s.signedScalarQ16||intervention.nativeCounterfactualCompared!==false||intervention.beforeOriginalInstruction!==true||intervention.allCapturedInputSpansRevalidated!==true||intervention.allNonForceBytesUnchanged!==true||intervention.contextUnchanged!==true)fail('actual single-write proof');
  integer(intervention.holdElapsedMs,0,19999,'actual hold duration');
  const expected=cloneNativeFrameWithForce(pre,s).snapshot;
  let bytes=0;
  for(const [id,r] of expected.ranges) {
    const actual=post.ranges.get(id);
    if(!actual||Number(actual.address)!==Number(r.address)||actual.length!==r.length||!actual.bytes.equals(r.bytes)||actual.sha256!==sha(actual.bytes))fail(`force-only post-input span ${id}`);
    for(const key of ['rootAddress','rootRva','moduleBaseAddress','baseRegister','dereferenceOffsets','offset','rangeMode','requestedResolvedRoot','regionBaseAddress','regionSize','regionProtection','regionState','regionType','maxRegionBytes','vectorHeaderAddress','vectorHeaderHex','vectorBegin','vectorEnd','vectorCapacity','maxVectorBytes','source'])if(JSON.stringify(actual[key])!==JSON.stringify(r[key]))fail(`post-input span descriptor ${id}`);
    bytes+=r.length;
  }
  return {matched:true,preInputOrdinal:pre.ordinal,postInputOrdinal:post.ordinal,checkedCapturedBytesIncludingOverlap:bytes,changedAddress:s.bodyAddress+0x74,changedLength:12,contextUnchanged:true,allNonForceBytesUnchanged:true};
}

export function validateHeldBudgetEvidence(held,configuration,budget) {
  validateHeldForceConfiguration(configuration);
  const rows=[...held.snapshot.ranges.values()].filter(r=>r.id!=='thread-seh-head'),event=configuration.breakpoints.find(b=>b.id==='native-dispatch-entry');
  const logical=720+rows.reduce((n,r)=>n+r.length+(r.rangeMode==='vector-storage'?12:0),0),storage=configuration.heldForceInput.shareContainedRanges?verifyContainedRangeStorage(held.snapshot,held.snapshot.rangeStorage):null;
  const pre=storage?storage.retainedSnapshotBytes:logical,eventBytes=720+event.ranges.reduce((n,r)=>n+r.length,0),required=pre*3+eventBytes*64;
  if(storage){verifyContainedRangeStorage(held.snapshot,budget?.rangeStorage,{actual:false});if(budget.logicalSnapshotBytes!==logical)fail('logical sharing footprint');}
  else if(budget?.rangeStorage||held.snapshot.rangeStorage)fail('unconfigured contained range storage');
  const snapshotLimit=configuration.controlledRaceSettings?71:70;
  if(!budget||budget.type!=='held-force-budget'||budget.metadataBeforeBlobRead!==true||budget.pid!==held.request.pid||budget.tid!==held.request.tid||budget.observedDebugEventOrdinal!==held.request.observedDebugEventOrdinal||budget.preSnapshotBytes!==pre||budget.eventSnapshotBytes!==eventBytes||budget.eventReserveBytes!==eventBytes*64||budget.requiredPendingBytes!==required||budget.pendingLimitBytes!==134217728||budget.snapshotLimit!==snapshotLimit||budget.requiredAdditionalSnapshots!==67||budget.snapshotsBefore!==held.snapshot.ordinal-1||budget.snapshotsBefore+67>snapshotLimit||required>134217728||budget.sufficient!==true||budget.contextBytes!==716||budget.threadEnvironmentBytes!==4||budget.rangeFootprints?.length!==rows.length)fail('actual pre-refusal budget evidence');
  const seen=new Set();
  for(const p of budget.rangeFootprints) {
    const r=held.snapshot.ranges.get(p.id),header=r?.rangeMode==='vector-storage'?12:0;
    if(!r||r.id==='thread-seh-head'||seen.has(p.id)||Number(p.address)!==Number(r.address)||p.length!==r.length||p.vectorHeaderBytes!==header||p.byteFootprint!==r.length+header)fail('actual per-range budget footprint');
    seen.add(p.id);
  }
  return {verified:true,preSnapshotBytes:pre,eventSnapshotBytes:eventBytes,requiredPendingBytes:required,limitBytes:134217728,rangeCount:rows.length,...(storage?{logicalSnapshotBytes:logical,storageMode:'snapshot-local-contained-ranges',physicalBackingCount:storage.backingCount}: {})};
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

export async function waitForHeldForceRequest(directory,{timeoutMs=90000}={}) {
  integer(timeoutMs,1,90000,'watch deadline');const start=performance.now();
  for(;;) {
    try {const info=await lstat(path.join(directory,'held-force-request.json'));if(!info.isFile()||info.isSymbolicLink())fail('request must be an immutable regular file');return;}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(performance.now()-start>=timeoutMs)fail('request watch deadline');
    await new Promise(resolve=>setTimeout(resolve,25));
  }
}
