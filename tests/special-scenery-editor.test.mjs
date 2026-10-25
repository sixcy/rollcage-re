import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneryFixture} from './lib/scenery-fixture.mjs';
import {createSceneryDraft,inspectScenery,compileSceneryEdits,applySceneryTransform} from '../src/scenery-editor.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
const records=source=>parsePlacements(source.texture,parseGFXM(source.geometry).models).records;

test('existing special transforms preserve class, destruction configuration and all opaque placement bytes',()=>{
  const source=sceneryFixture(),original=records(source),draft=createSceneryDraft(source.geometry,source.texture,1);
  draft[1].position=[70,-12,41];draft[1].yaw=1024;const out=compileSceneryEdits(source,draft,{level:1}),p=records(out)[1];
  assert.equal(p.raw[31],1);assert.deepEqual(p.position,draft[1].position);assert.equal(p.angles[1],1024);
  for(let i=0;i<56;i++)if(![8,9,10,11,12,13,16,17].includes(i))assert.equal(p.raw[i],original[1].raw[i]);
  const copy=[...draft,{...draft[1],id:'special-copy'}];assert.throws(()=>compileSceneryEdits(source,copy,{level:1}),/duplication|duplicated/);
  assert.throws(()=>compileSceneryEdits(source,draft.slice(0,1),{level:1}),/cannot be removed/);
});

test('linked destruction chains transform as complete units and reject partial or distorted edits',()=>{
  const source=sceneryFixture();source.geometry.writeUInt32LE(0x1480,0x80);
  for(let i=0;i<2;i++){source.texture.writeUInt16LE(0,0x506+i*56);source.texture[0x51f+i*56]=0;}source.texture[0x516+56]=1;
  const info=inspectScenery(source.geometry,source.texture),original=createSceneryDraft(source.geometry,source.texture,1);assert.deepEqual(info[0].linkedIndices,[0,1]);assert.deepEqual(info[1].linkedIndices,[0,1]);
  let draft=applySceneryTransform(original,{id:'original-0',position:[80,0,60],yaw:1024},info),out=compileSceneryEdits(source,draft,{level:1});assert.equal(records(out)[1].angles[1],1024);assert.deepEqual(records(out).map(p=>p.position),draft.map(r=>r.position));
  draft=structuredClone(original);draft[1].position[0]++;assert.throws(()=>compileSceneryEdits(source,draft,{level:1}),/transformed together/);
  let rotated=applySceneryTransform(original,{id:'original-0',yaw:16},info);rotated=applySceneryTransform(rotated,{id:'original-0',yaw:32},info);rotated=applySceneryTransform(rotated,{id:'original-0',yaw:0},info);assert.deepEqual(rotated,original,'Repeated quantized edits return to original linked positions without accumulating rounding drift');
  assert.equal(records(source)[1].position[0],42);
});

test('authored tilt stays intact during translation and rejects yaw changes',()=>{
  const source=sceneryFixture();source.texture.writeInt16LE(16,0x50e);const original=createSceneryDraft(source.geometry,source.texture,1),info=inspectScenery(source.geometry,source.texture);assert.equal(info[0].editable,true);assert.equal(info[0].yawEditable,false);
  const draft=applySceneryTransform(original,{id:'original-0',position:[60,10,32]},info),out=compileSceneryEdits(source,draft,{level:1});assert.equal(records(out)[0].angles[0],16);
  draft[0].yaw=1024;assert.throws(()=>compileSceneryEdits(source,draft,{level:1}),/translation only/);
});

test('attached emitter coordinates follow original transforms and shared targets require all owners',()=>{
  const source=sceneryFixture(),geometry=Buffer.alloc(0x1600);geometry.set(source.geometry);source.geometry=geometry;geometry.writeUInt32LE(0x1500,0x108);geometry.writeInt16LE(44,0x1500);geometry.writeInt16LE(-5,0x1502);geometry.writeInt16LE(32,0x1504);
  source.texture.writeUInt16LE(0x3000,0x52e);const original=createSceneryDraft(geometry,source.texture,1),info=inspectScenery(geometry,source.texture),draft=applySceneryTransform(original,{id:'original-0',position:[64,0,32]},info),out=compileSceneryEdits(source,draft,{level:1});assert.equal(out.geometry.readInt16LE(0x1500),76);assert.equal(out.geometry.readInt16LE(0x1502),-5);assert.deepEqual(out.geometry.subarray(0x1506,0x150c),geometry.subarray(0x1506,0x150c));
  source.texture.writeUInt16LE(0x3000,0x52e+56);assert.throws(()=>compileSceneryEdits(source,draft,{level:1}),/every owning object|transformed together/);
  const linked=inspectScenery(geometry,source.texture);assert.deepEqual(linked[0].linkedIndices,[0,1]);const moved=applySceneryTransform(original,{id:'original-0',position:[64,0,32]},linked);assert.equal(compileSceneryEdits(source,moved,{level:1}).geometry.readInt16LE(0x1500),76);
});

test('unknown attachment types and broken group configuration remain explicitly locked',()=>{
  const source=sceneryFixture();source.texture.writeUInt16LE(0x6000,0x52e);assert.equal(inspectScenery(source.geometry,source.texture)[0].editable,false);
  const other=sceneryFixture();other.texture.writeUInt16LE(100,0x506);assert.equal(inspectScenery(other.geometry,other.texture)[0].editable,false);
});

test('attached static lights move and recompute native terrain ranges instead of retaining stale coverage',()=>{
  const source=sceneryFixture(),geometry=Buffer.alloc(0x1900);geometry.set(source.geometry);source.geometry=geometry;
  geometry.writeUInt32LE(0x1500,0x14);geometry.writeUInt32LE(0x1510,0x1500);geometry.writeUInt32LE(32,0x151c);geometry.writeUInt32LE(0x1580,0x28);geometry.writeUInt16LE(8,0x1580);geometry.writeUInt16LE(0,0x1582);
  geometry.writeUInt32LE((2<<19)|1|(2<<7)|(2<<1),0x1120);geometry.writeUInt32LE(0x1600,0x44);geometry.writeUInt32LE(1,0x48);geometry.writeInt16LE(44,0x1606);geometry.writeInt16LE(0,0x1608);geometry.writeInt16LE(32,0x160a);geometry[0x160c]=10;geometry.writeUInt32LE(0xdeadbeef,0x1610);
  source.texture.writeUInt16LE(0x1000,0x52e);const original=createSceneryDraft(geometry,source.texture,1),info=inspectScenery(geometry,source.texture),draft=applySceneryTransform(original,{id:'original-0',position:[64,0,32]},info),out=compileSceneryEdits(source,draft,{level:1});assert.equal(out.geometry.readInt16LE(0x1606),76);assert.notEqual(out.geometry.readUInt32LE(0x1610),0xdeadbeef);assert.equal(out.geometry.readUInt32LE(0x1610),0xb00600);
  assert.deepEqual(out.geometry.subarray(0x1600,0x1606),geometry.subarray(0x1600,0x1606));assert.deepEqual(geometry.readUInt32LE(0x1610),0xdeadbeef);
});
