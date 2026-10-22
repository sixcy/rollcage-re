import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {replayNativeFrameSequence,expandNativeFramePatchRuns,applyNativeFrameSequenceTransition} from '../tools/lib/native-frame-sequence.mjs';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationVehicleFixture} from '../tools/lib/simulation-vehicle-fixtures.mjs';
import {completeNativeFrameGeometryFixture} from '../tools/lib/native-frame-fixtures.mjs';
import {stepSimulationFrame} from '../src/simulation-frame.mjs';

const semantic = [{id: 'body', address: 0x1000, length: 16}, {id: 'clock', address: 0x2000, length: 4, comparison: 'read-only'}];
const abi = [{id: 'caller-stack', address: 0x3000, length: 8, comparison: 'abi-input'}];
const counters = [{id: 'clock', address: 0x2000, length: 4}];
function snapshot(position, velocity, clock, stackByte, ordinal) {
  const body = Buffer.alloc(16), tick = Buffer.alloc(4), stack = Buffer.alloc(8, stackByte);
  body.writeUInt32LE(position, 0); body.writeUInt32LE(velocity, 4); tick.writeUInt32LE(clock);
  return {moduleBaseAddress: 0x400000, tid: 12, ordinal, registers: {eax: '0x0', esp: '0x3004', ecx: clock}, ranges: [
    {id: 'body', address: 0x1000, bytes: body}, {id: 'clock', address: 0x2000, bytes: tick}, {id: 'stack', address: 0x3000, bytes: stack}
  ]};
}
const pairs = () => [
  {before: snapshot(0, 2, 0, 1, 1), after: snapshot(2, 2, 0, 7, 2)},
  {before: snapshot(2, 3, 1, 8, 3), after: snapshot(5, 3, 1, 7, 4)},
  {before: snapshot(5, 3, 2, 9, 5), after: snapshot(8, 3, 2, 7, 6)},
];
const options = {semanticRegions: semantic, abiInputRegions: abi, counterRegions: counters};
const externalRuns = ledger => [...expandNativeFramePatchRuns(ledger,{kind:'external-producer'})];
function adapter({drift = false, entries = []} = {}) {
  return input => {
    const captured = createCapturedMemory(input.ranges), {memory} = captured;
    entries.push({position: memory.readUInt32LE(0x1000), velocity: memory.readUInt32LE(0x1004), stack: memory[0x3000], registerClock: input.registers.ecx});
    memory.writeUInt32LE(memory.readUInt32LE(0x1000) + memory.readUInt32LE(0x1004) + Number(drift), 0x1000);
    // Only this first byte is a modeled scratch write. The full observed ABI
    // refresh remains explicit even when some untouched bytes already match.
    memory[0x3000] = 7;
    return {...captured, manifest: {aliases: [], requiredRegions: [...semantic, ...abi]}, report: {nativeReturn: 0}};
  };
}

test('carries physics state and supplies only observed producer changes plus explicit next-caller ABI', async () => {
  const input = pairs(), entries = [], evidence = input.map(pair => [pair.before, pair.after].map(snapshot => snapshot.ranges.map(row => Buffer.from(row.bytes))));
  const {report} = await replayNativeFrameSequence(input, {...options, replayFrame: adapter({entries})});
  assert.equal(report.matched, true); assert.equal(report.frames, 3);
  assert.deepEqual(entries, [
    {position: 0, velocity: 2, stack: 1, registerClock: 0},
    {position: 2, velocity: 3, stack: 8, registerClock: 1},
    {position: 5, velocity: 3, stack: 9, registerClock: 2},
  ]);
  assert.equal(report.externallyPatchedBytes, 3); assert.equal(report.abiRefreshedBytes, 16);
  assert.deepEqual(externalRuns(report.transitions[0]).map(row => row.address), [0x1004, 0x2000]);
  assert.equal(report.transitions[1].externalPatchRuns, 1);
  assert.deepEqual(report.transitions[0].nextNativeBeforeCounters, {clock: 1});
  assert.deepEqual(report.cases[2].sourceBeforeCounters, {clock: 2});
  assert.equal(report.transitions[0].samples[0].nativeAfterHex, '02');
  for (let i = 0; i < input.length; i++) for (const [stage, snapshot] of [input[i].before, input[i].after].entries()) for (let j = 0; j < snapshot.ranges.length; j++) assert.deepEqual(snapshot.ranges[j].bytes, evidence[i][stage][j]);
});

