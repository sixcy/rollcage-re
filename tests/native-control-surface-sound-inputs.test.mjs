import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {nativeControlSurfaceSound7CaptureRange,nativeControlSurfaceSound7ObservedRegions} from '../tools/lib/native-control-surface-sound-inputs.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {createNativeParentRttiCaptureConfig} from '../tools/prepare-native-parent-rtti-capture.mjs';
import {verifyNativeParentRttiCaptureConfiguration} from '../tools/lib/native-parent-rtti-capture.mjs';

const base=0x940000,root=base+0x2f2414,begin=0x100c07a0,ownerAddress=0x08c76148;
const word=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
function fixture({nullOwner=false}={}){
  const header=Buffer.concat([word(begin),word(begin+64*4),word(begin+94*4)]),storage=Buffer.alloc(94*4,0x69),pointer=nullOwner?0:ownerAddress;storage.writeUInt32LE(pointer,28);
  const rows=[{id:'header',address:root,bytes:header,length:12},{id:'control-sound-bank-storage',address:begin,bytes:storage,length:storage.length,rootRva:'0x2f2414',moduleBaseAddress:base,rangeMode:'vector-storage',vectorHeaderAddress:root,vectorHeaderHex:header.toString('hex'),vectorBegin:begin,vectorEnd:begin+64*4,vectorCapacity:begin+94*4,maxVectorBytes:65536},
    {id:'control-surface-sound7-owner',address:pointer,bytes:Buffer.alloc(nullOwner?0:0x490,0x73),length:nullOwner?0:0x490,rangeMode:'guarded-pointer',rootRva:'0x2f2414',moduleBaseAddress:base,guardedRootAddress:root,dereferenceOffsets:['0','0x1c'],dereferenceMinimumValues:[1,1],guardedDeclaredLength:0x490,guardedStopIndex:nullOwner?1:null,guardedPointerReadBytes:8,guardedPointerSteps:[{index:0,readAddress:root,value:begin,minimumValue:1,bytesHex:word(begin).toString('hex')},{index:1,readAddress:begin+28,value:pointer,minimumValue:1,bytesHex:word(pointer).toString('hex')}]}];
  return {breakpointId:'native-control-before',ranges:new Map(rows.map(row=>[row.id,row]))};
}
const owner=s=>s.ranges.get('control-surface-sound7-owner'),bank=s=>s.ranges.get('control-sound-bank-storage');

test('synthetic original code7 owner is admitted exactly490h without any descendants; actual NULL grants no memory and after states cannot seed input',()=>{
  assert.deepEqual(nativeControlSurfaceSound7CaptureRange(),{id:'control-surface-sound7-owner',rva:'0x2f2414',dereferenceOffsets:['0','0x1c'],dereferenceMinimumValues:[1,1],length:0x490});
  const snapshot=fixture(),before=[...snapshot.ranges.values()].map(row=>Buffer.from(row.bytes));
  const regions=nativeControlSurfaceSound7ObservedRegions(snapshot,base);assert.equal(regions.length,1);assert.deepEqual([regions[0].id,regions[0].address,regions[0].length,regions[0].comparison],['control-surface-sound7-owner',ownerAddress,0x490,'mutable']);
  assert.deepEqual([...snapshot.ranges.values()].map(row=>row.bytes),before);
  assert.deepEqual(nativeControlSurfaceSound7ObservedRegions({...snapshot,ranges:[...snapshot.ranges.values()]},base),regions);
  const empty=fixture({nullOwner:true});assert.deepEqual(nativeControlSurfaceSound7ObservedRegions(empty,base),[]);assert.throws(()=>createCapturedMemory([...empty.ranges.values()]).span(0,1),/Uncaptured/);
  for(const breakpointId of ['native-control-after-ai','native-control-after-world-effects',undefined])assert.throws(()=>nativeControlSurfaceSound7ObservedRegions({...snapshot,breakpointId},base),/original parent-entry/);
});

