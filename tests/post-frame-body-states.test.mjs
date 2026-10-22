import test from 'node:test';
import assert from 'node:assert/strict';
import {runPostFrameBodyStates} from '../src/post-frame-body-states.mjs';

const point=(x,y=0,z=0)=>({position:[x,y,z]});
const body=(type=11,x=1)=>({flags:type,position:[x*65536,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096],collisionState128:32,field160:7});
function setup(bodies,points=[point(0),point(10),point(10,0,10)]){
 const group={bodies,count:bodies.length},route={count:points.length,reverseByte2:0,points},routes={countByte46:2,groups:[{count:1,points:[point(1)]},route]},routeState={currentPoint:null},slots36=new Uint8Array(36).fill(1),calls=[];
 const handlers={prepass:()=>{},query:(target,request)=>{request.queryValue.value=77;return 1;},apply:(target,request)=>{calls.push({target,...request,position:request.position.slice(),quaternion:request.quaternion.slice(),rotation:request.rotation.slice()});return{registerEcx:123};},vehicleTail:()=>({registerEcx:456}),emit:()=>{}};
 return {group,route,routes,routeState,slots36,handlers,calls,run:()=>runPostFrameBodyStates(group,{routes,routeState,slots36,handlers})};
}

test('route selection skips the header and the current point by pointer identity',()=>{
 const target=body(),fixture=setup([target]);fixture.routeState.currentPoint=fixture.route.points[0];fixture.run();
 assert.equal(fixture.calls[0].route,fixture.route);assert.equal(fixture.calls[0].index,1);assert.equal(fixture.routeState.currentPoint,fixture.route.points[1]);assert.deepEqual(fixture.calls[0].position,[10*65536,0,0]);
});

test('void placement result reaches actual sound defaults without inventing an unused register',()=>{
 const target=body(),f=setup([target]),memory=Buffer.alloc(0xa00000);f.handlers.apply=()=>{};delete f.handlers.emit;
 const result=runPostFrameBodyStates(f.group,{routes:f.routes,routeState:f.routeState,slots36:f.slots36,handlers:f.handlers,memory,scratchBase:0x9000});
 assert.equal(result.respawnedBodies,1);
});

test('nearest and second-nearest scratch persist between rejected bodies',()=>{
 const first=body(11,0),second=body(11,10),fixture=setup([first,second]);fixture.run();
 assert.equal(fixture.calls.length,2);assert.equal(fixture.calls[0].index,0);
 //A second nearest search would choose index1. Native retains the first zero
 //distance and keeps index0 even though it is now the excluded current point.
 assert.equal(fixture.calls[1].index,0);assert.deepEqual(fixture.calls[1].position,[0,0,0]);
});

test('failed placement swaps position but retains query mutations and first orientation',()=>{
 const target=body(),fixture=setup([target]);let queryQuaternion,queryDirection;
 fixture.handlers.query=(input,request)=>{assert.equal(input,target);assert.equal(request.rotation,target.rotation);queryQuaternion=request.quaternion.slice();queryDirection=fixture.routeState.direction.slice();request.quaternion[0]=12345;request.rotation[0]=321;request.position[0]=99;request.queryValue.value=-123;return 0;};
 fixture.run();const applied=fixture.calls[0];
 assert.equal(applied.index,1);assert.equal(fixture.routeState.currentPoint,fixture.route.points[1]);assert.deepEqual(applied.position,[10*65536,0,0]);assert.deepEqual(fixture.routeState.direction,queryDirection);assert.deepEqual(queryDirection,[65535,0,0]);assert.deepEqual(applied.quaternion,[12345,...queryQuaternion.slice(1)]);assert.equal(applied.rotation[0],321);assert.equal(applied.queryValue,-123);
});

test('type4 marks its controller and stops the entire captured body traversal',()=>{
 const first=body(4),later=body(),owner={flags:0x1000};first.controller164={body:owner,timer3a:9,flags39:3};const fixture=setup([first,later]);
 assert.deepEqual(fixture.run(),{visitedBodies:1,respawnedBodies:0,retiredBodies:0,stoppedByType4:true});assert.equal(first.controller164.timer3a,20);assert.equal(first.controller164.flags39,0x83);assert.equal(owner.flags,0x1200);assert.equal(fixture.calls.length,0);
});

test('retirement compacts the captured array, holds the cursor and decrements remaining twice',()=>{
 const first=body(7),next=body(),third=body(),last=body(),replacementOwner=body();first.controller164={body:first,active4:1,index5:8};const fixture=setup([first,next,third,last]),order=[];
 fixture.handlers.unregister=target=>{order.push(['unregister',target]);fixture.group.bodies.splice(0,1);fixture.group.count--;first.controller164.body=replacementOwner;};fixture.handlers.removeSpatial=target=>order.push(['spatial',target]);
 assert.deepEqual(fixture.run(),{visitedBodies:3,respawnedBodies:2,retiredBodies:1,stoppedByType4:false});assert.deepEqual(order,[['unregister',first],['spatial',replacementOwner]]);assert.deepEqual(fixture.calls.map(call=>call.target),[next,third]);assert.equal(first.controller164.active4,0);assert.equal(replacementOwner.field160,0);assert.equal(first.field160,7);assert.equal(fixture.slots36[8],0);
});

test('prepass changes are captured while later global list replacement is ignored',()=>{
 const first=body(),second=body(),unused=body(),fixture=setup([unused]),captured=[first,second];
 fixture.handlers.prepass=()=>{fixture.group.bodies=captured;fixture.group.count=2;};fixture.handlers.query=(target,request)=>{fixture.group.bodies=[unused];fixture.group.count=1;request.queryValue.value=1;return 1;};
 assert.equal(fixture.run().visitedBodies,2);assert.deepEqual(fixture.calls.map(call=>call.target),[first,second]);
});

test('live type after apply controls vehicle tail and the emitter preserves leaked ECX',()=>{
 const target=body(),fixture=setup([target]),events=[];
 fixture.handlers.apply=(input,request)=>{input.flags=3;return{registerEcx:123};};fixture.handlers.vehicleTail=(input,mode)=>{events.push(['tail',input,mode]);return{registerEcx:-11};};fixture.handlers.emit=value=>events.push(['emit',value]);fixture.run();
 assert.deepEqual(events,[['tail',target,0],['emit',{code:43,registerEdx:0,args:[0,-1,9000,6,-11,0,0]}]]);
});

test('signed wrapped distance can beat an ordinary nearer point',()=>{
 const target=body(11,-32768),fixture=setup([target],[point(-32768),point(32767),point(32766)]);fixture.run();
 //65535 squared wraps negative. Strict signed comparisons select the wrapped
 //negative candidate despite the exact zero-distance point visited earlier.
 assert.equal(fixture.calls[0].index,2);
});

test('reverse byte flips normalized route direction and retirement checks slot after callbacks',()=>{
 const fixture=setup([body()]);fixture.route.reverseByte2=1;fixture.run();assert.deepEqual(fixture.routeState.direction,[-65536,0,0]);
 const target=body(21),retirement=setup([target]);target.controller164={body:target,active4:1,index5:0};retirement.handlers.unregister=()=>{};retirement.handlers.removeSpatial=()=>{target.controller164.index5=36;};assert.throws(()=>retirement.run(),RangeError);assert.equal(target.controller164.active4,1);
});
