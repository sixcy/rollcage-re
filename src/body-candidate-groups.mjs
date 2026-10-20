// Native candidate grouping 0x46ea80. Group storage and body-list capacities
// belong to the caller; this does not infer their native allocation policy.
// Each group keeps its unused body-list entries, just as the native code does.
export function buildBodyCandidateGroups(physicalBodies,context) {
 if(!Array.isArray(physicalBodies)||physicalBodies.length>65535||!context||!Array.isArray(context.groups)||!Number.isInteger(context.count)||context.count< -2147483648||context.count>2147483647)throw Error('Candidate grouping requires explicit physical bodies and reusable group storage/count.');
 const groupAt=index=>{const group=context.groups[index];if(!group||!Array.isArray(group.bodies)||!Number.isInteger(group.count)||group.count<0||group.count>65535)throw Error('Candidate group storage requires a body array and unsigned 16-bit count.');return group;};
 for(let index=0;index<context.count;index++){const group=groupAt(index);group.count=0;group.spatialBucket=null;}
 let count=0;
 for(const body of physicalBodies) {
  const flags=body.flags;
  if((flags&0x8000)||!(flags&0x800)||(flags&0x1ff)===4||(body.collisionFlags&0x1000000))continue;
  const bucket=body.spatialBucket;
  if(!bucket||!Number.isInteger(bucket.headId)||bucket.headId<0||bucket.headId>65535)throw Error('Candidate grouping requires the explicit spatial bucket head ID.');
  if(!bucket.headId)continue;
  // The eight-byte octant scratch starts at -1 for every outer body. Its
  // search finds this same body in the physical list and consumes the first
  // scratch entry, so the retained instructions always produce one group.
  const group=groupAt(count++);
  group.bodies[group.count]=body;
  group.count=(group.count+1)&65535;
  group.spatialBucket=bucket;
  body.collisionGroup130=group;
  body.collisionFlags|=0x1000000;
 }
 context.count=count;
 const sentinel=groupAt(count);sentinel.count=0;sentinel.spatialBucket=null;
 return context;
}
