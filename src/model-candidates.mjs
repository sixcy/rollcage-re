import {parseGFXM} from './gfxm.mjs';
import {parsePlacements} from './placements.mjs';
import {parseModelCollision,readPlacementCollision} from './model-collision.mjs';
import {parseSpatialIndex} from './spatial-index.mjs';
import {parseStaticModelLinks} from './model-links.mjs';
import {acceptsCollisionPlane} from './terrain-candidates.mjs';
import {toModelYawQuery} from './model-transforms.mjs';
import {signedShort} from './fixed-integer.mjs';
export function createModelCollisionContext(data,btp,{spatial=parseSpatialIndex(data)}={}) {
 const models=parseGFXM(data).models,placements=parsePlacements(btp,models),links=parseStaticModelLinks(data,spatial,placements);
 const collisions=new Map(),instances=new Map();
 for(const placement of placements.records)if(placement.type===0) {
  if(!collisions.has(placement.modelIndex))collisions.set(placement.modelIndex,parseModelCollision(data,models[placement.modelIndex]));
  const collision=collisions.get(placement.modelIndex),settings=readPlacementCollision(data,placement,collision);
  instances.set(placement.index,{collision,settings});
 }
 return {spatial,links,instances};
}
// FUN_00429600's candidate-acceptance output. Its point/edge calls write local
// contact data, then their flags are unconditionally overwritten with 2. Their
// scratch calculations are not needed to reproduce this acceptance predicate.
export function acceptsModelShape(collision,shape,query,positionQ16) {
 if(!shape.faceCount)return false; // Disabled records are excluded by the caller.
 if(shape.faceCount<3)return true;
 const records=new Map(collision.faceRecords.map(record=>[record.index,record]));
 for(let i=0;i<shape.faceCount-1;i++) {
  const record=records.get(shape.records[i]),face=collision.faces[record.faceIndex],vertex=collision.vertices[face.indices[0]-1];
  const point=vertex.slice(0,3).map((value,axis)=>signedShort(value+(positionQ16[axis]>>16)));
  if(!acceptsCollisionPlane(query,face.packedNormal,point,0x80010000))return false;
 }
 return true;
}
// FUN_00429360 plus its parent object's stage filters. The original spatial
// registration, rather than the terrain midpoint lookup, chooses model lists.
export function buildModelCandidates(context,body,{radiusQ8,spatialState}={}) {
 if(!Number.isInteger(radiusQ8)||radiusQ8<0||radiusQ8>0x7fffffff)throw Error('A nonnegative signed Q8 body radius is required.');
 const result={candidates:[],skipped:null};
 if((body.flags&0x200)||(body.flags&0x1ff)===4){result.skipped='object_filter';return result;}
 if(!context.spatial.available){result.skipped='no_spatial_data';return result;}
 const registration=spatialState??context.spatial.lookup(body.position);result.spatial=registration;
 if(!registration.found||!registration.node){result.skipped='no_spatial_cell';return result;}
 const list=context.links.nodes[registration.node.index];if(!list)throw Error('Model candidate spatial registration has no static list.');
 const query={originQ8:body.position.map(value=>value>>8),deltaQ8:body.linearVelocity.map(value=>value>>8),radiusQ8};result.query=query;
 for(const placementIndex of list.placementIndices) {
  const instance=context.instances.get(placementIndex);if(!instance)throw Error('Static model list references an unavailable instance.');
  const {collision,settings}=instance;if(settings.class===5)continue;
  const positionQ16=settings.position.map(value=>value<<16),localQuery=toModelYawQuery(query,positionQ16,settings.yaw);
  for(const shape of collision.shapes) {
   const config=settings.configurations[shape.index];if(!config)throw Error('Model candidate shape configuration is unavailable.');
   if(config.type===5||!shape.faceCount)continue;
   if(acceptsModelShape(collision,shape,localQuery,positionQ16))result.candidates.push({collision,shape,settings,yaw:settings.yaw,cellRef:-4});
  }
 }
 return result;
}
