// Native450e50 entry ->4749e0 entry, before any physics instruction executes.
// Pair by the retained caller stack and actual thread/clock, never file order alone.
import {REDUX_SHA256} from '../prepare-native-physics-capture.mjs';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {validateCapturedGuardedPointerRanges} from './captured-guarded-pointer-ranges.mjs';
import {verifyNativeFrameBoundaries} from '../prepare-native-frame-capture.mjs';
import {decodePhysicsNumericalContext} from '../../src/race-clock.mjs';

export const nativeControlBoundaries = Object.freeze({entry: 0x450e50, afterAi: 0x450f18, exit: 0x4749e0, physicsExit: 0x474b1e,
  call: 0x451012, returnAddress: 0x451017, childEspBelowParent: 20});
const ids = ['native-control-before', 'native-control-after'];
export const nativeControlTailBoundaries = Object.freeze([
  {id:'native-control-after-attachments',stage:'attachments',address:0x45101c,precedingCall:0x44f050},
  {id:'native-control-after-recovery',stage:'recovery',address:0x451021,precedingCall:0x47ccc0},
  {id:'native-control-after-drive',stage:'drive',address:0x45109c,precedingCall:0x469fd0},
].map(Object.freeze));
export const nativeControlLateBoundaries = Object.freeze([
  {id:'native-control-after-auxiliary',stage:'auxiliary',address:0x4510ef,precedingCall:0x475e50},
  {id:'native-control-after-cameras',stage:'cameras',address:0x451111},
  {id:'native-control-after-world-effects',stage:'world-effects',address:0x451120,precedingCall:0x438550},
].map(Object.freeze));
const hex = address => `0x${address.toString(16)}`;

export async function verifyNativeControlBoundaries() {
  const [evidence, physics] = await Promise.all([
    readInstructionEvidence(['310-race-step-parent-assembly.json'], {directory: 'analysis/native-simulation/results'}),
    verifyNativeFrameBoundaries(),
  ]);
  if (evidence.evidence.some(row => row.subject?.digest?.sha256 !== REDUX_SHA256)) throw Error('Native control boundary target SHA differs.');
  const listing = new Map(evidence.instructions.map(row => [row.address, row]));
  for(const point of [...nativeControlTailBoundaries,...nativeControlLateBoundaries].filter(row=>row.precedingCall)){const call=listing.get(point.address-5);if(call?.op!=='CALL'||Number(call.args[0])!==point.precedingCall)throw Error('Native parent-tail boundary differs from retained caller.');}
  for (const [address, op, args] of [
    [0x450e50, 'PUSH', ['EBX']], [0x450e51, 'PUSH', ['EBP']], [0x450e52, 'PUSH', ['ESI']],
    [0x450e59, 'MOV', ['EBP', 'EDX']], [0x450e5d, 'PUSH', ['EDI']],
    [0x450f18, 'XOR', ['EDI', 'EDI']],
    [0x451012, 'CALL', ['0x004749e0']], [0x451017, 'CALL', ['0x0044f050']],
    [0x4510f8, 'JLE', ['0x00451111']], [0x451102, 'CALL', ['0x004180a0']],
    [0x451108, 'CALL', ['0x0041bef0']], [0x45110d, 'CMP', ['ESI', 'EAX']],
    [0x45110f, 'JL', ['0x00451100']], [0x451111, 'CALL', ['0x00496700']],
  ]) {
    const row = listing.get(address);
    if (row?.op !== op || JSON.stringify(row.args) !== JSON.stringify(args)) throw Error(`Native control boundary differs at ${hex(address)}.`);
  }
  return {evidenceIds: [...new Set([...evidence.evidence.map(row => row.evidence_id), ...physics.evidenceIds])]};
}

