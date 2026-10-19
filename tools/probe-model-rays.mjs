import {RollcageArchive} from '../src/archive.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parseModelCollision} from '../src/model-collision.mjs';
import {queryModelShapeRay} from '../src/model-query.mjs';
import {verifyModelShapeRay} from './verify-model-query-instructions.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
let queries=0,hits=0,misses=0,nativeChecks=0,instructionSteps=0;const resources=[],failures=[],samples=[];
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  const counts={resource:entry.index,models:0,queries:0,hits:0,misses:0};
  for(const model of parseGFXM(data).models)if(model)try {
   const collision=parseModelCollision(data,model);if(!collision.available)continue;counts.models++;
   const records=new Map(collision.faceRecords.map(record=>[record.index,record]));
   for(const shape of collision.shapes) {
    const selected=shape.faceCount>2?[...new Set([0,Math.floor(shape.records.length/2),shape.records.length-1])]:[0];
    for(const slot of selected) {
     const face=shape.faceCount>2?collision.faces[records.get(shape.records[slot]).faceIndex]:null;
     const positionQ16=[50*65536+16384,-30*65536+32768,20*65536],normal=face?.normalQ8??[0,-256,0];
     const vertices=face?face.indices.filter(Boolean).map(index=>collision.vertices[index-1]):[shape.center];
     const target=[0,1,2].map(axis=>Math.trunc(vertices.reduce((sum,vertex)=>sum+vertex[axis]*256,0)/vertices.length)+(positionQ16[axis]>>8));
     const query={originQ8:target.map((value,i)=>value+normal[i]*40),deltaQ8:normal.map(value=>-value*80)};
     const result=queryModelShapeRay(collision,shape,query,{positionQ16});
     if(queries%4===0){const check=verifyModelShapeRay(collision,shape,query,{positionQ16});nativeChecks++;instructionSteps+=check.steps;}
     queries++;counts.queries++;if(result.flags){hits++;counts.hits++;if(result.fractionQ16<=0||result.fractionQ16>65536)throw Error('Hit fraction is outside the admitted positive range.');}else {misses++;counts.misses++;}
     if(entry.index===30&&samples.length<8)samples.push({model:model.index,shape:shape.index,query,positionQ16,result});
    }
   }
  }catch(error){failures.push({resource:entry.index,model:model.index,error:error.message});}
  resources.push(counts);
 }
}finally{await archive.close();}
const summary={resources:resources.length,models:resources.reduce((sum,r)=>sum+r.models,0),queries,hits,misses,nativeChecks,instructionSteps,failures};
await writeFile('analysis/model-ray-probes.json',JSON.stringify({method:'Synthetic rays aimed through selected installed model faces with a declared fractional translation. Reconstructed query and sampled retained-instruction checks; no original process execution.',summary,resources},null,2));
await writeFile('analysis/level1-model-ray-probes.json',JSON.stringify({samples},null,2));console.log(JSON.stringify({...summary,failures:failures.slice(0,5)}));if(failures.length)process.exitCode=1;
