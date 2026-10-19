// Candidate-group pair exclusions0x428010 and event builder0x4279d0.
import {prepareBodyShapeCache} from './body-shape-cache.mjs';
import {queryBodyPairContact} from './body-pair-query.mjs';
import {insertCollisionEvent} from './collision-events.mjs';
const pointer=(body,name)=>{if(!Object.hasOwn(body,name))throw Error(`Pair exclusion requires explicit body.${name}.`);return body[name];};
// Pointer fields hold body identities (or an explicit null/opaque identity).
// The caller applies this directional predicate in both directions.
export function isBodyPairExcluded(first,second) {
 const a=first.flags&0x1ff,b=second.flags&0x1ff;
 if(a===4)return true;
 if(a===3){if(b===12)return pointer(second,'pointer194')===first;if(b===17)return pointer(second,'pointer180')===first;return false;}
 if(a===12){if(b===12)return pointer(first,'pointer194')===pointer(second,'pointer194');if(b===17)return pointer(first,'pointer194')===pointer(second,'pointer180');return false;}
 if(a===17){if(b===12)return pointer(first,'pointer180')===pointer(second,'pointer194');if(b===17)return pointer(first,'pointer180')===pointer(second,'pointer180');return false;}
 if(a===22){if(b===3)return pointer(first,'pointer194')===second||pointer(first,'pointer198')===second;return b===22;}
 return false;
}
function countOf(group){const count=group.count??group.bodies.length;if(!Number.isInteger(count)||count<0||count>65535||count>group.bodies.length)throw Error('Pair event group requires an explicit in-bounds unsigned16 count.');return count;}
const scratch=()=>({flags:0,point:[0,0,0],normal:[0,0,0],scalar:0,auxiliaryVector:[0,0,0],field38:0});
// Same-group work visits only later entries; cross-group work visits every pair.
// Count and first-body state are captured at native points, while body-array
// entries, second-body flags and refresh-group markers remain live.
export function buildBodyPairEvents(firstGroup,secondGroup=null,{records,queue,prepare=prepareBodyShapeCache,query=queryBodyPairContact,emit=insertCollisionEvent,exclude=isBodyPairExcluded,timeOptions,queryOptions,output=scratch()}={}) {
 if(secondGroup){const first=firstGroup.bodies[0],second=secondGroup.bodies[0];if(!first||!second)throw Error('Cross-group coarse screening requires both first body entries.');
  for(let axis=0;axis<3;axis++)if(Math.abs(((first.position[axis]-second.position[axis])|0)>>23)>2)return 0;
 }
 const count=countOf(firstGroup);let emitted=0;
 for(let index=0;index<count;index++){
  const first=firstGroup.bodies[index];if(!first||first.frameTimeQ16===65536)continue;
  const firstTime=first.frameTimeQ16,firstFlags=first.collisionFlags;
  prepare(first,firstTime,records,timeOptions);
  const remaining=(65536-firstTime)|0;if(remaining<=0)continue;
  const others=secondGroup??firstGroup,otherCount=secondGroup?countOf(secondGroup):count;
  for(let otherIndex=secondGroup?0:index+1;otherIndex<otherCount;otherIndex++){
   const second=others.bodies[otherIndex];if(!second||first===second||second.frameTimeQ16===65536)continue;
   if(exclude(first,second)||exclude(second,first))continue;
   if(firstGroup.isRefreshGroup&&first===firstGroup.bodies[1]&&second===firstGroup.bodies[0])continue;
   if((firstFlags&0x80000000)&&(second.collisionFlags&0x80000000))continue;
   prepare(second,firstTime,records,timeOptions);
   const deltaQ16=query(first,second,records,output,remaining,queryOptions);
   output.flags&=255;
   if(!output.flags)continue;
   output.field38=-3;
   const flags={value:output.flags};emit(queue,{object1:first,object2:second,contact:output,flags,tag:0,auxiliaryVector:output.auxiliaryVector,deltaQ16});output.flags=flags.value;
   emitted++;
  }
 }
 return emitted;
}
