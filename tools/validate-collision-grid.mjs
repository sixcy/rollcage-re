import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources=[],failures=[];
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const grid=parseCollisionGrid(data);if(!grid.available){resources.push({resource:entry.index,available:false});continue;}
   const cells=grid.sectors.flatMap(s=>s.cells),forms=cells.flatMap(c=>c.forms),borders=grid.sectors.reduce((n,s)=>n+s.borders.reduce((m,b)=>m+Number(b.left.normal!==null)+Number(b.right.normal!==null),0),0);
   resources.push({resource:entry.index,available:true,normals:grid.normalCount,regions:grid.regions.length,zones:grid.zones.length,
    cells:cells.length,activeCells:cells.filter(c=>c.covered).length,unreferencedNormalCodes:cells.filter(c=>!c.covered&&c.rawNormalIndex>=grid.normalCount).length,forms:forms.length,borders,
    types:forms.reduce((m,f)=>(m[f.type]=(m[f.type]??0)+1,m),{})});
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
const sum=key=>resources.reduce((n,r)=>n+(r[key]??0),0),summary={resources:resources.length,levels:resources.filter(r=>r.available).length,normals:sum('normals'),
 regions:sum('regions'),zones:sum('zones'),cells:sum('cells'),activeCells:sum('activeCells'),unreferencedNormalCodes:sum('unreferencedNormalCodes'),forms:sum('forms'),borders:sum('borders'),failures};
await writeFile('analysis/collision-grid-catalog.json',JSON.stringify({summary,resources},null,2));console.log(JSON.stringify(summary));
if(failures.length)process.exitCode=1;
