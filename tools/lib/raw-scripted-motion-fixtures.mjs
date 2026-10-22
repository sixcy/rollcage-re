import {initializeBodyRetirementEffectTables} from '../../src/body-retirement-effects.mjs';
export const scriptFixtureAddresses={body:0x100000,particles:0x120000,debris:0x110000,script:0x30000,spawns:0x31000,pack:0x32000,rows:0x40000,indices:0x43000,bucket:0x45000,free:0x46000,active:0x46100,stack:0x9000};
//Explicit synthetic runtime storage. No constructor/loader provenance is implied.
export function createRawScriptFixture({memory=Buffer.alloc(0xa00000),freeCount=16}={}){
  const a=scriptFixtureAddresses,put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p);
  initializeBodyRetirementEffectTables(memory);memory.fill(0xa5,a.stack-0x1000,a.stack+64);memory.fill(0x69,a.body,a.body+0x800);memory.fill(0x93,a.debris,a.debris+32*128);
  put(a.body,26);put(a.body+4,0);put(a.body+12,a.bucket);word(a.bucket+8,1);put(0x902eec,a.body);put(0x909254,a.rows);put(0x909278,a.bucket);
  for(let row=0;row<256;row++){word(a.rows+row*16,0xff00);word(a.rows+row*16+2,255);put(a.rows+row*16+12,a.indices);}
  for(let i=0;i<256;i++)word(a.indices+i*2,0);put(a.bucket+4,0);
  put(a.body+0x134,a.script);word(a.body+0x138,0);put(a.body+0x13a,0);memory[a.body+0x13e]=0;memory[a.body+0x13f]=0;put(a.body+0xa8,65536);
  for(let i=0;i<9;i++)word(a.body+0xc4+i*2,i%4?0:4096);
  put(0x90b990,a.pack);put(a.pack+0xa8,a.spawns);for(let i=0;i<16;i++)word(a.spawns+i*2,i*4093);
  put(0x902b7c,a.free);put(0x902b80,a.active);put(0x902b84,a.debris);put(0x902b88,0);put(0x902b8c,freeCount-1);for(let i=0;i<32;i++){word(a.free+i*2,i);put(a.debris+i*128+4,0);}
  put(0x5ec958,0x12345678);put(0x5ec954,0x87654321);put(0x5eb500,0);put(0x6e65b4,a.particles);put(0x6e65c0,0);put(0x6e65c8,0);put(0x6f2414,0);put(0x6f2418,0);
  for(let i=0;i<16;i++){memory.fill(0,a.particles+i*256,a.particles+(i+1)*256);put(a.particles+i*256+0xac,i<15?a.particles+(i+1)*256:0);}
  memory.writeFloatLE(1,0x5dc774);memory.writeFloatLE(4096,0x5dca88);
  return {memory,body:a.body,scratchBase:a.stack,roundingMode:'nearest-even',addresses:a};
}
