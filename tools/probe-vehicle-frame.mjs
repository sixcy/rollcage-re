import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {createModelCollisionContext} from '../src/model-candidates.mjs';
import {initializeVehicleContacts} from '../src/vehicle-contacts.mjs';
import {readVehicleDriveConfiguration} from '../src/wheel-drive.mjs';
import {initializeWheelForceCoefficients} from '../src/wheel-forces.mjs';
import {updateVehiclePhysicsStage} from '../src/vehicle-frame.mjs';
import {updateBodyDerived} from '../src/body-physics.mjs';
import {quaternionMatrix} from '../src/fixed-math.mjs';
import {verifyTrackBasis} from './verify-track-basis-instructions.mjs';
import {writeFile} from 'node:fs/promises';
const archive=await RollcageArchive.open(process.argv[2]??'C:\\Program Files (x86)\\Psygnosis\\Rollcage'),resources=[],failures=[],samples=[];
const summary={resources:0,batches:0,vehicles:0,contacts:0,rest:0,airSpin:0,orientation:0,special:0,events:0,emissions:0,particleCalls:0,nativeBasisChecks:0,instructionSteps:0};
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const grid=parseCollisionGrid(data);if(!grid.available)continue;
   const {data:btp}=await archive.readResource(entry.index+1),modelContext=createModelCollisionContext(data,btp,{spatial:grid.spatial}),counts={resource:entry.index,batches:0,vehicles:0,rest:0,airSpin:0,orientation:0,special:0};
   for(const sector of grid.sectors) {
    const active=sector.cells.filter(cell=>cell.covered),batch=[];
    for(const slot of new Set([0,Math.floor(active.length/2),active.length-1])) {
     const cell=active[slot];if(!cell)continue;const profile=batch.length,top=cell.row*(sector.columns+1)+cell.column,indices=[top,top+1,top+sector.columns+1,top+sector.columns+2];
     const position=[0,1,2].map(axis=>Math.trunc(indices.reduce((sum,index)=>sum+sector.vertices[index][axis],0)/4));position[1]-=40;
     const quaternion=[[65536,0,0,0],[46340,46340,0,0],[46340,0,0,46340]][profile];
     const body={flags:3,position:position.map(value=>value*65536),momentum:profile?[0,0,16*65536]:[0,0,0],angularMomentum:profile===1?[0,8000001,0]:[0,0,0],quaternion,rotation:quaternionMatrix(quaternion),inverseInertia:[21671,17762,31930],mass:65536,inverseMass:65536,force:[0,0,0],torque:[0,0,0]};updateBodyDerived(body);
     const state=initializeVehicleContacts();state.airSpinCounter=30;state.driveEffects=Array.from({length:6},(_,index)=>({status:index>=2?1:0,payload:index>=2?[6000,16,0,0,0,0]:[0,0,0,0,0,0]}));
     state.wheels.forEach(wheel=>Object.assign(wheel,{spin:0,angle:0,effectFlags:0,effectSpeed:0,slipSpeed:0,leverArm:[0,0,0],relativeHit:[0,0,0],slipVector:[0,0,0],tractionCorrection:[0,0,0],slipWithSpin:[0,0,0]}));initializeWheelForceCoefficients(body,state);
     const drive=readVehicleDriveConfiguration((entry.index>>1)%7);drive.multiplierQ16=profile?32768:0;drive.capacityOverride=profile===0?1:profile===1?2:0;drive.specialTimer=profile===0?21:40;
     batch.push({body,state,drive,steeringAngleQ16:0,reverseSteering:false,registeredCellRef:(cell.row<<16)|(cell.column<<8)|sector.index,trackContext:{mode:0,progressStage:0,routeIndex:0},driveContext:{gameMode:0,modeFlags:0,specialMode:false,effectLevel:0,effectMode:0}});
    }
    if(!batch.length)continue;
    if(summary.batches%10===0){const vehicle=batch[0],check=verifyTrackBasis(data,grid,vehicle.registeredCellRef,vehicle.trackContext);summary.nativeBasisChecks++;summary.instructionSteps+=check.steps;}
    const result=updateVehiclePhysicsStage(batch,batch.map(vehicle=>vehicle.body),{data,grid,modelContext},{onBreakableContact:()=>false,onTractionEffects:({wheel,measuredSpeed,surfaceReduction})=>{wheel.effectSpeed=measuredSpeed>0x40000&&(surfaceReduction>>>0)<=2?measuredSpeed:0;},onEmitEffect:()=>summary.emissions++,onSurfaceParticles:()=>summary.particleCalls++,onSpecialEvent:()=>summary.events++});
    summary.batches++;counts.batches++;summary.vehicles+=batch.length;counts.vehicles+=batch.length;
    result.forEach((stages,index)=>{for(const key of ['rest','airSpin','orientation'])if(stages[key]){summary[key]++;counts[key]++;}if(stages.special.applied){summary.special++;counts.special++;}summary.contacts+=batch[index].state.wheels.filter(wheel=>wheel.flags&1).length;const body=batch[index].body;for(const value of [...body.momentum,...body.angularMomentum,...body.torque,...body.linearVelocity,...body.angularVelocity,...body.quaternionDerivative])if(!Number.isInteger(value)||value< -2147483648||value>2147483647)throw Error('Frame stage produced a non-signed-integer body value.');});
    if(samples.length<4&&entry.index===30)samples.push({resource:entry.index,sector:sector.index,vehicles:batch.map((vehicle,index)=>({registeredCellRef:vehicle.registeredCellRef,momentum:vehicle.body.momentum,angularMomentum:vehicle.body.angularMomentum,torque:vehicle.body.torque,linearVelocity:vehicle.body.linearVelocity,airSpinCounter:vehicle.state.airSpinCounter,specialMode:vehicle.drive.capacityOverride,specialTimer:vehicle.drive.specialTimer,rest:result[index].rest,airSpin:result[index].airSpin,orientation:result[index].orientation,specialApplied:result[index].special.applied}))});
   }
   resources.push(counts);
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
summary.resources=resources.length;summary.failures=failures;
await writeFile('analysis/vehicle-frame-probes.json',JSON.stringify({method:'Synthetic batches of up to three vehicles above sampled covered cells: upright stationary, quarter-turn X with airborne spin, and quarter-turn Z. Recovered geometry, drive tables and wheel coefficients; explicit registered cells, route index0, default progression context, controls and special timers. Full reconstructed wheel/post-wheel stage order followed by body derivative refresh. Destruction, emission, particles and transition event explicitly inert; traction callback models its effects-disabled cache write. No pose integration, collision response, observed runtime registrations or race equivalence.',summary,resources,samples},null,2));console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;
