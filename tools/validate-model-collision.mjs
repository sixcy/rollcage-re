import {RollcageArchive} from '../src/archive.mjs';
import {parseGFXM} from '../src/gfxm.mjs';
import {parseModelCollision,readPlacementCollision} from '../src/model-collision.mjs';
import {parsePlacements} from '../src/placements.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources=[],failures=[];
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  const counts={resource:entry.index,models:0,withShapes:0,shapes:0,faces:0,faceRecords:0,edges:0,extraVertices:0,extraFaces:0,kinds:{},placements:0,placementClasses:{},configurationTypes:{}};
  const models=parseGFXM(data).models,collisions=new Map();
  for(const model of models)if(model)try {
   const collision=parseModelCollision(data,model);counts.models++;if(collision.available)counts.withShapes++;
   collisions.set(model.index,collision);
   if(collision.available){counts.extraVertices+=collision.vertices.length-model.vertexCount;counts.extraFaces+=collision.faces.length-data.readUInt16LE(collision.collisionModelOffset+6);}
   for(const field of ['shapes','faces','faceRecords','edges'])counts[field]+=collision[field].length;
   for(const shape of collision.shapes)counts.kinds[shape.kind]=(counts.kinds[shape.kind]??0)+1;
  }catch(error){failures.push({resource:entry.index,model:model.index,error:error.message});}
  const {data:btp}=await archive.readResource(entry.index+1);
  if(btp.toString('ascii',0,4)==='BTP ')for(const placement of parsePlacements(btp,models).records)if(placement.type===0)try {
   const settings=readPlacementCollision(data,placement,collisions.get(placement.modelIndex));counts.placements++;
   counts.placementClasses[settings.class]=(counts.placementClasses[settings.class]??0)+1;
   for(const config of settings.configurations)counts.configurationTypes[config.type]=(counts.configurationTypes[config.type]??0)+1;
  }catch(error){failures.push({resource:entry.index,placement:placement.index,error:error.message});}
  resources.push(counts);
 }
}finally{await archive.close();}
const sum=key=>resources.reduce((n,r)=>n+r[key],0),kinds={};for(const resource of resources)for(const [kind,count]of Object.entries(resource.kinds))kinds[kind]=(kinds[kind]??0)+count;
const combine=key=>{const result={};for(const resource of resources)for(const [value,count]of Object.entries(resource[key]))result[value]=(result[value]??0)+count;return result;};
const summary={resources:resources.length,...Object.fromEntries(['models','withShapes','shapes','faces','faceRecords','edges','extraVertices','extraFaces','placements'].map(key=>[key,sum(key)])),kinds,placementClasses:combine('placementClasses'),configurationTypes:combine('configurationTypes'),failures};
await writeFile('analysis/model-collision-catalog.json',JSON.stringify({summary,resources},null,2));console.log(JSON.stringify({...summary,failures:failures.slice(0,15)}));if(failures.length)process.exitCode=1;
