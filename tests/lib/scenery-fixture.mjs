// Synthetic authored data, not evidence from a running original process.
export function sceneryFixture({color=100}={}) {
  const geometry=Buffer.alloc(0x1500),texture=Buffer.alloc(0x600);
  geometry.write('GFXM');geometry.writeUInt32LE(1,0x10);geometry.writeUInt32LE(1,0xc);
  for(const[offset,value]of[[0x24,0x100],[0x6c,0x1100],[0x68,0x1120],[0x18,0x1130],[0x1c,0x1300],[0x84,0x1320],[0x88,0x1340],[0x8c,0x1348],[0xcc,0x1400],[0xd8,0x1410],[0xac,0x1434]])geometry.writeUInt32LE(value,offset);
  geometry.writeUInt16LE(1,0x2c);geometry.writeUInt16LE(3,0x96);
  for(let row=0;row<256;row++)geometry.writeUInt16LE(0xff,0x100+row*16);
  geometry.writeUInt16LE(0x8080,0x100+128*16);geometry.writeUInt16LE(0xff,0x102+128*16);geometry.writeUInt32LE(1,0x10c+128*16);
  geometry.writeUInt32LE(2<<19,0x1120);geometry.writeUInt32LE(0x1140,0x1130);
  const m=0x1140;geometry.write('MODC',m);geometry.writeUInt16LE(3,m+4);geometry.writeUInt16LE(1,m+6);
  geometry.writeUInt32LE(0x1258-m,m+12);geometry.writeUInt32LE(0x1260-m,m+16);geometry.writeUInt32LE(0x1288-m,m+20);geometry.writeUInt16LE(0x50,m+0x1c);
  geometry.writeUInt32LE(0x1240-m,m+0x40);geometry[m+0x27]=1;geometry.writeUInt16LE(0x12d8-m,m+0x34);geometry.writeUInt16LE(0x12f8-m,m+0x38);geometry.writeUInt16LE(0x12f8-m,m+0x3a);
  geometry.write('MODL',m+0x50);geometry.writeUInt16LE(1,m+0x50+6);geometry.writeUInt32LE(0x12f0-(m+0x50),m+0x50+12);geometry.writeUInt32LE(0x12f8-(m+0x50),m+0x50+16);
  [[-20,0,-20],[20,0,-20],[0,-30,20]].forEach((v,i)=>v.forEach((n,axis)=>geometry.writeInt16LE(n,0x1240+i*8+axis*2)));
  geometry.set([1,2,3,0],0x1258);geometry.set([1,2,3,0],0x12f0);geometry.writeUInt32LE(1<<16,0x12d8+16);
  geometry.writeUInt16LE(0xffff,0x1412);geometry.writeUInt32LE(0,0x1434);geometry.writeUInt32LE(0,0x1438);geometry.writeUInt32LE(1,0x143c);
  texture.write('BTP ');texture.writeUInt32LE(2,0x14);texture.writeUInt32LE(0x4a0,0x24);texture.writeUInt32LE(0x500,0x28);
  texture.writeUInt16LE(1,0x34);texture.writeUInt16LE(1,0x36);texture.writeUInt32LE(0x70,0x38);texture.writeUInt32LE(0x80,0x3c);
  texture.writeUInt16LE(4,0x70);texture.writeUInt16LE(4,0x72);texture.fill(color,0x80,0x480);texture.fill(1,0x4a0,0x4b0);
  for(let i=0;i<2;i++){const p=0x500+i*56;texture.writeUInt16LE(0x400,p);texture.writeUInt16LE(0xffff,p+6);texture.writeUInt16LE(0xffff,p+24);texture.writeInt16LE(32+i*10,p+8);texture.writeInt16LE(32,p+12);texture[p+31]=i?1:7;texture.writeUInt16LE(i,p+20);}
  return {geometry,texture};
}
