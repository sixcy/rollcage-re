import test from 'node:test';
import assert from 'node:assert/strict';
import {runPhysicsFrame} from '../src/physics-frame.mjs';
import {CollisionEventQueue,insertCollisionEvent} from '../src/collision-events.mjs';

const names=['begin','prepareOrdinary','stepScripted','externalWorld','collectCandidates','updateGroups','updateVehicles','buildInitialEvents','respond','refresh','finish'];
const stages=(overrides={})=>({queue:new CollisionEventQueue(8),effectFlags:{first:1,second:2},...Object.fromEntries(names.map(name=>[name,()=>{}])),...overrides});
const body=(extra={})=>({flags:3,frameTimeQ16:0,collisionFlags:0,...extra});
const emit=(queue,object1,time,object2=null,tag=0)=>insertCollisionEvent(queue,{object1,object2,contact:{point:[0,0,0],normal:[0,65536,0],scalar:0,field38:0},flags:{value:1},tag,deltaQ16:time-object1.frameTimeQ16});

test('a full frame preserves native stage order and resets the queue immediately before initial events',()=>{
 const log=[],environment=stages();environment.queue.push(123,false);environment.queue.events[0].sentinel='retained';
 for(const name of names)environment[name]=()=>log.push([name,environment.queue.count]);
 const result=runPhysicsFrame({bodies:[],count:0},environment);
 assert.deepEqual(log,[['begin',1],['externalWorld',1],['collectCandidates',1],['updateGroups',1],['updateVehicles',1],['buildInitialEvents',0],['finish',0]]);
 assert.deepEqual(result,{nativeReturn:0,preparedBodies:0,scriptedBodies:0,ordinaryBodies:0,processedEvents:0});
 assert.equal(environment.queue.events[0].sentinel,'retained');
});

test('preparation captures count and array after begin while reading subsequent entries and flags live',()=>{
 const first=body(),unused=body(),replacement=body(),ignored=body(),list=[first,unused],group={bodies:[],count:0},log=[];
 const environment=stages({begin:()=>{group.bodies=list;group.count=2;},prepareOrdinary:(target,index)=>{
  log.push(['ordinary',target,index]);list[1]=replacement;replacement.flags|=0x2000;group.bodies=[ignored];group.count=0;
 },stepScripted:(target,index)=>log.push(['scripted',target,index])});
 const result=runPhysicsFrame(group,environment);
 assert.deepEqual(log,[['ordinary',first,0],['scripted',replacement,1]]);
 assert.equal(result.preparedBodies,2);assert.equal(result.ordinaryBodies,1);assert.equal(result.scriptedBodies,1);
});

test('both effect flags remain visible through the world stage and are cleared before candidates',()=>{
 const effects={first:1,second:1},log=[],observe=name=>log.push([name,effects.first,effects.second]);
 runPhysicsFrame({bodies:[body(),body({flags:0x2003})]},stages({effectFlags:effects,
  begin:()=>observe('begin'),prepareOrdinary:()=>observe('ordinary'),stepScripted:()=>observe('scripted'),
  externalWorld:()=>{observe('world');effects.first=7;effects.second=8;},collectCandidates:()=>observe('candidates'),updateGroups:()=>observe('groups')}));
 assert.deepEqual(log,[['begin',1,1],['ordinary',1,1],['scripted',1,1],['world',1,1],['candidates',0,0],['groups',0,0]]);
 assert.deepEqual(effects,{first:0,second:0});
});

test('the connected event loop releases slots, invalidates other contacts and calls finish once',()=>{
 const target=body(),queue=new CollisionEventQueue(4),log=[];
 const result=runPhysicsFrame({bodies:[target]},stages({queue,buildInitialEvents:()=>{emit(queue,target,100,null,1);emit(queue,target,500,null,2);},
  respond:(event,delta,current)=>{assert.equal(current,queue);log.push(['respond',event.tag,delta,queue.count,queue.freeTop]);target.frameTimeQ16+=delta;},
  refresh:(first,second,current)=>{assert.equal(first,target);assert.equal(second,null);assert.equal(current,queue);log.push(['refresh',queue.count]);},
  finish:()=>log.push(['finish',queue.count])}));
 assert.equal(result.processedEvents,1);assert.equal(target.frameTimeQ16,100);
 assert.deepEqual(log,[['respond',1,100,1,2],['refresh',0],['finish',0]]);
});

test('a negative contact delta processes once and leaves unrelated queued work for finish',()=>{
 const first=body({frameTimeQ16:50000}),second=body(),queue=new CollisionEventQueue(4),log=[];
 const result=runPhysicsFrame({bodies:[]},stages({queue,buildInitialEvents:()=>{emit(queue,first,100);emit(queue,second,200);},
  respond:(event,delta)=>{log.push(['respond',delta]);event.object1=null;},refresh:()=>log.push(['unexpected refresh']),finish:()=>log.push(['finish',queue.count])}));
 assert.equal(result.processedEvents,1);assert.deepEqual(log,[['respond',-49900],['finish',1]]);
});

test('required stages fail before beginning and physical count validation follows begin',()=>{
 let began=0;const environment=stages({begin:()=>began++});delete environment.updateGroups;
 assert.throws(()=>runPhysicsFrame({bodies:[]},environment),/stage updateGroups is required/);assert.equal(began,0);
 assert.throws(()=>runPhysicsFrame({bodies:[],count:1},stages({begin:()=>began++})),/unsigned-word physical body count/);assert.equal(began,1);
});
