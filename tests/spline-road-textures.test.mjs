import test from 'node:test';
import assert from 'node:assert/strict';
import {extendSplineRoadPacketInitializers} from '../src/spline-road-textures.mjs';
import {sceneryFixture} from './lib/scenery-fixture.mjs';
import {parseBTP,decodeBTPTexture} from '../src/btp.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';

const fixture=()=>{const source=sceneryFixture();source.texture.writeUInt32LE(1,12);source.texture.writeUInt16LE(0xa51b,0x40);return source;};
test('new spline packet modes clone original inline words and move BTP data losslessly',()=>{
  const {geometry,texture}=fixture(),before=Buffer.from(texture),out=extendSplineRoadPacketInitializers(texture,{oldCount:1,newCount:4,entries:[1,2,3].map(index=>({index,sourcePacket:0}))});
  assert.equal(out.readUInt32LE(12),4);for(let i=0;i<4;i++)assert.equal(out.readUInt16LE(0x40+i*2),0xa51b);assert.equal(out.length,texture.length+8);
  assert.deepEqual(decodeBTPTexture(parseBTP(out),0).rgba,decodeBTPTexture(parseBTP(texture),0).rgba);assert.deepEqual(parsePlacements(out,parseGFXM(geometry).models).records.map(p=>p.raw),parsePlacements(texture,parseGFXM(geometry).models).records.map(p=>p.raw));assert.deepEqual(texture,before);
});
test('no additional packets preserve bytes; unproved BTP layouts and duplicate references reject atomically',()=>{
  const {texture}=fixture(),before=Buffer.from(texture);assert.deepEqual(extendSplineRoadPacketInitializers(texture,{oldCount:1,newCount:1,entries:[]}),texture);
  for(const entries of [[{index:1,sourcePacket:1}],[{index:0,sourcePacket:0}]])assert.throws(()=>extendSplineRoadPacketInitializers(texture,{oldCount:1,newCount:2,entries}),/reference/);
  const bad=Buffer.from(texture);bad.writeUInt32LE(1,0x18);assert.throws(()=>extendSplineRoadPacketInitializers(bad,{oldCount:1,newCount:2,entries:[{index:1,sourcePacket:0}]}),/reserved/);assert.deepEqual(texture,before);
});
