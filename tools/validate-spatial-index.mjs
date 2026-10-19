import {RollcageArchive} from '../src/archive.mjs';
import {parseSpatialIndex} from '../src/spatial-index.mjs';
import {parseScene} from '../src/scene.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources=[],failures=[];
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const index=parseSpatialIndex(data);if(!index.available){resources.push({resource:entry.index,available:false});continue;}
   const scene=parseScene(data);let found=0,outside=0,layers=0;
   for(const segment of scene.segments)for(const vertex of segment.vertices) {
    const result=index.lookup(vertex.slice(0,3).map(value=>value*65536));
    if(!result.found)throw Error('Populated level has no spatial lookup result.');
    found++;if(result.outside)outside++;if(result.layers)layers++;
   }
   resources.push({resource:entry.index,available:true,nodes:index.nodeCount,populatedRows:index.rows.filter(r=>r.ranges.length).length,
    mappedCells:index.rows.reduce((n,r)=>n+r.cells,0),heightContinuations:index.nodes.filter(n=>n.continues).length,
    vertexLookups:found,outsideVertexLookups:outside,layeredVertexLookups:layers});
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
const sum=key=>resources.reduce((n,r)=>n+(r[key]??0),0),summary={resources:resources.length,levels:resources.filter(r=>r.available).length,
 nodes:sum('nodes'),mappedCells:sum('mappedCells'),heightContinuations:sum('heightContinuations'),vertexLookups:sum('vertexLookups'),
 outsideVertexLookups:sum('outsideVertexLookups'),layeredVertexLookups:sum('layeredVertexLookups'),failures};
await writeFile('analysis/spatial-index-catalog.json',JSON.stringify({summary,resources},null,2));console.log(JSON.stringify(summary));
if(failures.length)process.exitCode=1;
