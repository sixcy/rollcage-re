import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCollisionVector,querySpherePair} from '../src/sphere-collision.mjs';
import {queryBodyPairContact} from '../src/body-pair-query.mjs';
import {prepareBodyShapeCache,storeBodyShapeContact} from '../src/body-shape-cache.mjs';
import {BodyShapePool,registerBodyCollisionShapes} from '../src/body-shape-registration.mjs';
import {buildBodyPairEvents,isBodyPairExcluded} from '../src/body-pair-events.mjs';
import {CollisionEventQueue,decodeCollisionEventKey} from '../src/collision-events.mjs';

const rounding={roundingMode:'nearest-even'};
const contact=()=>({flags:0,point:[7,8,9],normal:[10,11,12],scalar:77,auxiliaryVector:[13,14,15]});
const record=(x=0,vx=0,radius=256)=>{
 const result=Buffer.alloc(72);result.writeInt32LE(x,8);result.writeInt32LE(vx,20);result.writeInt32LE(radius,64);return result;
};
const vectorAt=(record,offset)=>[0,4,8].map(axis=>record.readInt32LE(offset+axis));
const body=(ids,count,extra={})=>({flags:1,position:[0,0,0],linearVelocity:[0,0,0],angularVelocity:[0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096],frameTimeQ16:0,collisionFlags:0,collisionCount10c:count,collisionIds:ids,...extra});

test('analytic head-on spheres generate half-frame contact and preserve the unused scalar',()=>{
 const result=contact();
 assert.equal(querySpherePair(record(-512,512),record(512,-512),result,65536,rounding),32768);
 assert.deepEqual(result,{flags:1,point:[0,0,0],normal:[256,0,0],scalar:77,auxiliaryVector:[13,14,15]});
});

test('an AABB rejection preserves the entire supplied sphere result',()=>{
 const result=contact();result.flags=0x123402;
 const before=structuredClone(result);
 assert.equal(querySpherePair(record(),record(4096,256),result,65536,rounding),65536);
 assert.deepEqual(result,before);
});

test('overlap writes penetration and replaces only the low flag byte',()=>{
 const result=contact();result.flags=0x123401;
 assert.equal(querySpherePair(record(),record(256),result,65536,rounding),0);
 assert.equal(result.flags,0x123402);assert.equal(result.scalar,-256);
 assert.deepEqual(result.point,[128,0,0]);assert.deepEqual(result.normal,[-256,0,0]);
});

test('float normalization exposes rounding, large-vector reduction and masked invalid results',()=>{
 assert.deepEqual(normalizeCollisionVector([3,4,0],'nearest-even').vector,[2458,3277,0]);
 assert.deepEqual(normalizeCollisionVector([3,4,0],'toward-zero').vector,[2457,3276,0]);
 const input=[131072,65536,32768],result=normalizeCollisionVector(input,'nearest-even');
 assert.equal(result.shift,4);assert.deepEqual(input,[8192,4096,2048]);
 assert.deepEqual(normalizeCollisionVector([0,0,0],'nearest-even').vector,[-2147483648,-2147483648,-2147483648]);
 assert.throws(()=>normalizeCollisionVector([3,4,0]),/explicit x87 rounding mode/);
});

test('body pairs retain the last accepted shape time rather than the earliest',()=>{
 const records=[record(),record(0,0,4096),record(1024,-2048),record(1536,-2048),record(0,0,4096)];
 const first=body([0,1],1),second=body([2,3,4],2),result=contact();
 assert.equal(queryBodyPairContact(first,second,records,result,65536,rounding),32768);
 assert.equal(result.flags,1);assert.equal(result.scalar,77);
 assert.deepEqual(result.normal,[65536,0,0]);assert.deepEqual(result.auxiliaryVector,[2048,0,0]);
 second.collisionIds=[3,2,4];
 assert.equal(queryBodyPairContact(first,second,records,contact(),65536,rounding),16384);
});

test('active vehicle state replaces ordinary spheres with the aggregate',()=>{
 const records=[record(5120),record(5632),record(0,0,1024),record(512),record(512)];
 const first=body([0,1,2],2,{flags:3,pairCollisionContext:{stateByte6bc:0}}),second=body([3,4],1),result=contact();
 assert.equal(queryBodyPairContact(first,second,records,result,65536,rounding),65536);
 assert.equal(result.flags,0);
 first.pairCollisionContext.stateByte6bc=1;
 assert.equal(queryBodyPairContact(first,second,records,result,65536,rounding),0);
 assert.equal(result.flags,2);assert.equal(result.scalar,-768);
});

test('pair coarse rejection clears flags while preserving stale payload fields',()=>{
 const first=body([],0),second=body([],0,{position:[129*65536,0,0]}),result=contact();result.flags=3;
 assert.equal(queryBodyPairContact(first,second,[],result,65536,rounding),65536);
 assert.deepEqual(result,{flags:0,point:[7,8,9],normal:[10,11,12],scalar:77,auxiliaryVector:[13,14,15]});
});