test('native entry snapshots never reset accumulating source physics drift', async () => {
  const entries = [], {report} = await replayNativeFrameSequence(pairs(), {...options, replayFrame: adapter({drift: true, entries})});
  assert.equal(report.matched, false);
  assert.deepEqual(entries.map(row => row.position), [0, 3, 7]);
  assert.deepEqual(report.cases.map(row => row.comparisons[0].firstDivergence.sourceByte), [3, 7, 11]);
  assert.equal(externalRuns(report.transitions[0]).some(row => row.address === 0x1000), false);
  assert.equal(report.firstDivergence.frameIndex, 0);
});

test('an external overwrite of a divergent byte is explicit and cannot erase its earlier failed comparison', async () => {
  const input = pairs(); input[1].before.ranges[0].bytes[0] = 20;
  const {report} = await replayNativeFrameSequence(input, {...options, replayFrame: adapter({drift: true})});
  assert.equal(report.matched, false);
  const patch = report.transitions[0].patchRanges.find(row => row.address === 0x1000), sample = report.transitions[0].samples.find(row => row.address === 0x1000);
  assert.equal(patch.overwrittenSourceDivergenceBytes, 1); assert.equal(sample.sourceBeforeHex, '03');
  assert.equal(sample.nextNativeBeforeHex, '14'); assert.equal(report.cases[1].comparisons[0].firstDivergence.sourceByte, 24);
});

test('serialized relative runs reconstruct every observed change exactly while retaining unchanged source drift', async () => {
  const input = pairs(), original = input[0], next = input[1];
  // Source position3 differs from native-after2 and already equals the next
  // native position3. This byte is an observed producer change, but applying
  // it does not change source bytes; the overwritten divergence still counts.
  next.before.ranges[0].bytes[0] = 3;
  const {report} = await replayNativeFrameSequence(input,{...options,replayFrame:adapter({drift:true})});
  const ledger = JSON.parse(JSON.stringify(report.transitions[0]));
  const nativeAfter = createCapturedMemory(original.after.ranges), nextNativeBefore = createCapturedMemory(next.before.ranges);
  const source = adapter({drift:true})(original.before), expected = adapter({drift:true})(original.before);
  // Independent bytewise reference applies no ledger tuples or source helper.
  const referenceChanged = [], expandedChanged = [];
  let externalBytes=0,sourceChanges=0,overwritten=0;
  for(const row of original.after.ranges) for(let i=0;i<row.bytes.length;i++) {
    const address=row.address+i, old=nativeAfter.memory[address], target=nextNativeBefore.memory[address];
    const isAbi=abi.some(span=>address>=span.address&&address<span.address+span.length);
    if(old!==target)referenceChanged.push(address);
    if(isAbi)expected.memory[address]=target;
    else if(old!==target){externalBytes++;sourceChanges+=Number(expected.memory[address]!==target);overwritten+=Number(expected.memory[address]!==old);expected.memory[address]=target;}
  }
  for(const run of expandNativeFramePatchRuns(ledger)) for(let i=0;i<run.length;i++)expandedChanged.push(run.address+i);
  assert.deepEqual(expandedChanged,referenceChanged);
  const applied=applyNativeFrameSequenceTransition(ledger,{nativeAfter,nextNativeBefore,source});
  assert.equal(applied.externallyPatchedBytes,externalBytes);assert.equal(applied.externalSourceChangedBytes,sourceChanges);assert.equal(applied.overwrittenSourceDivergenceBytes,overwritten);
  assert.equal(overwritten,1);assert.equal(externalBytes,3);assert.equal(sourceChanges,2);
  for(const row of original.after.ranges)assert.deepEqual(source.span(row.address,row.bytes.length),expected.span(row.address,row.bytes.length));
  assert.equal(source.memory.readUInt32LE(0x1000),3);
  assert.equal(Object.hasOwn(ledger,'externalPatches'),false);assert.equal(Object.hasOwn(ledger,'observedChanges'),false);
});