function stackPolicy(breakpoint) {
  const row = breakpoint.ranges?.find(range => range.id === 'frame-stack');
  const before = -Number(row?.offset), after = Number(row?.length) - before;
  if (row?.baseRegister !== 'esp' || row.address !== undefined || row.rva !== undefined || row.readableRegion || row.vectorStorage || row.dereferenceOffsets?.length
    || !Number.isInteger(before) || before < 4 || before > 65536 || after !== 32) throw Error('Native control stack must declare its scratch and32-byte parent/child argument coverage.');
  const queue = breakpoint.ranges?.find(range => range.id === 'attachment-queue');
  if (Number(queue?.rva) !== 0x502040 || !Number.isInteger(queue.length) || queue.length < 4 || queue.length > 65536 || queue.length % 4 || queue.readableRegion || queue.vectorStorage || queue.dereferenceOffsets?.length) throw Error('Native control attachment observation differs.');
  return {stackBytesBefore: before, stackBytesAfter: after, attachmentWindowBytes: queue.length};
}

function phaseGate(breakpoint) {
  const condition = breakpoint.captureWhen, range = condition?.range;
  if (condition?.equalsBytesHex !== '04000000' || Number(range?.rva) !== 0x1ecb1c || range.length !== 4 || Number(range.offset) !== 0x57c
    || JSON.stringify(range.dereferenceOffsets) !== '["0"]' || range.address !== undefined || range.baseRegister !== undefined || range.readableRegion || range.vectorStorage) throw Error('Native control requires the exact phase4 observation gate.');
}

