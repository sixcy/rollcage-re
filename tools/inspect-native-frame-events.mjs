// Read-only inspection of retained captures. No native process is launched.
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {nativeFrameGlobalRegions} from './lib/native-frame-manifest.mjs';
import {pairNativeFrameSnapshots} from './check-native-frame-replay.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

export const nativeEventBoundaries = Object.freeze({initialQueue:0x474a50, dispatchCall:0x474ad5, dispatchEntry:0x474bb0, dispatchReturn:0x474ada, filterEntry:0x474b20, frameEntry:0x4749e0, frameExit:0x474b1e, dispatchEspBelowFrame:28});
const vec = (memory,address) => [0,4,8].map(delta=>memory.readInt32LE(address+delta));
function memoryOf(snapshot) {
  const ranges=snapshot.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot.ranges;
  const bases=new Set([snapshot.moduleBaseAddress,...ranges.map(row=>row.moduleBaseAddress)].filter(value=>value!==undefined&&value!==null).map(Number));
  if(bases.size!==1)throw Error('Event inspection requires one observed module base.');
  const base=[...bases][0],aliases=nativeFrameGlobalRegions.map(row=>({address:row.preferredAddress,targetAddress:base+row.preferredAddress-0x400000,length:row.length}));
  return {...createCapturedMemory(ranges,{aliases}),moduleBaseAddress:base};
}
function queueOf(memory) {
  const capacity=memory.readUInt32LE(0x902ba4),count=memory.readUInt32LE(0x902ba0),freeTop=memory.readInt32LE(0x902bb4),records=memory.readUInt32LE(0x902ba8),heap=memory.readUInt32LE(0x902bac);
  if(capacity>4096||count>capacity||freeTop< -1||freeTop>=capacity)throw Error('Invalid captured native event queue bounds.');
  return {capacity,count,freeTop,records,heap};
}
function eventOf(memory,address,queue) {
  const slot=(address-queue.records)/0x68;
  if(!Number.isInteger(slot)||slot<0||slot>=queue.capacity)throw Error('Native dispatch event pointer is outside its captured event pool.');
  memory.subarray(address,address+0x68);
  return {address,slot,kind:memory.readInt32LE(address),object1:memory.readUInt32LE(address+4),object2:memory.readUInt32LE(address+8),pointQ8:vec(memory,address+0x2c),normalQ16:vec(memory,address+0x38),scalar:memory.readInt32LE(address+0x48),classFlags:memory.readUInt32LE(address+0x54),tag:memory.readUInt16LE(address+0x58),damping:memory.readUInt16LE(address+0x5a)};
}
function bodyOf(memory,address,{participant=false}={}) {
  const flags=memory.readUInt32LE(address),scripted=!!(flags&0x2000);
  const result={address,flags,type:flags&511,scripted,positionQ16:vec(memory,address+0x34),linearVelocityQ16:vec(memory,address+0x68),frameTimeQ16:memory.readInt32LE(address+0x118),collisionState128:memory.readUInt32LE(address+0x128),collisionCounter168:memory[address+0x168]};
  if(scripted)result.script={offset:memory.readUInt16LE(address+0x138),timer:memory.readUInt16LE(address+0x13a),actionTimer:memory.readUInt16LE(address+0x13c),segment:memory[address+0x13e],spawnIndex:memory[address+0x13f]};
  if(participant)Object.assign(result,{control710:memory.readUInt32LE(address+0x710),controlMode718:memory[address+0x718],route6c0:memory.readUInt16LE(address+0x6c0),point6c2:memory.readUInt16LE(address+0x6c2),aiMode6c4:memory.readUInt16LE(address+0x6c4),aiTimer6c6:memory.readUInt16LE(address+0x6c6),aiAge6e8:memory[address+0x6e8],aiStuck6e9:memory[address+0x6e9],throttle64d:memory[address+0x64d],drive650:memory.readInt32LE(address+0x650),startDrive6b0:memory.readInt32LE(address+0x6b0),speed668:memory.readInt16LE(address+0x668)});
  return result;
}
export function inspectNativeFrameSnapshot(snapshot) {
  const {memory,moduleBaseAddress}=memoryOf(snapshot),queue=queueOf(memory),session=memory.readUInt32LE(0x5ecb1c),participantCount=memory[session+0x54d],bodyCount=memory.readUInt16LE(0x902bc4),list=memory.readUInt32LE(0x902bc0);
  if(participantCount>6||bodyCount>=96)throw Error('Native frame body/participant counts exceed producer bounds.');
  const participants=Array.from({length:participantCount},(_,index)=>({index,...bodyOf(memory,memory.readUInt32LE(0x909300+index*0x30c),{participant:true})}));
  const bodies=Array.from({length:bodyCount},(_,index)=>bodyOf(memory,memory.readUInt32LE(list+index*4)));
  const activeEvents=Array.from({length:queue.count},(_,index)=>{
    const key=memory.readUInt32LE(queue.heap+(index+1)*4),slot=key>>>20;
    return {key,timeQ16:key>>>1&0x7ffff,terrain:!!(key&1),...eventOf(memory,queue.records+slot*0x68,queue)};
  });
  return {ordinal:snapshot.ordinal,hit:snapshot.hit,rawHit:snapshot.rawHit,moduleBaseAddress,logicalClock:memory.readUInt32LE(0x90a548),phase:memory.readInt32LE(session+0x57c),phaseCounter:memory.readInt32LE(session+0x580),playbackMode:memory[session+0x58c],participantCount,bodyCount,queue:{...queue,activeEvents},participants,bodies};
}

