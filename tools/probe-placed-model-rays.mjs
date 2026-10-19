import {RollcageArchive} from '../src/archive.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {parseModelCollision,readPlacementCollision} from '../src/model-collision.mjs';
import {queryPlacedModelRay} from '../src/placed-model-query.mjs';
import {rotateModelYaw,rotateModelYawPoint} from '../src/model-transforms.mjs';
import {verifyPlacedModelRay} from './verify-placed-model-instructions.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources=[],failures=[],samples=[];let queries=0,hits=0,misses=0,nativeChecks=0,instructionSteps=0;
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const models=parseGFXM(data).models,{data:btp}=await archive.readResource(entry.index+1),placements=parsePlacements(btp,models);
   const collisions=new Map(),counts={resource:entry.index,queries:0,hits:0,misses:0};
   for(const placement of placements.records)if(placement.type===0) {
    if(!collisions.has(placement.modelIndex))collisions.set(placement.modelIndex,parseModelCollision(data,models[placement.modelIndex]));
    const collision=collisions.get(placement.modelIndex),shape=collision.shapes.find(shape=>shape.faceCount>2);if(!shape)continue;
    const settings=readPlacementCollision(data,placement,collision),record=collision.faceRecords.find(record=>record.index===shape.records[0]),face=collision.faces[record.faceIndex];
    const vertices=face.indices.filter(Boolean).map(index=>collision.vertices[index-1]),positionQ16=settings.position.map(value=>value<<16);
    const target=[0,1,2].map(axis=>Math.trunc(vertices.reduce((sum,vertex)=>sum+vertex[axis]*256,0)/vertices.length)+(positionQ16[axis]>>8));
    const query={originQ8:rotateModelYawPoint(target.map((value,i)=>value+face.normalQ8[i]*40),positionQ16,settings.yaw),deltaQ8:rotateModelYaw(face.normalQ8.map(value=>-value*80),settings.yaw),tag:100};
    const candidate={collision,shape,settings},result=queryPlacedModelRay([candidate],query,{onBreakableContact:()=>false});
    if(queries%8===0){const check=verifyPlacedModelRay([candidate],query);nativeChecks++;instructionSteps+=check.steps;}
    queries++;counts.queries++;if(result.flags){hits++;counts.hits++;}else {misses++;counts.misses++;}
    if(entry.index===30&&samples.length<6)samples.push({placement:placement.index,model:placement.modelIndex,yaw:settings.yaw,class:settings.class,query,result});
   }
   resources.push(counts);
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
const summary={resources:resources.length,queries,hits,misses,nativeChecks,instructionSteps,failures};
await writeFile('analysis/placed-model-ray-probes.json',JSON.stringify({method:'Synthetic aimed wheel-tag rays through each eligible installed ordinary placement, with native yaw. Destruction state explicitly inert in both port and instruction checks. No original process execution, spatial candidate lifecycle or destruction-effect equivalence claimed.',summary,resources},null,2));
await writeFile('analysis/level1-placed-model-ray-probes.json',JSON.stringify({samples},null,2));console.log(JSON.stringify({...summary,failures:failures.slice(0,5)}));if(failures.length)process.exitCode=1;