export function verifyNativeControlCaptureConfiguration(configuration) {
  const points = ids.map(id => configuration.breakpoints?.filter(row => row.id === id));
  if (points.some(rows => rows?.length !== 1)) throw Error('Native control requires unique entry and physics-entry sites.');
  const [before, after] = points.map(rows => rows[0]);
  if (Number(before.rva) !== nativeControlBoundaries.entry - 0x400000 || Number(after.rva) !== nativeControlBoundaries.exit - 0x400000
    || before.address !== undefined || after.address !== undefined) throw Error('Native control instruction boundary differs.');
  phaseGate(before); phaseGate(after);
  const options = stackPolicy(before);
  if (JSON.stringify(stackPolicy(after)) !== JSON.stringify(options)) throw Error('Native control stack policies differ.');
  const physicsPoints = configuration.breakpoints.filter(row => row.id === 'native-control-after-physics');
  if (physicsPoints.length > 1) throw Error('Native control physics-exit checkpoint is duplicated.');
  const tails=nativeControlTailBoundaries.map(boundary=>configuration.breakpoints.filter(row=>row.id===boundary.id));
  const postphysics=tails.some(rows=>rows.length>0);
  if(postphysics&&(!physicsPoints.length||tails.some(rows=>rows.length!==1)))throw Error('Native parent tail requires all three unique checkpoints and physics exit.');
  const latePoints=nativeControlLateBoundaries.map(boundary=>configuration.breakpoints.filter(row=>row.id===boundary.id));
  const lateStages=latePoints.filter(rows=>rows.length).length;
  if(lateStages&&(!postphysics||latePoints.some((rows,index)=>rows.length!==(index<lateStages?1:0))))throw Error('Late parent checkpoints require a contiguous prefix after all drive checkpoints.');
  const physicsExit = physicsPoints[0], terminal=lateStages?latePoints[lateStages-1][0]:postphysics?tails.at(-1)[0]:physicsExit??after;
  const frames = terminal.stopAfterHits, skipFrames = before.skipMatchingHits;
  if (!Number.isInteger(frames) || frames < 1 || frames > 3 || before.stopAfterHits > 0 || !Number.isInteger(skipFrames) || skipFrames < 0 || skipFrames > 0x7fffffff || after.skipMatchingHits !== skipFrames) throw Error('Native control count or skip window differs.');
  if (physicsExit) {
    if (Number(physicsExit.rva) !== nativeControlBoundaries.physicsExit - 0x400000 || physicsExit.address !== undefined || physicsExit.skipMatchingHits !== skipFrames || after.stopAfterHits > 0
      || JSON.stringify(stackPolicy(physicsExit)) !== JSON.stringify(options)) throw Error('Native control physics-exit checkpoint boundary or policy differs.');
    phaseGate(physicsExit);
    if(postphysics&&physicsExit.stopAfterHits>0)throw Error('Native parent tail cannot terminate at physics exit.');
  }
  if(postphysics)for(const [index,rows]of tails.entries()){
    const point=rows[0],boundary=nativeControlTailBoundaries[index];
    if(Number(point.rva)!==boundary.address-0x400000||point.address!==undefined||point.skipMatchingHits!==skipFrames
      || (index<tails.length-1||lateStages>0)&&point.stopAfterHits>0||JSON.stringify(stackPolicy(point))!==JSON.stringify(options))throw Error('Native parent-tail checkpoint boundary or policy differs.');
    phaseGate(point);
  }
  for(let index=0;index<lateStages;index++){
    const point=latePoints[index][0],boundary=nativeControlLateBoundaries[index];
    if(Number(point.rva)!==boundary.address-0x400000||point.address!==undefined||point.skipMatchingHits!==skipFrames
      ||index<lateStages-1&&point.stopAfterHits>0||JSON.stringify(stackPolicy(point))!==JSON.stringify(options))throw Error('Late parent checkpoint boundary or policy differs.');
    phaseGate(point);
  }
  const checkpoints = configuration.breakpoints.filter(row => row.id === 'native-control-after-ai');
  if (checkpoints.length > 1) throw Error('Native control AI checkpoint is duplicated.');
  if (checkpoints.length) {
    const checkpoint = checkpoints[0];
    if (Number(checkpoint.rva) !== nativeControlBoundaries.afterAi - 0x400000 || checkpoint.address !== undefined || checkpoint.skipMatchingHits !== skipFrames || checkpoint.stopAfterHits > 0
      || JSON.stringify(stackPolicy(checkpoint)) !== JSON.stringify(options)) throw Error('Native control AI checkpoint boundary or policy differs.');
    phaseGate(checkpoint);
  }
  if (configuration.pendingFrameObserver || configuration.observationActivation || configuration.phaseActions?.some(action => [...ids, 'native-control-after-ai', 'native-control-after-physics',...nativeControlTailBoundaries.map(row=>row.id),...nativeControlLateBoundaries.map(row=>row.id)].includes(action.breakpointId))) throw Error('Native control prefix observer cannot supply game state or use a different pending selection policy.');
  return {frames, skipFrames, options, afterAiCheckpoint: Boolean(checkpoints.length), physicsExitCheckpoint: Boolean(physicsExit),postphysics,lateStages};
}

