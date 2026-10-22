import {createSimulationVehicleFixture} from './simulation-vehicle-fixtures.mjs';
import {createVehicleConstructionFixture} from './vehicle-construction-fixtures.mjs';
import {registerRawBodySpatial} from '../../src/raw-body-construction.mjs';
import {removeBodySpatial} from '../../src/body-retirement.mjs';

//Install constructed asset/session inputs while retaining the actual terrain,
//shape/event pools and spatial mappings of the connected physics fixture.
export function createVehicleConstructionPhysicsFixture(program,fixture=0,{heapBase=0x400000}={}){
 const body=0x200080,f=createSimulationVehicleFixture(program,fixture,{vehicleCount:0,extraBodyStorage:[{address:body,length:0x4000}]}),c=createVehicleConstructionFixture(program,fixture),m=f.memory,d=(p,v)=>m.writeInt32LE(v|0,p),a=c.addresses;
 c.memory.copy(m,a.session,a.session,a.session+0xc0000);c.memory.copy(m,0xa0000,0xa0000,0xac000);c.memory.copy(m,0x5ecfc4,0x5ecfc4,0x5ed00c);
 const pack=m.readUInt32LE(0x90b98c),relocated={models:0x530000,lookup:0x520000,spawns:0x540000,checkpoint:0x550000,checkpointIds:0x560000,groups:0x570000,points:0x580000,aux:0x590000,materials:0x5a0000};
 for(const[key,length]of[['models',48],['lookup',2048],['spawns',48],['checkpoint',60],['checkpointIds',12],['groups',36],['points',0x300],['aux',0x40],['materials',4096]])c.memory.copy(m,relocated[key],a[key],a[key]+length);
 for(const[o,key]of[[0x18,'models'],[0x58,'lookup'],[0x48,'spawns'],[0x70,'checkpoint'],[0x90,'checkpointIds'],[0x60,'groups']])d(pack+o,relocated[key]);m[pack+0x44]=3;m[pack+0x46]=3;for(let i=0;i<3;i++)d(relocated.groups+i*12+8,relocated.points+i*0x100);
 d(0x5ecb1c,a.session);d(0x90b990,relocated.aux);d(0x90b988,relocated.materials);d(0x70dcf4,body-m.readUInt32LE(0x902eec));d(0x6e6b44,0);d(0x7130b8,0);d(0x82e900,0);d(0x5ed008,fixture+123);d(0x56e258,0xf0000000);m[a.session+0x54d]=1;m[a.session+0x54e]=0;m[a.session+0x551]=0;m[a.session]=8;m[a.session+0x1c]=fixture%6;m[a.session+0x10]=0;
 //The material categories are upstream texture metadata; choose plain material
 //for these constructor-to-physics cases, leaving effect branches to the other
 //populated vehicle parent oracle.
 for(let i=0;i<256;i++)d(relocated.materials+i*16+12,0);f.grid.scene.uvTable=relocated.materials;
 let cursor=heapBase;const allocate=(size,runtime)=>{const pointer=cursor;cursor+=(size+15)&~15;return pointer;};
 const runtime={memory:m,scratchBase:0x9000,handlers:{allocate}};
 const finish=()=>{const vehicle=f.vehicleViews.vehicleFor(body);f.context.vehiclePreparationStateFor=value=>f.vehicleViews.stateFor(value);f.context.environment.effectRuntime.views=f.vehicleViews;f.context.handlers.removeSpatial=value=>removeBodySpatial(value.address,{memory:m});f.context.handlers.insertSpatial=value=>registerRawBodySpatial(value.address,{memory:m});return[vehicle];};
 return{...f,construction:{body,record:a.record,index:0,runtime,finish,relocated}};
}
