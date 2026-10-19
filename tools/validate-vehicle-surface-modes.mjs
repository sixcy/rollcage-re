import {RollcageArchive} from '../src/archive.mjs';
import {parseScene} from '../src/scene.mjs';
import {readVehicleSurfaceMode} from '../src/wheel-drive.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage'),resources=[],failures=[];
const summary={resources:0,vertices:0,modes:{0:0,1:0,2:0}};
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const scene=parseScene(data);if(!scene.segments.length)continue;
   const counts={resource:entry.index,lowerBound:data.readUInt16LE(0x66),vertices:0,modes:{0:0,1:0,2:0}};
   for(const sector of scene.segments)for(let row=0;row<=sector.rows;row++)for(let column=0;column<=sector.columns;column++) {
    if(sector.index>255||column>127||row>32767)throw Error('Vertex cannot be represented in a registered cell reference.');
    const mode=readVehicleSurfaceMode(data,scene,(row<<16)|(column<<8)|sector.index);counts.vertices++;counts.modes[mode]++;summary.vertices++;summary.modes[mode]++;
   }
   resources.push(counts);
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
summary.resources=resources.length;summary.failures=failures;
await writeFile('analysis/vehicle-surface-mode-catalog.json',JSON.stringify({method:'Static classifier over every installed level grid vertex, including grid edges. Uses the original GFXM +0x66 lower bound and vertex high-ten-bit codes. No original process execution or claim these are observed vehicle registrations.',summary,resources},null,2));console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;