test('compact ledger rejects altered hashes, omitted runs, counters and ABI classification before source mutation', async () => {
  const input=pairs(),{report}=await replayNativeFrameSequence(input,{...options,replayFrame:adapter()});
  for(const mutate of [
    ledger=>{ledger.patchRanges[0].nextNativeBeforeSha256='0'.repeat(64);},
    ledger=>{ledger.patchRanges[0].externalRuns=[];},
    ledger=>{ledger.externallyPatchedBytes++;},
    ledger=>{ledger.patchRanges[0].externalRuns[0][1]++;},
    ledger=>{ledger.patchRanges[0].abiRuns.push(ledger.patchRanges[0].externalRuns.shift());},
    ledger=>{ledger.abiRefreshes[0].sourceChangedBytes++;},
  ]) {
    const ledger=JSON.parse(JSON.stringify(report.transitions[0]));mutate(ledger);
    const source=adapter()(input[0].before), initial=input[0].before.ranges.map(row=>({address:row.address,bytes:Buffer.from(source.span(row.address,row.bytes.length))}));
    assert.throws(()=>applyNativeFrameSequenceTransition(ledger,{nativeAfter:createCapturedMemory(input[0].after.ranges),nextNativeBefore:createCapturedMemory(input[1].before.ranges),source}),/hash|counter|classification|omits|differs/);
    for(const row of initial)assert.deepEqual(source.span(row.address,row.bytes.length),row.bytes,'Rejected ledgers never partially write.');
  }
});

test('dense short-run changes use bounded containing hashes and preserve every relative offset across chunk boundaries', async () => {
  const input=pairs().slice(0,2), regionAddress=0x100000, length=131072;
  for(const pair of input)for(const snapshot of [pair.before,pair.after])snapshot.ranges.push({id:'dense-observation',address:regionAddress,bytes:Buffer.alloc(length,11)});
  for(const snapshot of [input[1].before,input[1].after])for(let i=0;i<length;i+=2)snapshot.ranges.at(-1).bytes[i]=13;
  const {report}=await replayNativeFrameSequence(input,{...options,replayFrame:adapter()});
  assert.equal(report.matched,true);
  const ledger=report.transitions[0], dense=ledger.patchRanges.filter(row=>row.address>=regionAddress);
  assert.equal(dense.length,2);assert.equal(ledger.externallyPatchedBytes,65538);
  assert.equal(dense.reduce((sum,row)=>sum+row.externalRuns.length,0),65536);
  const expanded=externalRuns(ledger).filter(row=>row.address>=regionAddress);
  assert.equal(expanded.length,65536);assert.equal(expanded[32768].address,regionAddress+65536);
  assert.equal(expanded.at(-1).address,regionAddress+length-2);
  for(const row of dense){assert.equal(row.length,65536);assert.deepEqual(row.regionIds,['dense-observation']);assert.equal(Object.hasOwn(row.externalRuns[0],'sha256'),false);}
  assert.ok(JSON.stringify(ledger).length<750000,'One hash group per64KiB avoids per-run hash/region repetition.');
  assert.ok(ledger.samples.length<=8);assert.ok(ledger.samples.every(row=>row.sourceBeforeHex.length<=32));
  const source=adapter()(input[0].before);
  applyNativeFrameSequenceTransition(JSON.parse(JSON.stringify(ledger)),{nativeAfter:createCapturedMemory(input[0].after.ranges),nextNativeBefore:createCapturedMemory(input[1].before.ranges),source});
  assert.deepEqual(source.span(regionAddress,length),input[1].before.ranges.at(-1).bytes);
});