// A standalone474bb0 snapshot must include all core global spans used above,
// the selected event bytes, and its entry return word. This validates ABI and
// exact slot identity, not whether an event survived the filter.
export function inspectNativeEventDispatch(snapshot,{frameEntryEsp}={}) {
  const {memory,moduleBaseAddress}=memoryOf(snapshot),esp=Number(snapshot.registers.esp),event=Number(snapshot.registers.ecx),actual=preferred=>moduleBaseAddress+preferred-0x400000;
  if(Number(snapshot.registers.eip)!==actual(nativeEventBoundaries.dispatchEntry)||memory.readUInt32LE(esp)!==actual(nativeEventBoundaries.dispatchReturn))throw Error('Native event snapshot has a different dispatch/caller boundary.');
  if(frameEntryEsp!==undefined&&esp!==frameEntryEsp-nativeEventBoundaries.dispatchEspBelowFrame)throw Error('Native event snapshot has a different parent frame stack.');
  return {ordinal:snapshot.ordinal,tid:snapshot.tid,moduleBaseAddress,logicalClock:memory.readUInt32LE(0x90a548),frameEntryEsp:esp+nativeEventBoundaries.dispatchEspBelowFrame,deltaQ16:Number(snapshot.registers.edx)|0,...eventOf(memory,event,queueOf(memory))};
}

export async function verifyNativeEventBoundaries() {
  const evidence=await readInstructionEvidence(['278-physics-frame-assembly.json']);
  const instructions=new Map(evidence.instructions.map(row=>[row.address,row]));
  for(const[address,op,...args]of[[0x474a46,'CALL','0x00440510'],[0x474a4b,'CALL','0x00427870'],[0x474a50,'MOV','EAX','[0x00902ba0]'],[0x474a57,'JZ','0x00474b12'],[0x474ac7,'CALL','0x00474b20'],[0x474ad2,'PUSH','ECX'],[0x474ad3,'MOV','ECX','EBX'],[0x474ad5,'CALL','0x00474bb0'],[0x474ada,'MOV','EAX','dword ptr [EBX + 0x4]'],[0x474b12,'CALL','0x00475450']]) {
    const row=instructions.get(address);if(row?.op!==op||JSON.stringify(row.args)!==JSON.stringify(args))throw Error(`Native event boundary evidence differs at0x${address.toString(16)}.`);
  }
  return evidence.evidence.map(row=>row.evidence_id);
}

export function inspectNativeFrameEvents(capture,configuration) {
  const {pairs}=pairNativeFrameSnapshots(capture,configuration);
  const frames=pairs.map(({before,after})=>{
    const entry=inspectNativeFrameSnapshot(before),exit=inspectNativeFrameSnapshot(after),left=memoryOf(before).memory,right=memoryOf(after).memory,changedRecordSlots=[];
    if(entry.queue.capacity!==exit.queue.capacity||entry.queue.records!==exit.queue.records)throw Error('Native frame changed event pool allocation identity.');
    for(let slot=0;slot<entry.queue.capacity;slot++) {
      const address=entry.queue.records+slot*0x68;
      if(!left.subarray(address,address+0x68).equals(right.subarray(address,address+0x68)))changedRecordSlots.push(slot);
    }
    return {entry,exit,logicalClockDelta:exit.logicalClock-entry.logicalClock,changedRecordSlots,
      stationaryParticipantCount:entry.participants.filter(body=>body.linearVelocityQ16.every(value=>value===0)).length,
      movedBodies:exit.bodies.filter(body=>{const prior=entry.bodies.find(row=>row.address===body.address);return prior&&body.positionQ16.some((value,i)=>value!==prior.positionQ16[i]);}).map(body=>({address:body.address,type:body.type,scripted:body.scripted}))};
  });
  return {schemaVersion:1,authority:'retained-original-process-read-only-inspection',frames,
    limits:['Entry/exit empty queues cannot count dispatched events:440510 resets and4749e0 drains the queue.','Changed recycled event slots prove byte changes, not a historical event count.','Whole4749e0 boundaries exclude preceding controls and later attachment/body-state/world-tick producers.','Consecutive captured frames remain independently initialized native inputs; no uninterrupted source-only tick is established.'],
    observerTarget:{initialQueue:nativeEventBoundaries.initialQueue,dispatchEntry:nativeEventBoundaries.dispatchEntry,eventRegister:'ecx',deltaRegister:'edx',returnAddress:nativeEventBoundaries.dispatchReturn,dispatchEspBelowFrame:nativeEventBoundaries.dispatchEspBelowFrame,
      policy:'Retain the earlier whole-frame entry on the host, latch observed dispatches by thread and parentESP, then retain its matching frame return. Never read a future latch as if it captured past entry state.'}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const[input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node tools/inspect-native-frame-events.mjs CAPTURE_DIRECTORY NEW_REPORT_FILE');
  const[capture,configuration,evidence]=await Promise.all([loadPhysicsCapture(input,{expectedSha256:REDUX_SHA256}),readFile(path.join(input,'configuration.json'),'utf8').then(JSON.parse),verifyNativeEventBoundaries()]);
  const report={...inspectNativeFrameEvents(capture,configuration),boundaryEvidence:evidence};
  await writeFile(output,`${JSON.stringify(report,null,2)}\n`,{flag:'wx'});
  console.log(JSON.stringify({frames:report.frames.map(row=>({clock:row.entry.logicalClock,phaseCounter:row.entry.phaseCounter,stationaryParticipants:row.stationaryParticipantCount,changedEventRecords:row.changedRecordSlots.length,movedBodies:row.movedBodies.length})),output}));
}
