import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {runPostFrameBodyStates} from '../src/post-frame-body-states.mjs';

const own=await readInstructionEvidence(['098-post-frame-body-states-assembly.json','088-scripted-release-quaternion-assembly.json'],{directory:'analysis/native-simulation/results'}),math=await readInstructionEvidence(['244-wheel-direction-normalize-assembly.json','152-vector-length-assembly.json','217-wheel-capacity-curve-assembly.json','221-fixed-sqrt-assembly.json']);
const evidence=[...own.evidence,...math.evidence],instructions=[...own.instructions,...math.instructions],machine=new BoundedX86(instructions);
const LIST=0x50000,OTHER=0x50100,RESOURCE=0x61000,ROUTES=0x60000,POINTS=0x62000;
const put=(bytes,p,vector)=>vector.forEach((value,index)=>bytes.writeInt32LE(value|0,p+index*4)),get=(bytes,p,n=3)=>Array.from({length:n},(_,index)=>bytes.readInt32LE(p+index*4));
let seed=0x47ccc0ab,instructionSteps=0,respawns=0,retirements=0,earlyStops=0,failedQueries=0,prepassReplacements=0,groupMutations=0,controllerRelinks=0,overflowDistances=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0xffffffff)|0;
const fixtures=2400;
for(let fixture=0;fixture<fixtures;fixture++){
 machine.reset();const bytes=machine.bytes;
 const bodies=Array.from({length:7},(_,index)=>({address:0x10000+index*0x4000,flags:[3,4,7,21,33,11][random(6)]|(random(2)?0x1000:0),position:Array.from({length:3},()=>fixture%17===0?signed():(random(1200)-600)*65536+random(65536)),rotation:Array.from({length:9},()=>random(65536)-32768),collisionState128:random(4)?32:random(32),field160:random(65536)}));
 const controllers=bodies.map((body,index)=>({address:0x40000+index*0x100,body,active4:random(256),index5:random(36),flags39:random(256),timer3a:random(256)}));bodies.forEach((body,index)=>body.controller164=controllers[index]);
 const routes={countByte46:4,groups:Array.from({length:4},(_,group)=>({address:ROUTES+group*12,count:6,reverseByte2:random(256),points:Array.from({length:6},(_,index)=>({address:POINTS+group*0x100+index*16,position:Array.from({length:3},()=>fixture%17===0?random(65536)-32768:random(1200)-600)}))}))};
 //Distinct points, nonzero neighbor length and >=2 available points keep this
 //check in native-readable memory and avoid its division-by-zero fault domain.
 const routeState={currentPoint:fixture%3?null:routes.groups[1+random(3)].points[random(6)],position:[signed(),signed(),signed()],direction:[signed(),signed(),signed()]},slots36=Uint8Array.from({length:36},()=>random(256)),mathScratch={sum91d45c:signed(),leadingZeros91d460:signed()};
 const group={bodies:bodies.slice(),count:fixture%8},other=bodies.slice().reverse(),beginCount=(fixture+3)%8,replaceArray=fixture%4===0,captured=replaceArray?other:group.bodies,capturedAddress=replaceArray?OTHER:LIST,expected=[],actual=[];
 const pointer=object=>object?.address??0;
 function encodeBody(target,p,body){target.writeInt32LE(body.flags,p);put(target,p+0x34,body.position);body.rotation.forEach((value,index)=>target.writeInt16LE(value,p+0xc4+index*2));target.writeInt32LE(body.collisionState128,p+0x128);target.writeUInt16LE(body.field160,p+0x160);target.writeUInt32LE(pointer(body.controller164),p+0x164);}
 function encodeController(target,p,controller){target.writeUInt32LE(pointer(controller.body),p);target[p+4]=controller.active4;target[p+5]=controller.index5;target[p+0x39]=controller.flags39;target[p+0x3a]=controller.timer3a;}
 bodies.forEach(body=>{bytes.fill(0xa5,body.address,body.address+0x4000);encodeBody(bytes,body.address,body);});controllers.forEach(controller=>{bytes.fill(0xa5,controller.address,controller.address+0x100);encodeController(bytes,controller.address,controller);});
 const bodyBytes=bodies.map(body=>Buffer.from(bytes.subarray(body.address,body.address+0x4000))),controllerBytes=controllers.map(controller=>Buffer.from(bytes.subarray(controller.address,controller.address+0x100)));
 bytes.fill(0xa5,LIST,LIST+0x200);group.bodies.forEach((body,index)=>bytes.writeUInt32LE(body.address,LIST+index*4));other.forEach((body,index)=>bytes.writeUInt32LE(body.address,OTHER+index*4));const listBytes=Buffer.from(bytes.subarray(LIST,LIST+0x200));
 bytes.fill(0xa5,ROUTES,ROUTES+0x100);bytes.fill(0xa5,POINTS,POINTS+0x400);for(const route of routes.groups){bytes.writeUInt16LE(route.count,route.address);bytes[route.address+2]=route.reverseByte2;bytes.writeUInt32LE(route.points[0].address,route.address+8);for(const point of route.points)point.position.forEach((value,index)=>bytes.writeInt16LE(value,point.address+index*2));}
 const routeBytes=Buffer.from(bytes.subarray(ROUTES,ROUTES+0x100)),pointBytes=Buffer.from(bytes.subarray(POINTS,POINTS+0x400));
 bytes.writeUInt32LE(LIST,0x902bc0);bytes.writeUInt16LE(group.count,0x902bc4);bytes.writeUInt32LE(RESOURCE,0x90b98c);bytes[RESOURCE+0x46]=routes.countByte46;bytes.writeUInt32LE(ROUTES,RESOURCE+0x60);bytes.writeUInt32LE(pointer(routeState.currentPoint),0x70eb18);put(bytes,0x70eb0c,routeState.position);put(bytes,0x70eb1c,routeState.direction);slots36.forEach((value,index)=>bytes[0x849940+index]=value);bytes.writeInt32LE(mathScratch.sum91d45c,0x91d45c);bytes.writeInt32LE(mathScratch.leadingZeros91d460,0x91d460);
 let sourceQuery=0,nativeQuery=0,sourceRemovals=0,nativeRemovals=0;
 const sourceSnapshot=()=>bodies.map((body,index)=>{const output=Buffer.from(bodyBytes[index]);encodeBody(output,0,body);return output;});
 const nativeSnapshot=()=>bodies.map(body=>Buffer.from(bytes.subarray(body.address,body.address+0x4000)));
 const callbackPosition=index=>[(fixture*17+index)|0,(-fixture*19-index)|0,(fixture*23+index)|0];
 const queryValue=index=>((fixture*31)^index^0x334455)|0;
 const applyEcx=index=>(0xf0000000|fixture<<8|index)|0,tailEcx=index=>(0xe0000000|fixture<<8|index)|0;
 const removeSource=(body,name)=>{
  expected.push([name,body.address]);const index=captured.indexOf(body);if(index>=0){captured.splice(index,1);captured.push(bodies[6]);group.count=Math.max(0,group.count-1);}sourceRemovals++;
  if(name==='unregister'&&fixture%3===0){const controller=controllers.find(value=>value.body===body);if(controller)controller.body=bodies[6];}
 };
 const removeNative=(body,name)=>{
  actual.push([name,body]);const count=7,index=Array.from({length:count},(_,i)=>bytes.readUInt32LE(capturedAddress+i*4)).indexOf(body);if(index>=0){for(let i=index;i<count-1;i++)bytes.writeUInt32LE(bytes.readUInt32LE(capturedAddress+(i+1)*4),capturedAddress+i*4);bytes.writeUInt32LE(bodies[6].address,capturedAddress+(count-1)*4);bytes.writeUInt16LE(Math.max(0,bytes.readUInt16LE(0x902bc4)-1),0x902bc4);}nativeRemovals++;
  if(name==='unregister'&&fixture%3===0){const controller=controllers.find(value=>bytes.readUInt32LE(value.address)===body);if(controller)bytes.writeUInt32LE(bodies[6].address,controller.address);}
 };
 machine.externalCalls.set(0x47e180,()=>{actual.push(['prepass']);bytes.writeUInt16LE(beginCount,0x902bc4);if(replaceArray)bytes.writeUInt32LE(OTHER,0x902bc0);});
 machine.externalCalls.set(0x4284d0,m=>removeNative(m.r.ECX,'unregister'));
 machine.externalCalls.set(0x474850,m=>{actual.push(['removeSpatial',m.r.ECX]);bytes.writeInt32LE(bytes.readInt32LE(m.r.ECX+0x128)^1,m.r.ECX+0x128);});
 machine.externalCalls.set(0x46a2d0,m=>removeNative(m.r.ECX,'retire33'));
 machine.externalCalls.set(0x47d040,m=>{
  const index=nativeQuery++,p=m.r.ECX,q=bytes.readUInt32LE(m.r.ESP),rotation=bytes.readUInt32LE(m.r.ESP+4),mode=bytes.readInt32LE(m.r.ESP+8),output=bytes.readUInt32LE(m.r.ESP+12);
  actual.push(['query',p,get(bytes,m.r.EDX),get(bytes,q,4),Array.from({length:9},(_,axis)=>bytes.readInt16LE(rotation+axis*2)),mode,bytes.readUInt32LE(0x70eb18),get(bytes,0x70eb1c),nativeSnapshot()]);
  assert.equal(rotation,p+0xc4);put(bytes,m.r.EDX,callbackPosition(index));bytes.writeInt32LE(bytes.readInt32LE(q)^0x123456,q);bytes.writeInt16LE(123+index,rotation);bytes.writeInt32LE(queryValue(index),output);
  if(index===0&&fixture%5===0&&beginCount>1){bytes.writeUInt32LE(bodies[5].address,capturedAddress+4);bytes.writeUInt16LE(1,0x902bc4);bytes.writeUInt32LE(capturedAddress===LIST?OTHER:LIST,0x902bc0);}
  m.r.EAX=(fixture+index)%3===0?0:1;
 });
 machine.externalCalls.set(0x47d440,m=>{
  const index=nativeQuery-1,p=m.r.ECX,q=bytes.readUInt32LE(m.r.ESP),rotation=bytes.readUInt32LE(m.r.ESP+4),route=bytes.readUInt32LE(m.r.ESP+8),routeIndex=bytes.readInt32LE(m.r.ESP+12),value=bytes.readInt32LE(m.r.ESP+16);
  actual.push(['apply',p,get(bytes,m.r.EDX),get(bytes,q,4),Array.from({length:9},(_,axis)=>bytes.readInt16LE(rotation+axis*2)),route,routeIndex,value,bytes.readUInt32LE(0x70eb18),get(bytes,0x70eb1c),nativeSnapshot()]);
  put(bytes,p+0x34,get(bytes,m.r.EDX));bytes.writeInt32LE(0,p+0x128);bytes.writeInt32LE((bytes.readInt32LE(p)&~0x1ff)|((fixture+index)%2?3:11),p);m.r.ECX=applyEcx(index);
 });
 machine.externalCalls.set(0x47d900,m=>{const index=nativeQuery-1;actual.push(['vehicleTail',m.r.ECX,m.r.EDX]);bytes.writeUInt16LE((bytes.readUInt16LE(m.r.ECX+0x160)+1)&65535,m.r.ECX+0x160);m.r.ECX=tailEcx(index);});
 machine.externalCalls.set(0x484bb0,m=>actual.push(['emit',m.r.ECX,m.r.EDX,get(bytes,m.r.ESP,7)]));
 machine.externalCalls.set(0x568162,()=>{});
 const result=runPostFrameBodyStates(group,{routes,routeState,slots36,mathScratch,handlers:{
  prepass:()=>{expected.push(['prepass']);group.count=beginCount;if(replaceArray)group.bodies=other;},
  unregister:body=>removeSource(body,'unregister'),removeSpatial:body=>{expected.push(['removeSpatial',body.address]);body.collisionState128^=1;},retireType33:body=>removeSource(body,'retire33'),
  query:(body,request)=>{const index=sourceQuery++;expected.push(['query',body.address,request.position.slice(),request.quaternion.slice(),request.rotation.slice(),request.mode,pointer(routeState.currentPoint),routeState.direction.slice(),sourceSnapshot()]);assert.equal(request.rotation,body.rotation);request.position.splice(0,3,...callbackPosition(index));request.quaternion[0]^=0x123456;request.rotation[0]=123+index;request.queryValue.value=queryValue(index);if(index===0&&fixture%5===0&&beginCount>1){captured[1]=bodies[5];group.count=1;group.bodies=captured===other?bodies.slice():other;groupMutations++;}if((fixture+index)%3===0)failedQueries++;return(fixture+index)%3===0?0:1;},
  apply:(body,request)=>{const index=sourceQuery-1;expected.push(['apply',body.address,request.position.slice(),request.quaternion.slice(),request.rotation.slice(),pointer(request.route),request.index,request.queryValue,pointer(routeState.currentPoint),routeState.direction.slice(),sourceSnapshot()]);body.position=request.position.slice();body.collisionState128=0;body.flags=(body.flags&~0x1ff)|((fixture+index)%2?3:11);return{registerEcx:applyEcx(index)};},
  vehicleTail:(body,value)=>{const index=sourceQuery-1;expected.push(['vehicleTail',body.address,value]);body.field160=(body.field160+1)&65535;return{registerEcx:tailEcx(index)};},emit:request=>expected.push(['emit',request.code,request.registerEdx,request.args])
 }});
 machine.entry=0x47ccc0;machine.r.ESP=0x9000;bytes.writeUInt32LE(0xffffffff,0x9000);instructionSteps+=machine.run();
 assert.deepEqual(actual,expected,`boundary arguments, mutation and order ${fixture}`);
 bodies.forEach((body,index)=>{const target=Buffer.from(bodyBytes[index]);encodeBody(target,0,body);assert.deepEqual(bytes.subarray(body.address,body.address+0x4000),target,`all body bytes ${fixture}:${index}`);});
 controllers.forEach((controller,index)=>{const target=Buffer.from(controllerBytes[index]);encodeController(target,0,controller);assert.deepEqual(bytes.subarray(controller.address,controller.address+0x100),target,`all controller bytes ${fixture}:${index}`);if(controller.body!==bodies[index])controllerRelinks++;});
 captured.forEach((body,index)=>listBytes.writeUInt32LE(body.address,capturedAddress-LIST+index*4));assert.deepEqual(bytes.subarray(LIST,LIST+0x200),listBytes,`captured array ${fixture}`);
 assert.equal(bytes.readUInt16LE(0x902bc4),group.count);assert.equal(bytes.readUInt32LE(0x902bc0),group.bodies===other?OTHER:LIST);assert.equal(bytes.readUInt32LE(0x70eb18),pointer(routeState.currentPoint));assert.deepEqual(get(bytes,0x70eb0c),routeState.position);assert.deepEqual(get(bytes,0x70eb1c),routeState.direction);assert.equal(bytes.readInt32LE(0x91d45c),mathScratch.sum91d45c);assert.equal(bytes.readInt32LE(0x91d460),mathScratch.leadingZeros91d460);assert.deepEqual(bytes.subarray(0x849940,0x849940+36),Buffer.from(slots36));assert.deepEqual(bytes.subarray(ROUTES,ROUTES+0x100),routeBytes);assert.deepEqual(bytes.subarray(POINTS,POINTS+0x400),pointBytes);
 assert.equal(sourceRemovals,nativeRemovals);respawns+=result.respawnedBodies;retirements+=result.retiredBodies;if(result.stoppedByType4)earlyStops++;if(replaceArray)prepassReplacements++;if(fixture%17===0)overflowDistances++;
}
const report={method:'Complete retained47ccc0 outer postphysics state32 traversal and41e3f0 quaternion construction with actual fixed math.47e180/4284d0/474850/46a2d0/47d040/47d440/47d900/484bb0 are explicit state-mutating boundary mocks. Compares all16384 bytes of7bodies, all256 bytes of7controllers, complete captured body arrays, slot table, route records, point records, mutable route/root globals and every boundary argument/order. Exercises captured/replaced arrays/counts, live compaction/controller relinking, native double remaining decrement, type4 whole-loop stop, cross-body closest/second scratch, signed distance overflow, excluded previous route point, reverse routes, fallback retaining first orientation and leaked ECX emitter argument. Native malformed/empty route memory and zero direction division-fault domains are outside fixtures. No original process execution.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,fixtures,respawns,retirements,earlyStops,failedQueries,prepassReplacements,groupMutations,controllerRelinks,overflowDistanceFixtures:overflowDistances,instructionSteps,matched:true};
await writeFile('analysis/post-frame-body-states-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
