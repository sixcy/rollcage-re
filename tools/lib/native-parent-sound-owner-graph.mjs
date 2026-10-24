import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCapturedMemory} from './captured-memory.mjs';
import {readInstructionEvidence} from './instruction-evidence.mjs';
import {REDUX_SHA256} from './retained-native-program.mjs';
import {nativeParentSoundChannelGraphPolicy,nativeParentSoundChannelGraphCapability,verifyNativeParentSoundChannelGraph} from './native-parent-sound-channel-graph.mjs';

export const nativeParentSoundOwnerGraphCapability='scoped-parent-sound-bank-owner-graph-v1';
export const nativeParentSoundOwnerGraphStages=Object.freeze(['native-control-before','native-control-after-ai','native-control-after','native-control-after-physics','native-control-after-attachments','native-control-after-recovery','native-control-after-drive','native-control-after-auxiliary','native-control-after-cameras','native-control-after-world-effects']);
export function nativeParentSoundOwnerGraphPolicy({channelGraph=false,finalTick=false}={}){assert.equal(typeof channelGraph,'boolean');assert.equal(typeof finalTick,'boolean');return {rootRva:'0x2f2414',headerRangeId:'sound-owner-vector-roots',storageRangeId:'control-sound-bank-storage',maxUsedSlots:256,ownerBytes:0x490,breakpointIds:[...nativeParentSoundOwnerGraphStages,...(finalTick?['native-parent-return']:[])],...(channelGraph?{channelGraph:nativeParentSoundChannelGraphPolicy()}:{} )};}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const uint=(value,label)=>{const n=Number(value);assert.ok((typeof value==='number'||typeof value==='string'&&/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value))&&Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff,`Sound owner graph actual uint32 ${label}`);return n;};
const rowsOf=snapshot=>snapshot.ranges instanceof Map?[...snapshot.ranges.values()]:snapshot.ranges;
const graphRow=row=>row.source==='parent-sound-bank-owner-graph'||row.id?.startsWith('parent-sound-bank-owner-');
const channelRow=row=>row.source==='parent-sound-bank-channel-graph'||row.id?.startsWith('parent-sound-channel-');
function exactRow(rows,id,address,length){
  const matches=rows.filter(row=>row.id===id);assert.equal(matches.length,1,`Sound owner graph exact ${id}`);const row=matches[0];
  assert.equal(uint(row.address,id),address);assert.equal(row.length,length);assert.ok(Buffer.isBuffer(row.bytes)&&row.bytes.length===length);assert.equal(row.sha256,hash(row.bytes),`Sound owner graph ${id} SHA`);return row;
}

