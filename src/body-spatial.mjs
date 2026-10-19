// Runtime body lists in native spatial buckets: 0x474600 / 0x474850.
// Allocation remains the caller's responsibility. IDs address 128-byte pool
// units and need not be consecutive or denote complete object-sized slots.
const unsignedShort=(value,label)=>{if(!Number.isInteger(value)||value<0||value>65535)throw Error(`${label} requires an unsigned 16-bit ID.`);return value;};
function checkBucket(bucket){if(!bucket||typeof bucket!=='object')throw Error('A runtime spatial bucket is required.');unsignedShort(bucket.headId,'Spatial bucket head');return bucket;}

// The caller supplies mutable buckets separately from the parsed static index.
// A bucket's headId is explicit runtime state, rather than inferred allocation.
export function createBodySpatialSelector(index,buckets) {
 if(!index?.available||typeof index.lookup!=='function'||!Array.isArray(buckets)||buckets.length!==index.nodes.length)throw Error('Spatial registration requires a parsed index and one explicit runtime bucket per node.');
 for(const bucket of buckets)checkBucket(bucket);
 return body=>{
  const result=index.lookup(body.position);
  if(!result.found)throw Error('Body spatial lookup found no populated cell.');
  return {bucket:buckets[result.node.index],outside:result.outside};
 };
}

export class BodySpatialRegistry {
 constructor(poolEntries,selectBucket) {
  if(!Array.isArray(poolEntries)||typeof selectBucket!=='function')throw Error('Spatial registration requires explicit pool entries and a bucket selector.');
  this.selectBucket=selectBucket;this.byId=new Map();this.ids=new Map();
  for(const {body,poolOffset} of poolEntries) {
   if(!body||typeof body!=='object'||!Number.isInteger(poolOffset)||poolOffset<0||poolOffset>65534*128||poolOffset%128)throw Error('Spatial pool offsets must be explicit aligned units with nonzero 16-bit IDs.');
   const id=poolOffset/128+1;
   if(this.byId.has(id)||this.ids.has(body))throw Error('Spatial pool bodies and IDs must be unique.');
   this.byId.set(id,body);this.ids.set(body,id);
  }
 }
 idFor(body){const id=this.ids.get(body);if(id===undefined)throw Error('Body has no explicit spatial pool entry.');return id;}
 bodyFor(id){unsignedShort(id,'Spatial body link');const body=this.byId.get(id);if(!body)throw Error(`Spatial body ID ${id} has no explicit pool entry.`);return body;}
 insert(body) {
  const id=this.idFor(body),selected=this.selectBucket(body),bucket=checkBucket(selected?.bucket),head=bucket.headId;
  if(typeof selected.outside!=='boolean')throw Error('Spatial selector requires an explicit outside flag.');
  // Resolve before mutation, so invalid handles fail without partly written lists.
  const previousHead=head?this.bodyFor(head):null;
  body.spatialBucket=bucket;body.spatialOutside=selected.outside;
  body.spatialNextId=head;body.spatialPreviousId=0;
  if(previousHead)previousHead.spatialPreviousId=id;
  bucket.headId=id;return body;
 }
 remove(body) {
  this.idFor(body);
  const previous=unsignedShort(body.spatialPreviousId,'Previous spatial link'),next=unsignedShort(body.spatialNextId,'Next spatial link');
  const nextBody=next?this.bodyFor(next):null,previousBody=previous?this.bodyFor(previous):null;
  if(previous===0){checkBucket(body.spatialBucket).headId=next;if(nextBody)nextBody.spatialPreviousId=0;}
  else{if(nextBody)nextBody.spatialPreviousId=previous;previousBody.spatialNextId=next;}
  body.spatialNextId=0;body.spatialPreviousId=0;
  // Native removal does not clear the tagged bucket reference at object +0xc.
  return body;
 }
 handlers(){return {insertSpatial:body=>this.insert(body),removeSpatial:body=>this.remove(body)};}
}
