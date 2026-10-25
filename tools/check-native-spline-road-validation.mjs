// Independent comparison of bounded native loaded spans against the exported
// archive, including raw blob hashes and owned input/cleanup records.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
const [root,output]=process.argv.slice(2);if(!root||!output)throw Error('Usage: node tools/check-native-spline-road-validation.mjs CASE_ROOT NEW_REPORT.json');
const sha=d=>createHash('sha256').update(d).digest('hex'),fileHash=async filename=>{const h=createHash('sha256');let length=0;for await(const bytes of createReadStream(filename)){h.update(bytes);length+=bytes.length;}return {length,sha256:h.digest('hex')};};
const config=JSON.parse(await readFile(path.join(root,'spline-road-capture-config.json'),'utf8')),expected=JSON.parse(await readFile(path.join(root,'spline-road-expected.json'),'utf8')),manifest=JSON.parse(await readFile(path.join(root,'installation-manifest.json'),'utf8'));
const capture=await loadPhysicsCapture(path.join(root,'capture'),{expectedSha256:config.expectedSha256}),records=(await readFile(path.join(root,'capture/trace.jsonl'),'utf8')).trim().split(/\r?\n/).map(JSON.parse),checks=[];
const observerManifest=JSON.parse(await readFile(path.join(root,'observer-manifest.json'),'utf8'));for(const file of observerManifest.files)assert.deepEqual(await fileHash(path.join(root,file.path)),{length:file.length,sha256:file.sha256});assert.equal(records.find(r=>r.type==='capture').helperSourceSha256,observerManifest.files.find(f=>f.path==='observer-source.cs').sha256);
assert.equal(sha(await readFile(path.join(root,'capture/configuration.json'))),observerManifest.files.find(f=>f.path==='spline-road-capture-config.json').sha256);
const entry=capture.snapshots.find(s=>s.breakpointId==='pickup-loader-entry');assert.ok(entry);assert.equal(entry.ranges.get('pickup-loader-name').bytes.toString('ascii').replaceAll('\\','/').toUpperCase().replace(/\0.*$/s,'').replace(/\.BLP$/,''),`${expected.quality}/LEV${expected.level}`);
const input=records.find(r=>r.type==='controlled-race-settings-intervention');assert.ok(input?.contextUnchanged&&input.allOtherCapturedBytesUnchanged&&input.nativeOutputsWritten===false);assert.equal(input.level,expected.level);assert.equal(input.quality,expected.quality==='LOW'?0:1);
let archive;try{
 archive=await RollcageArchive.open(path.join(root,'installation'));const t=getGame('rollcage').tracks.find(t=>t.name===`${expected.quality}/LEV${expected.level}.BLP`),data=(await archive.readResource(t.index)).data;assert.equal(sha(data),expected.resourceSha256);
 for(const snapshot of capture.snapshots.filter(s=>s.ranges.has('pickup-module-roots'))){
  const base=snapshot.ranges.get('pickup-module-roots').bytes.readUInt32LE();
  for(const span of expected.probe.spans){const r=snapshot.ranges.get(span.id);assert.ok(r);assert.equal(Number(r.address),base+span.offset);assert.equal(r.bytes.toString('hex'),span.expectedHex);assert.equal(r.bytes.toString('hex'),data.subarray(span.offset,span.offset+span.length).toString('hex'));checks.push({snapshot:snapshot.ordinal,id:span.id,address:r.address,length:r.length,sha256:r.sha256});}
 }
 assert.ok(checks.length);assert.ok(capture.snapshots.some(s=>s.breakpointId==='pickup-first-tick'));assert.ok(records.some(r=>r.type==='owned-process-cleanup'&&r.terminated));
 const files=[];for(const file of manifest.files){const source=await fileHash(path.join(manifest.source,file.path));assert.deepEqual(source,{length:file.length,sha256:file.sha256});const staged=await fileHash(path.join(root,'installation',file.path));const expectedHash=file.path==='IDXData/Rollcage.img'?config.pickupEditorObservation.imageSha256:file.path==='IDXData/Rollcage.idx'?config.pickupEditorObservation.indexSha256:file.sha256;assert.equal(staged.sha256,expectedHash);files.push({path:file.path,sourceUnchanged:true,stagedSha256:staged.sha256});}
 const grid=parseCollisionGrid(data),contracts=[];
 for(const snapshot of capture.snapshots.filter(s=>s.ranges.has('spline-sector-header'))){
  const base=snapshot.ranges.get('pickup-module-roots').bytes.readUInt32LE(),header=snapshot.ranges.get('pickup-scene-header').bytes,sector=snapshot.ranges.get('spline-sector-header').bytes,road=expected.splineRoadObservation,original=data.subarray(road.sectorOffset,road.sectorOffset+96),table=snapshot.ranges.get('spline-sector-table-entry');
  assert.equal(header.readUInt32LE(8),road.packetCount);assert.equal(header.readUInt32LE(16),17);assert.equal(table.bytes.readUInt32LE(),base+road.sectorOffset);assert.equal(Number(table.address),base+data.readUInt32LE(0x14)+16*4);assert.equal(sector.toString('ascii',0,4),'SEGM');assert.equal(sector.readUInt32LE(8),4);assert.equal(sector.readUInt32LE(12),8);
  const pointers=[];for(const offset of [0x20,0x28,0x2c,0x30,0x3c,0x40,0x44,0x50,0x54,0x58,0x5c]){assert.equal(sector.readUInt32LE(offset),base+original.readUInt32LE(offset));pointers.push({offset,pointer:sector.readUInt32LE(offset)});}
  assert.equal(sector.readUInt32LE(0x38),base+data.readUInt32LE(0x50)+original.readUInt32LE(0x38));assert.equal(sector.readUInt32LE(0x48),base+road.instanceOffset);assert.equal(sector.readUInt32LE(0x4c),base+road.rowStateOffset+road.rowStateIndex*28);
  assert.equal(Number(snapshot.ranges.get('spline-row-state').address),sector.readUInt32LE(0x4c));assert.equal(snapshot.ranges.get('spline-row-state').bytes.length,(road.sectorRows+1)*28);assert.equal(Number(snapshot.ranges.get('spline-instance-rows').address),sector.readUInt32LE(0x48));
  const render=snapshot.ranges.get('spline-render-root'),packet=snapshot.ranges.get('spline-render-packet');assert.equal(Number(render.address),Number(render.moduleBaseAddress)+0x509244);assert.equal(Number(packet.address),render.bytes.readUInt32LE()+road.packetIndex*0x120);assert.equal(packet.bytes.length,0x120);
  // 44c770 initializes both packet buffers. Subsequent renderer passes write
  // lighting, primitive commands and chain links into these same buffers.
  const initialized=['pickup-init-entry','pickup-init-return','pickup-first-tick'].includes(snapshot.breakpointId);if(initialized){assert.equal(packet.bytes.readUInt16LE(3),0xff0c);assert.equal(packet.bytes.readUInt16LE(0x87),0xff0c);}
  contracts.push({snapshot:snapshot.ordinal,sectorIndex:16,packetIndex:road.packetIndex,packetCount:road.packetCount,rowStateAddress:sector.readUInt32LE(0x4c),renderPacketAddress:packet.address,packetInitializationChecked:initialized,pointers});
 }
 assert.ok(contracts.length>=2);const contacts=[];for(const snapshot of capture.snapshots.filter(s=>s.breakpointId==='pickup-terrain-contact')){
  const body=snapshot.ranges.get('terrain-contact-body').bytes,query=snapshot.ranges.get('terrain-contact-query').bytes,result=snapshot.ranges.get('terrain-contact-output').bytes,cell=result.readInt32LE(32);assert.equal(body.readUInt32LE()&511,3);assert.notEqual(result.readInt32LE(28),0);assert.ok(expected.probe.allowedCellRefs.includes(cell));
  const sector=cell&255,column=(cell<<16)>>24,row=cell>>16,pointQ8=[0,4,8].map(o=>result.readInt32LE(o)),normalQ16=[12,16,20].map(o=>result.readInt32LE(o)),s=grid.sectors[sector],forms=s.cells[row*s.columns+column].forms;
  const form=forms.find(f=>grid.normals[f.normal].components.every((n,i)=>n*256===normalQ16[i]));assert.ok(form,'Native contact normal equals an exported cell plane');
  const normal=grid.normals[form.normal].components,anchor=s.vertices[form.indices[0]],planeError=Math.abs(normal.reduce((sum,n,i)=>sum+n*(pointQ8[i]/256-anchor[i]),0))/Math.hypot(...normal);
  if(query.readInt32LE(64)===0)assert.ok(planeError<=1,'Native wheel hit lies on the exported plane (one source-unit packed-normal tolerance)');
  contacts.push({snapshot:snapshot.ordinal,cellRef:cell,sector,row,column,flags:result.readInt32LE(28),radiusQ8:query.readInt32LE(64),pointQ8,normalQ16,exportedNormalMatched:true,planeError});
 }
 if(expected.probe.requireContact)assert.ok(contacts.length,'Declared native edited-cell contact is required');
 const report={passed:true,contracts,authority:'original-process-with-declared-instrumentation',quality:expected.quality,level:expected.level,checks,contacts,files,completion:capture.complete,scope:expected.scope};
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:true,quality:report.quality,contracts:contracts.length,checks:checks.length,contacts,files:files.length,output}));
}finally{await archive?.close();}
