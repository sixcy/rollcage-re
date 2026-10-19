import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {readTerrainSurface} from '../src/terrain-surfaces.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources=[],failures=[];
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const grid=parseCollisionGrid(data);if(!grid.available)continue;
   const descriptors=new Set(),categories={},gripReductions={};let cells=0;
   for(const sector of grid.sectors)for(const cell of sector.cells)if(cell.covered) {
    const surface=readTerrainSurface(data,grid.scene,(sector.index|(cell.column<<8)|(cell.row<<16))>>>0);
    cells++;descriptors.add(surface.index);categories[surface.category]=(categories[surface.category]??0)+1;gripReductions[surface.gripReduction]=(gripReductions[surface.gripReduction]??0)+1;
   }
   resources.push({resource:entry.index,cells,descriptors:descriptors.size,categories,gripReductions});
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
const combine=key=>{const result={};for(const resource of resources)for(const [value,count]of Object.entries(resource[key]))result[value]=(result[value]??0)+count;return result;};
const summary={resources:resources.length,cells:resources.reduce((n,r)=>n+r.cells,0),descriptors:resources.reduce((n,r)=>n+r.descriptors,0),categories:combine('categories'),gripReductions:combine('gripReductions'),failures};
await writeFile('analysis/terrain-surface-catalog.json',JSON.stringify({summary,resources},null,2));console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;
