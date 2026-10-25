import {terrainFixture} from './terrain-fixture.mjs';

// Synthetic native table contracts; never original-process evidence.
export function splineTerrainFixture() {
  const original=terrainFixture(),data=Buffer.alloc(0x4000);data.set(original);data.set(original.subarray(0x100,0x1100),0x2400);data.writeUInt32LE(0x2400,0x24);data.writeUInt32LE(0x1600,0x110);
  data.writeUInt32LE(0x3600,0x20);data.writeUInt16LE(1<<11,0x3600);data.writeUInt16LE(1,0x3602);data[0x3603]=2<<2;
  data.writeUInt32LE(0x3700,0xc4);data.writeUInt32LE(0x3800,0x3c);data.writeUInt32LE(0x3900,0xac);data.writeUInt16LE(1,0x96);
  for(const offset of [0x1120,0x112c])data.writeUInt32LE(data.readUInt32LE(offset)|5,offset);
  return data;
}
