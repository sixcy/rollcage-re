import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {createRespawnRuntime} from '../src/respawn-runtime.mjs';
import {createVehicleRuntimeViews} from '../src/vehicle-runtime-views.mjs';
import {updateWheelDrive} from '../src/wheel-drive.mjs';
import {applyWheelTractionForces} from '../src/wheel-forces.mjs';
import {applyWheelSuspension} from '../src/wheel-physics.mjs';

const nativeDirectory='analysis/native-simulation/results',sceneDirectory='analysis/scene/results';
const nativeFiles=['870-wheel-runtime-cross-assembly.json','715-wheel-traction-effects-assembly.json','717-wheel-rear-emission-assembly.json','719-wheel-surface-particles-assembly.json',...[[811,'483e60'],[813,'483c80'],[815,'483d10'],[817,'4365a0'],[819,'475c30'],[822,'483f10'],[824,'475bc0'],[826,'4334b0'],[828,'484020']].map(([id,p])=>`${id}-wheel-effects-${p}-assembly.json`),'665-retirement-4286e0-assembly.json','669-retirement-4746f0-assembly.json','115-effect-allocation-assembly.json','118-particle-removal-assembly.json','117-particle-registration-assembly.json','232-steering-dot-assembly.json','239-steering-triple-cross-assembly.json','134-checkpoint-interpolation-assembly.json','243-steering-normalize-assembly.json'];
const sceneFiles=['138-wheel-suspension-assembly.json','218-wheel-drive-stage-assembly.json','214-wheel-drive-inputs-assembly.json','144-wheel-traction-assembly.json','223-wheel-spin-assembly.json','152-vector-length-assembly.json','220-wheel-drive-dot-assembly.json','217-wheel-capacity-curve-assembly.json','221-fixed-sqrt-assembly.json','219-wheel-surface-override-assembly.json','230-wheel-effect-selector-assembly.json','246-wheel-correction-stage-assembly.json','248-wheel-torque-correction-assembly.json','254-wheel-correction-scale-assembly.json','255-wheel-correction-inertia-assembly.json','256-wheel-cross-assembly.json','244-wheel-direction-normalize-assembly.json','133-sqrt-lookup-assembly.json','211-sqrt-leading-zeros-assembly.json'];
const [native,scene]=await Promise.all([readInstructionEvidence(nativeFiles,{directory:nativeDirectory}),readInstructionEvidence(sceneFiles)]),evidence=[...native.evidence,...scene.evidence];
const instructions=[...new Map([...native.instructions,...scene.instructions].map(instruction=>[instruction.address,instruction])).values()];
const readTable=async(directory,name)=>{const result=JSON.parse(await readFile(`${directory}/${name}`,'utf8'));return result.structuredContent??JSON.parse(result.content.find(c=>c.type==='text').text);};
const tables=await Promise.all([...['820-wheel-effects-surface-switch.json','829-wheel-effects-debris-switch.json','830-wheel-effects-matrix-scale.json','831-wheel-effects-quality-threshold.json'].map(name=>readTable(nativeDirectory,name)),...['228-wheel-drive-switch-bytes.json','229-wheel-effect-threshold.json','232-wheel-effect-switch-bytes.json'].map(name=>readTable(sceneDirectory,name))]);
const sqrt=JSON.parse(await readFile('src/sqrt-table.json','utf8')),machine=new BoundedX86(instructions),memory=Buffer.alloc(0xa00000);
const BODIES=[0x10000,0x15000],CONFIG=0x30000,SESSION=0x31000,MATERIALS=0x32000,SKIDS=0x35000,OLD=0x37000,ROWS=0x40000,INDICES=0x43000,BUCKET=0x45000,FREE=0x46000,ACTIVE=0x46200,SHAPES=0x50000,PARTICLES=0x100000,DEBRIS=0x110000,STACK=0x9000;
const respawn=createRespawnRuntime({memory,recordCount:2,bodyStorage:BODIES.map(address=>({address,length:0x4000})),scratchBase:STACK});
const views=createVehicleRuntimeViews({memory,bodyAt:respawn.bodyAt,vehicleStateFor:respawn.vehicleStateFor});
let seed=0x41c080ab,instructionSteps=0,vehicleCalls=0,sourceCounts,nativeCounts;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p),vector=(p,v)=>v.forEach((x,i)=>put(p+i*4,x));
const countKeys=['traction','rearAttempts','rearParticles','debris','merges','segments'];
const addresses=new Map([[0x483b90,'traction'],[0x436630,'rearAttempts'],[0x436698,'rearParticles'],[0x475d96,'debris'],[0x483feb,'merges'],[0x483c80,'segments']]);
machine.onInstruction=address=>{const name=addresses.get(address);if(name)nativeCounts[name]++;};
const totals=Object.fromEntries(countKeys.map(key=>[key,0]));
function initialize(fixture){
 memory.fill(0);memory.fill(0x36,STACK-0x400,STACK+64);for(const table of tables)Buffer.from(table.normalized_result.bytes_hex,'hex').copy(memory,Number(table.normalized_result.address));sqrt.values.forEach((value,i)=>word(0x5eb290+i*2,value));
 const count=fixture%2+1;put(0x5ecb1c,SESSION);put(0x5ecefc,CONFIG);memory[SESSION+0x54d]=count;put(SESSION+0x57c,fixture%8);memory[SESSION+0x553]=fixture%4;memory[SESSION+0x579]=[0,1,2,5,8,10,11][fixture%7];memory[SESSION+0x587]=fixture%2;
 memory[CONFIG+0x2c]=fixture%7===0?0:1;memory.writeFloatLE([NaN,3.199,3.2,4,5][fixture%5],CONFIG+0x68);
 const mode=fixture%3,level=0x55000,sector=0x55100,vertices=0x55200;put(0x909240,level);put(level,sector);put(sector+8,1);put(sector+0x20,vertices);word(0x90929c,400);put(vertices+4,([0,900,980][mode]<<22));
 for(let v=0;v<count;v++){
  const body=BODIES[v];put(0x909300+v*0x30c,body);put(body,3);vector(body+0x34,[(20+v*10)*65536,0,30*65536]);vector(body+0x40,[random(100001)-50000,0,0]);vector(body+0x4c,[0,random(100001)-50000,0]);vector(body+0x68,[random(16*65536)-8*65536,0,random(16*65536)-8*65536]);
  [4096,0,0,0,4096,0,0,0,4096].forEach((value,i)=>word(body+0xc4+i*2,value));[21671,1024,-500,1024,17762,1536,-500,1536,31930].forEach((value,i)=>put(body+0xe4+i*4,value));
  memory[body+0x145]=v;put(0x91e79c,SHAPES);put(SHAPES+v*72+64,15520);memory[body+0x10c]=5;memory[body+0x64e]=[0,128,129,255][fixture%4];memory[body+0x64f]=fixture%2;
  for(const[offset,value]of[[0x658,fixture%31],[0x65a,fixture%17],[0x65c,fixture%31],[0x2f3a,[256,2048,4096,-4096][fixture%4]],[0x668,[0,29,30,350,-1][fixture%5]]])word(body+offset,value);
  for(const[offset,value]of[[0x6b0,random(65537)],[0x650,[0,20000,32768,65536][fixture%4]],[0x3cf8,random(4001)-2000],[0x3d04,fixture%3],[0x6a8,random(80000)],[0x3cf4,random(80000)],[0x3cfc,[1,500000,1000000,3000000][fixture%4]],[0x664,[0x1ffff,0x20000,0x100000,0x200000][fixture%4]]])put(body+offset,value);
  for(let i=0;i<4;i++){
   const w=body+0x324+i*200,m=MATERIALS+(v*4+i)*16,old=OLD+(v*4+i)*32;memory[w]=(fixture>>i&1)|8;memory[w+0x9c]=v;put(w+0x58,random(10000001)-5000000);put(w+0x78,random(0x100000000));put(w+0xa8,fixture%2?0x8000:0);put(w+0xb8,fixture%3===0?-1:old);word(w+0xa0,20+v*10);word(w+0xa4,30);word(old+12,10);word(old+26,1);
   vector(w+0x10,[random(40*65536)-20*65536,0,random(40*65536)-20*65536]);vector(w+0x1c,[0,0,0]);vector(w+0x28,[(i%2?27:-27)*65536,0,(i<2?32:-32)*65536]);vector(w+0x34,[0,0,65536]);vector(w+0x40,[0,65536,0]);vector(w+0xac,[0,65536,0]);put(w+0xbc,random(200000));put(w+0xc0,[0,1,4096,65536][fixture%4]);
   put(body+0x198+i*28,fixture%11===0?0:m);put(m+12,([0,5,6,7,8,9,14][(fixture+i)%7]|random(27)<<8));
   const c=body+0x1f0+i*0x4c;vector(c,[0,4096,0]);vector(c+0xc,[random(16*65536)-8*65536,random(16*65536)-8*65536,random(16*65536)-8*65536]);vector(c+0x18,[(i%2?27:-27)*65536,0,(i<2?32:-32)*65536]);vector(c+0x24,[random(40*65536)-20*65536,0,random(40*65536)-20*65536]);vector(c+0x30,[0,random(20*65536)-10*65536,0]);vector(c+0x3c,[0,-65536,0]);put(c+0x48,random(44*65536));
  }
  for(let i=0;i<6;i++){const g=body+0x3dc8+i*28;put(g,fixture%3===0?1:0);put(g+4,fixture%2?0:0x7fffffff);put(g+8,fixture%2?5:100);put(g+12,fixture%13);vector(g+16,[(fixture%4+v*10)*65536,0,0]);}
 }
 put(0x90a548,fixture%21);put(0x8495d0,SKIDS+fixture%16*292);put(0x8495d4,SKIDS);put(0x8495d8,SKIDS+16*292);put(0x5ed2b8,[0,128,256,400][fixture%4]);put(0x5ed2c0,[0,128,256,512][fixture%4]);put(0x811180,fixture%3);put(0x811184,fixture%2?BODIES[0]:0);put(0x81118c,32768);put(0x919004,0x030b00ff|(fixture%12)<<16);put(0x5ec958,[0,1,0x7fffffff,-1,random(0x100000000)][fixture%5]);
 put(0x909254,ROWS);put(0x909278,BUCKET);for(let i=0;i<256;i++){word(ROWS+i*16,0xff00);put(ROWS+i*16+12,INDICES);}if(fixture%7===0)put(ROWS+128*16+12,0);
 put(0x902eec,PARTICLES);put(0x6e65b4,PARTICLES);for(let i=0;i<16;i++)put(PARTICLES+i*256+0xac,i<15?PARTICLES+(i+1)*256:0);
 put(0x902b7c,FREE);put(0x902b80,ACTIVE);put(0x902b84,DEBRIS);put(0x902b8c,fixture%65-1);for(let i=0;i<64;i++)word(FREE+i*2,i);
 sourceCounts=Object.fromEntries(countKeys.map(key=>[key,0]));nativeCounts=Object.fromEntries(countKeys.map(key=>[key,0]));memory.copy(machine.bytes);return {count,mode};
}
function execute(entry,body=0){machine.entry=entry;machine.r.ECX=body;machine.r.ESP=STACK;machine.bytes.writeUInt32LE(0xffffffff,STACK);instructionSteps+=machine.run();}
function compare(fixture,phase){
 for(const[p,n]of[[BODIES[0],0x4000],[BODIES[1],0x4000],[SKIDS,16*292],[OLD,256],[BUCKET,16],[FREE,0x400],[PARTICLES,0x14000],[0x8495d0,12],[0x919004,4],[0x5ec958,4],[0x902b7c,20],[0x6e65b4,24],[0x91cdc0,48],[0x91d360,20],[0x91d3e4,6],[0x91d448,12]]){
  const a=machine.bytes.subarray(p,p+n),b=memory.subarray(p,p+n);if(!a.equals(b)){const i=a.findIndex((value,i)=>value!==b[i]);assert.fail(`${phase} fixture${fixture} at0x${(p+i).toString(16)} native=${a[i]} JS=${b[i]}`);}
 }
}
const fixtures=1200;
for(let fixture=0;fixture<fixtures;fixture++){
 const {count,mode}=initialize(fixture),vehicles=Array.from({length:count},(_,index)=>views.vehicleFor(BODIES[index]));
 for(const vehicle of vehicles){applyWheelSuspension(vehicle.body,vehicle.state.wheels,vehicle.state.contacts);execute(0x488370,vehicle.body.address);}
 compare(fixture,'suspension');
 for(const vehicle of vehicles){
  updateWheelDrive(vehicle.body,vehicle.state,vehicle.drive,{...vehicle.driveContext,surfaceMode:mode},{timeOptions:vehicle.timeOptions,effectRuntime:{views,scratchBase:STACK}});
  execute(0x41c080,vehicle.body.address);vehicleCalls++;
 }
 compare(fixture,'drive+effects');
 for(let p=memory.readUInt32LE(0x6e65c0);p;p=memory.readUInt32LE(p+0xa8))sourceCounts.rearParticles++;
 assert.equal(sourceCounts.rearParticles,nativeCounts.rearParticles);
 for(const vehicle of vehicles)applyWheelTractionForces(vehicle.body,vehicle.state.wheels);
 for(const vehicle of vehicles)sourceCounts.debris+=views.effectHandlers({body:vehicle.body,scratchBase:STACK-0x48,positionAddress:STACK-0x200,directionAddress:STACK-0x210}).onSurfaceParticles();
 execute(0x499e90);compare(fixture,'forces+surface');assert.equal(sourceCounts.debris,nativeCounts.debris);
 for(const key of countKeys)totals[key]+=nativeCounts[key];
}
const report={method:'Connected actual retained 488370 suspension → 41c080 drive parent with its real effectRuntime defaults → 483b90 traction/skid graph and 436630 gate/particle graph, followed by actual 499e90 global wheel forces → 42c590 surface debris. JavaScript uses coherent native Buffer views decorating createRespawnRuntime body/state/wheel identities, with no body/wheel/gate synchronization copies and no mocked callees. Caller temporary emission vectors use supplied parent-stack addresses. Compares full vehicle bodies, skid/particle/debris/free/active/spatial storage, RNG/frame and consumed renderer outputs. Two unconsumed padding bytes copied from incidental native helper-stack garbage are excluded. Synthetic contact/runtime/session/material/spatial producer inputs and registered vertex codes are explicit; no original process execution.',evidence:[...evidence.map(value=>value.evidence_id),...tables.map(value=>value.evidence_id),sqrt.evidence],instructions:instructions.length,fixtures,suspensionCalls:vehicleCalls,vehicleCalls,forceCalls:fixtures,instructionSteps,totals,matched:true};
await writeFile('analysis/vehicle-runtime-views-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
