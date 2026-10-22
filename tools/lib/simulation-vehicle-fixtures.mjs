import {createSimulationRuntimeFixture} from './simulation-runtime-fixtures.mjs';
import {createVehicleRuntimeViews} from '../../src/vehicle-runtime-views.mjs';
import {initializeVehicleContacts} from '../../src/vehicle-contacts.mjs';
import {initializeWheelForceCoefficients} from '../../src/wheel-forces.mjs';
import {readVehicleDriveConfiguration} from '../../src/wheel-drive.mjs';
import template from '../../src/vehicle-contact-template.json' with {type:'json'};
import {createVehicleCollisionFilter} from '../../src/vehicle-collision-filter.mjs';
import {quaternionMatrix} from '../../src/fixed-math.mjs';
import {updateBodyDerived} from '../../src/body-physics.mjs';

//Explicit raw arena/session/controls/material inputs. This uses actual vehicle
//templates but does not stand in for41dbb0's model/render/controller constructor.
export function createSimulationVehicleFixture(program,fixture=0,{vehicleCount=1,ordinaryCount=0,models=false,interacting=false,vehicleFilters=true,effects=true,extraBodyStorage=[],additionalCollisionFilters=new Map()}={}){
 let filter;const collisionFilters=new Map([...additionalCollisionFilters,[0x41e080,(...args)=>filter(...args)]]);
 const f=createSimulationRuntimeFixture(program,fixture,{count:vehicleCount+ordinaryCount,models,collisionFilters,extraBodyStorage}),{memory,views,respawn,addresses:a,extraAddresses:b}=f,put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p);
 const filterRuntime={memory,scratchBase:0x9000-52};filter=createVehicleCollisionFilter(filterRuntime);
 f.context.nativeCollisionFilterRuntimes=[filterRuntime];
 const config=0x97000,materials=0x95000,skids=0x98000,oldSkids=0x9a000;
 const vehicleViews=createVehicleRuntimeViews({memory,bodyAt:views.bodyAt,vehicleStateFor:respawn.vehicleStateFor});
 put(0x5ecefc,config);memory[config+0x2c]=effects&&fixture%5===0?1:0;memory.writeFloatLE(effects&&fixture%2?4:0,config+0x68);memory[b.session+0x54d]=vehicleCount;put(b.session+0x57c,0);memory[b.session+0x579]=effects?fixture%3:0;memory[b.session+0x587]=0;
 put(0x90b988,materials);word(0x90929c,400);word(0x66,400);put(materials+12,effects?[0,5,6,7,8,9,14][fixture%7]:0);put(0x8495d0,skids);put(0x8495d4,skids);put(0x8495d8,skids+16*292);put(0x5ed2b8,256);put(0x5ed2c0,256);
 put(0x6e65b4,b.particles);put(0x6e65c0,0);put(0x6e65c8,0);for(let i=0;i<128;i++)put(b.particles+i*256+0xac,i<127?b.particles+(i+1)*256:0);
 put(0x902b7c,b.debrisFree);put(0x902b80,b.debrisActive);put(0x902b84,b.debris);put(0x902b88,0);put(0x902b8c,63);for(let i=0;i<64;i++)word(b.debrisFree+i*2,i);put(0x5ec958,fixture+1);put(0x5eb500,64);put(0x6f2414,0);put(0x6f2418,0);put(0x919004,0x030b00ff);
 //A wide flat authored floor supports all four actual44-unit wheel rays.
 for(let i=0;i<f.grid.sectors[0].vertices.length;i++){const v=f.grid.sectors[0].vertices[i];v[0]*=4;v[2]*=4;v.forEach((x,j)=>word(a.vertices+i*8+j*2,x));}
 f.grid.scene={segments:[{columns:f.grid.sectors[0].columns,rows:f.grid.sectors[0].rows,verticesOffset:a.vertices,packetsOffset:a.packets}],uvTable:materials};
 f.context.environment.grid.scene=f.grid.scene;
 for(let i=0;i<f.grid.sectors[0].cells.length;i++){put(a.packets+i*8+4,0);f.grid.sectors[0].cells[i].rawNormalIndex=0;}
 f.context.environment.data=memory;
 //Re-register complete vehicle template shapes in the existing physical pool.
 put(0x91e794,255);put(0x91e784,-1);put(0x91e798,0);word(0x902bc4,0);memory.fill(0,a.list,a.list+32);for(let i=0;i<256;i++)memory[memory.readUInt32LE(0x91e780)+i]=i;
 const all=f.bodies,vehicles=[];
 for(let i=0;i<all.length;i++){
  const body=all[i],p=body.address;put(p+4,0);put(p+12,a.nodes);put(p+0x148,0);
  if(i>=vehicleCount){const descriptor=Buffer.alloc(20);descriptor.writeInt32LE(2*256,12);descriptor.writeUInt16LE(1,16);views.registerShapes(p,descriptor);continue;}
  put(p,0x1c03);put(p+0xb4,0);put(p+0x2f38,64);put(p+0x664,effects&&fixture%3?0x400000:0);word(p+0x668,effects&&fixture%3?40:0);put(p+0x644,(fixture%3-1)*4096);put(p+0x650,32768);memory[p+0x64f]=fixture%2;word(p+0x65e,i);put(p+0x6bc,-1);put(p+0x148,vehicleFilters?0x41e080:0);
  const mass=[65536,98304,32768][fixture%3];put(p+0xa8,mass);put(p+0xac,Number((65536n*65536n)/BigInt(mass)));[21671,17762,31930].forEach((value,j)=>put(p+0x9c+j*4,value));
  const quaternion=[[65536,0,0,0],[46340,0,46340,0],[0,65536,0,0],[65536,0,0,0]][Math.floor(fixture/4)%4];quaternion.forEach((value,j)=>put(p+0x58+j*4,value));quaternionMatrix(quaternion).forEach((value,j)=>word(p+0xc4+j*2,value));
  put(p+0x34,(interacting?(i===0?-45:45):i*100)*65536);put(p+0x38,-(30+fixture%8)*65536);put(p+0x3c,0);put(p+0x40,interacting?(i===0?8:-8)*65536:0);put(p+0x44,0);put(p+0x48,(fixture%4)*65536);
  views.registerShapes(p,Buffer.from(template.shapes.hex,'hex'));
  const vehicle=vehicleViews.vehicleFor(p),state=vehicle.state,initial=initializeVehicleContacts();
  put(p+0x320,initial.wheelRangeQ8);initial.descriptors.forEach((d,j)=>d.raw.copy(memory,p+0x180+j*28));state.bodyRadiusQ8=initial.bodyRadiusQ8;
  Object.assign(vehicle.drive,readVehicleDriveConfiguration(fixture%7));vehicle.drive.multiplierQ16=32768;memory[p+0x64e]=fixture%3?192:0;
  state.wheels.forEach((wheel,j)=>{wheel.flags=0;wheel.spin=0;wheel.angle=0;wheel.effectFlags=0;wheel.skidRecordB8=-1;memory[wheel.address+0x9c]=i;put(oldSkids+(i*4+j)*32+26,1);});initializeWheelForceCoefficients(vehicle.body,state);
  for(const gate of state.driveEffects){gate.status=1;gate.distanceThreshold=6000;gate.clockInterval=16;gate.lastClock=0;gate.lastPosition=[0,0,0];}
  vehicles.push(vehicle);put(0x909300+i*0x30c,p);
  updateBodyDerived(vehicle.body);
 }
 f.context.vehiclePreparationStateFor=body=>vehicleViews.stateFor(body);
 f.context.environment.effectRuntime={views:vehicleViews,driveScratchBase:0x9000-56,forceScratchBase:0x9000-56};
 f.context.environment.wheelRuntime={...f.context.nativeTerrain,scratchBase:0x9000-56,roundingMode:'nearest-even'};
 //Existing actual registry handlers refer to live bodies, so republish poses.
 for(let i=0;i<f.grid.spatial.nodes.length;i++)word(a.nodes+i*12+8,0);
 for(const body of all){put(body.address+4,0);f.context.handlers.insertSpatial(body);}
 return {...f,vehicles,vehicleViews,vehicleAddresses:{config,materials,skids,oldSkids}};
}
