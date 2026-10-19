import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGFXM } from '../src/gfxm.mjs';
function fixture() {
  const data = Buffer.alloc(0x1b0), base = 0x130;
  data.write('GFXM'); data.writeUInt32LE(0x120,0x18); data.writeUInt16LE(2,0x2c);
  data.writeUInt32LE(base,0x120); data.write('MODC',base);
  data.writeUInt16LE(4,base+4); data.writeUInt16LE(2,base+6);
  data.writeUInt32LE(0x50,base+0xc); data.writeUInt32LE(0x60,base+0x40);
  data.set([1,2,3,4,0,0,0,0,1,2,3,0,0,0,0,0],base+0x50);
  data.writeInt16LE(-32768,base+0x60); data.writeInt16LE(32767,base+0x62); data.writeInt16LE(-1,base+0x64);
  return data;
}
test('model reader retains null slots, signed coordinates and triangle sentinels', () => {
  const gfxm = parseGFXM(fixture());
  assert.equal(gfxm.models[1], null);
  assert.deepEqual(gfxm.models[0].vertices[0],[-32768,32767,-1,0]);
  assert.equal(gfxm.models[0].faces[0].triangle,false);
  assert.equal(gfxm.models[0].faces[1].triangle,true);
});
test('vertex references are one-based; only the fourth index can be zero', () => {
  const data = fixture(); data[0x180] = 0;
  assert.throws(()=>parseGFXM(data),/vertex index/);
  data[0x180] = 5;
  assert.throws(()=>parseGFXM(data),/vertex index/);
});
test('model tables and vertex arrays must remain inside the file', () => {
  const data = fixture(); data.writeUInt32LE(data.length,0x170);
  assert.throws(()=>parseGFXM(data),/vertices.*bounds/);
  data.writeUInt32LE(data.length,0x18);
  assert.throws(()=>parseGFXM(data),/table.*bounds/);
});
