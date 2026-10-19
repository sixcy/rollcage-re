// Static installed-data exercise of candidate -> ray -> contact -> suspension.
// Body placement and four short wheel descriptors are declared synthetic inputs.
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {buildTerrainCandidates} from '../src/terrain-candidates.mjs';
import {queryTerrainRay} from '../src/terrain-query.mjs';
import {readTerrainSurface} from '../src/terrain-surfaces.mjs';
import {buildWheelProbe,resolveWheelContact,applyWheelSuspension,prepareWheelContactSides} from '../src/wheel-physics.mjs';
import {verifyTerrainRay} from './verify-terrain-query-instructions.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources=[],failures=[],samples=[];
let probes=0,queries=0,hits=0,overlaps=0,misses=0,nativeChecks=0,instructionSteps=0;
const sidePreparation={bodies:0,queries:0,firstSide:0,secondSide:0,noContact:0,surfaces:0,categories:{},gripReductions:{}};
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const grid=parseCollisionGrid(data);if(!grid.available)continue;
   const counts={resource:entry.index,probes:0,queries:0,hits:0,overlaps:0,misses:0};
   for(const sector of grid.sectors) {
    const active=sector.cells.filter(cell=>cell.covered);
    for(const slot of new Set([0,Math.floor(active.length/2),active.length-1])) {
     const cell=active[slot];if(!cell)continue;
     const top=cell.row*(sector.columns+1)+cell.column,indices=[top,top+1,top+sector.columns+1,top+sector.columns+2];
     const position=[0,1,2].map(axis=>Math.trunc(indices.reduce((n,index)=>n+sector.vertices[index][axis],0)/4));position[1]-=40;
     const body={flags:3,position:position.map(value=>value*65536),linearVelocity:[0,0,0],angularVelocity:[0,0,0],momentum:[0,0,0],angularMomentum:[0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096]};
     const candidateState=buildTerrainCandidates(grid,body,{radiusQ8:64*256}),contacts=[],wheels=[],hitRecords=[];
     for(let wheel=0;wheel<4;wheel++) {
      const descriptor={positionQ8:[(wheel&1?4:-4)*256,0,(wheel&2?4:-4)*256],directionQ8:[0,256,0],tag:wheel};
      const probe=buildWheelProbe(body,descriptor),hit=queryTerrainRay(grid,candidateState.candidates,probe.query);
      if(wheel===0&&probes%10===0){const result=verifyTerrainRay(grid,candidateState.candidates,probe.query);nativeChecks++;instructionSteps+=result.steps;}
      queries++;counts.queries++;
      if(hit.flags){hits++;counts.hits++;if(hit.fractionQ16===0){overlaps++;counts.overlaps++;}
       if(hit.fractionQ16<0||hit.fractionQ16>65536)throw Error('Wheel hit fraction is outside its range.');
      }else {misses++;counts.misses++;}
      const contact=resolveWheelContact(body,descriptor,probe,hit);contacts.push(contact);wheels.push({flags:contact?1:0});hitRecords.push(hit);
     }
     applyWheelSuspension(body,wheels,contacts);
     for(const value of [...body.momentum,...body.angularMomentum])if(!Number.isInteger(value)||value< -2147483648||value>2147483647)throw Error('Suspension output is not a signed integer.');
     if(entry.index===30&&samples.length<4)samples.push({sector:sector.index,cell:cell.index,position,candidates:candidateState.candidates.length,hits:hitRecords,contacts,momentum:body.momentum,angularMomentum:body.angularMomentum});
     if(probes%10===0) {
      const state={side:sidePreparation.bodies&1,descriptors:Array.from({length:4},(_,wheel)=>({positionQ8:[(wheel&1?4:-4)*256,5*256,(wheel&2?4:-4)*256],directionQ8:[0,256,0],tag:wheel})),wheels:Array.from({length:4},()=>({flags:8}))};
      const outcome=prepareWheelContactSides(body,state,wheelProbes=>wheelProbes.map(probe=>{sidePreparation.queries++;return queryTerrainRay(grid,candidateState.candidates,probe.query);}),{resolveSurface:cellRef=>readTerrainSurface(data,grid.scene,cellRef)});
      for(const descriptor of state.descriptors)if(descriptor.surface){const surface=descriptor.surface;sidePreparation.surfaces++;sidePreparation.categories[surface.category]=(sidePreparation.categories[surface.category]??0)+1;sidePreparation.gripReductions[surface.gripReduction]=(sidePreparation.gripReductions[surface.gripReduction]??0)+1;}
      sidePreparation.bodies++;if(!outcome.contact)sidePreparation.noContact++;else if(outcome.attempts===1)sidePreparation.firstSide++;else sidePreparation.secondSide++;
      for(let wheel=0;wheel<4;wheel++)if(!!(state.wheels[wheel].flags&1)!==(state.contacts[wheel].distance>=0))throw Error('Side-preparation contact flag disagrees with distance.');
     }
     probes++;counts.probes++;
    }
   }
   resources.push(counts);
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
const summary={resources:resources.length,probes,queries,hits,overlaps,misses,nativeChecks,instructionSteps,sidePreparation,failures};
await writeFile('analysis/terrain-wheel-contact-probes.json',JSON.stringify({method:'Synthetic upright stationary bodies, 64-unit candidate radius, four short synthetic wheels, 44-unit downward rays, 40 units above cell centers. Installed collision data, reconstructed code, and sampled retained-instruction comparison; no original process execution.',summary,resources},null,2));
await writeFile('analysis/level1-wheel-contact-probes.json',JSON.stringify({samples},null,2));console.log(JSON.stringify(summary));
if(failures.length)process.exitCode=1;
