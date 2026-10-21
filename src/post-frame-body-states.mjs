//47ccc0 consumes state32 after the physics and attachment stages. Route groups
//are12bytes, points16bytes; the leading group is deliberately skipped. Object
//identity represents native point/controller/body pointers, including aliases.
import {quaternionFromReleaseDirection} from './scripted-release.mjs';

const handler=(handlers,name)=>{if(typeof handlers[name]!=='function')throw Error(`Post-frame body states require handler ${name}.`);return handlers[name];};
const pointPosition=point=>{if(!point||!Array.isArray(point.position)||point.position.length!==3)throw Error('Post-frame route point is outside supplied native-readable memory.');return point.position.map(value=>(value<<16)>>16);};
const pointAt=(route,index)=>typeof route.pointAt==='function'?route.pointAt(index):route.points[index];

export function runPostFrameBodyStates(physicalGroup,{routes,routeState,slots36,mathScratch={},handlers={}}={}) {
 handler(handlers,'prepass')();
 //Both the word count and pointer are captured AFTER47e180. Unregister/retire
 //may compact this same array; replacement of the global array is invisible.
 const bodies=physicalGroup.bodies,count=physicalGroup.count??bodies?.length;
 if(!Array.isArray(bodies)||!Number.isInteger(count)||count<0||count>65535||count>bodies.length)throw Error('Post-frame states require an in-bounds unsigned-word physical count.');
 let closestRoute=null,closestPoint=null,closestIndex=-1,closestDistance=0x7fffffff;
 let secondRoute=null,secondPoint=null,secondIndex=-1,secondDistance=0x7fffffff;
 //These scratch values are initialized once per47ccc0, not once per body.
 const queryValue={};let visitedBodies=0,respawnedBodies=0,retiredBodies=0,stoppedByType4=false;
 for(let cursor=0,remaining=count;remaining>0;cursor++,remaining--){
  const body=bodies[cursor];visitedBodies++;
  if(body.collisionState128!==32)continue;
  const type=body.flags&0x1ff;
  if(type===4){
   const controller=body.controller164;
   controller.timer3a=20;controller.body.flags|=0x200;controller.flags39|=0x80;
   stoppedByType4=true;break;
  }
  if(type===7||type===21){
   const controller=body.controller164;
   handler(handlers,'unregister')(controller.body);
   handler(handlers,'removeSpatial')(controller.body);
   const slot=controller.index5;
   if(!Number.isInteger(slot)||slot<0||slot>=36)throw RangeError('Post-frame controller slot exceeds native36-entry table.');
   if(!slots36)throw Error('Post-frame retirement requires its36-entry slot table.');
   slots36[slot]=0;controller.active4=0;controller.body.field160=0;
   //The native cursor holds its place while remaining is decremented twice.
   cursor--;remaining--;retiredBodies++;continue;
  }
  if(type===33){handler(handlers,'retireType33')(body);cursor--;remaining--;retiredBodies++;continue;}
  if(!routes||!Number.isInteger(routes.countByte46)||routes.countByte46<0||routes.countByte46>255||!Array.isArray(routes.groups))throw Error('Post-frame respawn requires the explicit GFXM route table.');
  if(!routeState)throw Error('Post-frame respawn requires mutable route globals.');
  const position=body.position.map(value=>value>>16);
  for(let groupIndex=1;groupIndex<routes.countByte46;groupIndex++){
   const route=routes.groups[groupIndex];
   if(!route||!Number.isInteger(route.count)||route.count<0||route.count>65535)throw Error('Post-frame route count must be an unsigned word.');
   for(let index=0;index<route.count;index++){
    const point=pointAt(route,index);if(point===routeState.currentPoint)continue;
    const coordinates=pointPosition(point),difference=coordinates.map((value,axis)=>(value-position[axis])|0);
    const distance=(Math.imul(difference[2],difference[2])+Math.imul(difference[1],difference[1])+Math.imul(difference[0],difference[0]))|0;
    if(distance<closestDistance){
     secondRoute=closestRoute;secondPoint=closestPoint;secondIndex=closestIndex;secondDistance=closestDistance;
     closestRoute=route;closestPoint=point;closestIndex=index;closestDistance=distance;
    }else if(distance<secondDistance){secondRoute=route;secondPoint=point;secondIndex=index;secondDistance=distance;}
   }
  }
  routeState.currentPoint=closestPoint;
  //Keep the global arrays stable so query/apply callbacks see actual aliases.
  routeState.position??=[0,0,0];routeState.direction??=[0,0,0];
  pointPosition(closestPoint).forEach((value,axis)=>routeState.position[axis]=value<<16);
  const forward=closestIndex<closestRoute.count-1,neighbor=pointAt(closestRoute,closestIndex+(forward?1:-1));
  let directionSign=forward?1:-1;if(closestRoute.reverseByte2&255)directionSign=-directionSign;
  const neighborPosition=pointPosition(neighbor),closestPosition=pointPosition(closestPoint);
  for(let axis=0;axis<3;axis++)routeState.direction[axis]=Math.imul((neighborPosition[axis]-closestPosition[axis])<<8,directionSign);
  const quaternion=quaternionFromReleaseDirection(routeState.direction,mathScratch),rotation=body.rotation;
  const accepted=handler(handlers,'query')(body,{position:routeState.position,quaternion,rotation,mode:1,queryValue});
  let route=closestRoute,index=closestIndex;
  if(!accepted){
   //Only position/current point change. The first attempt's quaternion,
   //normalized direction, body rotation and query scratch are all retained.
   routeState.currentPoint=secondPoint;
   pointPosition(secondPoint).forEach((value,axis)=>routeState.position[axis]=value<<16);
   route=secondRoute;index=secondIndex;
  }
  let registers=handler(handlers,'apply')(body,{position:routeState.position,quaternion,rotation,route,index,queryValue:queryValue.value});
  if((body.flags&0x1ff)===3)registers=handler(handlers,'vehicleTail')(body,0);
  if(!registers||!Number.isInteger(registers.registerEcx))throw Error('Post-frame emitter requires the explicit ECX register left by its preceding callback.');
  handler(handlers,'emit')({code:43,registerEdx:0,args:[0,-1,9000,6,registers.registerEcx|0,0,0]});
  respawnedBodies++;
 }
 return {visitedBodies,respawnedBodies,retiredBodies,stoppedByType4};
}
