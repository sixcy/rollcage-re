import {createSimulationRuntimeFixture} from './simulation-runtime-fixtures.mjs';
import {initializeModelContactFragments} from '../../src/model-contact-effects.mjs';
import {registerRawBodySpatial} from '../../src/raw-body-construction.mjs';
import {removeBodySpatial} from '../../src/body-retirement.mjs';

export function createModelContactEffectFixture(program,fixture=0,{initialize=true}={}){
 const f=createSimulationRuntimeFixture(program,fixture,{models:true,breakable:true}),{memory}=f,put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p);
 const fragments=0x770000,materialPack=0x79000,materials=0x7a000,groups=0x7b000,mesh=0x7c000,scripts=0x7d000;
 put(0x90b990,materialPack);word(materialPack+0x2e,0);put(0x90b988,materials);put(materials+0x4d0,0x12345678);put(materials+0x4d4,0xabcdef01);put(materials+0x4d8,0x10203040);
 put(0x70dcf4,fragments-memory.readUInt32LE(0x902eec));put(0x909294,groups);put(0x909290,mesh);put(0x9092b4,scripts);memory.fill(0x5a,fragments,fragments+0x6000);
 if(initialize)initializeModelContactFragments({memory});
 for(let i=0;i<3;i++){
  const object=0x250000+i*0x1000;word(object+0x190,i);word(object+0x18e,i*4);memory[object+0x19b]=i;
  Object.defineProperty(f.models.instances.get(i).settings,'class',{get:()=>memory[object+0x19a]});
  memory[groups+i*16+6]=(fixture+i)%5;word(scripts+i*2,0xffff);word(object+0x16a,0x5000|i);word(object+0x16c,0);
  [65536,-2*65536,3*65536].forEach((v,axis)=>put(object+0x40+axis*4,v));
  for(let shape=0;shape<4;shape++){
   memory[mesh+(i*4+shape)*8+3]=2+(fixture+shape)%11;
   const configuration=memory.readUInt32LE(object+0x194)+shape*4;put(configuration,((fixture+shape)%3===0?4:2)<<24);
  }
  registerRawBodySpatial(object,{memory});
 }
 f.context.handlers={...f.context.handlers,removeSpatial:body=>removeBodySpatial(body.address,{memory}),insertSpatial:body=>registerRawBodySpatial(body.address,{memory})};
 return {...f,put,word,effectAddresses:{fragments,materialPack,materials,groups,mesh,scripts}};
}

export function modelContactEffectComparisonRanges(f){
 const{addresses:a,extraAddresses:b,effectAddresses:c}=f;
 return [[0x250000,0x3000],[c.fragments,0x6000],[0x810924,24],[c.groups,48],[c.mesh,128],[c.scripts,16],[0x70dcf4,4],[0x5ec958,4],[a.nodes,36],[b.particles,128*256],[b.debris,64*128],[b.debrisFree,0x1100],[0x6e65b4,24],[0x902b7c,20],[0x9153cc,0x30],[0x919020,288],[0x91d360,0x104],[0x920800,48],[0x80f20c,4],[0x10000,0x4000],[0x91ff80,0x140],[0x9205a0,0x250],[0x91cdc0,48]];
}
