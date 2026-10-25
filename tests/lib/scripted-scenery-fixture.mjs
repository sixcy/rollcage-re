import {sceneryFixture} from './scenery-fixture.mjs';
// Synthetic ordinary scenery plus one native type24 authored animated object.
export function scriptedSceneryFixture({shared=false,opcode=3}={}){
  const source=sceneryFixture(),geometry=Buffer.alloc(0x1900),texture=Buffer.alloc(0x700);geometry.set(source.geometry);texture.set(source.texture);
  geometry.writeUInt32LE(0x1600,0xa4);geometry.writeUInt32LE(0x1700,0xa8);geometry.writeUInt16LE(0x10,0x1600);geometry.writeUInt16LE(0x10,0x1602);
  const start=0x1610;geometry.writeInt16LE(0,start);[2,4,6].forEach((o,i)=>geometry.writeInt16LE(i+1,start+o));
  geometry.writeInt16LE(1,start+8);geometry.writeUInt16LE(12,start+10);[6,8,10].forEach((o,i)=>geometry.writeInt16LE(i+4,start+8+o));
  geometry.writeInt16LE(2,start+20);[70,0,32].forEach((n,i)=>geometry.writeInt32LE(n*65536,start+24+i*4));
  const curve=start+36;geometry.writeInt16LE(opcode,curve);geometry.writeInt16LE(1,curve+2);geometry.writeUInt16LE(256,curve+4);
  for(let point=0;point<4;point++)[64+point*10,-point,32].forEach((n,i)=>geometry.writeInt32LE(n*65536,curve+8+point*16+i*4));
  geometry.writeUInt16LE(1,curve+22);geometry.writeInt16LE(6,curve+68);geometry.writeInt16LE(2,curve+70);geometry.writeUInt16LE(3,curve+72);geometry.writeInt16LE(4,curve+76);
  [70,0,32].forEach((n,i)=>geometry.writeInt16LE(n,0x1700+i*2));geometry.writeUInt16LE(0x1234,0x1706);
  texture.writeUInt32LE(shared?4:3,0x14);
  for(let index=2;index<(shared?4:3);index++){const p=0x500+index*56;texture.set(texture.subarray(0x500,0x538),p);texture.writeUInt16LE(24,p);texture[p+31]=3;texture[p+38]=index===2?0:1;texture[p+39]=0;}
  return {geometry,texture};
}