function number(value, label) {
  const result = Number(value);
  if ((typeof value !== 'number' && typeof value !== 'string') || typeof value === 'string' && !/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value) || !Number.isSafeInteger(result) || result < 0 || result > 0xffffffff) throw Error(`Native control ${label} is not an observed x86 value.`);
  return result;
}
function inspect(snapshot, boundary, options) {
  const rows = snapshot.ranges instanceof Map ? [...snapshot.ranges.values()] : [];
  const bases = new Set([snapshot.moduleBaseAddress, ...rows.map(row => row.moduleBaseAddress)].filter(value => value !== undefined && value !== null).map(value => number(value, 'module base')));
  if (bases.size !== 1) throw Error('Native control requires one observed module base.');
  const base = [...bases][0], esp = number(snapshot.registers?.esp, 'ESP');
  const numerical = decodePhysicsNumericalContext({x87ControlWord: number(snapshot.registers?.fpuControlWord, 'x87 control word'), mxcsr: number(snapshot.registers?.mxcsr, 'MXCSR')});
  if (numerical.x87.precisionBits !== 24 || numerical.x87.roundingMode !== 'nearest-even' || numerical.x87.exceptionMask !== 63
    || numerical.sse.roundingMode !== 'nearest-even' || numerical.sse.exceptionMask !== 63 || numerical.sse.flushToZero || numerical.sse.denormalsAreZero) throw Error('Native control boundary lacks PC24/nearest-even masked numerical mode.');
  const stack = snapshot.ranges.get('frame-stack'), session = snapshot.ranges.get('session'), clock = snapshot.ranges.get('clock');
  if (number(snapshot.registers?.eip, 'EIP') !== base + boundary - 0x400000 || !stack || Number(stack.address) !== esp - options.stackBytesBefore
    || stack.bytes?.length !== options.stackBytesBefore + options.stackBytesAfter) throw Error('Native control instruction or stack observation differs.');
  if (!session || session.bytes?.length < 0x590 || session.bytes[0x54d] !== 6 || session.bytes.readUInt32LE(0x57c) !== 4
    || snapshot.captureWhen?.actualBytesHex !== '04000000' || snapshot.captureWhen.equalsBytesHex !== '04000000'
    || Number(snapshot.captureWhen.address) !== Number(session.address) + 0x57c) throw Error('Native control lacks actual six-participant phase4 proof.');
  if (!clock || clock.bytes?.length !== 4 || Number(clock.address) !== base + 0x50a548) throw Error('Native control lacks its actual logical clock.');
  const count = snapshot.ranges.get('attachment-count')?.bytes;
  if (!count || count.length !== 4 || count.readInt32LE() < 0 || count.readInt32LE() * 4 > options.attachmentWindowBytes) throw Error('Native control attachment count exceeds observation.');
  return {base, esp, stack, clock: clock.bytes.readUInt32LE(), word(offset) {return stack.bytes.readUInt32LE(options.stackBytesBefore + offset);}};
}

