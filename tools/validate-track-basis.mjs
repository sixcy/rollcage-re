import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {readVehicleTrackBasis,selectTrackBasisAxis} from '../src/track-basis.mjs';
import {verifyTrackBasis} from './verify-track-basis-instructions.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage'),resources=[],failures=[];
const summary={resources:0,coveredQueries:0,policyQueries:0,zeroTangents:0,nativeChecks:0,instructionSteps:0,axes:{}};
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const grid=parseCollisionGrid(data);if(!grid.available)continue;const counts={resource:entry.index,coveredQueries:0,policyQueries:0};
   const query=(cellRef,context)=>{const result=readVehicleTrackBasis(data,grid,cellRef,context);for(const value of [...result.tangentQ16,...result.normalQ16])if(!Number.isInteger(value)||value< -2147483648||value>2147483647)throw Error('Track basis output is not a signed integer.');if(!result.tangentQ16.some(Boolean))summary.zeroTangents++;const axis=selectTrackBasisAxis(cellRef,context);summary.axes[axis]=(summary.axes[axis]??0)+1;return result;};
   for(const sector of grid.sectors) {
    const active=sector.cells.filter(cell=>cell.covered),context={mode:0,progressStage:0,routeIndex:0};
    for(const cell of active) {
     const cellRef=(cell.row<<16)|(cell.column<<8)|sector.index;query(cellRef,context);
     if(summary.coveredQueries%2048===0){const check=verifyTrackBasis(data,grid,cellRef,context);summary.nativeChecks++;summary.instructionSteps+=check.steps;}
     summary.coveredQueries++;counts.coveredQueries++;
    }
    for(const slot of new Set([0,Math.floor(active.length/2),active.length-1])) {
     const cell=active[slot];if(!cell)continue;const cellRef=(cell.row<<16)|(cell.column<<8)|sector.index;
     for(const [mode,progressStage]of [[11,4],[11,11],[12,6],[12,7],[12,11]]){query(cellRef,{mode,progressStage,routeIndex:0});summary.policyQueries++;counts.policyQueries++;}
    }
   }
   resources.push(counts);
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
summary.resources=resources.length;summary.failures=failures;
await writeFile('analysis/track-basis-catalog.json',JSON.stringify({method:'Static track-basis exercise at every covered installed cell with declared default mode/progression and route index0, plus sampled mode11/12 policies. Original packed-normal table and grid/route records; sampled retained-instruction comparisons. No captured player progression, runtime registration or original process execution.',summary,resources},null,2));console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;
