import { writeFile } from 'node:fs/promises';
import { RollcageArchive } from '../src/archive.mjs';
import { parseScene } from '../src/scene.mjs';
import { parseBTP } from '../src/btp.mjs';
import { resourceMappings } from '../src/resource-names.mjs';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources=[],failures=[];
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);
  if(data.toString('ascii',0,4)!=='GFXM') continue;
  try {
   const scene=parseScene(data), pair=await archive.readResource(entry.index+1), btp=parseBTP(pair.data);
   const faces=scene.segments.flatMap(s=>s.faces), pages=[...new Set(faces.map(f=>f.page))].sort((a,b)=>a-b);
   const invalidPages=pages.filter(p=>!btp.textures[p]||btp.textures[p].empty);
   resources.push({resource:entry.index,names:resourceMappings.filter(m=>m.index===entry.index).map(m=>m.name),
    segments:scene.segments.length,vertices:scene.segments.reduce((n,s)=>n+s.vertices.length,0),quads:faces.length,pages,invalidPages,
    bounds:[0,1,2].map(a=>{const vals=scene.segments.flatMap(s=>s.vertices.map(v=>v[a]));return vals.length?[Math.min(...vals),Math.max(...vals)]:null;}),
    gridSizes:scene.segments.map(s=>[s.columns,s.rows])});
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
const summary={resources:resources.length,segments:resources.reduce((n,r)=>n+r.segments,0),vertices:resources.reduce((n,r)=>n+r.vertices,0),quads:resources.reduce((n,r)=>n+r.quads,0),
 texturedPCPacks:resources.filter(r=>r.segments>0&&!r.invalidPages.length).length,
 invalidPageResources:resources.filter(r=>r.invalidPages.length).map(r=>({resource:r.resource,pages:r.invalidPages})),failures};
await writeFile('analysis/scene-catalog.json',JSON.stringify({summary,resources},null,2));console.log(JSON.stringify({...summary,invalidPageResources:summary.invalidPageResources.length}));
if(failures.length)process.exitCode=1;