export function verifyNativeParentSoundOwnerGraph(snapshot,proof,{moduleBaseAddress,policy=nativeParentSoundOwnerGraphPolicy()}={}){
  assert.deepEqual(policy,nativeParentSoundOwnerGraphPolicy({channelGraph:policy.channelGraph!==undefined,finalTick:policy.breakpointIds?.includes('native-parent-return')}),'Exact bounded sound owner policy');
  const base=uint(moduleBaseAddress,'module base');assert.ok(base>0&&base+0x2f2420<=0x100000000);
  const rows=rowsOf(snapshot);assert.ok(Array.isArray(rows));assert.equal(new Set(rows.map(row=>row.id)).size,rows.length,'Unique sound graph snapshot range IDs');
  assert.ok(policy.breakpointIds.includes(snapshot.breakpointId),'Sound graph belongs only to admitted parent checkpoints');
  assert.ok(proof&&proof.type==='parent-sound-bank-owners-observed');assert.equal(proof.snapshotOrdinal,snapshot.ordinal);assert.equal(uint(proof.mainModuleBaseAddress,'proof module'),base);
  const headerAddress=base+0x2f2414,header=exactRow(rows,policy.headerRangeId,headerAddress,12),h=header.bytes;
  assert.equal(Number(header.rootRva),0x2f2414);assert.equal(Number(header.moduleBaseAddress),base);assert.equal(Number(header.offset??0),0);assert.deepEqual(header.dereferenceOffsets??[],[]);assert.ok(!header.rangeMode&&!header.baseRegister&&!header.rootAddress,'Ordinary fixed header observation');
  const begin=h.readUInt32LE(),end=h.readUInt32LE(4),capacity=h.readUInt32LE(8);
  assert.ok(begin<=end&&end<=capacity&&(end-begin)%4===0&&(capacity-begin)%4===0&&capacity-begin<=65536,'Actual sound vector bounds');
  const used=(end-begin)/4;assert.ok(used<=256,'Sound owner used-slot observation bound');assert.ok(begin!==0||end===0&&capacity===0,'NULL vector has no storage');
  const storage=exactRow(rows,policy.storageRangeId,begin,capacity-begin);
  assert.equal(storage.rangeMode,'vector-storage');assert.equal(Number(storage.rootRva),0x2f2414);assert.equal(Number(storage.moduleBaseAddress),base);assert.equal(Number(storage.offset??0),0);assert.deepEqual(storage.dereferenceOffsets??[],[]);assert.ok(!storage.baseRegister&&!storage.rootAddress);
  assert.deepEqual([uint(storage.vectorHeaderAddress,'vector header'),storage.vectorHeaderHex,uint(storage.vectorBegin,'begin'),uint(storage.vectorEnd,'end'),uint(storage.vectorCapacity,'capacity'),storage.maxVectorBytes],[headerAddress,h.toString('hex'),begin,end,capacity,65536]);
  const slots=[],owners=[],byAddress=new Map();let nullSlots=0;
  for(let index=0;index<used;index++){
    const address=storage.bytes.readUInt32LE(index*4);let ownerIndex=null,rangeId=null;
    if(address){assert.ok(address+0x490<=0x100000000,'Sound owner bounded allocation extent');let owner=byAddress.get(address);if(!owner){owner={index:owners.length,address,slotIndices:[],rangeId:`parent-sound-bank-owner-${owners.length}`,bytes:0x490};owners.push(owner);byAddress.set(address,owner);}owner.slotIndices.push(index);ownerIndex=owner.index;rangeId=owner.rangeId;}else nullSlots++;
    slots.push({index,slotAddress:begin+index*4,ownerAddress:address,ownerIndex,rangeId});
  }
  assert.equal(rows.filter(graphRow).length,owners.length,'Only actual used distinct owner rows; no descendants');
  for(const owner of owners){const row=exactRow(rows,owner.rangeId,owner.address,0x490);assert.deepEqual([row.source,row.graphRole,row.ownerIndex,row.bankSlotIndices],['parent-sound-bank-owner-graph','owner',owner.index,owner.slotIndices]);assert.ok(!row.rangeMode&&!row.dereferenceMinimumValues&&!row.vectorStorage&&!row.readableRegion,'Owner graph grants only plain exact bytes');owner.sha256=row.sha256;}
  //Includes partial owner intersections and any ordinary code2/7/19 observations.
  //This validates actual byte consistency; it does not grant new allocation tails.
  createCapturedMemory(rows);
  const normalizeSlots=entries=>entries.map(row=>{assert.deepEqual(Object.keys(row).sort(),['index','slotAddress','ownerAddress','ownerIndex','rangeId'].sort());return {...row,slotAddress:uint(row.slotAddress,'slot'),ownerAddress:uint(row.ownerAddress,'owner')};});
  const normalizeOwners=entries=>entries.map(row=>{assert.deepEqual(Object.keys(row).sort(),['index','address','slotIndices','rangeId','bytes','sha256'].sort());return {...row,address:uint(row.address,'owner allocation')};});
  assert.ok(Array.isArray(proof.slots)&&Array.isArray(proof.owners));assert.deepEqual(normalizeSlots(proof.slots),slots,'Raw used slot pointer provenance and aliases');assert.deepEqual(normalizeOwners(proof.owners),owners,'Raw owner extent and hash provenance');
  assert.deepEqual([uint(proof.headerAddress,'header'),proof.headerBytesHex,proof.headerRangeId,proof.headerSha256,uint(proof.begin,'begin'),uint(proof.end,'end'),uint(proof.capacity,'capacity'),proof.usedSlots,proof.capacitySlots,proof.storageRangeId,uint(proof.storageAddress,'storage'),proof.storageBytes,proof.storageSha256,proof.maxUsedSlots,proof.ownerBytes,proof.uniqueOwners,proof.nullSlots,proof.additionalOwnerBytes],
    [headerAddress,h.toString('hex'),policy.headerRangeId,header.sha256,begin,end,capacity,used,(capacity-begin)/4,policy.storageRangeId,begin,capacity-begin,storage.sha256,256,0x490,owners.length,nullSlots,owners.length*0x490],'Complete exact sound owner graph counts and original bytes');
  assert.deepEqual([proof.sameStoppedDebugEvent,proof.afterParentAdmission,proof.beforeOriginalInstruction,proof.completeUsedOwnerObservation],[true,true,true,true],'Same admitted stopped event before original instruction');
  const result={verified:true,snapshotOrdinal:snapshot.ordinal,usedSlots:used,uniqueOwners:owners.length,nullSlots,additionalOwnerBytes:owners.length*0x490,slots,owners,semanticOwnersAdmitted:0,originalInput:snapshot.breakpointId==='native-control-before'};
  if(policy.channelGraph)result.channelGraph=verifyNativeParentSoundChannelGraph(snapshot,proof.channelGraph,{moduleBaseAddress:base,ownerProof:result});
  else {assert.equal(proof.channelGraph,undefined,'No unconfigured channel proof');assert.ok(!rows.some(channelRow),'No unconfigured channel rows');}
  return result;
}

