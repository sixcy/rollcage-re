import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {createSimulationVehicleFixture} from '../tools/lib/simulation-vehicle-fixtures.mjs';
import {configurePostFrameFixture} from '../tools/lib/post-frame-runtime-fixtures.mjs';
import {completeNativeFrameGeometryFixture} from '../tools/lib/native-frame-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {recoveryLeafPolicy,replayNativeRecoveryLeaf,compareNativeRecoveryLeafPair,verifyNativeRecoveryLeafBoundaries} from '../tools/lib/native-recovery-leaf-replay.mjs';
import {pairNativeRecoveryLeafSnapshots,nativeRecoveryLeafIds} from '../tools/check-native-recovery-leaf-replay.mjs';
import {REDUX_SHA256} from '../tools/prepare-native-physics-capture.mjs';
const program=await loadRetainedNativeProgram();
function interpretedPairs({vehicles=1,negativeShapes=false,fixtureIndex=1}={}){
 const f=createSimulationVehicleFixture(program,fixtureIndex,{vehicleCount:vehicles,models:false,vehicleFilters:false,extraBodyStorage:[{address:0x70f130,length:0x3e78}]}),m=f.memory;completeNativeFrameGeometryFixture(f);configurePostFrameFixture(f,fixtureIndex,0x9000);const base=f.addresses.bodies[0];
 for(const[p,v]of[[0x6e6b40,base],[0x902eec,base],[0x709808,-140000+0x14000/32],[0x70dcf4,0x13000],[f.extraAddresses.session+0x57c,4]])m.writeInt32LE(v|0,p);
 for(const body of f.bodies)m.writeInt32LE(32,body.address+0x128);if(negativeShapes)m[f.bodies[0].address+0x10c]=255;
 const machine=new BoundedX86(program.instructions,{entry:0x47ccc0,fpuPrecisionBits:24});m.copy(machine.bytes);Object.assign(machine.r,{ESP:0x9000,EBX:0x11223344,EBP:0x22334455,ESI:0x33445566,EDI:0x44556677});machine.bytes.writeUInt32LE(0xffffffff,0x9000);machine.externalCalls.set(0x568162,x=>assert.equal(x.r.ECX>>>0,x.bytes.readUInt32LE(0x5e8890)));
 let ordinal=0;const pending=new Map(),pairs=[],progressVisits=new Set();
 const snapshot=address=>({ordinal:++ordinal,tid:7,moduleBaseAddress:0x400000,registers:{...Object.fromEntries(Object.entries(machine.r).map(([name,value])=>[name.toLowerCase(),value>>>0])),eip:address,fpuControlWord:0x7f,mxcsr:0x1f80},ranges:new Map([['image',{address:0,bytes:Buffer.from(machine.bytes)}]])});
 machine.onInstruction=address=>{if([0x44a2e0,0x449d40].includes(address))progressVisits.add(address);for(const stage of['query','apply']){const p=recoveryLeafPolicy(stage);if(address===p.entry)pending.set(stage,snapshot(address));if(p.exits.includes(address)){assert.ok(pending.has(stage));pairs.push({stage,before:pending.get(stage),after:snapshot(address),moduleBaseAddress:0x400000,progressVisits});pending.delete(stage);}}};machine.run(4000000);assert.equal(pending.size,0);return pairs;
}
test('query and apply leaf replays match actual interpreted parent-produced calls at both return sites',()=>{
 const exits={query:new Set(),apply:new Set()};let compared=0;
 for(const options of[{vehicles:1},{vehicles:2},{vehicles:1,negativeShapes:true},{vehicles:1,fixtureIndex:7}])for(const pair of interpretedPairs(options)){
  const replay=replayNativeRecoveryLeaf(pair.stage,pair.before,{stackBytesBefore:4096}),comparison=compareNativeRecoveryLeafPair(pair.stage,pair,replay);assert.equal(comparison.matched,true,JSON.stringify(comparison.firstDivergence));assert.ok(comparison.comparedBytes>100000);assert.equal(comparison.registers.length,pair.stage==='query'?6:5);assert.equal(replay.report.input.returnAddress,recoveryLeafPolicy(pair.stage).returnAddress);exits[pair.stage].add(pair.after.registers.eip);compared++;
 }
 assert.equal(compared,10);assert.deepEqual([...exits.query].sort(),[0x47d42a,0x47d434]);assert.deepEqual([...exits.apply].sort(),[0x47d6ed,0x47d703]);
});
test('apply leaf reaches actual checkpoint progression and compares its real backing/controller spans',()=>{
 const pair=interpretedPairs({vehicles:1,fixtureIndex:7}).find(row=>row.stage==='apply');assert.ok(pair.progressVisits.has(0x44a2e0)&&pair.progressVisits.has(0x449d40));const replay=replayNativeRecoveryLeaf('apply',pair.before,{stackBytesBefore:4096});assert.equal(compareNativeRecoveryLeafPair('apply',pair,replay).matched,true);
 const covers=(address,length)=>replay.manifest.requiredRegions.some(row=>row.comparison!=='abi-input'&&address>=row.address&&address+length<=row.address+row.length);assert.ok(covers(0x9f000,40)&&covers(0x9f100,8)&&covers(0x9e000,0x3a));
});
test('leaf comparison checks nonvolatile/ESP/queryEAX and includes query output even in ABI storage',()=>{
 const pair=interpretedPairs()[0],replay=replayNativeRecoveryLeaf('query',pair.before,{stackBytesBefore:4096}),comparison=compareNativeRecoveryLeafPair('query',pair,replay);assert.equal(comparison.matched,true);
 const output=replay.report.input.stackArguments[3];assert.ok(replay.manifest.requiredRegions.some(row=>row.comparison!=='abi-input'&&output>=row.address&&output+4<=row.address+row.length));
 const image=pair.after.ranges.get('image').bytes;image[output]^=1;assert.equal(compareNativeRecoveryLeafPair('query',pair,replay).matched,false);image[output]^=1;
 pair.after.registers.eax^=1;assert.equal(compareNativeRecoveryLeafPair('query',pair,replay).firstDivergence.name,'eax');pair.after.registers.eax^=1;
 pair.after.registers.ebx++;assert.equal(compareNativeRecoveryLeafPair('query',pair,replay).firstDivergence.name,'ebx');pair.after.registers.ebx--;
 pair.after.registers.esp+=4;assert.throws(()=>compareNativeRecoveryLeafPair('query',pair,replay),/thread\/ESP/);pair.after.registers.esp-=4;
 pair.after.registers.eip=0x47d434;assert.equal(compareNativeRecoveryLeafPair('query',pair,replay).firstDivergence.kind,'preRET-branch');
});
test('leaf input admission rejects missing arguments/caller/numerical state rather than replacing answers',()=>{
 const pair=interpretedPairs()[0],snapshot=pair.before;
 assert.throws(()=>replayNativeRecoveryLeaf('query',snapshot,{stackBytesBefore:4096,stackBytesAfter:16}),/complete actual stack/);
 assert.throws(()=>replayNativeRecoveryLeaf('apply',snapshot,{stackBytesBefore:4096}),/entry\/caller/);
 assert.throws(()=>replayNativeRecoveryLeaf('query',{...snapshot,registers:{...snapshot.registers,fpuControlWord:0x27f}},{stackBytesBefore:4096}),/PC24/);
 const memory=snapshot.ranges.get('image').bytes,E=snapshot.registers.esp;memory.writeUInt32LE(0,E);assert.throws(()=>replayNativeRecoveryLeaf('query',snapshot,{stackBytesBefore:4096}),/entry\/caller/);
});
test('leaf boundaries retain both actual query and apply exits and fixed parent call sites',async()=>{
 const proof=await verifyNativeRecoveryLeafBoundaries();assert.equal(proof.evidenceIds.length,4);assert.deepEqual(recoveryLeafPolicy('query').exits,[0x47d42a,0x47d434]);assert.equal(recoveryLeafPolicy('apply').stackBytesAfter,24);assert.throws(()=>recoveryLeafPolicy('other'),/query or apply/);
});
function observedPair(stage='query'){
 const pair=interpretedPairs().find(row=>row.stage===stage),leaf=recoveryLeafPolicy(stage),ids=nativeRecoveryLeafIds(stage),session=pair.before.ranges.get('image').bytes.readUInt32LE(0x5ecb1c),captureWhen={range:{id:'phase',rva:'0x1ecb1c',dereferenceOffsets:['0'],offset:'0x57c',length:4},equalsBytesHex:'04000000'},ranges=[{id:'frame-stack',baseRegister:'esp',offset:'-4096',length:4096+leaf.stackBytesAfter},{id:'attachment-queue',rva:'0x502040',length:1024}];
 const configuration={breakpoints:[{id:ids.before,rva:leaf.entry-0x400000,skipMatchingHits:0,stopAfterHits:0,captureWhen,ranges},...ids.after.map((id,i)=>({id,rva:leaf.exits[i]-0x400000,skipMatchingHits:0,stopAfterHits:1,captureWhen,ranges}))],phaseActions:[]};
 for(const[snapshot,isEntry]of[[pair.before,true],[pair.after,false]]){const m=snapshot.ranges.get('image').bytes,E=snapshot.registers.esp;snapshot.ordinal=isEntry?1:2;snapshot.breakpointId=isEntry?ids.before:ids.after[leaf.exits.indexOf(snapshot.registers.eip)];snapshot.hit=1;snapshot.rawHit=100;snapshot.matchingHit=1;snapshot.captureWhen={address:session+0x57c,actualBytesHex:'04000000',equalsBytesHex:'04000000'};snapshot.ranges.set('session',{address:session,bytes:Buffer.from(m.subarray(session,session+0x590))});snapshot.ranges.set('frame-stack',{address:E-4096,bytes:Buffer.from(m.subarray(E-4096,E+leaf.stackBytesAfter))});}
 return {configuration,capture:{header:{executableSha256:REDUX_SHA256},snapshots:[pair.before,pair.after],complete:{reason:'snapshot-bound',snapshots:2}},pair,stage};
}
test('standalone leaf capture pairing preserves actual arguments/both exits and rejects ambiguous branch skips',()=>{
 for(const stage of['query','apply']){const f=observedPair(stage),paired=pairNativeRecoveryLeafSnapshots(stage,f.capture,f.configuration);assert.equal(paired.pairs.length,1);assert.equal(paired.options.stackBytesAfter,stage==='query'?20:24);const replay=replayNativeRecoveryLeaf(stage,paired.pairs[0].before,paired.options);assert.equal(compareNativeRecoveryLeafPair(stage,paired.pairs[0],replay).matched,true);}
 for(const[edit,message]of[
  [f=>{f.configuration.breakpoints.pop();},/both exact preRET/],
  [f=>{f.configuration.breakpoints[0].skipMatchingHits=1;},/branch-dependent skip/],
  [f=>{f.pair.after.tid++;},/same-thread/],
  [f=>{f.pair.after.ranges.get('frame-stack').bytes.writeUInt32LE(0,4096);},/caller/],
  [f=>{f.pair.after.captureWhen.actualBytesHex='05000000';},/phase predicate/],
  [f=>{f.pair.after.registers.eip=0x47d03f;},/instruction/],
  [f=>{f.configuration.phaseActions.push({breakpointId:'native-recovery-query-before',writes:[]});},/observer-only/],
  [f=>{f.capture.complete.reason='duration-bound';},/complete bounded/],
 ]){const f=observedPair();edit(f);assert.throws(()=>pairNativeRecoveryLeafSnapshots(f.stage,f.capture,f.configuration),message);}
});