test('coverage, named dynamic allocation identity, module, thread and alias changes fail closed', async () => {
  for (const mutate of [
    input => {input[1].before.ranges[0].address++;},
    input => {input[1].before.ranges[0].id = 'replacement-allocation';},
    input => {input[1].before.moduleBaseAddress++;},
    input => {input[1].before.tid++;},
  ]) {
    const input = pairs(); mutate(input);
    await assert.rejects(replayNativeFrameSequence(input, {...options, replayFrame: adapter()}), /identity|topology/);
  }
  let call = 0; const base = adapter();
  await assert.rejects(replayNativeFrameSequence(pairs(), {...options, replayFrame: snapshot => {
    const replay = base(snapshot); replay.manifest.aliases = [{address: 0x4000, targetAddress: 0x1000 + call++, length: 1}]; return replay;
  }}), /aliases changed/);
});

test('all declared semantic bytes and return values are checked, including native read-only mutations', async () => {
  const input = pairs(); input[0].after.ranges[1].bytes.writeUInt32LE(9);
  const {report} = await replayNativeFrameSequence(input, {...options, replayFrame: adapter()});
  assert.equal(report.cases[0].comparisons[1].nativeReadOnlyChanges, 1); assert.equal(report.matched, false);
  const base = adapter();
  const other = await replayNativeFrameSequence(pairs().slice(0, 1), {...options, replayFrame: snapshot => ({...base(snapshot), report: {nativeReturn: 1}})});
  assert.equal(other.report.cases[0].firstDivergence.kind, 'return');
});

test('initial observation policy records surplus and mutable roots without admitting new bytes', async () => {
  const input = pairs();
  for (const pair of input) for (const snapshot of [pair.before, pair.after]) Object.assign(snapshot.ranges[0], {rangeMode: 'readable-region', rootRva: '0x20', dereferenceOffsets: ['0'], requestedResolvedRoot: '0x1000'});
  for (const snapshot of [input[1].before, input[1].after, input[2].before, input[2].after]) {
    snapshot.ranges[0].bytes = Buffer.concat([snapshot.ranges[0].bytes, Buffer.alloc(4, 99)]);
    snapshot.ranges[0].bytes.writeUInt32LE(0x1010, 8);
    snapshot.ranges[0].requestedResolvedRoot = '0x1004';
  }
  await assert.rejects(replayNativeFrameSequence(input, {...options, replayFrame: adapter()}), /topology/);
  const {report, finalReplay} = await replayNativeFrameSequence(input, {...options, coveragePolicy: 'initial-observation', replayFrame: adapter()});
  assert.equal(report.matched, true); assert.equal(report.capturedUnionBytes, 28);
  assert.deepEqual(report.observations.map(row => row.surplusBytes), [0, 0, 4, 4, 4, 4]);
  assert.deepEqual(report.observations[2].surplus[0], {address: 0x1010, length: 4, sha256: 'b6fbd675f98e2abd22d4ed29fdc83150fedc48597e92dd1a7a24381d44a27451', bytesHex: '63636363'});
  assert.equal(report.observations[2].resolvedRoots[0].changedFromInitial, true);
  assert.throws(() => finalReplay.span(0x1010, 1), /Uncaptured/);
  const fail = adapter(); let calls = 0;
  await assert.rejects(replayNativeFrameSequence(input, {...options, coveragePolicy: 'initial-observation', replayFrame: snapshot => {
    const replay = fail(snapshot); if (++calls === 2) replay.span(replay.memory.readUInt32LE(0x1008), 1); return replay;
  }}), /Uncaptured/);
  input[1].before.ranges[0].bytes = input[1].before.ranges[0].bytes.subarray(1); input[1].before.ranges[0].address++;
  await assert.rejects(replayNativeFrameSequence(input, {...options, coveragePolicy: 'initial-observation', replayFrame: adapter()}), /coverage lost/);
});

