import {parseGFXM} from './gfxm.mjs';
import {parsePlacements} from './placements.mjs';
import {parseModelCollision,readPlacementCollision} from './model-collision.mjs';
import {collisionPlaneWarnings} from './model-collision-preview.mjs';

const empty=(status,reason='')=>({status,totalShapes:0,activeShapes:0,geometryDisabled:0,settingsDisabled:0,kinds:{point:0,edge:0,polyhedron:0},warnings:[],reason});

// Authored state only. 429360/423ab0 skip zero face-count records and config
// type 5; tags, damage state and runtime effects can further filter contacts.
export function summarizeSceneryCollision(collision,settings) {
  if(!collision?.available)return empty('unknown','Collision representation is unavailable.');
  const result=empty('disabled');result.totalShapes=collision.shapes.length;
  for(const shape of collision.shapes){
    if(!shape.faceCount){result.geometryDisabled++;continue;}
    const config=settings?.configurations?.[shape.slot];
    if(!config)return {...result,status:'unknown',reason:'Collision configuration slot is unavailable.'};
    if(settings.class===5||config.type===5){result.settingsDisabled++;continue;}
    result.activeShapes++;result.kinds[shape.kind]++;
    if(shape.faceCount>=3)result.warnings.push(...collisionPlaneWarnings(collision,shape));
  }
  if(result.activeShapes)result.status='enabled';
  return result;
}

export function inspectSceneryCollisions(data,texture) {
  const models=parseGFXM(data).models,placements=parsePlacements(texture,models),cache=new Map(),result=new Map();
  for(const placement of placements.records.filter(p=>p.type===0&&(p.flags&0x400))){
    try{
      if(!cache.has(placement.modelIndex))cache.set(placement.modelIndex,parseModelCollision(data,models[placement.modelIndex]));
      const collision=cache.get(placement.modelIndex);
      result.set(placement.index,summarizeSceneryCollision(collision,readPlacementCollision(data,placement,collision)));
    }catch(error){result.set(placement.index,empty('unknown',error.message));}
  }
  return result;
}