export function verifyNativeParentSoundOwnerGraphRecords({capture,configuration,records,before,parent,owner,base,U,clock,activationEvent}){
  const policy=configuration.parentRttiObservation?.soundBankOwnerGraph,markers=records.filter(row=>row.type?.startsWith('parent-sound-bank-'));
  if(!policy){assert.equal(markers.length,0,'No unconfigured sound graph marker');for(const s of capture.snapshots){assert.equal(s.parentSoundBankOwnerGraph,undefined);assert.ok(!rowsOf(s).some(row=>graphRow(row)||channelRow(row)));}assert.equal(capture.complete.soundBankOwnerGraph,undefined);return undefined;}
  const finalTick=configuration.parentRttiObservation?.finalTick!==undefined;
  assert.deepEqual(policy,nativeParentSoundOwnerGraphPolicy({channelGraph:policy.channelGraph!==undefined,finalTick}));assert.ok(capture.header.helperCapabilities?.includes(nativeParentSoundOwnerGraphCapability),'Sound owner graph native capability');
  if(policy.channelGraph)assert.ok(capture.header.helperCapabilities?.includes(nativeParentSoundChannelGraphCapability),'Sound channel graph native capability');
  const final=finalTick?capture.snapshots.filter(s=>s.breakpointId==='native-parent-return'):[];
  assert.equal(final.length,finalTick?1:0,'One configured final owner observation');const observedParent=[...parent,...final],checkpoints=observedParent.length;
  assert.equal(markers.length,finalTick?11:10,'All successful sound graph checkpoint markers');assert.ok(markers.every(row=>row.type==='parent-sound-bank-owners-observed'),'No unknown sound graph marker');
  assert.deepEqual(observedParent.map(s=>s.breakpointId),policy.breakpointIds);const observations=[];let ownerRows=0,ownerBytes=0;
  const initial=createCapturedMemory(rowsOf(before)),caller=initial.span(U,4).readUInt32LE(),total=initial.span(U+4,4).readUInt32LE();
  for(const [index,s]of observedParent.entries()){
    const p=s.parentSoundBankOwnerGraph,m=markers[index],at=records.findIndex(row=>row.type==='snapshot'&&row.ordinal===s.ordinal),event=records.findIndex(row=>row.type==='debug-event'&&row.ordinal===s.observedDebugEventOrdinal);
    assert.ok(p&&m&&event>=0&&at>event);assert.deepEqual(p,m,'Exact sound graph annotation and marker');assert.deepEqual(records[at].parentSoundBankOwnerGraph,p);assert.ok(records.indexOf(m)>event&&records.indexOf(m)<at&&!records.slice(event+1,at).some(row=>row.type==='debug-event'),'Sound graph same stopped event');
    assert.equal(s.tid,owner.tid,'Sound graph actual snapshot owned thread');assert.equal(records[at].tid,owner.tid,'Sound graph raw snapshot owned thread');
    const debug=records[event];assert.deepEqual([debug.event,debug.pid,debug.tid],[1,owner.pid,owner.tid]);
    assert.deepEqual([m.pid,m.tid,m.ownerMainTid,m.breakpointId,m.observedDebugEventOrdinal,m.parentEntryDebugEventOrdinal,uint(m.parentEntryEsp,'parent ESP'),m.parentClock,m.parentIteration,uint(m.parentCaller,'parent caller'),m.parentTotalIterations,m.activationDebugEventOrdinal],
      [owner.pid,owner.tid,owner.tid,s.breakpointId,s.observedDebugEventOrdinal,before.observedDebugEventOrdinal,U,clock,before.context.readUInt32LE(168),caller,total,index<=7?0:activationEvent],'Sound graph actual selected parent lineage');
    const result=verifyNativeParentSoundOwnerGraph(s,p,{moduleBaseAddress:base,policy});observations.push(result);ownerRows+=result.uniqueOwners;ownerBytes+=result.additionalOwnerBytes;
  }
  for(const s of capture.snapshots)if(!observedParent.includes(s)){assert.equal(s.parentSoundBankOwnerGraph,undefined,'No sound graph outside parent stages');assert.ok(!rowsOf(s).some(row=>graphRow(row)||channelRow(row)));}
  const channelGraph=policy.channelGraph?{checkpoints,usedChannelSlots:0,storageRows:0,wrapperRows:0,sourceRows:0,vtableRows:0,additionalBytes:0}:undefined;
  if(channelGraph)for(const result of observations)for(const key of Object.keys(channelGraph))if(key!=='checkpoints')channelGraph[key]+=result.channelGraph[key];
  assert.deepEqual(capture.complete.soundBankOwnerGraph,{checkpoints,ownerRows,ownerBytes,...(channelGraph?{channelGraph}:{})},'Complete bounded owner transport lifecycle');
  return {verified:true,scope:'Original parent-entry owner input transport; lazy source-reached semantic comparison only',checkpoints,ownerRows,ownerBytes,observations,...(channelGraph?{channelGraph}:{})};
}

export async function verifyNativeParentSoundOwnerGraphEvidence(){
  const p=await readInstructionEvidence(['9083-audio-sample-lookup-assembly.json'],{directory:'analysis/native-simulation/results'});assert.ok(p.evidence.every(row=>row.subject?.digest?.sha256===REDUX_SHA256));
  for(const [address,op,args]of [[0x40dee8,'PUSH',['0x490']],[0x40deed,'CALL',['dword ptr [0x0056e220]']],[0x40df02,'CALL',['0x0040d7d0']]]){const row=p.instructions.find(r=>r.address===address);assert.ok(row?.op===op&&JSON.stringify(row.args)===JSON.stringify(args),`Original sound owner allocation0x${address.toString(16)}`);}
  return {targetSha256:REDUX_SHA256,evidenceIds:p.evidence.map(row=>row.evidence_id),scope:'Original490h allocation and construction; observed pointers/bytes supply all input, no owner/channel is initialized.'};
}
