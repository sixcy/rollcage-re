import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {pairNativeFrameSnapshots,compareNativeFramePair} from './check-native-frame-replay.mjs';
import {traceNativeFrameDispatches,compareNativeDispatchSnapshots} from './lib/native-frame-event-trace.mjs';
import {loadHeldForceRequest,planHeldForceInput,encodeHeldForceDecision,validateHeldForceConfiguration,validateHeldForceTransition,validateHeldBankVector,validateHeldBudgetEvidence} from './lib/native-held-force.mjs';
import {unpackCollisionNormal} from '../src/collision-grid.mjs';
import {REDUX_SHA256} from './prepare-native-physics-capture.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
function comparableForecast(r) {const {elapsedMs,...rest}=r;return rest;}

export function proveNativeChassisBorderCandidate(snapshot,event,replay,selected) {
  const m=createCapturedMemory([...snapshot.ranges.values()]).memory,base=replay.manifest.moduleBaseAddress;
  const eventBytes=snapshot.ranges.get('dispatch-event'),body=snapshot.ranges.get('dispatch-body-header'),arena=snapshot.ranges.get('dispatch-candidate-arena');
  if(!eventBytes||eventBytes.bytes.length!==104||eventBytes.bytes.readUInt32LE()!==1||eventBytes.bytes.readUInt32LE(4)!==selected.bodyAddress||!body||Number(body.address)!==selected.bodyAddress||body.length!==0x180||(body.bytes.readUInt32LE()&511)!==3||event.classification.category!=='terrain-border'||!['swept-contact','penetration-contact','sliding-contact'].includes(event.classification.response))throw Error('Actual selected chassis-border dispatcher/body proof differs.');
  const actualNormal=[0,4,8].map(o=>eventBytes.bytes.readInt32LE(0x38+o)),actualResponse=({1:'swept-contact',2:'penetration-contact',8:'sliding-contact'})[eventBytes.bytes[0x54]];
  if(eventBytes.bytes.readInt32LE(0x44)!==event.before.field44||actualNormal.some((v,i)=>v!==event.before.normalQ16[i])||actualResponse!==event.classification.response)throw Error('Actual dispatcher plane/response differs from the source event.');
  if(!arena||arena.length!==0x8000||Number(arena.address)!==m.readUInt32LE(base+0x51e788))throw Error('Actual current candidate pool differs.');
  const pointer=body.bytes.readUInt32LE(0x154),count=body.bytes.readUInt16LE(0x15c),start=Number(arena.address),end=start+arena.length;
  if(count<1||count>64||pointer<start||pointer+count*16>end||(pointer-start)%16)throw Error('Native dispatch candidate slice is outside its actual pool.');
  const matches=[];
  for(let i=0;i<count;i++) {
    const address=pointer+i*16,c=m.subarray(address,address+16),type=c[0]&15,cellId=c.readInt32LE(4),normalQ16=unpackCollisionNormal(c.readUInt32LE(8)).map(v=>v<<8);
    if(![6,7].includes(type)||cellId!==event.before.field44||cellId!==selected.border.cellId||normalQ16.some((v,j)=>v!==event.before.normalQ16[j]||v!==selected.border.normalQ16[j]))continue;
    if(!event.before.terrainCandidates.some(row=>row.address===address&&row.type===type&&row.id===cellId&&row.normalQ16.every((v,j)=>v===normalQ16[j])))throw Error('Actual candidate does not match the source event producer.');
    const sectorIndex=c[4],row=c.readInt16LE(6),column=c.readInt8(5),sector=replay.geometry.grid.sectors[sectorIndex],vertices=c.readUInt32LE(12),offset=c[1];
    if(!sector||row<0||row>=sector.rows||column<0||column>=sector.columns||vertices<sector.vertexAddress||(vertices-sector.vertexAddress)%8||(vertices-sector.vertexAddress)/8+offset>=sector.vertices.length)throw Error('Native border candidate geometry ownership differs.');
    matches.push({address,type,cellId,normalQ16,candidateHex:c.toString('hex'),sector:sectorIndex,row,column,pointAddress:vertices+offset*8,planePoint:sector.vertices[(vertices-sector.vertexAddress)/8+offset].slice(0,3)});
  }
  if(!matches.length)throw Error('No actual current type6/7 candidate proves the selected plane.');
  return {nativeOrdinal:snapshot.ordinal,eventAddress:Number(eventBytes.address),bodyAddress:selected.bodyAddress,candidates:matches};
}

