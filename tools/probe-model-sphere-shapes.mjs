// Installed MODC geometry with declared synthetic probes; no original execution.
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RollcageArchive} from '../src/archive.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parseModelCollision} from '../src/model-collision.mjs';
import {queryModelShapeSphere} from '../src/model-sphere-query.mjs';
import {normalizeCollisionVector} from '../src/sphere-collision.mjs';
import {verifyModelShapeSphere} from './verify-model-sphere-query-instructions.mjs';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage'),resources=[],failures=[],probes=[],positionQ16=[50*65536+16384,-30*65536+32768,20*65536],roundingMode='nearest-even';
let queries=0,hits=0,misses=0,nativeChecks=0,instructionSteps=0;
const histogram=(target,key)=>{target[key]=(target[key]??0)+1;};
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  const counts={resource:entry.index,resourceSha256:createHash('sha256').update(data).digest('hex'),models:0,shapes:0,shapeKinds:{},queries:0,hits:0,misses:0,flags:{},nativeChecks:0,nativeChecksByKind:{},instructionSteps:0};
  for(const model of parseGFXM(data).models)if(model)try {
   const collision=parseModelCollision(data,model);if(!collision.available)continue;counts.models++;
   const records=new Map(collision.faceRecords.map(record=>[record.index,record]));
   for(const shape of collision.shapes) {
    counts.shapes++;histogram(counts.shapeKinds,shape.kind);
    const selected=shape.faceCount>2?[...new Set([0,Math.floor(shape.records.length/2),shape.records.length-1])]:[0];
    for(const slot of selected) {
     let normal=[0,-256,0],vertices=[shape.center];
     if(shape.faceCount>2){const face=collision.faces[records.get(shape.records[slot]).faceIndex];normal=face.normalQ8;vertices=face.indices.filter(Boolean).map(index=>collision.vertices[index-1]);}
     else if(shape.faceCount===2){const record=records.get(shape.records[0]),edge=collision.edges.find(value=>value.index===record.raw[0]);vertices=edge.indices.map(index=>collision.vertices[index-1]);const direction=edge.normalQ8,axis=[0,0,0];axis[direction.map(Math.abs).indexOf(Math.min(...direction.map(Math.abs)))]=256;const cross=[direction[1]*axis[2]-direction[2]*axis[1],direction[2]*axis[0]-direction[0]*axis[2],direction[0]*axis[1]-direction[1]*axis[0]];normal=normalizeCollisionVector(cross,roundingMode).vector.map(value=>value>>4);}
     const target=[0,1,2].map(axis=>Math.trunc(vertices.reduce((sum,vertex)=>sum+vertex[axis]*256,0)/vertices.length)+(positionQ16[axis]>>8)),input={originQ8:target.map((value,i)=>(value+normal[i]*40)|0),deltaQ8:normal.map(value=>-value*80|0),radiusQ8:8*256,surfaceRef:0x12345678},query=structuredClone(input),output={point:[-1515870811,-1515870811,-1515870811],normal:[-1515870811,-1515870811,-1515870811],scalar:-1515870811,flags:-1515870811},options={positionQ16,maxFractionQ16:65536,roundingMode},fractionQ16=queryModelShapeSphere(collision,shape,query,output,options),probe={resource:entry.index,model:model.index,shape:shape.index,kind:shape.kind,faceSlot:shape.faceCount>2?slot:null,input,fractionQ16,output,surfaceRef:query.surfaceRef,nativeChecked:false};
     probes.push(probe);
     if(queries%4===0||shape.faceCount===1||shape.faceCount===2){const check=verifyModelShapeSphere(collision,shape,input,options,{point:[-1515870811,-1515870811,-1515870811],normal:[-1515870811,-1515870811,-1515870811],scalar:-1515870811,flags:-1515870811});probe.nativeChecked=true;nativeChecks++;counts.nativeChecks++;instructionSteps+=check.steps;counts.instructionSteps+=check.steps;histogram(counts.nativeChecksByKind,shape.kind);}
     queries++;counts.queries++;histogram(counts.flags,output.flags);if(output.flags){hits++;counts.hits++;}else{misses++;counts.misses++;}
    }
   }
  }catch(error){failures.push({resource:entry.index,model:model.index,error:error.message});}
  resources.push(counts);
 }
}finally{await archive.close();}
const sum=key=>resources.reduce((total,value)=>total+value[key],0),combine=key=>{const combined={};for(const resource of resources)for(const [name,value]of Object.entries(resource[key]))combined[name]=(combined[name]??0)+value;return combined;},summary={resources:resources.length,models:sum('models'),shapes:sum('shapes'),shapeKinds:combine('shapeKinds'),queries,hits,misses,flags:combine('flags'),nativeChecks,nativeChecksByKind:combine('nativeChecksByKind'),instructionSteps,failures};
await writeFile('analysis/model-sphere-shape-probes.json',JSON.stringify({method:'Synthetic nonzero-radius sphere probes aimed at up to three selected faces per installed MODC polyhedron, each point center and each edge midpoint. Authored face/edge IDs, normals, extra vertices and primitive shape tables are parsed from all installed GFXM resources. Fixed eight-unit radius, forty-unit start offset, eighty-unit closing velocity and declared fractional Q16 object translation. One in four queries plus all point/edge queries receive complete retained-instruction shape-query comparisons. Complete port outputs and input probes are retained below. No original process execution or gameplay observation.',context:{positionQ16,roundingMode,maxFractionQ16:65536,radiusQ8:2048},summary,resources,probes},null,2));console.log(JSON.stringify({...summary,failures:failures.slice(0,5)}));if(failures.length)process.exitCode=1;
