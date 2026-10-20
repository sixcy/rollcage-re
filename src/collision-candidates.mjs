// Candidate orchestration 0x427870 / 0x427910. Static-contact generation is an
// explicit boundary; pair generation defaults to the recovered 0x4279d0 port.
import {buildBodyPairEvents} from './body-pair-events.mjs';
function operations(options) {
 if(typeof options.buildStaticEvents!=='function')throw Error('Collision candidate scheduling requires explicit static-contact generation.');
 return {staticEvents:options.buildStaticEvents,pairEvents:options.buildPairEvents??((a,b)=>buildBodyPairEvents(a,b,options.pairOptions))};
}
const countOf=group=>group.count??group.bodies.length;
function groupAt(context,index){const group=context.groups[index];if(!group)throw Error('Collision candidate group storage is missing.');return group;}
export function buildInitialCollisionEvents(physicalGroup,context,options={}) {
 const {staticEvents,pairEvents}=operations(options);let total=staticEvents(physicalGroup)|0;
 // Native captures the group count after the static pass and does not reread it.
 const count=context.count;
 for(let index=0;index<count;index++){
  const group=groupAt(context,index);
  if(countOf(group)>1)total=(total+pairEvents(group,null))|0;
  for(let other=index+1;other<count;other++)total=(total+pairEvents(group,groupAt(context,other)))|0;
 }
 return total;
}
export function refreshCollisionCandidates(first,second,context,options={}) {
 const eligible=body=>{if(!body)return null;if(!Number.isInteger(body.collisionCounter168)||body.collisionCounter168<0||body.collisionCounter168>255)throw Error('Candidate refresh requires explicit counter byte +0x168.');return (body.collisionCounter168<<24>>24)<0?null:body;};
 first=eligible(first);second=eligible(second);if(!first){if(!second)return 0;first=second;second=null;}
 const {staticEvents,pairEvents}=operations(options),group=context.refreshGroup;
 if(!group||!Array.isArray(group.bodies))throw Error('Candidate refresh requires reusable refreshGroup storage.');
 group.isRefreshGroup=true;group.bodies[0]=first;group.bodies[1]=second;group.count=second?2:1;group.spatialBucket=first.spatialBucket;
 let total=staticEvents(group)|0;
 if((first.flags&0x1ff)===4)return total;
 // Unlike the initial pass, this native loop reloads the global group count
 // after each nonempty pair-builder call. Count/body mutations remain visible.
 let bound=context.count;
 for(let index=0;index<bound;index++){
  const other=groupAt(context,index);
  if(countOf(other)!==0){total=(total+pairEvents(group,other))|0;bound=context.count;}
 }
 return total;
}