export async function checkNativeHeldChassisForce(input,output) {
  const report={schemaVersion:1,authority:'original-process-held-force-input-and-complete-frame-comparison',matched:false,nativeCounterfactualCompared:false,scope:'One controlled12-byte force input; genuine chassis-border candidate/dispatcher and complete actual frame output. Natural walls, ceilings and inverted driving remain separate.'};
  try {
    const held=await loadHeldForceRequest(input),capture=await loadPhysicsCapture(input,{expectedSha256:REDUX_SHA256}),configuration=JSON.parse(await readFile(path.join(input,'configuration.json'),'utf8'));
    validateHeldForceConfiguration(configuration);
    const records=(await readFile(path.join(input,'trace.jsonl'),'utf8')).trim().split(/\r?\n/).map(JSON.parse),pre=capture.snapshots.filter(s=>s.breakpointId==='held-force-pre-input'),writes=records.filter(r=>r.type==='held-force-intervention'),waiting=records.filter(r=>r.type==='held-force-waiting');
    const owner=records.filter(r=>r.type==='owned-process');
    const budgets=records.filter(r=>r.type==='held-force-budget');if(budgets.length!==1)throw Error('Missing unique held capacity diagnostic.');report.budget=validateHeldBudgetEvidence(held,configuration,budgets[0]);
    if(pre.length!==1||writes.length!==1||waiting.length!==1||owner.length!==1||owner[0].pid!==held.request.pid||owner[0].tid!==held.request.tid||waiting[0].requestSha256!==held.requestSha256||waiting[0].preInputOrdinal!==pre[0].ordinal)throw Error('Held input lacks unique actual owned request/intervention evidence.');
    const preIndex=records.findIndex(r=>r.type==='snapshot'&&r.ordinal===pre[0].ordinal),waitIndex=records.indexOf(waiting[0]),writeIndex=records.indexOf(writes[0]);
    const debug=records.find(r=>r.type==='debug-event'&&r.ordinal===held.request.observedDebugEventOrdinal);
    if(!debug||debug.pid!==held.request.pid||debug.tid!==held.request.tid||debug.event!==1||preIndex<0||waitIndex<=preIndex||writeIndex<=waitIndex||records.slice(waitIndex+1,writeIndex).some(r=>r.type==='debug-event')||waiting[0].allOwnedThreadsStoppedByDebugEvent!==true)throw Error('Held observation/decision escaped its actual stopped owned debug event.');
    if(pre[0].ordinal!==held.snapshot.ordinal||!pre[0].context.equals(held.snapshot.context)||pre[0].ranges.size!==held.snapshot.ranges.size)throw Error('Request differs from the retained actual pre-input snapshot.');
    for(const[id,r]of held.snapshot.ranges){const a=pre[0].ranges.get(id);if(!a||Number(a.address)!==Number(r.address)||!a.bytes.equals(r.bytes))throw Error('Request/pre-input blob identity differs.');}
    const planBytes=await readFile(path.join(input,'held-force-plan.json')),saved=JSON.parse(planBytes),forecast=planHeldForceInput(held);
    if(JSON.stringify(comparableForecast(saved))!==JSON.stringify(comparableForecast(forecast)))throw Error('Retained source-only forecast differs from fresh bounded replay.');
    if(await readFile(path.join(input,'held-force-decision.txt'),'utf8')!==encodeHeldForceDecision(held,forecast,sha(planBytes)))throw Error('Actual held decision differs from verified source forecast.');
    const pairs=pairNativeFrameSnapshots(capture,configuration).pairs;
    if(pairs.length!==1)throw Error('Held force requires exactly one complete native frame.');
    const pair=pairs[0];report.input=validateHeldForceTransition(held,pair.before,writes[0],forecast,sha(planBytes));
    validateHeldBankVector(pair.after,pair.moduleBaseAddress);
    const replay=traceNativeFrameDispatches(pair.before,pair.options),native=capture.snapshots.filter(s=>s.breakpointId==='native-dispatch-entry');
    report.frame=compareNativeFramePair(pair,replay);
    report.dispatch=compareNativeDispatchSnapshots(native,replay.dispatchEvents,{...pair,logicalClock:held.request.clock,mode:'pending-frame',subset:'all',sourceProcessedEvents:replay.report.processedEvents});
    report.chassisBorders=[];
    for(const [index,event] of replay.dispatchEvents.entries())if(event.before.kind===1&&event.before.object1?.address===forecast.selected.bodyAddress&&event.before.object1.type===3&&event.classification.category==='terrain-border'&&event.before.field44===forecast.selected.border.cellId&&event.before.normalQ16.every((v,j)=>v===forecast.selected.border.normalQ16[j]))report.chassisBorders.push(proveNativeChassisBorderCandidate(native[index],event,replay,forecast.selected));
    if(!report.chassisBorders.length)throw Error('Native result has no independently proven planned chassis-border event.');
    report.sourceForecast={authority:forecast.authority,attempts:forecast.attempts.length,selected:forecast.selected.index,nativeCounterfactualCompared:false};
    report.matched=report.input.matched&&report.frame.matched&&report.dispatch.matched;
  } catch(error) {report.failure={message:error.message,stack:error.stack};}
  await writeFile(output,`${JSON.stringify(report,null,2)}\n`,{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [input,output]=process.argv.slice(2);if(!input||!output||process.argv.length!==4)throw Error('Usage: node tools/check-native-held-chassis-force.mjs CAPTURE NEW_REPORT');
  const report=await checkNativeHeldChassisForce(input,output);console.log(JSON.stringify({matched:report.matched,failure:report.failure?.message,output}));if(!report.matched)process.exitCode=1;
}
