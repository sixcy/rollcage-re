import {RollcageArchive} from '../src/archive.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {parseSpatialIndex} from '../src/spatial-index.mjs';
import {parseStaticModelLinks} from '../src/model-links.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources=[],failures=[];
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const spatial=parseSpatialIndex(data);if(!spatial.available)continue;
   const {data:btp}=await archive.readResource(entry.index+1),placements=parsePlacements(btp,parseGFXM(data).models),links=parseStaticModelLinks(data,spatial,placements);
   resources.push({resource:entry.index,entries:links.entries.length,nodes:links.nodes.length,populatedNodes:links.nodes.filter(node=>node.placementIndices.length).length,references:links.nodes.reduce((sum,node)=>sum+node.placementIndices.length,0)});
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
const sum=key=>resources.reduce((n,r)=>n+r[key],0),summary={resources:resources.length,entries:sum('entries'),nodes:sum('nodes'),populatedNodes:sum('populatedNodes'),references:sum('references'),failures};
await writeFile('analysis/model-link-catalog.json',JSON.stringify({summary,resources},null,2));console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;