test('initial observation still rejects fixed pointer-region replacement and root descriptor changes', async () => {
  for (const mutate of [
    input => {input[1].before.ranges[0].address++;},
    input => {input[1].before.ranges[0].rootRva = '0x24';},
  ]) {
    const input = pairs(); mutate(input);
    await assert.rejects(replayNativeFrameSequence(input, {...options, coveragePolicy: 'initial-observation', replayFrame: adapter()}), /identity changed/);
  }
});

test('readable-region metadata may split within overlapping rows while the full original union remains covered', async () => {
  const input=pairs();
  for(const pair of input)for(const snapshot of [pair.before,pair.after]){
    const row=snapshot.ranges[0];Object.assign(row,{rangeMode:'readable-region',rootRva:'0x20',requestedResolvedRoot:'0x1000'});
    snapshot.ranges.push({...row,id:'overlapping-observation',rootRva:'0x24',bytes:Buffer.from(row.bytes)});
  }
  for(const snapshot of [input[1].before,input[1].after,input[2].before,input[2].after]){
    snapshot.ranges[0].address+=4;snapshot.ranges[0].bytes=snapshot.ranges[0].bytes.subarray(4);snapshot.ranges[0].requestedResolvedRoot='0x1004';
  }
  await assert.rejects(replayNativeFrameSequence(input,{...options,replayFrame:adapter()}),/topology/);
  const {report}=await replayNativeFrameSequence(input,{...options,coveragePolicy:'initial-observation',replayFrame:adapter()});
  assert.equal(report.matched,true);assert.equal(report.capturedUnionBytes,28);assert.deepEqual(report.observations.map(row=>row.surplusBytes),[0,0,0,0,0,0]);
  // Losing a single original byte across ALL observations still fails; the
  // checker cannot silently reduce its footprint to their intersection.
  const row=input[1].before.ranges.at(-1);row.address++;row.bytes=row.bytes.subarray(1);
  await assert.rejects(replayNativeFrameSequence(input,{...options,coveragePolicy:'initial-observation',replayFrame:adapter()}),/coverage lost/);
});

test('default full-frame adapter carries constructed vehicle physics across observed clock producer bytes', async () => {
  const program = await loadRetainedNativeProgram();
  const f = createSimulationVehicleFixture(program, 2, {vehicleCount: 2, ordinaryCount: 1, interacting: true, effects: false, models: false});
  completeNativeFrameGeometryFixture(f);
  const m = f.memory, base = f.addresses.bodies[0];
  m.writeUInt32LE(base, 0x6e6b40); m.writeUInt32LE(base, 0x902eec);
  m.writeInt32LE(-140000 + 0x20000 / 32, 0x709808); m.writeUInt32LE(0x1e000, 0x70dcf4);
  m.writeInt32LE(4, f.extraAddresses.session + 0x57c);
  const snap = () => ({moduleBaseAddress: 0x400000, registers: {esp: '0x9000', eax: 0, fpuControlWord: '0x007f', mxcsr: '0x1f80'}, ranges: [{id: 'constructed-image', address: 0, bytes: Buffer.from(m)}]});
  const input = [];
  for (let i = 0; i < 2; i++) {
    f.context.selectionCounter = m.readInt32LE(0x90a548);
    const before = snap(), result = stepSimulationFrame(f.views.physicalGroup, f.vehicles, f.context), after = snap();
    after.registers.eax = result.nativeReturn; input.push({before, after});
    m.writeUInt32LE(m.readUInt32LE(0x90a548) + 1, 0x90a548);
  }
  const {report} = await replayNativeFrameSequence(input, {frameOptions: {stackBytesBefore: 4096}});
  assert.equal(report.matched, true, JSON.stringify(report.firstDivergence));
  assert.equal(report.frames, 2); assert.equal(report.externallyPatchedBytes, 1);
  assert.equal(report.cases[0].nativeScenario.identity.available,true);assert.equal(report.cases[0].nativeScenario.identity.stable,true);
  assert.equal(externalRuns(report.transitions[0])[0].address, 0x90a548);
  assert.equal(report.cases[1].sourceBeforeCounters['selection-clock90a548'], report.cases[1].nativeBeforeCounters['selection-clock90a548']);
});
