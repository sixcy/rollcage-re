// Synthetic two-sector grid, with coincident boundary edges and two height
// layers whose original collision groups differ. No original-process evidence.
export function terrainFixture(){
  const data=Buffer.alloc(0x2400);data.write('GFXM');
  for(const [offset,value]of [[0xc,2],[0x10,2],[0x14,0x1140],[0x24,0x100],[0x28,0x1500],[0x34,0x1400],[0x38,1],[0x68,0x1120],[0x6c,0x1100],[0x100,0x1800],[0x110,0x1600]])data.writeUInt32LE(value,offset);
  for(let z=0;z<256;z++)data.writeUInt16LE(0xff,0x100+z*16);data.writeUInt16LE(0x8180,0x100+128*16);data.writeUInt16LE(0xff,0x102+128*16);data.writeUInt32LE(1,0x10c+128*16);data.writeUInt16LE(12,0x1102);
  data.writeUInt16LE(0x8180,0x100+127*16);data.writeUInt16LE(0xff,0x102+127*16);data.writeUInt32LE(1,0x10c+127*16);
  data.writeUInt32LE(32<<13,0x1120);data.writeUInt32LE(0x80000000,0x1124);data.writeUInt32LE(31<<13,0x112c);data.writeUInt32LE(1<<16,0x1130);
  for(let sector=0;sector<2;sector++){
    const s=0x1160+sector*0x60,vertices=0x1240+sector*0x80,packets=0x1380+sector*0x20;data.writeUInt32LE(s,0x1140+sector*4);data.write('SEGM',s);data.writeUInt32LE(1,s+4);data.writeUInt32LE(2,s+8);data.writeUInt32LE(2,s+12);data.writeUInt32LE(vertices,s+0x20);data.writeUInt32LE(packets,s+0x50);
    for(let r=0;r<3;r++)for(let c=0;c<3;c++){const p=vertices+(r*3+c)*8;data.writeInt16LE(sector*128+c*64,p);data.writeInt16LE(-r*64,p+4);data.writeUInt16LE(4,p+6);}
    const region=0x1500+sector*6;data.writeUInt16LE(sector,region+2);data.writeUInt16LE(128|(2<<8)|(2<<12),region+4);
  }
  data.writeUInt32LE(768<<10,0x1400);data.set([0,0,255,255,15,0,0,0,0,15,15,15,3,5,0,0],0x1600);data.set(data.subarray(0x1600,0x1610),0x1610);data.writeUInt16LE(1,0x1616);data.writeUInt32LE(7|(20<<8),0x161c);
  return data;
}