export function pairNativeControlSnapshots(capture, configuration) {
  if (capture.header?.executableSha256 !== REDUX_SHA256) throw Error('Native control target SHA differs.');
  const {frames, skipFrames, options, afterAiCheckpoint, physicsExitCheckpoint,postphysics,lateStages} = verifyNativeControlCaptureConfiguration(configuration);
  const terminal = capture.snapshots.at(-1);
  if (capture.complete?.reason !== 'snapshot-bound' || terminal?.breakpointId !== (lateStages?nativeControlLateBoundaries[lateStages-1].id:postphysics?'native-control-after-drive':physicsExitCheckpoint ? 'native-control-after-physics' : ids[1]) || terminal.hit !== frames) throw Error('Native control capture did not reach its declared physics boundary bound.');
  const pending = new Map(), pairs = [];
  let entries = 0, exits = 0, previousOrdinal = 0;
  for (const snapshot of capture.snapshots) {
    if (!ids.includes(snapshot.breakpointId)) continue;
    const point = configuration.breakpoints.find(row => row.id === snapshot.breakpointId);
    validateCapturedGuardedPointerRanges([...snapshot.ranges.values()], {expectedDescriptors: [...(configuration.ranges ?? []), ...point.ranges]});
    const before = snapshot.breakpointId === ids[0];
    const observed = inspect(snapshot, before ? nativeControlBoundaries.entry : nativeControlBoundaries.exit, options);
    if (!Number.isSafeInteger(snapshot.tid) || snapshot.tid < 1 || !Number.isSafeInteger(snapshot.ordinal) || snapshot.ordinal <= previousOrdinal
      || !Number.isInteger(snapshot.rawHit) || snapshot.rawHit < snapshot.matchingHit || snapshot.matchingHit !== skipFrames + snapshot.hit) throw Error('Native control order, thread or matching-hit evidence differs.');
    previousOrdinal = snapshot.ordinal;
    if (before) {
      if (pending.size || snapshot.hit !== ++entries) throw Error('Nested or nonsequential native control entry.');
      pending.set(snapshot.tid, {snapshot, ...observed});
      continue;
    }
    const entry = pending.get(snapshot.tid);
    if (!entry || snapshot.hit !== ++exits || entry.snapshot.hit !== snapshot.hit || entry.base !== observed.base
      || observed.esp !== entry.esp - nativeControlBoundaries.childEspBelowParent || entry.clock !== observed.clock) throw Error('Native control physics entry lacks its same-thread/stack/clock parent.');
    if (observed.word(0) !== observed.base + nativeControlBoundaries.returnAddress - 0x400000 || observed.word(20) !== entry.word(0) || observed.word(24) !== entry.word(4)) throw Error('Native control saved caller or iteration argument differs.');
    for (const [offset, register] of [[4, 'edi'], [8, 'esi'], [12, 'ebp'], [16, 'ebx']]) {
      if (observed.word(offset) !== number(entry.snapshot.registers[register], register)) throw Error(`Native control saved ${register} differs.`);
    }
    const iteration = number(entry.snapshot.registers.edx, 'iteration');
    if (number(snapshot.registers.ebp, 'EBP iteration') !== iteration) throw Error('Native control native iteration register differs.');
    pending.delete(snapshot.tid);
    pairs.push({before: entry.snapshot, after: snapshot, moduleBaseAddress: observed.base, options,
      iteration: iteration | 0, totalIterations: entry.word(4) | 0, logicalClock: observed.clock});
  }
  if (pending.size || pairs.length !== frames || entries !== frames || exits !== frames) throw Error('Unmatched native control boundaries.');
  const checkpoints = capture.snapshots.filter(row => row.breakpointId === 'native-control-after-ai');
  if (checkpoints.length !== (afterAiCheckpoint ? frames : 0)) throw Error('Missing or undeclared native control AI checkpoint.');
  for (const [index, snapshot] of checkpoints.entries()) {
    const descriptor = configuration.breakpoints.find(row => row.id === 'native-control-after-ai');
    validateCapturedGuardedPointerRanges([...snapshot.ranges.values()], {expectedDescriptors: [...(configuration.ranges ?? []), ...descriptor.ranges]});
    const pair = pairs[index], point = inspect(snapshot, nativeControlBoundaries.afterAi, options), parentEsp = Number(pair.before.registers.esp);
    if (snapshot.hit !== index + 1 || snapshot.matchingHit !== skipFrames + snapshot.hit || !Number.isInteger(snapshot.rawHit) || snapshot.rawHit < snapshot.matchingHit
      || snapshot.tid !== pair.before.tid || snapshot.ordinal <= pair.before.ordinal || snapshot.ordinal >= pair.after.ordinal
      || point.base !== pair.moduleBaseAddress || point.esp !== parentEsp - 16 || point.clock !== pair.logicalClock
      || point.word(16) !== pair.before.ranges.get('frame-stack').bytes.readUInt32LE(options.stackBytesBefore)
      || point.word(20) !== (pair.totalIterations >>> 0) || number(snapshot.registers.ebp, 'checkpoint EBP') !== (pair.iteration >>> 0)) throw Error('Native control AI checkpoint lacks its actual parent stack/thread/clock/order.');
    for (const [offset, register] of [[0, 'edi'], [4, 'esi'], [8, 'ebp'], [12, 'ebx']]) if (point.word(offset) !== number(pair.before.registers[register], register)) throw Error('Native control AI checkpoint saved registers differ.');
    pair.checkpoints = {afterAi: snapshot};
  }
  const physicsExits = capture.snapshots.filter(row => row.breakpointId === 'native-control-after-physics');
  if (physicsExits.length !== (physicsExitCheckpoint ? frames : 0)) throw Error('Missing or undeclared native control physics-exit checkpoint.');
  for (const [index, snapshot] of physicsExits.entries()) {
    const descriptor = configuration.breakpoints.find(row => row.id === 'native-control-after-physics');
    validateCapturedGuardedPointerRanges([...snapshot.ranges.values()], {expectedDescriptors: [...(configuration.ranges ?? []), ...descriptor.ranges]});
    const pair = pairs[index], point = inspect(snapshot, nativeControlBoundaries.physicsExit, options), entry = inspect(pair.after, nativeControlBoundaries.exit, options);
    if (snapshot.hit !== index + 1 || snapshot.matchingHit !== skipFrames + snapshot.hit || !Number.isInteger(snapshot.rawHit) || snapshot.rawHit < snapshot.matchingHit
      || snapshot.tid !== pair.after.tid || snapshot.ordinal <= pair.after.ordinal || pairs[index + 1] && snapshot.ordinal >= pairs[index + 1].before.ordinal
      || point.base !== pair.moduleBaseAddress || point.esp !== entry.esp || point.clock !== pair.logicalClock
      || number(snapshot.registers.eax, 'physics return EAX') !== 0) throw Error('Native control physics exit lacks its actual call stack/thread/clock/order.');
    //4749e0 saves ECX and all four nonvolatile registers, then restores them
    //before474b1e RET. The original caller and parent saves remain live.
    for (const name of ['ebx', 'ebp', 'esi', 'edi', 'ecx']) if (number(snapshot.registers[name], `physics exit ${name}`) !== number(pair.after.registers[name], `physics entry ${name}`)) throw Error('Native control physics exit changed a restored register.');
    for (let offset = 0; offset < 28; offset += 4) if (point.word(offset) !== entry.word(offset)) throw Error('Native control physics exit changed its parent caller stack.');
    pair.physicsAfter = snapshot;
  }
  for(const boundary of [...nativeControlTailBoundaries,...nativeControlLateBoundaries]){
    const snapshots=capture.snapshots.filter(row=>row.breakpointId===boundary.id);
    const declared=postphysics&&(nativeControlTailBoundaries.includes(boundary)||nativeControlLateBoundaries.indexOf(boundary)<lateStages);
    if(snapshots.length!==(declared?frames:0))throw Error('Missing or undeclared native parent-tail snapshot.');
    for(const [index,snapshot]of snapshots.entries()){
      const descriptor=configuration.breakpoints.find(row=>row.id===boundary.id);
      validateCapturedGuardedPointerRanges([...snapshot.ranges.values()],{expectedDescriptors:[...(configuration.ranges??[]),...descriptor.ranges]});
      const pair=pairs[index],point=inspect(snapshot,boundary.address,options),parent=inspect(pair.before,nativeControlBoundaries.entry,options);
      const previous=pair.postphysics?Object.values(pair.postphysics).at(-1):pair.physicsAfter;
      if(snapshot.hit!==index+1||snapshot.matchingHit!==skipFrames+snapshot.hit||!Number.isInteger(snapshot.rawHit)||snapshot.rawHit<snapshot.matchingHit
        ||snapshot.tid!==pair.before.tid||snapshot.ordinal<=previous.ordinal||pairs[index+1]&&snapshot.ordinal>=pairs[index+1].before.ordinal
        ||point.base!==pair.moduleBaseAddress||point.esp!==parent.esp-16||point.clock!==pair.logicalClock||number(snapshot.registers.ebp,'tail EBP')!==(pair.iteration>>>0))throw Error('Native parent-tail snapshot lacks same-thread/stack/clock/order proof.');
      for(const [offset,register]of [[0,'edi'],[4,'esi'],[8,'ebp'],[12,'ebx']])if(point.word(offset)!==number(pair.before.registers[register],register))throw Error('Native parent-tail saved registers differ.');
      if(point.word(16)!==parent.word(0)||point.word(20)!==parent.word(4))throw Error('Native parent-tail caller argument differs.');
      (pair.postphysics??={})[boundary.stage]=snapshot;
    }
  }
  return {pairs, frames, skipFrames, options, afterAiCheckpoint, physicsExitCheckpoint,postphysics,lateStages};
}
