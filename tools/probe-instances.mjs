import {RollcageArchive} from '../src/archive.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open('C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try {
 for(const id of process.argv.slice(2).map(Number)) {
  const {data}=await archive.readResource(id),count=data.readUInt32LE(0xc),offset=data.readUInt32LE(0x68);
  const records=Array.from({length:count},(_,index)=>{
   const p=offset+index*12;
   return {index,words:Array.from({length:6},(_,i)=>data.readUInt16LE(p+i*2)),signed:Array.from({length:6},(_,i)=>data.readInt16LE(p+i*2))};
  });
  const modelCount=data.readUInt16LE(0x2c),modelTable=data.readUInt32LE(0x18);
  const models=Array.from({length:modelCount},(_,index)=>{
   const p=data.readUInt32LE(modelTable+index*4);if(!p)return null;
   return {index,offset:p,words:Array.from({length:40},(_,i)=>data.readUInt16LE(p+i*2))};
  });
  await writeFile(`analysis/scene/instances-${id}.probe.json`,JSON.stringify({id,count,offset,models,records},null,2));
  console.log(JSON.stringify({id,count,offset,models:models.slice(0,3),records:records.slice(0,10)}));
 }
}finally{await archive.close();}
