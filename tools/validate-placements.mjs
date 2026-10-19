import {RollcageArchive} from '../src/archive.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parseBTP} from '../src/btp.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {readModelMaterials} from '../src/model-materials.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources=[],failures=[];
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const gfxm=parseGFXM(data),pair=await archive.readResource(entry.index+1),btp=parseBTP(pair.data),placements=parsePlacements(pair.data,gfxm.models);
   const pages=new Set();let faces=0,triangles=0,animatedFaces=0,multipleAxes=0;
   for(const record of placements.records.filter(r=>r.type===0)) {
    const model=gfxm.models[record.modelIndex],materials=readModelMaterials(data,model,record.uvStarts[0]);
    for(const face of materials){pages.add(face.page);faces++;triangles+=face.indices.length===3?1:2;if(face.animation)animatedFaces++;}
    if(record.angles.filter(Boolean).length>1)multipleAxes++;
   }
   resources.push({resource:entry.index,placements:placements.count,types:placements.records.reduce((m,r)=>(m[r.type]=(m[r.type]??0)+1,m),{}),faces,triangles,animatedFaces,multipleAxes,
    pages:[...pages].sort((a,b)=>a-b),invalidPages:[...pages].filter(p=>!btp.textures[p]||btp.textures[p].empty)});
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
const sum=key=>resources.reduce((n,r)=>n+r[key],0);
const summary={resources:resources.length,placements:sum('placements'),types:resources.reduce((m,r)=>{for(const [k,v]of Object.entries(r.types))m[k]=(m[k]??0)+v;return m;},{}),
 faces:sum('faces'),triangles:sum('triangles'),animatedFaces:sum('animatedFaces'),multipleAxes:sum('multipleAxes'),missingPCTextures:resources.filter(r=>r.invalidPages.length).length,failures};
await writeFile('analysis/placement-catalog.json',JSON.stringify({summary,resources},null,2));console.log(JSON.stringify(summary));
if(failures.length)process.exitCode=1;
