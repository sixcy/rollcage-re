// Corpus probes use declared synthetic body states above recovered covered cells.
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {buildTerrainCandidates} from '../src/terrain-candidates.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources=[],failures=[];
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const grid=parseCollisionGrid(data);if(!grid.available)continue;
   let probes=0,candidates=0,empty=0,skipped=0,truncated=0,maxCandidates=0;const samples=[];
   for(const sector of grid.sectors) {
    const active=sector.cells.filter(cell=>cell.covered);
    for(const slot of new Set([0,Math.floor(active.length/2),active.length-1])) {
     const cell=active[slot];if(!cell)continue;
     const top=cell.row*(sector.columns+1)+cell.column,indices=[top,top+1,top+sector.columns+1,top+sector.columns+2];
     const position=[0,1,2].map(axis=>Math.trunc(indices.reduce((n,index)=>n+sector.vertices[index][axis],0)/4));position[1]-=40;
     const body={flags:3,position:position.map(value=>value*65536),linearVelocity:[0,0,0]};
     const result=buildTerrainCandidates(grid,body,{radiusQ8:64*256});probes++;
     if(result.candidates.length>64)throw Error('Candidate limit exceeded.');
     for(const candidate of result.candidates){if(!grid.normals[candidate.normalIndex]||!grid.sectors[candidate.sector].vertices[candidate.vertexBase+candidate.pointOffset])throw Error('Candidate contains an invalid grid reference.');}
     candidates+=result.candidates.length;if(!result.candidates.length)empty++;if(result.skipped)skipped++;if(result.dropped)truncated++;maxCandidates=Math.max(maxCandidates,result.candidates.length);
     if(entry.index===30&&samples.length<4)samples.push({position,sector:sector.index,cell:cell.index,query:result.query,closest:result.closest,candidates:result.candidates});
    }
   }
   resources.push({resource:entry.index,probes,candidates,empty,skipped,truncated,maxCandidates});
   if(samples.length)await writeFile('analysis/level1-candidate-probes.json',JSON.stringify({scope:'Synthetic stationary body states, 64-unit radius, 40 units above selected cell centers; reconstructed code only.',samples},null,2));
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
const sum=key=>resources.reduce((n,r)=>n+r[key],0),summary={resources:resources.length,probes:sum('probes'),candidates:sum('candidates'),empty:sum('empty'),skipped:sum('skipped'),truncated:sum('truncated'),failures};
await writeFile('analysis/terrain-candidate-probes.json',JSON.stringify({method:'Reconstructed candidate code on installed collision data with declared synthetic body inputs; no original-process comparison.',summary,resources},null,2));console.log(JSON.stringify(summary));
if(failures.length)process.exitCode=1;
