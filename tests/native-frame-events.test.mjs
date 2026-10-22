import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {inspectNativeFrameSnapshot,inspectNativeEventDispatch,inspectNativeFrameEvents,verifyNativeEventBoundaries,nativeEventBoundaries} from '../tools/inspect-native-frame-events.mjs';
import {createConnectedFrameCandidateFixture} from '../tools/lib/frame-candidate-runtime-fixtures.mjs';
import {loadPhysicsCapture} from '../tools/lib/physics-capture-comparison.mjs';

function fixture() {
  const {memory:m,addresses:a}=createConnectedFrameCandidateFixture(2),session=0x75000,event=0x50000+3*0x68,esp=0x9000;
  m.writeUInt32LE(session,0x5ecb1c);m[session+0x54d]=2;m[session+0x58c]=1;m.writeInt32LE(4,session+0x57c);m.writeInt32LE(61,session+0x580);m.writeUInt32LE(289,0x90a548);
  for(let i=0;i<2;i++)m.writeUInt32LE(a.bodies[i],0x909300+i*0x30c);
  m.writeInt16LE(123,a.bodies[0]+0x668);m.writeUInt16LE(456,a.bodies[0]+0x66a);
  for(const[p,value]of[[0x902ba0,1],[0x902ba4,4],[0x902ba8,0x50000],[0x902bac,0x51000],[0x902bb4,2],[0x51004,(3<<20)|(1234<<1)],[event,0],[event+4,a.bodies[0]],[event+8,a.bodies[1]],[event+0x54,8],[esp,0x474ada]])m.writeUInt32LE(value,p);
  const snapshot={ordinal:1,hit:1,rawHit:290,tid:123,moduleBaseAddress:0x400000,registers:{esp,eip:0x474bb0,ecx:event,edx:0xffffffe0},ranges:new Map([['image',{address:0,bytes:m}]])};
  return {m,a,event,esp,snapshot};
}

test('observer decodes only active heap keys and leaves recycled records/history unclassified',()=>{
  const f=fixture(),before=Buffer.from(f.m),row=inspectNativeFrameSnapshot(f.snapshot);
  assert.equal(row.logicalClock,289);assert.equal(row.phaseCounter,61);assert.equal(row.playbackMode,1);assert.equal(row.bodyCount,2);
  assert.equal(row.queue.activeEvents.length,1);assert.equal(row.queue.activeEvents[0].slot,3);assert.equal(row.queue.activeEvents[0].timeQ16,1234);assert.equal(row.queue.activeEvents[0].terrain,false);
  assert.equal(row.queue.activeEvents[0].classFlags,8);assert.equal(row.participants[0].address,f.a.bodies[0]);
  assert.equal(row.participants[0].speed668,123,'Speed668 is a signed WORD, separate from66a.');
  assert.deepEqual(f.m,before,'Inspector does not mutate retained bytes.');
  f.m.writeUInt32LE(0,0x902ba0);assert.deepEqual(inspectNativeFrameSnapshot(f.snapshot).queue.activeEvents,[]);
  f.m.writeUInt32LE(5,0x902ba0);assert.throws(()=>inspectNativeFrameSnapshot(f.snapshot),/queue bounds/);
});

test('dispatch boundary requires the native caller, parent stack and exact104-byte event slot',()=>{
  const f=fixture(),row=inspectNativeEventDispatch(f.snapshot,{frameEntryEsp:f.esp+28});
  assert.equal(row.frameEntryEsp,f.esp+28);assert.equal(row.address,f.event);assert.equal(row.deltaQ16,-32);assert.equal(row.object2,f.a.bodies[1]);
  assert.equal(nativeEventBoundaries.dispatchEspBelowFrame,28);
  assert.throws(()=>inspectNativeEventDispatch(f.snapshot,{frameEntryEsp:f.esp+24}),/parent frame stack/);
  f.snapshot.registers.ecx++;assert.throws(()=>inspectNativeEventDispatch(f.snapshot),/event pool/);f.snapshot.registers.ecx--;
  f.m.writeUInt32LE(0, f.event+4);assert.equal(inspectNativeEventDispatch(f.snapshot).object1,0,'Dispatch invocation may survive a filter with both bodies removed.');
  f.m.writeUInt32LE(0x1234,f.esp);assert.throws(()=>inspectNativeEventDispatch(f.snapshot),/caller boundary/);
});

test('native event observer addresses retain queue reset, initial build, filter and dispatch ordering',async()=>{
  const evidence=await verifyNativeEventBoundaries();assert.equal(evidence.length,1);
});

const nativeDirectory='analysis/native-physics-local/startup-20261022/hidden-full-frame-capture';
test('retained firstactive frame reports stationary sixcar launch state without inventing event counts',{skip:!existsSync(`${nativeDirectory}/trace.jsonl`)},async()=>{
  const capture=await loadPhysicsCapture(nativeDirectory),config=JSON.parse(await readFile(`${nativeDirectory}/configuration.json`,'utf8'));
  const report=inspectNativeFrameEvents(capture,config),row=report.frames[0];
  assert.equal(row.entry.logicalClock,228);assert.equal(row.entry.phaseCounter,0);assert.equal(row.entry.participantCount,6);assert.equal(row.entry.bodyCount,15);
  assert.equal(row.stationaryParticipantCount,6);assert.deepEqual(row.changedRecordSlots,[]);assert.equal(row.logicalClockDelta,0);
  assert.equal(row.movedBodies.filter(body=>body.scripted).length,3);assert.equal(Object.hasOwn(row,'processedEvents'),false);
});
