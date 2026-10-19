// Installed-data coverage of the connected contact stages. Body states are
// synthetic; wheel geometry and broad-phase radius come from the original PE.
import {RollcageArchive} from '../src/archive.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {createModelCollisionContext} from '../src/model-candidates.mjs';
import {initializeVehicleContacts,updateVehicleContacts} from '../src/vehicle-contacts.mjs';
import {applyWheelSuspension} from '../src/wheel-physics.mjs';
import {verifyModelCandidates} from './verify-model-candidates-instructions.mjs';
import {rotateModelYawPoint} from '../src/model-transforms.mjs';
import {readVehicleDriveConfiguration,prepareWheelDriveDirections,updateWheelDrive} from '../src/wheel-drive.mjs';
import {initializeWheelForceCoefficients,applyWheelTractionForces} from '../src/wheel-forces.mjs';
import {verifyWheelDrive} from './verify-wheel-drive-instructions.mjs';
import {writeFile} from 'node:fs/promises';
const driveEnabled=process.argv.includes('--drive'),installation=process.argv.slice(2).find(value=>!value.startsWith('--'));
const archive=await RollcageArchive.open(installation??'C:\\Program Files (x86)\\Psygnosis\\Rollcage');
const resources=[],failures=[],samples=[];
const summary={resources:0,bodies:0,terrainCandidates:0,modelCandidates:0,firstSide:0,secondSide:0,noContact:0,terrainContacts:0,modelContacts:0,overlaps:0,misses:0,nativeCandidateChecks:0,instructionSteps:0,categories:{},gripReductions:{}};
const byInput={terrainCenters:{bodies:0,terrainContacts:0,modelContacts:0},modelFaces:{bodies:0,terrainContacts:0,modelContacts:0}},modelSamples=[];
const driveSummary={bodies:0,activeWheels:0,nonzeroDriveInputs:0,nonzeroCorrections:0,effectCalls:0,nativeChecks:0,instructionSteps:0};
try {
 for(const entry of archive.entries) {
  const {data}=await archive.readResource(entry.index);if(data.toString('ascii',0,4)!=='GFXM')continue;
  try {
   const grid=parseCollisionGrid(data);if(!grid.available)continue;
   const {data:btp}=await archive.readResource(entry.index+1),context=createModelCollisionContext(data,btp,{spatial:grid.spatial});
   const counts={resource:entry.index,bodies:0,terrainCandidates:0,modelCandidates:0,terrainContacts:0,modelContacts:0,misses:0};
   function exercise(positionQ16,input,source) {
     const position=positionQ16.map(value=>value/65536),body={flags:3,position:positionQ16,linearVelocity:[0,0,0],angularVelocity:[0,0,0],momentum:[0,0,0],angularMomentum:[0,0,0],rotation:[4096,0,0,0,4096,0,0,0,4096]};
     const state=initializeVehicleContacts();let drive,driveContext;
     if(driveEnabled) {
      body.linearVelocity=[0,0,16*65536];body.momentum=body.linearVelocity.slice();body.mass=65536;body.worldInverseInertia=[21671,0,0,0,17762,0,0,0,31930];
      driveContext={gameMode:0,modeFlags:0,specialMode:!!(summary.bodies&1),surfaceMode:0,effectLevel:0,effectMode:0};drive=readVehicleDriveConfiguration((entry.index>>1)%7,{specialMode:driveContext.specialMode});drive.multiplierQ16=[0,32768,65536][summary.bodies%3];drive.inputByte=[0,128,200][summary.bodies%3];
      for(const wheel of state.wheels)Object.assign(wheel,{spin:[0,0x80000,-0x80000,0x400000][summary.bodies%4],angle:0,effectFlags:0,effectSpeed:0,slipSpeed:0,leverArm:[0,0,0],relativeHit:[0,0,0],slipVector:[0,0,0],tractionCorrection:[0,0,0],slipWithSpin:[0,0,0]});
      state.driveEffects=Array.from({length:6},(_,index)=>({status:index>=2?1:0,payload:index>=2?[6000,16,0,0,0,0]:[0,0,0,0,0,0]}));
      initializeWheelForceCoefficients(body,state);prepareWheelDriveDirections(body,state.wheels,[-0x8000,0,0x8000][summary.bodies%3]);
     }
     const result=updateVehicleContacts(data,grid,context,body,state,{onBreakableContact:()=>false});
     if(summary.bodies%10===0){const check=verifyModelCandidates(context,body,{radiusQ8:state.bodyRadiusQ8});summary.nativeCandidateChecks++;summary.instructionSteps+=check.steps;}
     summary.bodies++;counts.bodies++;byInput[input].bodies++;summary.terrainCandidates+=result.terrain.candidates.length;counts.terrainCandidates+=result.terrain.candidates.length;
     summary.modelCandidates+=result.models.candidates.length;counts.modelCandidates+=result.models.candidates.length;
     if(!result.preparation.contact)summary.noContact++;else if(result.preparation.attempts===1)summary.firstSide++;else summary.secondSide++;
     for(let wheel=0;wheel<4;wheel++) {
      const contact=state.contacts[wheel],descriptor=state.descriptors[wheel],active=!!(state.wheels[wheel].flags&1);
      if(active!==(contact.distance>=0))throw Error('Wheel contact distance disagrees with active flag.');
      if(!active){summary.misses++;counts.misses++;continue;}
      if(contact.distance===0)summary.overlaps++;
      if(descriptor.cellRef===-4){summary.modelContacts++;counts.modelContacts++;byInput[input].modelContacts++;}
      else {summary.terrainContacts++;counts.terrainContacts++;byInput[input].terrainContacts++;if(!descriptor.surface)throw Error('Terrain contact lacks surface metadata.');const surface=descriptor.surface;summary.categories[surface.category]=(summary.categories[surface.category]??0)+1;summary.gripReductions[surface.gripReduction]=(summary.gripReductions[surface.gripReduction]??0)+1;}
     }
     applyWheelSuspension(body,state.wheels,state.contacts);
     if(driveEnabled) {
      if(driveSummary.bodies%20===0){const check=verifyWheelDrive(body,state,drive,driveContext);driveSummary.nativeChecks++;driveSummary.instructionSteps+=check.steps;}
      const driven=updateWheelDrive(body,state,drive,driveContext,{onTractionEffects:({wheel,measuredSpeed,surfaceReduction})=>{wheel.effectSpeed=measuredSpeed>0x40000&&(surfaceReduction>>>0)<=2?measuredSpeed:0;},onEmitEffect:()=>{driveSummary.effectCalls++;}});
      const forces=applyWheelTractionForces(body,state.wheels);driveSummary.bodies++;
      driven.wheels.forEach(wheel=>{if(wheel.traction)driveSummary.activeWheels++;if(wheel.driveInput!==0)driveSummary.nonzeroDriveInputs++;});forces.forEach(force=>{if(force?.correction.some(Boolean))driveSummary.nonzeroCorrections++;});
     }
     for(const value of [...body.momentum,...body.angularMomentum])if(!Number.isInteger(value)||value< -2147483648||value>2147483647)throw Error('Suspension output is not a signed integer.');
     const sample={resource:entry.index,input,...source,position,terrainCandidates:result.terrain.candidates.length,modelCandidates:result.models.candidates.length,side:state.side,attempts:result.preparation.attempts,cellRefs:state.descriptors.map(descriptor=>descriptor.cellRef),distances:state.contacts.map(contact=>contact.distance),momentum:body.momentum,angularMomentum:body.angularMomentum};
     if(input==='terrainCenters'&&entry.index===30&&samples.length<6)samples.push(sample);
     if(input==='modelFaces'&&modelSamples.length<6&&sample.cellRefs.includes(-4))modelSamples.push(sample);
   }
   for(const sector of grid.sectors) {
    const active=sector.cells.filter(cell=>cell.covered);
    for(const slot of new Set([0,Math.floor(active.length/2),active.length-1])) {
     const cell=active[slot];if(!cell)continue;
     const top=cell.row*(sector.columns+1)+cell.column,indices=[top,top+1,top+sector.columns+1,top+sector.columns+2];
     const position=[0,1,2].map(axis=>Math.trunc(indices.reduce((sum,index)=>sum+sector.vertices[index][axis],0)/4));position[1]-=40;
     exercise(position.map(value=>value*65536),'terrainCenters',{sector:sector.index,cell:cell.index});
    }
   }
   // Aim wheel zero above an upward-facing polygon in each eligible instance.
   // Original spatial registration chooses candidates; no object is forced in.
   for(const {collision,settings}of context.instances.values()) {
    let selected;
    for(const shape of collision.shapes)if(shape.faceCount>2) {
     for(const recordIndex of shape.records){const record=collision.faceRecords[recordIndex],face=collision.faces[record.faceIndex];if(face.normalQ8[1]<-64){selected={shape,face};break;}}
     if(selected)break;
    }
    if(!selected)continue;
    const vertices=selected.face.indices.filter(Boolean).map(index=>collision.vertices[index-1]),positionQ16=settings.position.map(value=>value<<16);
    const local=[0,1,2].map(axis=>Math.trunc(vertices.reduce((sum,vertex)=>sum+vertex[axis]*256,0)/vertices.length)+(positionQ16[axis]>>8));
    const target=rotateModelYawPoint(local,positionQ16,settings.yaw);
    exercise([target[0]+27*256,target[1]-40*256,target[2]-32*256].map(value=>value<<8),'modelFaces',{placement:settings.placementIndex,shape:selected.shape.index});
   }
   resources.push(counts);
  }catch(error){failures.push({resource:entry.index,error:error.message});}
 }
}finally{await archive.close();}
summary.resources=resources.length;summary.byInput=byInput;summary.failures=failures;
const report={method:'Synthetic upright stationary bodies 40 source units above sampled covered cell centers; additional bodies aim wheel zero 40 units above upward-facing installed model polygons, retaining original spatial candidate lookup. Original four-wheel geometry and recovered 15520 Q8 candidate radius. Original terrain/model ordering and side retries, followed by reconstructed suspension. Destruction callback explicitly inert. Sampled model candidate comparisons interpret retained x86 with point/edge scratch helpers mocked because their flags are overwritten by the screen. No original process execution, captured runtime states or complete driving simulation.',summary,resources,samples,modelSamples};
if(driveEnabled){summary.drive=driveSummary;report.method='Synthetic forward-moving bodies with recovered wheel layout, variant/special drive tables and mass-derived wheel coefficients. Three declared control/steering profiles and four initial-spin profiles. Direction preparation -> contacts -> suspension -> drive -> traction forces, with candidate and sampled drive instruction comparisons. Surface mode explicitly zero (all serialized vertices classify zero); traction effects use their disabled-context cache write, emission constructors are explicitly inert, and destruction is inert. No body integration, collision response, rest/air assists, original process execution or complete frame equivalence.';}
await writeFile(driveEnabled?'analysis/vehicle-drive-probes.json':'analysis/vehicle-contact-probes.json',JSON.stringify(report,null,2));console.log(JSON.stringify(summary));if(failures.length)process.exitCode=1;
