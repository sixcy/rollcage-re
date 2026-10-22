import test from 'node:test';
import assert from 'node:assert/strict';
import {packDevicePalette16, packDevicePalette32} from '../src/device-color-packing.mjs';
import {initializeProceduralTexturePalette, initializeProceduralTextureStorage} from '../src/procedural-texture.mjs';
function fixture() {
  const memory=Buffer.alloc(0xa00000),put=(p,v)=>memory.writeInt32LE(v|0,p);put(0x714ae8,0x50000);put(0x50444,0x52000);put(0x52018,1);Buffer.from([3,11,2,5,3,0,7,15]).copy(memory,0x52004);
  return{memory,put,runtime:{memory,scratchBase:0x9000}};
}
test('16-bit palette uses RGB black for alpha and ignores the authored fourth byte',()=>{
  const f=fixture();f.put(0x10000,0xff000000);f.put(0x10004,0x000000ff);packDevicePalette16(0x10000,0x20000,f.runtime);
  assert.equal(f.memory.readUInt16LE(0x20000),0);assert.equal(f.memory.readUInt16LE(0x20002),0xf800);
});
test('32-bit alpha distinguishes colorkey from the special first packed-black entry',()=>{
  const f=fixture();f.put(0x10000,1);f.put(0x10004,0);
  packDevicePalette32(0x10000,2,0x20000,0,f.runtime);assert.equal(f.memory.readUInt32LE(0x20000),0);assert.equal(f.memory.readUInt32LE(0x20004),0x8000);
  packDevicePalette32(0x10000,2,0x21000,1,f.runtime);assert.equal(f.memory.readUInt32LE(0x21000),0x8000);assert.equal(f.memory.readUInt32LE(0x21004),0);
});
test('procedural palette leaves index128 and authored alpha bytes unchanged',()=>{
  const f=fixture();f.memory.fill(0x53,0x713fb0,0x7143b0);f.put(0x5ed02c,2);f.put(0x6e1628,77);
  f.runtime.handlers={rendererCall:(object,method,args)=>{if(method===0x90)return 0x51000;if(method===8){f.put(args[0],0x60000);f.put(args[2],512);return 1;}return 0;}};
  initializeProceduralTexturePalette(f.runtime);assert.equal(f.memory.readUInt32LE(0x713fb0+128*4),0x53535353);assert.deepEqual([...f.memory.subarray(0x7143ac,0x7143b0)],[0,0,0,0x53]);
});
test('failed procedural storage allocation publishes only its null owner',()=>{
  const f=fixture();f.put(0x713884,123);f.put(0x713888,456);initializeProceduralTextureStorage({...f.runtime,handlers:{allocate:size=>{assert.equal(size,0x75840);return 0;}}});
  assert.equal(f.memory.readUInt32LE(0x713994),0);assert.equal(f.memory.readUInt32LE(0x713884),123);assert.equal(f.memory.readUInt32LE(0x713888),456);
});
