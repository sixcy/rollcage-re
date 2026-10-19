import {RollcageArchive} from '../src/archive.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open('C:\\Program Files (x86)\\Psygnosis\\Rollcage');
try {
 for(const id of process.argv.slice(2).map(Number)) {
  const {data}=await archive.readResource(id),pair=await archive.readResource(id+1),btp=pair.data,gfxm=parseGFXM(data);
  const count=btp.readUInt32LE(0x14),offset=btp.readUInt32LE(0x28),indexTable=data.readUInt32LE(0xcc),materialTable=data.readUInt32LE(0xd8);
  const records=[];
  for(let index=0;index<count;index++) {
   const p=offset+index*56,type=btp.readUInt16LE(p)&0x3ff;
   if(type!==0)continue;
   const modelIndex=btp[p+3],model=gfxm.models[modelIndex],uvStart=btp.readUInt16LE(p+40);
   const materials=Array.from({length:model.faceCount},(_,face)=>{
    const key=data.readUInt16LE(indexTable+(uvStart+face)*2),uv=materialTable+(key>>2),animation=data.readUInt16LE(uv+2);
    return {face,key,uv,animation,page:data.readUInt16LE(uv+6)&63,bytes:data.subarray(uv,uv+12).toString('hex')};
   });
   records.push({index,modelIndex,faceCount:model.faceCount,uvStart,angles:[14,16,18].map(a=>btp.readInt16LE(p+a)),materials});
  }
  await writeFile(`analysis/scene/materials-${id}.probe.json`,JSON.stringify({id,indexTable,materialTable,records},null,2));
  console.log(JSON.stringify({id,count:records.length,models:[...new Set(records.map(x=>x.modelIndex))],multiAxis:records.filter(r=>r.angles.filter(Boolean).length>1).length,
   animations:[...new Set(records.flatMap(r=>r.materials.map(m=>m.animation)))],pages:[...new Set(records.flatMap(r=>r.materials.map(m=>m.page)))],sample:records.slice(0,2).map(r=>({...r,materials:r.materials.slice(0,3)}))}));
 }
}finally{await archive.close();}
