import {createRawScriptFixture} from './raw-scripted-motion-fixtures.mjs';
import {initializeWheelEffectTables} from '../../src/wheel-effects.mjs';
export function createTerrainWaveFixture(program,index){
 const f=createRawScriptFixture({memory:program.initializeMemory(Buffer.alloc(0xa00000))}),m=f.memory,put=(p,v)=>m.writeInt32LE(v|0,p),word=(p,v)=>m.writeUInt16LE(v&65535,p),pack=0x60000,table=0x61000,palette=0x66000,map=0x68000,regions=0x69000,body=0x180000,record=0x909300,width=[2,3,7,15][index%4],height=[2,5,10,15][Math.floor(index/4)%4];
 initializeWheelEffectTables(m);put(0x90b98c,pack);put(pack,table);put(pack+0x30,palette);word(pack+0x5c,64);put(0x90cb60,map);m.fill(255,map,map+2048);word(0x90d974,975);put(0x909240,table);put(0x9092c0,regions);word(f.addresses.bucket+6,0);
 for(let i=0;i<1024;i++)put(palette+i*4,0xff000000|((i*103)&0xffffff));
 for(let i=0;i<2;i++){
  const sector=0x62000+i*0x1000,vertices=0x6a000+i*0x4000;put(table+i*4,sector);put(sector+8,width);put(sector+12,height);put(sector+0x20,vertices);
  for(let row=0;row<=height+1;row++)for(let col=0;col<=width;col++){const point=vertices+(row*(width+1)+col)*8;word(point,col*40);word(point+2,(col%2)*10);word(point+4,(i*height+row)*128);word(point+6,((row+col)%17)*64+(col&63));}
  word(regions+i*6,0);word(regions+i*6+2,i|(i===0?512:0));word(regions+i*6+4,(Math.min(15,width+1)<<12)|(height<<8));
 }
 put(0x5ecb1c,0x80000);m[0x8054d]=3;for(let i=0;i<3;i++){
  const b=body+i*0x5000,r=record+i*0x30c;put(r,b);m.fill(0,b,b+0x800);word(b+0x65e,i);m[b+0x718]=i%2?8:0;m[b+0x11c]=index%2;m[b+0x11d]=0;word(b+0x11e,[0,1,height][index%3]);m[b+0x68c]=0x43;m[b+0x68d]=255;put(b+0x710,index&1?0x4000:0);put(b+0x6bc,-1);m[b+0x6f3]=255;word(b+0x6fc,200);word(b+0x6fe,200);word(b+0x700,200);put(r+0x24,Math.imul(i,[800,-800,301,2499,300,2500,32768,-32768,66336,-64736,0x7fffffff,-2147483648][index%12]));m[r+0x1c]=index%3;for(let k=0;k<9;k++)word(b+0xc4+k*2,k%4?0:4096);
 }
 m[body+0x718]=index%2?8:0;put(0x6eafe0,index%7===0?0x81:0);put(0x90cb80,[0,1,2,3,4,5][index%6]);put(0x90cb84,record);put(0x90cb88,[0,10,149,150,174,175,199,200][index%8]);put(0x90cb8c,5+index%10);put(0x90cb90,index%5);put(0x90cb94,index%2?1:-1);put(0x90cb98,body+0x11c);put(0x90cb9c,0);put(0x90d970,0);word(0x90d976,65535);word(0x90d978,65535);put(0x90d98c,index%3);put(0x6e6704,[0,127,256,0x78000][index%4]);put(0x80f210,[0,1,63,64,65][index%5]);put(0x90a548,index*731);put(0x70000,index%2?1:-1);return{...f,body,record,pack,table,palette,map,regions,width,height};
}
