import {queryModelShapeRay} from './model-query.mjs';
import {toModelYawQuery,rotateModelYaw,rotateModelYawPoint} from './model-transforms.mjs';
// Radius-zero path through FUN_00423ab0. Candidate order is retained. Class-1
// and class-2 effects are excluded by the native zero-radius class filter.
export function queryPlacedModelRay(candidates,query,{maxFractionQ16=65536,vehicleFlags=3,activeTag=0,specialType4=false,onBreakableContact}={}) {
 if((query.radiusQ8??query.radius??0)!==0)throw Error('Placed-model ray query requires zero radius.');
 let result={flags:0,fractionQ16:maxFractionQ16};
 for(let index=0;index<candidates.length;index++) {
  const {collision,shape,settings}=candidates[index],objectClass=settings.class;
  if(objectClass===1||objectClass===2||objectClass===5)continue;
  const config=settings.configurations[shape.slot];if(!config)throw Error('Model shape configuration slot is unavailable.');
  if(config.type===5)continue;
  const sameTag=(query.tag&65535)===((activeTag<<24)>>24),special=(vehicleFlags&0x1ff)===3&&specialType4;
  if(config.type===4?(special?!sameTag:sameTag):sameTag)continue;
  const positionQ16=settings.position.map(value=>value<<16),localQuery=toModelYawQuery(query,positionQ16,settings.yaw);
  const hit=queryModelShapeRay(collision,shape,localQuery,{positionQ16,maxFractionQ16:result.fractionQ16});
  if(!hit.flags)continue;
  let flags=hit.flags;
  if(config.type===4) {
   if(!onBreakableContact)throw Error('Breakable model contact requires its object-state/effect handler.');
   if(onBreakableContact({candidate:candidates[index],query,hit}))flags=0x840;
  }
  const normal=rotateModelYaw(hit.normalQ8,settings.yaw);
  result={flags,fractionQ16:hit.fractionQ16,pointQ8:rotateModelYawPoint(hit.pointQ8,positionQ16,settings.yaw),normalQ16:normal.map(value=>value<<8),distanceQ8:hit.distanceQ8,cellRef:-4,candidateIndex:index,shapeSlot:shape.slot,placementIndex:settings.placementIndex};
 }
 return result;
}
// FUN_00488e20: every terrain ray runs before the model rays. If a model
// fraction is not closer, native code restores only the terrain flags, leaving
// any model-written point/normal fields in the shared result record.
export function selectWheelHits(probes,{terrainQuery,modelQuery}) {
 if(probes.length!==4)throw Error('Wheel hit selection requires four probes.');
 const terrain=probes.map(probe=>terrainQuery(probe.query)),buffers=terrain.map(hit=>({...hit}));
 for(let wheel=0;wheel<4;wheel++) {
  const model=modelQuery(probes[wheel].query),buffer=buffers[wheel];
  if(model.flags)Object.assign(buffer,model);else buffer.flags=0;
  if((model.fractionQ16>>>0)<(terrain[wheel].fractionQ16>>>0))buffer.fractionQ16=model.fractionQ16;
  else {buffer.flags=terrain[wheel].flags;buffer.fractionQ16=terrain[wheel].fractionQ16;}
 }
 return buffers;
}
