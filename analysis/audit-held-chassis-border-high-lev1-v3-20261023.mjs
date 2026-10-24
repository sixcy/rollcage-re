// Read-only audit of a CLOSED, FAILED original capture. Never constructs a
// complete record, held snapshot, source answer, or native process.
import assert from 'node:assert/strict';
import {readFile, realpath, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {validateControlledRaceSettingsConfiguration, verifyControlledRaceSettingsSnapshot} from '../tools/lib/native-controlled-race-settings.mjs';

const directory='analysis/native-physics-local/startup-20261022/held-chassis-border-high-lev1-v3-20261023';
const hash=b=>createHash('sha256').update(b).digest('hex');
const root=await realpath(directory), trace=await readFile(path.join(root,'trace.jsonl'));
const records=trace.toString().trim().split(/\r?\n/).map(JSON.parse);
const configurationBytes=await readFile(path.join(root,'configuration.json')), configuration=JSON.parse(configurationBytes);
validateControlledRaceSettingsConfiguration(configuration);
assert.equal(hash(configurationBytes),hash(await readFile('analysis/native-physics-local/startup-20261022/held-chassis-border-high-lev1-config-v3-20261023.json')));
const helper=await readFile('analysis/native-physics-local/startup-20261022/bounded-controlled-race-settings-runner-v3-20261023/native-physics-debugger.cs');
assert.equal(hash(helper),'be12d33fdbe3a85fd902d26b4becc27659f79dd9530480146a94d13344ee9f89');
const one=type=>{const rows=records.filter(r=>r.type===type);assert.equal(rows.length,1,type);return rows[0];};
const owner=one('owned-process'), main=records.filter(r=>r.type==='module'&&r.kind==='main');assert.equal(main.length,1);
const base=Number(main[0].baseAddress);
assert.equal(records[0].executableSha256,'c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5');
const files=new Map(), buffers=new Map();
function add(file,sha256,length) {const value={sha256,length};if(files.has(file))assert.deepEqual(files.get(file),value);files.set(file,value);}
for(const r of records){if(r.contextFile)add(r.contextFile,r.contextSha256,r.contextLength??716);for(const b of r.ranges??[])if(b.file)add(b.file,b.sha256,b.length);if(r.stack?.file)add(r.stack.file,r.stack.sha256,r.stack.length);}
let bytes=0;
for(const [file,expected]of files){assert.equal(path.basename(file),file);const resolved=await realpath(path.join(root,file));assert.equal(path.dirname(resolved),root);const b=await readFile(resolved);assert.equal(hash(b),expected.sha256,file);if(expected.length!==undefined)assert.equal(b.length,expected.length,file);buffers.set(file,b);bytes+=b.length;}
const snapshots=records.filter(r=>r.type==='snapshot');assert.deepEqual(snapshots.map(r=>r.ordinal),[1,2,3,4]);
const row=snapshots.find(r=>r.breakpointId==='controlled-race-settings');assert.ok(row);
const snapshot={...row,context:buffers.get(row.contextFile),ranges:new Map(row.ranges.map(r=>[r.id,{...r,bytes:buffers.get(r.file)}]))};
const input=verifyControlledRaceSettingsSnapshot(snapshot,configuration.controlledRaceSettings,{mainBase:base,ownerTid:owner.tid});
for(const [name,offset]of Object.entries({edi:156,esi:160,ebx:164,edx:168,ecx:172,eax:176,ebp:180,eip:184,esp:196,cs:188,eflags:192,ss:200}))assert.equal(Number(snapshot.registers[name]),snapshot.context.readUInt32LE(offset));
for(const [name,offset,mask]of [['fpuControlWord',28,65535],['fpuStatusWord',32,65535],['mxcsr',228,0xffffffff]])assert.equal(Number(snapshot.registers[name]),snapshot.context.readUInt32LE(offset)&mask);
const guard=one('controlled-race-settings-guarded'), done=one('controlled-race-settings-intervention'), writes=records.filter(r=>r.type==='controlled-race-settings-input-write');assert.equal(writes.length,2);
const index=r=>records.indexOf(r);
const debug=ordinal=>{const found=records.filter(r=>r.type==='debug-event'&&r.ordinal===ordinal);assert.equal(found.length,1);assert.equal(found[0].event,1);assert.equal(found[0].pid,owner.pid);assert.equal(found[0].tid,owner.tid);return found[0];};
const stopped=debug(row.observedDebugEventOrdinal), ordered=[stopped,row,guard,...writes,done];
for(let i=1;i<ordered.length;i++)assert.ok(index(ordered[i-1])<index(ordered[i]));
assert.equal(records.slice(index(row)+1,index(done)).some(r=>r.type==='debug-event'),false);
for(const r of [guard,...writes,done]){assert.equal(r.pid,owner.pid);assert.equal(r.tid,owner.tid);assert.equal(r.snapshotOrdinal,row.ordinal);assert.equal(r.observedDebugEventOrdinal,row.observedDebugEventOrdinal);}
for(const r of [guard,done]){assert.equal(r.breakpointId,'controlled-race-settings');assert.equal(r.rawHit,1);assert.equal(r.ownerMainTid,owner.tid);assert.equal(Number(r.configurationAddress),input.configAddress);assert.equal(Number(r.sessionAddress),input.sessionAddress);assert.equal(r.configurationBeforeHex,input.config.toString('hex'));assert.equal(r.contextSha256,row.contextSha256);assert.equal(r.allGuardsBeforeWrites,true);assert.equal(r.beforeOriginalInstruction,true);}
assert.equal(Number(guard.stackAddress),snapshot.context.readUInt32LE(196));assert.equal(guard.stackBytesHex,input.stack.toString('hex'));
assert.equal(done.configurationAfterHex,input.replacement.toString('hex'));assert.equal(done.level,1);assert.equal(done.quality,1);assert.equal(done.nativeOutputsWritten,false);
for(const k of ['contextUnchanged','rootsUnchanged','allOtherCapturedBytesUnchanged'])assert.equal(done[k],true);
const operand=Buffer.alloc(4);operand.writeUInt32LE(base+0x1ecefc);assert.equal(Number(guard.instructionAddress),base+0x3e0c5);assert.equal(guard.breakpointInstructionHex,'cc'+operand.toString('hex'));assert.equal(guard.restoredInstructionHex,'a1'+operand.toString('hex'));
for(const [i,offset]of [0xb,0x31].entries()){const w=writes[i];assert.equal(w.index,i+1);assert.equal(Number(w.address),input.configAddress+offset);assert.equal(w.length,1);assert.equal(w.originalBytesHex,input.config.subarray(offset,offset+1).toString('hex'));assert.equal(w.replacementBytesHex,input.replacement.subarray(offset,offset+1).toString('hex'));}
assert.deepEqual([...input.config.keys()].filter(i=>input.config[i]!==input.replacement[i]),[0xb]);
const out=one('controlled-race-settings-native-outputs'), budget=one('held-force-budget'), error=one('capture-error'), cleanup=one('owned-process-cleanup');
const nativeEvent=debug(out.observedDebugEventOrdinal);assert.ok(index(nativeEvent)<index(out));assert.ok(index(done)<index(out)&&index(out)<index(budget)&&index(budget)<index(error));
const nativeException=records.slice(index(nativeEvent)+1,index(out)).find(r=>r.type==='exception');assert.equal(Number(nativeException.address),base+0x749e0);
assert.equal(out.pid,owner.pid);assert.equal(out.tid,owner.tid);assert.equal(Number(out.sessionAddress),input.sessionAddress);assert.equal(out.level,1);assert.equal(out.quality,1);assert.equal(out.nativeOutputsWritten,false);assert.equal(out.configurationPersistenceAssumed,false);assert.equal(out.beforeHeldRequest,true);
const header=Buffer.from(out.sessionHeaderHex,'hex'), runtime=Buffer.from(out.sessionRuntimeHex,'hex'), family=Buffer.from(out.familyTableHex,'hex'), local=Buffer.from(out.localTableHex,'hex'), stem=Buffer.from(out.nativeStemHex,'hex');
assert.equal(header.length,48);assert.equal(runtime.length,0xd3);assert.equal(stem.length,260);assert.deepEqual(family,snapshot.ranges.get('settings-track-family').bytes);assert.deepEqual(local,snapshot.ranges.get('settings-track-local').bytes);
assert.equal(runtime[0x579-0x54d],0);assert.equal(header[0xe],family[0]);assert.equal(header[0xf],local[0]);assert.equal(header[0xe],1);assert.equal(header[0xf],0);assert.equal(stem.subarray(0,stem.indexOf(0)).toString(),'high\\lev1');
assert.equal(budget.observedDebugEventOrdinal,out.observedDebugEventOrdinal);assert.equal(budget.pid,owner.pid);assert.equal(budget.tid,owner.tid);assert.equal(budget.metadataBeforeBlobRead,true);assert.equal(budget.sufficient,false);
assert.equal(budget.contextBytes+budget.threadEnvironmentBytes+budget.rangeFootprints.reduce((n,r)=>n+r.byteFootprint,0),50129730);assert.equal(budget.preSnapshotBytes,50129730);assert.equal(budget.eventSnapshotBytes,50618);assert.equal(budget.eventReserveBytes,50618*64);assert.equal(budget.requiredPendingBytes,budget.preSnapshotBytes*3+budget.eventReserveBytes);assert.equal(budget.requiredPendingBytes,153628742);assert.equal(budget.pendingLimitBytes,134217728);assert.ok(budget.requiredPendingBytes>budget.pendingLimitBytes);
assert.equal(records.some(r=>r.type==='complete'),false);assert.equal(records.some(r=>/^held-force-(request|input-write|intervention)$/.test(r.type)),false);assert.equal(snapshots.some(r=>r.breakpointId==='native-frame-before'||r.breakpointId==='native-frame-after'),false);assert.equal(cleanup.terminated,true);
const summary={captureSucceeded:false,settingsInputVerified:true,nativeOutputMarkerVerified:true,nativeStem:'high\\lev1',nativeTrackIndex:0,nativeFamily:1,nativeLocal:0,allBlobHashesMatch:true,files:files.size,bytes,heldRequests:0,heldForceWrites:0,rawHeldOrOutputSnapshotPresent:false,completePresent:false,budgetRequired:budget.requiredPendingBytes,budgetLimit:budget.pendingLimitBytes,cleanupMs:cleanup.elapsedMs,traceSha256:hash(trace),limits:['Output marker is actual logged process-read data, not an invented held/output snapshot.','No raw post-context blob: immutable-helper readback flags and exact logged configuration transition are verified separately from pre-input raw blobs.','No force, contact or completed physics equality claim.']};
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary));
