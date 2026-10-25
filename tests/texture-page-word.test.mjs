import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeTexturePageWord,encodeTexturePageWord,isSupportedStaticTextureWord,trackTextureCapacity} from '../src/texture-page-word.mjs';
import {sceneryFixture} from './lib/scenery-fixture.mjs';
import {createSceneryDraft,compileSceneryEdits,inspectSceneryImport} from '../src/scenery-editor.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {readModelMaterials} from '../src/model-materials.mjs';
import {parseBTP,decodeBTPTexture} from '../src/btp.mjs';
import {parseScene} from '../src/scene.mjs';

const expand=(source,count)=>{const table=source.texture.length,texture=Buffer.alloc(table+count*12);texture.set(source.texture);for(let i=0;i<count;i++)texture.set(source.texture.subarray(0x70,0x7c),table+i*12);texture.writeUInt32LE(table,0x38);texture.writeUInt16LE(count,0x34);if(count>63)texture.fill(0,table+63*12,table+64*12);return {...source,texture};};
const imported=(source,donor)=>{const draft=createSceneryDraft(source.geometry,source.texture,1);draft.push({id:'foreign',sourceLevel:2,templateIndex:0,position:[50,0,30],yaw:0});return {draft,options:{level:1,donors:new Map([[2,{LOW:donor,HIGH:donor}]])}};};
test('all512 native logical IDs round-trip without consuming packet flag bits',()=>{
  for(let index=0;index<512;index++)for(const flags of [0,0x40,0x80,0xf8c0]){const encoded=encodeTexturePageWord(index,flags);assert.equal(decodeTexturePageWord(encoded),index);assert.equal(encoded&0xf8c0,flags);}
  assert.equal(encodeTexturePageWord(64),0x100);assert.equal(decodeTexturePageWord(0x0147),71);assert.equal(isSupportedStaticTextureWord(0x0147),true);assert.equal(isSupportedStaticTextureWord(0x0187),false);
  for(const id of [-1,512,NaN])assert.throws(()=>encodeTexturePageWord(id),/512/);assert.throws(()=>decodeTexturePageWord(65536),/16-bit/);
});
test('native runtime headroom counts original extra texture producers and reserved63 gap',()=>{
  assert.equal(trackTextureCapacity(484).valid,true);assert.equal(trackTextureCapacity(485).valid,false);assert.equal(trackTextureCapacity(63).reserved63Skip,1);assert.equal(trackTextureCapacity(64).reserved63Skip,0);
});
test('terrain readers use the full native page while the explicit legacy adapter retains six bits',()=>{
  const data=Buffer.alloc(444);data.write('GFXM');data.writeUInt32LE(1,0x10);data.writeUInt32LE(288,0x14);data.writeUInt32LE(292,288);data.writeUInt32LE(428,0x110);data.write('SEGM',292);data.writeUInt32LE(1,300);data.writeUInt32LE(1,304);data.writeUInt32LE(388,324);data.writeUInt32LE(420,372);data.writeUInt16LE(encodeTexturePageWord(73,0x40),434);
  assert.equal(parseScene(data).segments[0].faces[0].page,73);assert.equal(parseScene(data,{texturePageMode:'legacy'}).segments[0].faces[0].page,9);assert.equal(parseScene(data).segments[0].faces[0].pageWord,0x149);
});
test('import passes page63 boundary, preserves old pixels and encodes native ID64',()=>{
  const source=expand(sceneryFixture(),63),before={geometry:Buffer.from(source.geometry),texture:Buffer.from(source.texture)},donor=sceneryFixture({color:200}),{draft,options}=imported(source,donor),out=compileSceneryEdits(source,draft,options),btp=parseBTP(out.texture);
  assert.equal(btp.textureCount,65);assert.equal(btp.textures[63].empty,true);assert.deepEqual(decodeBTPTexture(btp,64).rgba,decodeBTPTexture(parseBTP(donor.texture),0).rgba);assert.deepEqual(decodeBTPTexture(btp,0).rgba,decodeBTPTexture(parseBTP(source.texture),0).rgba);
  const model=parseGFXM(out.geometry).models[1],record=parsePlacements(out.texture,parseGFXM(out.geometry).models).records[out.indices.foreign],face=readModelMaterials(out.geometry,model,record.uvStarts[0])[0];assert.equal(face.page,64);assert.equal(face.pageWord,0x100);assert.deepEqual(source,before);
  const report=inspectSceneryImport(source,draft,options);assert.equal(report.compatible,true);assert.equal(report.finalTextureCount,65);assert.deepEqual(report.textureAllocations.map(a=>[a.sourcePage,a.targetPage,a.action]),[[0,64,'append']]);assert.ok(!('geometry'in report)&&!('texture'in report));
});
test('foreign donor high-bank image references are decoded before dependency copying',()=>{
  const source=sceneryFixture(),donor=expand(sceneryFixture({color:200}),66);donor.geometry.writeUInt16LE(encodeTexturePageWord(65,0x40),0x1416);const {draft,options}=imported(source,donor),out=compileSceneryEdits(source,draft,options),models=parseGFXM(out.geometry).models,p=parsePlacements(out.texture,models).records[out.indices.foreign],face=readModelMaterials(out.geometry,models[p.modelIndex],p.uvStarts[0])[0];assert.equal(face.page,1);assert.equal(face.pageWord,0x41);assert.deepEqual(decodeBTPTexture(parseBTP(out.texture),1).rgba,decodeBTPTexture(parseBTP(donor.texture),65).rgba);
});
test('a transparent append may establish or extend the native contiguous range, never recolouring old pages',()=>{
  const source=sceneryFixture(),donor=sceneryFixture({color:200});donor.texture[0x32]=0;donor.texture[0x33]=1;const {draft,options}=imported(source,donor),out=compileSceneryEdits(source,draft,options),btp=parseBTP(out.texture);assert.equal(btp.transparentStart,1);assert.equal(btp.transparentCount,1);assert.equal(btp.textures[0].transparentBlack,false);assert.equal(btp.textures[1].transparentBlack,true);assert.deepEqual(decodeBTPTexture(btp,1).rgba,decodeBTPTexture(parseBTP(donor.texture),0).rgba);
  const blocked=expand(source,2);blocked.texture[0x32]=0;blocked.texture[0x33]=1;const b=imported(blocked,donor),before=Buffer.from(blocked.texture),report=inspectSceneryImport(blocked,b.draft,b.options);assert.equal(report.compatible,false);assert.equal(report.code,'transparent-range');assert.match(report.reason,/contiguous transparency/);assert.deepEqual(blocked.texture,before);
});
test('capacity failure remains atomic and is reported separately from unsupported model behavior',()=>{
  const source=expand(sceneryFixture(),484),donor=sceneryFixture({color:200}),{draft,options}=imported(source,donor),before=Buffer.from(source.texture),report=inspectSceneryImport(source,draft,options);assert.equal(report.compatible,false);assert.equal(report.code,'texture-capacity');assert.match(report.reason,/28.*512/);assert.throws(()=>compileSceneryEdits(source,draft,options),/texture slot/);assert.deepEqual(source.texture,before);
});
