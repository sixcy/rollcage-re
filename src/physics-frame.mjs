// Full stage order of0x4749e0. The stage implementations are supplied explicitly;
// heap pop/filter/invalidation/release order uses the recovered event processor.
import {processCollisionEvents} from './collision-events.mjs';

export function runPhysicsFrame(physicalGroup,stages) {
 const {queue,effectFlags}=stages;
 for(const name of ['begin','prepareOrdinary','stepScripted','externalWorld','collectCandidates','updateGroups','updateVehicles','buildInitialEvents','respond','refresh','finish'])
  if(typeof stages[name]!=='function')throw Error(`Physics frame stage ${name} is required.`);
 if(!queue||typeof queue.reset!=='function')throw Error('Physics frame requires its collision event queue.');
 if(!effectFlags||!Number.isInteger(effectFlags.first)||!Number.isInteger(effectFlags.second))throw Error('Physics frame requires explicit effect flags.');
 stages.begin();
 // The native word count and array pointer are captured after46e9b0. Each body
 // pointer is read when reached; mutations of later array entries remain visible.
 const bodies=physicalGroup.bodies,count=physicalGroup.count??bodies?.length;
 if(!Array.isArray(bodies)||!Number.isInteger(count)||count<0||count>65535||count>bodies.length)throw Error('Physics frame requires an in-bounds unsigned-word physical body count.');
 let scriptedBodies=0,ordinaryBodies=0;
 for(let index=0;index<count;index++){
  const body=bodies[index];
  if(body.flags&0x2000){stages.stepScripted(body,index);scriptedBodies++;}
  else {stages.prepareOrdinary(body,index);ordinaryBodies++;}
 }
 stages.externalWorld();effectFlags.first=0;effectFlags.second=0;
 stages.collectCandidates();stages.updateGroups();stages.updateVehicles();
 queue.reset();stages.buildInitialEvents(queue);
 const processedEvents=processCollisionEvents(queue,{respond:stages.respond,refresh:stages.refresh,finish:stages.finish,beforeInvalidate:stages.beforeInvalidate,beforeFilter:stages.beforeFilter,onPromotedDelta:stages.onPromotedDelta,afterRespond:stages.afterRespond});
 return {nativeReturn:0,preparedBodies:count,scriptedBodies,ordinaryBodies,processedEvents};
}