test('surface input rejects forged guards, missing/duplicate storage, wrong module, unused slot, capacity and owner extents',()=>{
  for(const change of [
    s=>owner(s).guardedPointerSteps[1].readAddress++,s=>owner(s).guardedPointerSteps[1].value++,s=>owner(s).guardedPointerSteps[1].bytesHex='00000000',
    s=>owner(s).address++,s=>owner(s).bytes=Buffer.alloc(0x48f),s=>owner(s).guardedDeclaredLength--,s=>owner(s).length--,
    s=>owner(s).dereferenceMinimumValues=[1,257],s=>owner(s).dereferenceOffsets=['0','0x18'],s=>owner(s).offset=1,
    s=>{owner(s).rootAddress=root;delete owner(s).rootRva;},s=>owner(s).moduleBaseAddress++,s=>bank(s).moduleBaseAddress++,s=>bank(s).rootRva='0x2f2418',
    s=>bank(s).vectorHeaderHex='00'.repeat(12),s=>bank(s).vectorHeaderAddress++,s=>bank(s).vectorBegin++,s=>bank(s).vectorCapacity++,s=>bank(s).maxVectorBytes=65537,
    s=>bank(s).length--,s=>bank(s).bytes=Buffer.alloc(372),s=>s.ranges.delete('header'),s=>s.ranges.delete('control-surface-sound7-owner'),
    s=>{const h=s.ranges.get('header').bytes;h.writeUInt32LE(begin+28,4);bank(s).vectorEnd=begin+28;bank(s).vectorHeaderHex=h.toString('hex');},
    s=>{const h=s.ranges.get('header').bytes;h.writeUInt32LE(begin+255,4);bank(s).vectorEnd=begin+255;bank(s).vectorHeaderHex=h.toString('hex');},
  ]){const snapshot=fixture();change(snapshot);assert.throws(()=>nativeControlSurfaceSound7ObservedRegions(snapshot,base));}
  const nullSnapshot=fixture({nullOwner:true});owner(nullSnapshot).bytes=Buffer.alloc(0x490);owner(nullSnapshot).length=0x490;assert.throws(()=>nativeControlSurfaceSound7ObservedRegions(nullSnapshot,base));
  const duplicate=fixture(),rows=[...duplicate.ranges.values()];assert.throws(()=>nativeControlSurfaceSound7ObservedRegions({...duplicate,ranges:[...rows,rows[1]]},base),/one original/);
  assert.throws(()=>nativeControlSurfaceSound7ObservedRegions(fixture(),0xffffffff),/module base/);
});

