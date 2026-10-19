// Exploratory raw records; labels are not a finished file-format contract.
import {RollcageArchive} from '../src/archive.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open('C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try {
 for(const id of process.argv.slice(2).map(Number)) {
  const {data}=await archive.readResource(id+1),count=data.readUInt32LE(0x14),offset=data.readUInt32LE(0x28);
  const records=Array.from({length:count},(_,index)=>{
   const p=offset+index*56;
   return {index,type:data.readUInt16LE(p)&0x3ff,position:[8,10,12].map(a=>data.readInt16LE(p+a)),
    words:Array.from({length:28},(_,i)=>data.readUInt16LE(p+i*2)),hex:data.subarray(p,p+56).toString('hex')};
  });
  await writeFile(`analysis/scene/placements-${id}.probe.json`,JSON.stringify({id,count,offset,records},null,2));
  console.log(JSON.stringify({id,count,offset,types:records.reduce((m,r)=>(m[r.type]=(m[r.type]??0)+1,m),{}),records:records.slice(0,8)}));
 }
}finally{await archive.close();}
