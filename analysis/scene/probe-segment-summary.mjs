import { RollcageArchive } from '../../src/archive.mjs';
const archive=await RollcageArchive.open('C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try {
 const {data}=await archive.readResource(30), count=data.readUInt32LE(0x10), table=data.readUInt32LE(0x14);
 const rows=Array.from({length:count},(_,i)=>{
  const p=data.readUInt32LE(table+i*4), v=data.readUInt32LE(p+0x20), n=data.readUInt16LE(p+0x14);
  return {i,offset:p,header:[4,8,12,16,20,24,28,36].map(f=>data.readUInt32LE(p+f)),
   vertices:v,candidateCount:n,bounds:v+n*8>data.length?null:[0,2,4].map(a=>{const vals=Array.from({length:n},(_,j)=>data.readInt16LE(v+j*8+a));return [Math.min(...vals),Math.max(...vals)];})};
 });console.log(JSON.stringify(rows,null,2));
} finally {await archive.close();}