test('cache time scaling affects both velocity and extrapolation, but leaves the aggregate unscaled',()=>{
 const records=[record(),record(),record()],first=body([0,1,2],2,{flags:3,position:[10*65536,0,0],linearVelocity:[8*65536,0,0]});
 records[0].writeInt16LE(256,0);records[1].writeInt16LE(-256,0);
 for(const entry of records)entry.writeInt32LE(1234,0x38);
 prepareBodyShapeCache(first,32768,records,{timeScaleActive:true,timeScaleQ16:32768});
 assert.deepEqual(vectorAt(records[0],8),[12*256,0,0]);assert.deepEqual(vectorAt(records[1],8),[10*256,0,0]);
 assert.deepEqual(vectorAt(records[0],0x14),[4*256,0,0]);
 assert.deepEqual(vectorAt(records[2],8),[10*256,0,0]);assert.deepEqual(vectorAt(records[2],0x14),[8*256,0,0]);
 assert.equal(records[0].readInt32LE(0x38),1234);assert.equal(first.collisionCache114,32768);
 prepareBodyShapeCache(first,0,records);
 assert.equal(records[0].readInt32LE(0x38),-1);assert.equal(records[1].readInt32LE(0x38),-1);
 assert.equal(records[2].readInt32LE(0x38),1234);
});

test('a one-shape cache ignores its local center and contact storage copies native units',()=>{
 const records=[record(),record()],first=body([0,1],1,{position:[65536,2*65536,-65536]});
 records[0].writeInt16LE(8192,0);prepareBodyShapeCache(first,0,records);
 assert.deepEqual(vectorAt(records[0],8),[256,512,-256]);
 records[1].writeInt32LE(1234,0x38);
 storeBodyShapeContact(first,{point:[1,-2,3],normal:[65536,0,-65536],scalar:-17},records);
 assert.deepEqual(vectorAt(records[1],0x20),[1,-2,3]);assert.deepEqual(vectorAt(records[1],0x2c),[65536,0,-65536]);
 assert.equal(records[1].readInt32LE(0x3c),-17);assert.equal(records[1].readInt32LE(0x38),1234);
});

test('registration consumes explicit free IDs and preserves aggregate time and scalar bytes',()=>{
 const records=Buffer.alloc(3*72,0x5a),pool=new BodyShapePool(records,[2,0,1]),descriptors=Buffer.alloc(20),physicalBodies=[];
 descriptors.writeInt32LE(0x12340100,0);descriptors.writeInt32LE(512,12);descriptors.writeUInt16LE(0x1234,16);
 const first=body([9,9,9],0,{flags:0x8003}),aggregate=registerBodyCollisionShapes(first,descriptors,pool,physicalBodies),shape=records.subarray(72,144);
 assert.deepEqual(first.collisionIds,[1,0,9]);assert.equal(first.flags,3);assert.equal(first.collisionCount10c,1);
 assert.equal(shape.readInt16LE(0),256);assert.equal(shape.readInt32LE(0x38),-1);assert.equal(shape.readUInt16LE(0x44),0x1234);
 assert.equal(shape.readInt32LE(0x3c),0x5a5a5a5a);assert.deepEqual([...shape.subarray(0x20,0x38)],Array(24).fill(0));
 assert.equal(aggregate.readInt32LE(0x40),768);assert.equal(aggregate.readInt32LE(0x38),0x5a5a5a5a);assert.equal(aggregate.readInt32LE(0x3c),0x5a5a5a5a);
 assert.deepEqual([...pool.activeIds.subarray(0,2)],[1,0]);assert.equal(pool.reverseIndices[1],0);assert.equal(pool.reverseIndices[0],1);
 assert.deepEqual(physicalBodies,[first]);assert.equal(first.collisionGroup130,0);
});

test('zero-shape registration retains its flag and type 17 forces the aggregate radius',()=>{
 const pool=new BodyShapePool(Buffer.alloc(3*72),[0,1,2]),physicalBodies=[],empty=body([99],0,{flags:0x8001});
 assert.equal(registerBodyCollisionShapes(empty,Buffer.alloc(0),pool,physicalBodies),null);
 assert.equal(empty.flags,0x8001);assert.equal(pool.allocatedCount,0);assert.deepEqual(empty.collisionIds,[99]);
 const descriptor=Buffer.alloc(20);descriptor.writeInt32LE(256,12);
 const aggregate=registerBodyCollisionShapes(body([],0,{flags:17}),descriptor,pool,physicalBodies);
 assert.equal(aggregate.readInt32LE(0x40),0x5000);
});

test('native cache, pair query and builder compute and enqueue a future contact',()=>{
 const records=[record(),record(),record(),record()],first=body([0,1],1),second=body([2,3],1,{position:[4*65536,0,0],linearVelocity:[-8*65536,0,0],collisionFlags:0x80000000}),queue=new CollisionEventQueue(2);
 assert.equal(buildBodyPairEvents({bodies:[first,second]},null,{records,queue,queryOptions:rounding}),1);
 assert.equal(queue.count,1);const key=queue.pop(),event=queue.events[key>>>20];
 assert.deepEqual(decodeCollisionEventKey(key),{slot:1,timeQ16:16384,terrain:false});
 assert.equal(event.object1,first);assert.equal(event.object2,second);assert.equal(event.classFlags,1);assert.equal(event.field44,-3);
 assert.deepEqual(event.point,[256,0,0]);assert.deepEqual(event.normal,[65536,0,0]);assert.deepEqual(event.auxiliaryVector,[8*65536,0,0]);
 assert.equal(second.collisionFlags,0);assert.equal(first.collisionCache114,0);assert.equal(second.collisionCache114,0);
});

test('builder applies directional ownership exclusions in both directions',()=>{
 const first=body([0,1],1,{flags:3}),owned=body([2,3],1,{flags:22,pointer194:first,pointer198:null});
 assert.equal(isBodyPairExcluded(first,owned),false);assert.equal(isBodyPairExcluded(owned,first),true);
 let queries=0;
 assert.equal(buildBodyPairEvents({bodies:[first,owned]},null,{prepare:()=>{},query:()=>{queries++;return 0;}}),0);
 assert.equal(queries,0);
});
