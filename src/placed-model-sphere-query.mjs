// Outer model query 0x423ab0. Object-effect routines are explicit callbacks;
// geometry, filters, candidate order, stale writes and yaw arithmetic are native.
import {queryModelShapeSphere} from './model-sphere-query.mjs';
import {toModelYawQuery,rotateModelYaw,rotateModelYawPoint} from './model-transforms.mjs';
const required=(callback,name,payload)=>{if(typeof callback!=='function')throw Error(`Placed model sphere contact requires ${name}.`);return callback(payload);};
export function queryPlacedModelSphere(candidates,query,output,{maxFractionQ16=65536,vehicleFlags=3,activeTag=0,specialType4=false,roundingMode,effects={},nativeState}={}) {
 let fraction=maxFractionQ16,acceptedFlags=0;
 for(let index=0;index<candidates.length;index++) {
  output.flags=0;
  const candidate=candidates[index],{collision,shape,settings}=candidate,objectClass=settings.class,radius=query.radiusQ8??0;
  if(objectClass===5||((objectClass===1||objectClass===2)&&radius===0))continue;
  const config=settings.configurations[shape.slot];if(!config)throw Error('Model shape configuration slot is unavailable.');
  if(config.type===5)continue;
  const sameTag=(query.tag&65535)===((activeTag<<24)>>24),special=(vehicleFlags&0x1ff)===3&&specialType4;
  if(config.type===4?(special?!sameTag:sameTag):sameTag)continue;
  const positionQ16=nativeState?.positionQ16(candidate)??settings.position.map(value=>value<<16),localQuery=toModelYawQuery(query,positionQ16,settings.yaw),localOutput=nativeState?.localOutput??{flags:0,point:[0,0,0],normal:[0,0,0],scalar:0};
  nativeState?.beforeShape(candidate,localQuery);
  const time=queryModelShapeSphere(collision,shape,localQuery,localOutput,{positionQ16,maxFractionQ16:fraction,roundingMode,nativeState});
  nativeState?.afterShape(candidate,localQuery);
  // 0x423d22 restores the four rotated X/Z probe fields. Surface references
  // are observable writes made by the nested query and survive that restore.
  if(localQuery.surfaceRef!==undefined)query.surfaceRef=localQuery.surfaceRef;
  let flags=localOutput.flags;if(!flags)continue;
  if(fraction<maxFractionQ16&&(flags&0x80000)){output.flags=acceptedFlags;return fraction;}
  const point=rotateModelYawPoint(localOutput.point,positionQ16,settings.yaw),normal=rotateModelYaw(localOutput.normal,settings.yaw),payload={candidate,candidateIndex:index,query,pointQ8:point,normalQ8:normal,fractionQ16:time,velocityQ16:query.deltaQ8.map(value=>value<<8),shapeSlot:shape.slot};
  nativeState?.rotateResult(point,normal);
  if(objectClass===1){if(required(effects.onClass1Contact,'onClass1Contact',payload))flags=0x240;}
  else if(objectClass===2){required(effects.onClass2Contact,'onClass2Contact',payload);flags=0x240;}
  else if(required(effects.onObjectContact,'onObjectContact',payload)) {
   if((settings.stateByte198??0)===0&&objectClass===4)required(effects.onClass4Break,'onClass4Break',payload);
   flags=0x840;
  }
  output.point=point;output.normal=normal.map(value=>value<<8);output.scalar=localOutput.scalar;output.cellRef=-4;fraction=time;acceptedFlags=flags;
 }
 output.flags=acceptedFlags;return fraction;
}
