//43e0c5 input hook only. Original43dfe0/43b0e0 produce track/session/stem.
import {createHash} from 'node:crypto';
import {createCapturedMemory} from './captured-memory.mjs';
import {bindCapturedNativeThreadEnvironment} from './native-frame-sound.mjs';

const fail=message=>{throw Error(`Controlled race settings: ${message}`);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function controlledRaceSettingsRanges() {
  return [
    {id:'settings-config-root',rva:'0x1ecefc',length:4},
    {id:'settings-session-root',rva:'0x1ecb1c',length:4},
    {id:'settings-config',rva:'0x1ecefc',dereferenceOffsets:['0'],length:128},
    {id:'settings-session-header',rva:'0x1ecb1c',dereferenceOffsets:['0'],length:48},
    {id:'settings-session-runtime',rva:'0x1ecb1c',dereferenceOffsets:['0'],offset:'0x54d',length:0xd3},
    {id:'settings-caller',baseRegister:'esp',length:28},
    ...controlledRaceSettingsOutputRanges(),
    {id:'settings-menu-id',rva:'0x1ec138',length:4},
    {id:'settings-launch-latch',rva:'0x2e6654',length:4},
    {id:'settings-main-state',rva:'0x2e66c8',length:8},
    {id:'settings-demo-deadline',rva:'0x2e6aac',length:4},
  ];
}
export function controlledRaceSettingsOutputRanges() {
  return [
    {id:'settings-track-family',rva:'0x174760',length:20},
    {id:'settings-track-local',rva:'0x17477c',length:20},
    {id:'settings-level-stem',rva:'0x2e6660',length:260},
  ];
}
export function controlledRaceSettingsBreakpoint() {
  return {id:'controlled-race-settings',rva:'0x3e0c5',ranges:controlledRaceSettingsRanges()};
}
export function validateControlledRaceSettingsConfiguration(o) {
  const p=o.controlledRaceSettings;
  if(!p||Object.keys(p).sort().join(',')!=='breakpointId,expectedQualityByte,expectedTrackByte,level,quality'||p.breakpointId!=='controlled-race-settings'||!Number.isInteger(p.level)||p.level<1||p.level>20||![0,1].includes(p.quality)||p.expectedTrackByte!==0||p.expectedQualityByte!==1||!o.heldForceInput||o.maxSnapshots!==71||o.captureThreadEnvironment!==true)fail('distinct held input policy/bounds');
  if(!same(o.breakpoints.at(-1),controlledRaceSettingsBreakpoint()))fail('exact site/observation whitelist');
  if(o.phaseActions.some(a=>a.breakpointId===p.breakpointId))fail('generic phase writes forbidden');
  for(const id of ['native-frame-before','native-frame-after']) {
    const b=o.breakpoints.find(b=>b.id===id);
    for(const r of controlledRaceSettingsOutputRanges())if(!same(b?.ranges.find(x=>x.id===r.id),r))fail('actual correlated-output ranges');
  }
  return true;
}
export function controlledRaceSettingsReplacement(policy,{mainBase,ownerTid,tid,configAddress,sessionAddress,config,stack,context,frontend}) {
  if(!policy||policy.breakpointId!=='controlled-race-settings'||!Number.isInteger(policy.level)||policy.level<1||policy.level>20||![0,1].includes(policy.quality)||policy.expectedTrackByte!==0||policy.expectedQualityByte!==1||!Number.isInteger(mainBase)||mainBase<1||mainBase+0x51ffff>0xffffffff||!Number.isInteger(ownerTid)||ownerTid<1||tid!==ownerTid||!Number.isInteger(configAddress)||configAddress<1||configAddress+128>0x100000000||!Number.isInteger(sessionAddress)||sessionAddress<1||sessionAddress+0x620>0x100000000||!Buffer.isBuffer(config)||config.length!==128||!Buffer.isBuffer(stack)||stack.length!==28||!Buffer.isBuffer(context)||context.length!==716||!Buffer.isBuffer(frontend)||frontend.length!==20||frontend.readUInt32LE(0)!==4||frontend.readUInt32LE(4)!==0||frontend.readUInt32LE(8)!==1||frontend.readUInt32LE(16)===0)fail('actual roots/thread/extents/frontend');
  const esp=context.readUInt32LE(196),eax=context.readUInt32LE(176),ecx=context.readUInt32LE(172);
  if(configAddress<sessionAddress+0x620&&sessionAddress<configAddress+128||configAddress<esp+28&&esp<configAddress+128)fail('configuration aliases protected session/stack');
  if(context.readUInt32LE(184)!==mainBase+0x3e0c5||context.readUInt32LE(164)!==0||ecx>19||eax!==ecx||esp<4096||esp+28>0x100000000||stack.readUInt32LE(16)!==10||stack.readUInt32LE(20)!==mainBase+0x3dae8||stack.readUInt32LE(24)>3||config[0x14]!==0||config[0x15]!==10||config[0xb]!==0||config[0x31]!==1)fail('caller/register/mode/original-byte guard');
  const next=Buffer.from(config);next[0xb]=policy.level;next[0x31]=policy.quality;return next;
}
function snapshotMemory(snapshot) {return createCapturedMemory([...snapshot.ranges.values()]).memory;}
export function verifyControlledRaceSettingsSnapshot(snapshot,policy,{mainBase,ownerTid}) {
  if(snapshot.breakpointId!==policy.breakpointId||snapshot.hit!==1||snapshot.tid!==ownerTid||snapshot.capturePhase!=='before-declared-writes-before-original-instruction'||!Buffer.isBuffer(snapshot.context)||snapshot.contextSha256!==sha(snapshot.context))fail('actual one-shot pre-input snapshot');
  const m=snapshotMemory(snapshot),configAddress=m.readUInt32LE(mainBase+0x1ecefc),sessionAddress=m.readUInt32LE(mainBase+0x1ecb1c),esp=snapshot.context.readUInt32LE(196);
  if(!snapshot.threadEnvironment)fail('actual stopped-thread environment absent');bindCapturedNativeThreadEnvironment(snapshot,{memory:m});
  for(const d of controlledRaceSettingsRanges()) {
    const r=snapshot.ranges.get(d.id);let address=d.rva?mainBase+Number(d.rva):esp;
    for(const offset of d.dereferenceOffsets??[])address=m.readUInt32LE(address+Number(offset));address+=Number(d.offset??0);
    if(!r||Number(r.address)!==address||r.length!==d.length||r.bytes.length!==d.length||r.sha256!==sha(r.bytes)||r.rangeMode)fail('exact captured pointer/stack/input extent');
  }
  for(const[name,offset]of [['eip',184],['eax',176],['ecx',172],['ebx',164],['esp',196]])if(Number(snapshot.registers[name])!==snapshot.context.readUInt32LE(offset))fail('raw CONTEXT metadata mismatch');
  const config=m.subarray(configAddress,configAddress+128),stack=m.subarray(esp,esp+28),frontend=Buffer.concat([m.subarray(mainBase+0x1ec138,mainBase+0x1ec138+4),m.subarray(mainBase+0x2e6654,mainBase+0x2e6654+4),m.subarray(mainBase+0x2e66c8,mainBase+0x2e66c8+8),m.subarray(mainBase+0x2e6aac,mainBase+0x2e6aac+4)]),replacement=controlledRaceSettingsReplacement(policy,{mainBase,ownerTid,tid:snapshot.tid,configAddress,sessionAddress,config,stack,context:snapshot.context,frontend});
  return {configAddress,sessionAddress,config,stack,replacement};
}
export function verifyControlledRaceSettingsRecords(configuration,records,snapshot,owner,heldSnapshot) {
  validateControlledRaceSettingsConfiguration(configuration);
  const base=Number(heldSnapshot.moduleBaseAddress??[...heldSnapshot.ranges.values()].find(r=>r.moduleBaseAddress)?.moduleBaseAddress),policy=configuration.controlledRaceSettings;
  if(!owner||owner.type!=='owned-process'||!Number.isInteger(owner.pid)||snapshot.tid!==owner.tid||heldSnapshot.tid!==owner.tid||snapshot.ordinal>=heldSnapshot.ordinal||snapshot.observedDebugEventOrdinal>=heldSnapshot.observedDebugEventOrdinal)fail('owned main-thread observation order');
  const input=verifyControlledRaceSettingsSnapshot(snapshot,policy,{mainBase:base,ownerTid:owner.tid}),guard=records.filter(r=>r.type==='controlled-race-settings-guarded'),writes=records.filter(r=>r.type==='controlled-race-settings-input-write'),done=records.filter(r=>r.type==='controlled-race-settings-intervention');
  if(guard.length!==1||writes.length!==2||done.length!==1)fail('unique guarded two-byte intervention');
  for(const r of [...guard,...writes,...done])if(r.pid!==owner.pid||r.tid!==owner.tid||r.snapshotOrdinal!==snapshot.ordinal||r.observedDebugEventOrdinal!==snapshot.observedDebugEventOrdinal)fail('write provenance');
  const g=guard[0],d=done[0],at=records.indexOf(g),end=records.indexOf(d),pre=records.findIndex(r=>r.type==='snapshot'&&r.ordinal===snapshot.ordinal);
  const debug=records.find(r=>r.type==='debug-event'&&r.ordinal===snapshot.observedDebugEventOrdinal);
  if(!debug||debug.pid!==owner.pid||debug.tid!==owner.tid||debug.event!==1||records.indexOf(debug)>=pre||pre<0||pre>=at||at>=records.indexOf(writes[0])||records.indexOf(writes[0])>=records.indexOf(writes[1])||records.indexOf(writes[1])>=end||records.slice(pre+1,end).some(r=>r.type==='debug-event'))fail('same-stopped-event guard/write order');
  for(const r of [g,d])if(r.breakpointId!==policy.breakpointId||r.rawHit!==1||r.ownerMainTid!==owner.tid||Number(r.configurationAddress)!==input.configAddress||Number(r.sessionAddress)!==input.sessionAddress||r.configurationBeforeHex!==input.config.toString('hex')||r.contextSha256!==snapshot.contextSha256||r.allGuardsBeforeWrites!==true||r.beforeOriginalInstruction!==true)fail('actual guard/preimage identity');
  if(Number(g.stackAddress)!==snapshot.context.readUInt32LE(196)||g.stackBytesHex!==input.stack.toString('hex')||d.configurationAfterHex!==input.replacement.toString('hex')||d.level!==policy.level||d.quality!==policy.quality||d.contextUnchanged!==true||d.allOtherCapturedBytesUnchanged!==true||d.rootsUnchanged!==true||d.nativeOutputsWritten!==false)fail('full configuration/context transition');
  const target=Buffer.alloc(4);target.writeUInt32LE(base+0x1ecefc);
  if(Number(g.instructionAddress)!==base+0x3e0c5||g.breakpointInstructionHex!==`cc${target.toString('hex')}`||g.restoredInstructionHex!==`a1${target.toString('hex')}`)fail('original relocated instruction proof');
  for(const[i,offset]of [0xb,0x31].entries())if(writes[i].index!==i+1||Number(writes[i].address)!==input.configAddress+offset||writes[i].length!==1||writes[i].originalBytesHex!==input.config.subarray(offset,offset+1).toString('hex')||writes[i].replacementBytesHex!==input.replacement.subarray(offset,offset+1).toString('hex'))fail('exact two input writes');
  for(const id of ['settings-track-family','settings-track-local'])if(!snapshot.ranges.get(id).bytes.equals(heldSnapshot.ranges.get(id)?.bytes))fail('immutable original classification tables changed');
  const outputs=records.filter(r=>r.type==='controlled-race-settings-native-outputs'),m=snapshotMemory(heldSnapshot),session=m.readUInt32LE(base+0x1ecb1c),heldIndex=records.findIndex(r=>r.type==='snapshot'&&r.ordinal===heldSnapshot.ordinal);
  if(outputs.length!==1)fail('unique actual native output observation');
  const out=outputs[0];
  if(records.indexOf(out)<=end||records.indexOf(out)>=heldIndex||out.pid!==owner.pid||out.tid!==owner.tid||out.observedDebugEventOrdinal!==heldSnapshot.observedDebugEventOrdinal||Number(out.sessionAddress)!==session||out.level!==policy.level||out.quality!==policy.quality||out.sessionHeaderHex!==m.subarray(session,session+48).toString('hex')||out.sessionRuntimeHex!==m.subarray(session+0x54d,session+0x620).toString('hex')||out.familyTableHex!==heldSnapshot.ranges.get('settings-track-family').bytes.toString('hex')||out.localTableHex!==heldSnapshot.ranges.get('settings-track-local').bytes.toString('hex')||out.nativeStemHex!==heldSnapshot.ranges.get('settings-level-stem').bytes.toString('hex')||out.nativeOutputsWritten!==false||out.configurationPersistenceAssumed!==false||out.beforeHeldRequest!==true)fail('native output marker/current captured span association');
  return {...verifyControlledRaceSettingsOutputs(heldSnapshot,policy,base),snapshotOrdinal:snapshot.ordinal,guardedDebugEventOrdinal:snapshot.observedDebugEventOrdinal,configBeforeHex:g.configurationBeforeHex,configAfterHex:d.configurationAfterHex,allOtherCapturedBytesUnchanged:true,contextUnchanged:true};
}
export function verifyControlledRaceSettingsOutputs(snapshot,policy,base) {
  const m=snapshotMemory(snapshot),session=m.readUInt32LE(base+0x1ecb1c),index=policy.level-1;
  for(const r of controlledRaceSettingsOutputRanges()) {const a=snapshot.ranges.get(r.id);if(!a||Number(a.address)!==base+Number(r.rva)||a.length!==r.length||a.bytes.length!==r.length||a.sha256!==sha(a.bytes))fail('captured native output/table identity');}
  const stemBytes=m.subarray(base+0x2e6660,base+0x2e6660+260),nul=stemBytes.indexOf(0);if(nul<0)fail('native stem terminator');
  const stem=stemBytes.subarray(0,nul).toString('ascii'),expected=`${policy.quality?'high':'low'}/lev${policy.level}`;
  if(m[session+0x579]!==index||m[session+0xe]!==m[base+0x174760+index]||m[session+0xf]!==m[base+0x17477c+index]||stem.replaceAll('\\','/')!==expected)fail('native correlated track/family/local/stem outputs');
  return {verified:true,level:policy.level,quality:policy.quality,nativeTrackIndex:m[session+0x579],nativeFamily:m[session+0xe],nativeLocalIndex:m[session+0xf],nativeStem:stem,configurationPersistenceAssumed:false,rosterOrRngForced:false};
}