test('surface profile is optional, preserves old configurations, and authenticates exact descriptors at all ten original parent sites only',async()=>{
  const options={viewportMapGraph:true,weatherScreenQueries:true,weatherCounterObservation:true,tyreSound2:true};
  const original=await createNativeParentRttiCaptureConfig('synthetic','never-launch',options),off=await createNativeParentRttiCaptureConfig('synthetic','never-launch',{...options,surfaceSound7:false});assert.deepEqual(off.configuration,original.configuration);
  const added=await createNativeParentRttiCaptureConfig('synthetic','never-launch',{...options,surfaceSound7:true}),config=added.configuration,range=nativeControlSurfaceSound7CaptureRange();assert.equal(added.surfaceSound7,true);assert.equal(config.maxSnapshots,21);assert.equal(config.maxDurationMs,90000);assert.equal(config.maxEvents,1000000);assert.equal(config.breakpoints.length,17);assert.equal(config.parentRttiObservation.surfaceSound7,undefined);assert.equal(config.phaseActions.length,3);
  let count=0;for(const point of config.breakpoints){const rows=point.ranges.filter(row=>row.id===range.id);assert.deepEqual(rows,point.id.startsWith('native-control-')?[range]:[]);count+=rows.length;}assert.equal(count,10);
  const restored=structuredClone(config);for(const point of restored.breakpoints)point.ranges=point.ranges.filter(row=>row.id!==range.id);assert.deepEqual(restored,original.configuration);assert.equal(verifyNativeParentRttiCaptureConfiguration(config).surfaceSound7,true);
  for(const change of [
    c=>c.breakpoints.find(p=>p.id==='native-control-after').ranges.find(r=>r.id===range.id).length++,
    c=>c.breakpoints.find(p=>p.id==='native-control-after').ranges.find(r=>r.id===range.id).dereferenceOffsets=['0','0x18'],
    c=>c.breakpoints.find(p=>p.id==='native-control-after').ranges=c.breakpoints.find(p=>p.id==='native-control-after').ranges.filter(r=>r.id!==range.id),
    c=>c.breakpoints.find(p=>p.id==='native-control-before').ranges=c.breakpoints.find(p=>p.id==='native-control-before').ranges.filter(r=>r.id!==range.id),
    c=>c.breakpoints.find(p=>p.id==='native-control-after').ranges=c.breakpoints.find(p=>p.id==='native-control-after').ranges.filter(r=>r.id!=='control-sound-bank-storage'),
    c=>c.breakpoints[0].ranges.push(range),c=>c.breakpoints.at(-1).ranges.push(range),c=>c.breakpoints.find(p=>p.id==='native-control-before').ranges.push(range),
    c=>c.phaseActions.push({breakpointId:'native-control-before',hit:1,writes:[]}),c=>c.parentRttiObservation.surfaceSound7=true,
  ]){const bad=structuredClone(config);change(bad);assert.throws(()=>verifyNativeParentRttiCaptureConfiguration(bad));}
  await assert.rejects(createNativeParentRttiCaptureConfig('synthetic','never-launch',{surfaceSound7:true,collisionSound19:false}),/bank/);
  for(const surfaceSound7 of [1,'true',null])await assert.rejects(createNativeParentRttiCaptureConfig('synthetic','never-launch',{surfaceSound7}),/boolean/);
});

test('new CLI prepares only and rejects duplicate flags; it never launches the game',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'rollcage-surface-input-'));
  try {
    const file=path.join(dir,'configuration.json'),output=path.join(dir,'never-launch'),tool='tools/prepare-native-parent-rtti-capture.mjs';
    const result=spawnSync(process.execPath,[tool,'synthetic',output,file,'24576','60','--surface-sound7'],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).preparedOnly,true);assert.equal(JSON.parse(result.stdout).launchBlockedUntilHelperCapability,true);
    const config=JSON.parse(await readFile(file,'utf8'));assert.equal(verifyNativeParentRttiCaptureConfiguration(config).surfaceSound7,true);
    const duplicate=spawnSync(process.execPath,[tool,'synthetic',output,path.join(dir,'duplicate.json'),'--surface-sound7','--surface-sound7'],{encoding:'utf8',windowsHide:true,timeout:10000});assert.notEqual(duplicate.status,0);assert.match(duplicate.stderr,/duplicate RTTI option/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('retained original V5 proves code7 slot but honestly lacks owner bytes; it cannot become a positive owner-input record',async()=>{
  const directory='analysis/native-parent-rtti-stock-capture-v5-20261024',records=(await readFile(path.join(directory,'trace.jsonl'),'utf8')).trim().split(/\r?\n/).map(JSON.parse),snapshot=records.find(r=>r.type==='snapshot'&&r.breakpointId==='native-control-before');
  const rows=[];for(const id of ['sound-owner-vector-roots','control-sound-bank-storage']){const row=snapshot.ranges.find(r=>r.id===id);assert.ok(row);const bytes=await readFile(path.join(directory,row.file));assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);rows.push({...row,bytes});}
  assert.equal(Number(rows[0].moduleBaseAddress),base);assert.equal(rows[1].bytes.readUInt32LE(7*4),ownerAddress);
  assert.ok(snapshot.ranges.every(row=>!(Number(row.address)<ownerAddress+0x490&&Number(row.address)+row.length>ownerAddress)));
  assert.throws(()=>nativeControlSurfaceSound7ObservedRegions({...snapshot,ranges:rows},base),/one original/);
});
