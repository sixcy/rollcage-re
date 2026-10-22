// Native vehicle wheel-update order (0x47ab30). Each of the first four stages
// runs over all vehicles, followed by global forces and per-vehicle assists.
import {prepareWheelDriveDirections,updateWheelDrive,readVehicleSurfaceMode} from './wheel-drive.mjs';
import {updateVehicleContacts} from './vehicle-contacts.mjs';
import {applyWheelSuspension} from './wheel-physics.mjs';
import {applyWheelTractionForces} from './wheel-forces.mjs';
import {clampVehicleAtRest,dampAirborneSpin,assistAirborneOrientation} from './vehicle-assists.mjs';
import {updateVehicleSpecialState} from './vehicle-special.mjs';
import {readVehicleTrackBasis} from './track-basis.mjs';
import {updateBodyDerived} from './body-physics.mjs';
import {updateRawVehicleContacts} from './raw-vehicle-contacts.mjs';
export function runVehicleWheelStages(vehicles,stages) {
 for(const key of ['directions','contacts','suspension','drive','forces','rest','airSpin','orientation','special'])if(typeof stages[key]!=='function')throw Error(`Vehicle wheel stage ${key} is required.`);
 for(const key of ['directions','contacts','suspension','drive'])for(let i=0;i<vehicles.length;i++)stages[key](vehicles[i],i);
 stages.forces(vehicles);
 for(let i=0;i<vehicles.length;i++){const vehicle=vehicles[i];for(const key of ['rest','airSpin','orientation','special'])stages[key](vehicle,i);}
}
// Each vehicle supplies caller-owned registration, progression, controls and
// timers. This function does not advance pose, generate collision events or
// invent those runtime inputs. Native wheel effects bind through supplied
// coherent views and actual drive/force entry stacks in effectRuntime.
export function updateVehicleWheelFrame(vehicles,environment,handlers={}) {
 const {data,grid,modelContext,effectRuntime,wheelRuntime,surfaceModeFor,trackBasisFor}=environment,results=vehicles.map(()=>({}));
 if(surfaceModeFor!==undefined&&typeof surfaceModeFor!=='function'||trackBasisFor!==undefined&&typeof trackBasisFor!=='function')throw Error('Vehicle surface and basis providers must be functions.');
 //47ab30 reloads participant count between calls. A newly reached participant
 //has no earlier-stage report, but still receives every remaining native stage.
 const resultFor=index=>results[index]??=({});
 let onSurfaceParticles=handlers.onSurfaceParticles;
 if(effectRuntime) {
  const {views,driveScratchBase,forceScratchBase}=effectRuntime;
  if(!views||!Number.isInteger(driveScratchBase)||!Number.isInteger(forceScratchBase))throw Error('Vehicle wheel effects require native41c080 and499e90 entry stacks.');
  for(const vehicle of vehicles)if(views.bodyAt(vehicle.body.address)!==vehicle.body||views.stateFor(vehicle.body)!==vehicle.state||views.driveFor(vehicle.body)!==vehicle.drive)throw Error('Vehicle wheel frame requires coherent native vehicle views.');
  const effects=views.effectHandlers({scratchBase:forceScratchBase-0x48,surfaceScratchBase:forceScratchBase-0x48,positionAddress:driveScratchBase-24,directionAddress:driveScratchBase-36});
  onSurfaceParticles??=effects.onSurfaceParticles;
 }
 if(vehicles.length&&!onSurfaceParticles)throw Error('Vehicle wheel frame requires its surface-particle handler.');
 for(const vehicle of vehicles){if(!Number.isInteger(vehicle.registeredCellRef))throw Error('Vehicle wheel frame requires explicit registered cell references.');if(!Number.isInteger(vehicle.steeringAngleQ16)||!Number.isInteger(vehicle.state.airSpinCounter))throw Error('Vehicle wheel frame requires explicit steering and airborne-counter state.');}
 runVehicleWheelStages(vehicles,{
  directions:(v,i)=>{resultFor(i).directions=prepareWheelDriveDirections(v.body,v.state.wheels,v.steeringAngleQ16,{reverseSteering:v.reverseSteering});},
  contacts:(v,i)=>{resultFor(i).contacts=wheelRuntime?updateRawVehicleContacts(v.body.address,wheelRuntime):updateVehicleContacts(data,grid,modelContext,v.body,v.state,{spatialState:v.spatialState,specialType4:v.specialType4,onBreakableContact:handlers.onBreakableContact?args=>handlers.onBreakableContact({...args,vehicle:v,index:i}):undefined});},
  suspension:(v,i)=>{resultFor(i).suspension=applyWheelSuspension(v.body,v.state.wheels,v.state.contacts);},
  drive:(v,i)=>{resultFor(i).drive=updateWheelDrive(v.body,v.state,v.drive,{...v.driveContext,surfaceMode:surfaceModeFor?surfaceModeFor(v):readVehicleSurfaceMode(data,grid.scene,v.registeredCellRef)},{timeOptions:environment.timeOptionsFor?.(v.body)??v.timeOptions,effectRuntime:effectRuntime?{views:effectRuntime.views,scratchBase:effectRuntime.driveScratchBase}:undefined,onTractionEffects:handlers.onTractionEffects?args=>handlers.onTractionEffects({...args,vehicle:v,vehicleIndex:i}):undefined,onEmitEffect:handlers.onEmitEffect?args=>handlers.onEmitEffect({...args,vehicle:v,vehicleIndex:i}):undefined});},
  forces:all=>{for(let i=0;i<all.length;i++)resultFor(i).forces=applyWheelTractionForces(all[i].body,all[i].state.wheels);for(let i=0;i<all.length;i++)onSurfaceParticles({vehicle:all[i],index:i});},
  rest:(v,i)=>{resultFor(i).rest=clampVehicleAtRest(v.body,v.state,v.drive);},
  airSpin:(v,i)=>{resultFor(i).airSpin=dampAirborneSpin(v.body,v.state);},
  orientation:(v,i)=>{resultFor(i).orientation=assistAirborneOrientation(v.body,v.state,environment.timeOptionsFor?.(v.body));},
  special:(v,i)=>{resultFor(i).special=updateVehicleSpecialState(v.body,v.state,v.drive,{readTrackBasis:()=>trackBasisFor?trackBasisFor(v):readVehicleTrackBasis(data,grid,v.registeredCellRef,v.trackContext),onSpecialEvent:handlers.onSpecialEvent?args=>handlers.onSpecialEvent({...args,vehicle:v,index:i}):undefined});}
 });
 return results;
}
// FUN_00475760 refreshes derivatives for every eligible physical body after
// the wheel pass, including bodies outside the vehicle list.
export function updateFrameBodyDerivatives(bodies,derive=updateBodyDerived) {
 for(const body of bodies)if(!(body.flags&0x8000))derive(body);
}
export function updateVehiclePhysicsStage(vehicles,bodies,environment,handlers) {
 const results=updateVehicleWheelFrame(vehicles,environment,handlers);updateFrameBodyDerivatives(bodies);return results;
}
