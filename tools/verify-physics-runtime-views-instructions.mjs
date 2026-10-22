import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createRespawnRuntime} from '../src/respawn-runtime.mjs';
import {createPhysicsRuntimeViews} from '../src/physics-runtime-views.mjs';
import {beginPhysicsFrame} from '../src/physics-frame-state.mjs';
import {prepareOrdinaryBody} from '../src/body-preparation.mjs';
import {buildBodyCandidateGroups} from '../src/body-candidate-groups.mjs';
import {prepareBodyShapeCache,storeBodyShapeContact} from '../src/body-shape-cache.mjs';
import {insertCollisionEvent} from '../src/collision-events.mjs';
import {dispatchCollisionResponse} from '../src/collision-dispatch.mjs';
import {unregisterPhysicalBody} from '../src/body-retirement.mjs';
const nativeFiles=['005-shape-registration-assembly.json','009-body-groups-assembly.json','050-ordinary-preparation-assembly.json','055-environment-response-assembly.json','056-contact-friction-assembly.json','059-contact-linear-input-assembly.json','060-contact-friction-scale-assembly.json','061-contact-friction-large-scale-assembly.json','063-special-vehicle-force-assembly.json','064-apply-body-forces-assembly.json','644-physical-unregister-assembly.json'];
const directory='analysis/native-simulation/results';
const sceneFiles=['329-physics-frame-start-assembly.json','292-event-heap-build-assembly.json','286-event-heap-sift-assembly.json','293-event-heap-invalidate-assembly.json','297-event-heap-insert-assembly.json','299-event-heap-push-assembly.json','400-body-shape-cache-assembly.json','402-body-shape-cache-entry-assembly.json','404-body-shape-contact-store-assembly.json','406-body-cache-rotation-assembly.json','275-physics-event-loop-assembly.json','320-pair-contact-response-assembly.json','321-pair-velocity-exchange-assembly.json','322-contact-velocity-split-assembly.json','323-penetration-correction-vector-assembly.json','324-body-position-correction-assembly.json','350-sliding-linear-replace-assembly.json','348-kind8-threshold-assembly.json','349-kind8-update-assembly.json','351-sliding-slow-body-assembly.json','312-static-contact-impulse-assembly.json','313-contact-point-velocity-assembly.json','314-contact-vector-scale-assembly.json','315-contact-inertia-transform-assembly.json','316-contact-quaternion-product-assembly.json','256-wheel-cross-assembly.json','220-wheel-drive-dot-assembly.json','217-wheel-capacity-curve-assembly.json','317-contact-relative-point-assembly.json','318-contact-advect-assembly.json','284-body-event-advance-assembly.json','135-body-advance-assembly.json','128-normalize-small-assembly.json','129-normalize-large-assembly.json','300-quaternion-matrix-assembly.json','133-sqrt-lookup-assembly.json','211-sqrt-leading-zeros-assembly.json','111-body-velocity-assembly.json','152-vector-length-assembly.json','221-fixed-sqrt-assembly.json'];
const [a,b]=await Promise.all([readInstructionEvidence(nativeFiles,{directory}),readInstructionEvidence(sceneFiles)]),evidence=[...a.evidence,...b.evidence],instructions=[...new Map([...a.instructions,...b.instructions].map(value=>[value.address,value])).values()];
const machine=new BoundedX86(instructions,{externalCalls:new Map([[0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890))]])}),memory=Buffer.alloc(0xa00000),sqrt=JSON.parse(await readFile('src/sqrt-table.json','utf8'));
const tableReply=JSON.parse(await readFile('analysis/scene/results/340-dispatch-tables.json','utf8')),table=tableReply.structuredContent??JSON.parse(tableReply.content.find(value=>value.type==='text').text);
const BODIES=[0x10000,0x15000],DESCRIPTORS=0x30000,SHAPES=0x40000,SHAPEFREE=0x45000,SHAPEACTIVE=0x45100,REVERSE=0x45200,LIST=0x46000,GROUPLISTS=0x47000,BUCKET=0x49000,EVENTS=0x50000,HEAP=0x52000,FREE=0x53000,CONTACT=0x54000,FLAGS=0x54100,SESSION=0x55000,STACK=0x9000;
const respawn=createRespawnRuntime({memory,recordCount:2,bodyStorage:BODIES.map(address=>({address,length:0x4000})),scratchBase:STACK});
const views=createPhysicsRuntimeViews({memory,bodyAt:respawn.bodyAt,bodyLists:[{address:LIST,capacity:16},...Array.from({length:65},(_,i)=>({address:GROUPLISTS+i*132,capacity:33}))],shapeCapacity:64});
const put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p),vector=(p,v)=>v.forEach((x,i)=>put(p+i*4,x));
let seed=0x4749e0ab,steps=0,checks=0,registrations=0,consumedContacts=0,events=0,retirements=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;};
function execute(entry,ecx=0,edx=0,args=[]){machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=STACK;machine.bytes.writeUInt32LE(0xffffffff,STACK);args.forEach((value,i)=>machine.bytes.writeInt32LE(value|0,STACK+4+i*4));steps+=machine.run();checks++;}
function compare(fixture,phase){for(const[p,n]of[[BODIES[0],0x4000],[BODIES[1],0x4000],[SHAPES,64*72],[SHAPEFREE,768],[LIST,64],[GROUPLISTS,65*132],[0x902bc0,0x330],[0x91e780,32],[EVENTS,8*104],[HEAP,36],[FREE,32],[0x902ba0,24],[CONTACT,72],[FLAGS,4]]){const a=memory.subarray(p,p+n),b=machine.bytes.subarray(p,p+n);if(!a.equals(b)){const i=a.findIndex((value,i)=>value!==b[i]);assert.fail(`${phase} fixture${fixture} at0x${(p+i).toString(16)} native=${b[i]} JS=${a[i]}`);}}}
const fixtures=800;
for(let fixture=0;fixture<fixtures;fixture++){
 memory.fill(0);sqrt.values.forEach((value,i)=>word(0x5eb290+i*2,value));Buffer.from(table.normalized_result.bytes_hex,'hex').copy(memory,Number(table.normalized_result.address));memory.writeFloatLE(1/4096,0x5dc5f4);put(0x5e8890,0x36d4c921);
 put(0x91e79c,SHAPES);put(0x91e780,SHAPEFREE);put(0x91e78c,SHAPEACTIVE);put(0x91e790,REVERSE);put(0x91e794,63);put(0x91e784,-1);for(let i=0;i<64;i++)memory[SHAPEFREE+i]=i;
 put(0x902bc0,LIST);put(0x5ecb1c,SESSION);memory[SESSION+0x54d]=2;for(let i=0;i<65;i++)put(0x902be0+i*12,GROUPLISTS+i*132);word(BUCKET+8,1);
 put(0x902ba4,8);put(0x902ba8,EVENTS);put(0x902bac,HEAP);put(0x902bb0,FREE);memory.fill(0x36,EVENTS,EVENTS+8*104);put(0x5eb5e0,[0,1024,4096,65536][fixture%4]);put(0x811180,fixture%2);put(0x811184,fixture%3?0:BODIES[0]);put(0x81118c,[0,32768,65536,98304][fixture%4]);
 for(const[index,body]of BODIES.entries()){
  put(0x909300+index*780,body);put(body,[0x9803,0x9807][(fixture+index)%2]);put(body+12,BUCKET);put(body+0xa8,65536);put(body+0xac,65536);put(body+0xb0,32768);put(body+0xb4,fixture%3?1000:0);put(body+0x108,fixture%2);put(body+0x6bc,-1);memory[body+0x66f]=[0,31,32,255][fixture%4];
  vector(body+0x34,[(index*5+2)*65536,-6*65536,0]);vector(body+0x40,[random(100001)-50000,random(100001)-50000,0]);vector(body+0x4c,[0,random(10001)-5000,0]);vector(body+0x68,[0,0,0]);vector(body+0x74,[random(10001)-5000,random(10001)-5000,0]);vector(body+0x80,[0,random(1001)-500,0]);put(body+0x58,65536);
  [4096,0,0,0,4096,0,0,0,4096].forEach((value,i)=>word(body+0xc4+i*2,value));[65536,0,0,0,65536,0,0,0,65536].forEach((value,i)=>put(body+0xe4+i*4,value));
 }
 memory.copy(machine.bytes);
 for(const[index,address]of BODIES.entries()){
  const count=(fixture+index)%3+1,p=DESCRIPTORS+index*80;for(let i=0;i<count;i++){vector(p+i*20,[(i-1)*256,0,0]);put(p+i*20+12,2*256);word(p+i*20+16,1);}memory.copy(machine.bytes,p,p,p+80);
  views.registerShapes(address,memory.subarray(p,p+count*20));execute(0x428270,address,count,[p]);registrations++;compare(fixture,'registration');
 }
 beginPhysicsFrame(views.physicalGroup.bodies.slice(0,views.physicalGroup.count),BODIES.map(views.bodyAt));execute(0x46e9b0);compare(fixture,'begin');
 for(const address of BODIES){
  const body=views.bodyAt(address);if(fixture%2){const record=views.records.subarray(body.collisionIds[0]*72,(body.collisionIds[0]+1)*72);record.writeUInt16LE(0x100,0x44);vector(SHAPES+body.collisionIds[body.collisionCount10c]*72+0x20,[0,256,0]);vector(SHAPES+body.collisionIds[body.collisionCount10c]*72+0x2c,[0,-65536,0]);memory.copy(machine.bytes,SHAPES,SHAPES,SHAPES+64*72);}
  consumedContacts+=prepareOrdinaryBody(body,{records:views.records,gravityQ16:views.gravityQ16,effectFlags:views.effectFlags,timeOptions:views.timeOptionsFor(body)}).contacts;execute(0x47a8e0,address);compare(fixture,'preparation');
  prepareBodyShapeCache(body,0,views.records,views.timeOptionsFor(body));execute(0x429820,address,0);compare(fixture,'cache');
 }
 buildBodyCandidateGroups(views.physicalGroup.bodies.slice(0,views.physicalGroup.count),views.candidateGroups);execute(0x46ea80);compare(fixture,'groups');
 views.queue.reset();execute(0x440510);compare(fixture,'queue reset');
 for(const[index,address]of BODIES.entries()){
  const body=views.bodyAt(address),contact=views.contactAt(CONTACT),flags={value:[1,2,0x140][fixture%3]},nativeFlags=flags.value;
  contact.point=[(index*5+2)*256,0,0];contact.normal=[0,-65536,0];contact.scalar=fixture%3===1?0:1;contact.field38=0;put(FLAGS,nativeFlags);memory.copy(machine.bytes,CONTACT,CONTACT,CONTACT+72);memory.copy(machine.bytes,FLAGS,FLAGS,FLAGS+4);
  const {event}=insertCollisionEvent(views.queue,{object1:body,contact,flags,tag:0,deltaQ16:256});execute(0x475500,address,0,[CONTACT,FLAGS,0,0,256]);put(FLAGS,flags.value);compare(fixture,'event insert');events++;
  dispatchCollisionResponse(event,256,{gravityQ16:views.gravityQ16,timeOptionsFor:views.timeOptionsFor,handlers:{storeContact:(target,value)=>storeBodyShapeContact(target,value,views.records)}});execute(0x474bb0,event.address,256);compare(fixture,'response');
 }
 views.queue.invalidate(views.bodyAt(BODIES[0]),null);execute(0x475630,BODIES[0]);compare(fixture,'invalidate');
 unregisterPhysicalBody(BODIES[0],{memory});execute(0x4284d0,BODIES[0]);compare(fixture,'unregister');retirements++;
 assert.equal(views.physicalGroup.count,1);assert.equal(views.physicalGroup.bodies[0],views.bodyAt(BODIES[1]));
}
const report={method:'Coherent native Buffer views execute actual shape registration428270→begin46e9b0→ordinary preparation47a8e0→sphere cache429820→candidate groups46ea80→queue reset440510→event insertion475500→static response474bb0→invalidation475630→unregister4284d0. Existing respawn body identities remain shared. No body/group/event/shape synchronization snapshots. All reached arithmetic and state routines run retained instructions; only compiler security-cookie validation is an explicit external service. Effects flags zero and movement stays within registered spatial high bytes, so game effects/spatial movement branches are not reached. Synthetic source contact payloads and caller-provided runtime storage are explicit. This is a connected subchain, not a complete4749e0 or original-process execution.',evidence:[...evidence.map(value=>value.evidence_id),table.evidence_id,sqrt.evidence],instructions:instructions.length,fixtures,registrations,consumedContacts,events,retirements,checks,instructionSteps:steps,matched:true};await writeFile('analysis/physics-runtime-views-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
