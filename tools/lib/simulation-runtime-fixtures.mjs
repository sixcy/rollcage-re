import {createConnectedFrameCandidateFixture} from './frame-candidate-runtime-fixtures.mjs';
import {createPhysicsRuntimeViews} from '../../src/physics-runtime-views.mjs';
import {createRespawnRuntime} from '../../src/respawn-runtime.mjs';
import {createRawTerrainGrid} from '../../src/raw-terrain-query.mjs';
import {BodySpatialRegistry,createBodySpatialSelector} from '../../src/body-spatial.mjs';
import {unpackCollisionNormal} from '../../src/collision-grid.mjs';

//Constructed native memory for full-parent comparisons. Pool/session/model/map
//addresses are declared inputs; this does not substitute a native race loader.
export function createSimulationRuntimeFixture(program,fixture=0,{models=false,count=1,breakable=false,collisionFilters=new Map(),extraBodyStorage=[]}={}) {
 const memory=program.initializeMemory(Buffer.alloc(0xa00000)),f=createConnectedFrameCandidateFixture(fixture*5+2,{memory}),a=f.addresses;
 const put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p),vector=(p,v)=>v.forEach((x,i)=>put(p+i*4,x));
 const groupLists=0x90000,shapeFree=0x45000,shapeActive=0x45100,shapeReverse=0x45200,events=0x50000,heap=0x53000,free=0x53400,session=0x75000,pack=0x78000,output=0x74000,contact=0x74100;
 //The candidate-only fixtures include deliberately inconsistent face layouts.
 //Here use an actual upward-facing flat floor so the complete parent reaches
 //contact generation and response, rather than testing only rejected queries.
 const sector=f.grid.sectors[0];
 sector.flags=1;put(a.header+4,1);
 sector.vertices.forEach((vertex,index)=>{vertex[1]=0;vertex[2]=-vertex[2];vertex[3]=0;vertex.forEach((value,axis)=>word(a.vertices+index*8+axis*2,value));});
 sector.cells.forEach((cell,index)=>{cell.forms=[{type:0,normal:0,point:null}];word(a.packets+index*8+2,0);});
 if(models)for(const {collision,settings} of f.models.instances.values()){
  for(const edge of collision.edges){edge.indices=[edge.raw[4],edge.raw[5]];edge.normalQ8=unpackCollisionNormal(edge.raw.readUInt32LE(0));}
  const {object}=f.candidateMapping.modelPointersFor({settings,shape:collision.shapes[0]});
  if(breakable){memory[object+0x198]=1;put(memory.readUInt32LE(object+0x194),0x4000000);[4096,0,0,0,4096,0,0,0,4096].forEach((v,i)=>word(object+0xc4+i*2,v));}
  Object.defineProperty(settings,'stateByte198',{get:()=>memory[object+0x198]});
  settings.configurations.forEach((configuration,index)=>Object.defineProperties(configuration,{flags:{get:()=>memory.readUInt32LE(memory.readUInt32LE(object+0x194)+index*4)},type:{get:()=>memory[memory.readUInt32LE(object+0x194)+index*4+3]&15}}));
 }
 put(0x91e780,shapeFree);put(0x91e78c,shapeActive);put(0x91e790,shapeReverse);put(0x91e794,255);put(0x91e784,-1);put(0x91e798,0);
 for(let i=0;i<256;i++)memory[shapeFree+i]=i;
 put(0x902ba4,100);put(0x902ba8,events);put(0x902bac,heap);put(0x902bb0,free);put(0x902ba0,0);put(0x902bb4,99);for(let i=0;i<100;i++)put(free+i*4,i<<20);
 put(0x902bc4,0);for(let i=0;i<65;i++){put(0x902be0+i*12,groupLists+i*132);put(0x902be4+i*12,0);put(0x902be8+i*12,0);}
 put(0x5ecb1c,session);memory[session+0x54d]=0;put(0x90b98c,pack);put(pack,a.sectors);put(a.header+12,f.grid.sectors[0].rows);
 put(0x902eec,a.bodies[0]);put(0x91cd90,0);put(0x9153d0,0);put(0x5eb5e0,fixture%2?1024:0);put(0x811180,0);put(0x90a548,fixture);
 if(!models)for(const node of f.grid.spatial.nodes){node.boundsWord&=~(7<<19);put(a.nodes+node.index*12,node.boundsWord);f.models.links.nodes[node.index].placementIndices=[];}
 const respawn=createRespawnRuntime({memory,recordCount:0,bodyStorage:[...a.bodies.map(address=>({address,length:0x4000})),...extraBodyStorage],scratchBase:0x9000});
 const views=createPhysicsRuntimeViews({memory,bodyAt:respawn.bodyAt,bodyLists:[{address:a.list,capacity:8},...Array.from({length:65},(_,i)=>({address:groupLists+i*132,capacity:33}))],bucketAt:f.bucketAt,candidateMapping:f.candidateMapping,collisionFilters});
 for(let i=0;i<count;i++) {
  const address=a.bodies[i];memory.fill(0,address,address+0x4000);put(address,0x1807);put(address+0xa8,65536);put(address+0xac,65536);put(address+0xb0,32768);put(address+0xb4,fixture%3?1000:0);put(address+0x6bc,-1);
  vector(address+0x34,[(i*12+2)*65536,-6*65536,2*65536]);vector(address+0x40,[0,(fixture%4?8:0)*65536,0]);put(address+0x58,65536);
  [4096,0,0,0,4096,0,0,0,4096].forEach((x,j)=>word(address+0xc4+j*2,x));[65536,65536,65536].forEach((x,j)=>put(address+0x9c+j*4,x));[65536,0,0,0,65536,0,0,0,65536].forEach((x,j)=>put(address+0xe4+j*4,x));
  const descriptor=Buffer.alloc(20);descriptor.writeInt32LE(2*256,12);descriptor.writeUInt16LE(1,16);views.registerShapes(address,descriptor);
 }
 const bodies=views.physicalGroup.bodies.slice(0,count),buckets=f.grid.spatial.nodes.map((_,i)=>views.bucketAt(a.nodes+i*12));for(const bucket of buckets)bucket.headId=0;
 const registry=new BodySpatialRegistry(bodies.map(body=>({body,poolOffset:body.address-a.bodies[0]})),createBodySpatialSelector(f.grid.spatial,buckets));for(const body of bodies)registry.insert(body);
 const grid=createRawTerrainGrid(f.grid,sector=>f.candidateMapping.terrainVerticesFor(sector),{memory});
 const context={environment:{data:Buffer.alloc(0),grid,modelContext:f.models},records:views.records,queue:views.queue,candidateArena:views.candidateArena,candidateGroups:views.candidateGroups,effectFlags:views.effectFlags,gravityQ16:views.gravityQ16,roundingMode:'nearest-even',timeOptionsFor:views.timeOptionsFor,selectionCounter:fixture,spatialStateFor:body=>({found:true,outside:body.spatialOutside,node:f.nodeForAddress(body.spatialBucket.address)}),staticScratch:{contact:views.contactAt(contact),tag:views.wordAt(contact+72)},queryOutput:views.outputAt(output),worldEffectState:{records:Buffer.alloc(0),count:0,originS16:[0,0,0],strength:0},nativeTerrain:{memory,views,grid},handlers:registry.handlers()};
 context.nativePhysicsStack={memory,views,scratchBase:0x9000};
 if(models)context.nativeModels={memory,views};
 const particles=0x700000,debris=0x720000,debrisFree=0x760000,debrisActive=0x761000;
 if(breakable){
  put(0x6e65b4,particles);put(0x6e65c0,0);put(0x6e65c8,0);for(let i=0;i<128;i++)put(particles+i*256+0xac,i<127?particles+(i+1)*256:0);
  put(0x902b7c,debrisFree);put(0x902b80,debrisActive);put(0x902b84,debris);put(0x902b88,0);put(0x902b8c,63);for(let i=0;i<64;i++)word(debrisFree+i*2,i);
  put(0x9153d8,0x0700aaff);put(0x5ec958,fixture+1);put(0x5eb500,32);put(0x6f2414,0);put(0x6f2418,0);
 }
 return {...f,views,respawn,bodies,context,extraAddresses:{groupLists,events,heap,free,output,contact,session,particles,debris,debrisFree,debrisActive},memory};
}
