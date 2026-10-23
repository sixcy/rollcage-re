import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {parseScene} from '../src/scene.mjs';
import {parseCollisionGrid} from '../src/collision-grid.mjs';
import {relocateRaceTrackPointers} from '../src/track-relocation.mjs';
import {initializeWorldPhysicsConstants,initializeRawBodyArena} from '../src/world-physics-pools.mjs';
import {initializeParticlePoolConstants,initializeRawParticlePools,initializeRawBodyDebrisPool} from '../src/particle-pools.mjs';
import {advanceRawBodyDebris,advanceRawEffectParticles} from '../src/particle-lifetime.mjs';
import {initializeDynamicLightStorage,updateDynamicLights} from '../src/dynamic-light-state.mjs';
import {publishTerrainPointStartupSeed,initializeSoloTerrainPointRuntime} from '../src/solo-terrain-point-runtime.mjs';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

const STACK=0x9000,put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
const programPromise=loadRetainedNativeProgram();
function synthetic(){
  const memory=Buffer.alloc(0xa00000),auxiliary=0x80000,sectors=0x81000,sector=0x82000,vertices=0x83000,cells=0x84000,palette=0x85000,allocation=0x88000;
  put(memory,0x90b98c,0x909240);put(memory,0x90b990,auxiliary);put(memory,0x909240,sectors);put(memory,0x909250,1);put(memory,sectors,sector);
  put(memory,sector+8,2);put(memory,sector+12,2);put(memory,sector+32,vertices);put(memory,auxiliary+0x100,cells);memory[auxiliary+0xfc]=1;put(memory,0x909270,palette);
  for(let i=0;i<9;i++){word(memory,vertices+i*8,i*3);word(memory,vertices+i*8+2,i*3+1);word(memory,vertices+i*8+4,i*3+2);word(memory,vertices+i*8+6,5<<6);}
  memory[palette+5*4+3]=60;
  return{memory,auxiliary,sectors,sector,vertices,cells,palette,allocation,runtime:{memory,scratchBase:STACK,handlers:{allocate:n=>{assert.equal(n,0x6000);return allocation;}}}};
}
function compare(memory,machine,label){
  const actual=machine.bytes.subarray(0x10000),expected=memory.subarray(0x10000);
  if(!actual.equals(expected)){const p=actual.findIndex((v,i)=>v!==expected[i]);assert.fail(`${label}:0x${(p+0x10000).toString(16)} native${actual[p]}/source${expected[p]}`);}
}
function runUntil(machine,entry,stop){
  let stopped=false;const previous=machine.onInstruction;
  machine.onInstruction=address=>{if(address===stop){stopped=true;throw Error('Declared owned-section endpoint.');}previous?.(address,machine);};
  machine.entry=entry;
  try{machine.run(1_000_000);}catch(error){if(!stopped)throw error;}finally{machine.onInstruction=previous;}
  assert.equal(stopped,true,'Actual instruction endpoint must be reached.');
}

test('startup seed and ordered prephysics restoration match exact retained caller sections including aliases',async()=>{
  const program=await programPromise,machine=new BoundedX86(program.instructions,{fpuPrecisionBits:24});
  for(const seed of[0,1,0xffffffff]){
    const f=synthetic(),session=0x70000;put(f.memory,session+0x618,seed);put(f.memory,0x5ec958,123);
    machine.reset();f.memory.copy(machine.bytes);machine.r.ECX=session;
    assert.equal(publishTerrainPointStartupSeed(session,f),seed);
    runUntil(machine,0x47eab4,0x47eabf);compare(f.memory,machine,`seed${seed}`);assert.equal(f.memory.readUInt32LE(0x5ec958),123);
  }
  for(const alias of[false,true]){
    const f=synthetic(),points=initializeSoloTerrainPointRuntime(f.runtime),base=f.allocation;
    put(f.memory,0x90b998,1);
    if(alias)put(f.memory,base,base+6);else{word(f.memory,f.vertices,999);word(f.memory,f.vertices+2,888);word(f.memory,f.vertices+4,777);}
    const x=f.memory.readUInt16LE(base+4),flags=f.memory.readUInt16LE(f.vertices+6);
    machine.reset();f.memory.copy(machine.bytes);points.restoreForPhysics();runUntil(machine,0x450fc3,0x451008);compare(f.memory,machine,`restore alias${alias}`);
    if(alias)assert.deepEqual([6,8,10].map(offset=>f.memory.readUInt16LE(base+offset)),[x,x,x]);
    else{assert.deepEqual([0,2,4].map(offset=>f.memory.readUInt16LE(f.vertices+offset)),[0,1,2]);assert.equal(f.memory.readUInt16LE(f.vertices+6),flags);}
    f.memory[f.auxiliary+0xfc]=0;put(f.memory,0x90b998,2000);put(f.memory,0x90b994,-1);
    machine.reset();f.memory.copy(machine.bytes);points.restoreForPhysics();runUntil(machine,0x450fc3,0x451008);compare(f.memory,machine,'disabled restore');
  }
});

test('point composition rejects malformed authored grids, allocation failures and live out-of-bounds rows without inventing state',()=>{
  for(const mutate of[
    f=>{f.memory[f.cells+2]=1;},f=>{f.memory[f.cells+3]=2;},f=>{word(f.memory,f.cells,2);},
    f=>{put(f.memory,f.sector+32,f.memory.length-4);},f=>{put(f.memory,0x909250,257);}
  ]){const f=synthetic();mutate(f);assert.throws(()=>initializeSoloTerrainPointRuntime(f.runtime),/grid|span|domain/);}
  const f=synthetic();f.runtime.handlers.allocate=()=>0;assert.throws(()=>initializeSoloTerrainPointRuntime(f.runtime),/failed-allocation/);
  assert.throws(()=>publishTerrainPointStartupSeed(undefined,f),/session identity/);
  const g=synthetic(),points=initializeSoloTerrainPointRuntime(g.runtime);put(g.memory,0x90b998,1025);assert.throws(()=>points.step(),/row count/);
  put(g.memory,0x90b998,1);put(g.memory,g.allocation,g.memory.length-4);assert.throws(()=>points.step(),/span/);
  assert.throws(()=>points.step({memory:Buffer.alloc(16)}),/replace/);
});

async function installedFixture(data,textures,program){
  const memory=Buffer.alloc(32*1024*1024);program.initializeMemory(memory);initializeWorldPhysicsConstants(memory);initializeParticlePoolConstants(memory);
  let heap=0xa00000;
  const allocate=n=>{const address=heap;heap+=(n+127)&~127;assert.ok(heap<=memory.length);return address;};
  const base=allocate(data.length),configuration=allocate(0x1000),session=allocate(0x1000);data.copy(memory,base);
  put(memory,0x5ecefc,configuration);memory.writeFloatLE(1,configuration+0x68);put(memory,0x5ecb1c,session);put(memory,session+0x618,1);put(memory,0x5ec958,1);
  put(memory,0x90b970,base);put(memory,0x90b990,base);
  const runtime={memory,scratchBase:STACK,allocate,handlers:{allocate},roundingMode:'nearest-even',x87PrecisionBits:24};
  const relocated=relocateRaceTrackPointers(base,base,runtime),grid=parseCollisionGrid(data),pack=memory.readUInt32LE(0x90b98c);
  put(memory,pack,memory.readUInt32LE(base+0x14));put(memory,pack+16,data.readUInt32LE(16));put(memory,0x909270,memory.readUInt32LE(base+0x4c));put(memory,0x909278,relocated.normals);
  for(const row of grid.spatial.rows)put(memory,base+row.offset+12,row.firstIndex?base+row.mapPointer:0);
  for(const row of grid.spatial.nodes)put(memory,base+row.offset+8,0);
  put(memory,0x709808,data.readInt16LE(0x11e));initializeRawBodyArena(runtime);
  put(memory,0x90b988,base+data.readUInt32LE(0x110));put(memory,0x90b984,textures.readUInt32LE(0x10));
  initializeRawBodyDebrisPool(runtime);initializeRawParticlePools(runtime);
  initializeDynamicLightStorage(runtime);
  return{memory,runtime,base,session,grid,get allocation(){return heap;}};
}
const installation='C:/Program Files (x86)/Psygnosis/Rollcage';
test('installed census identifies only both LEV8 variants and complete point/emission/consumer stages match retained instructions', {skip:!existsSync(`${installation}/IDXData/Rollcage.idx`)},async()=>{
  const program=await programPromise,archive=await RollcageArchive.open(installation),populated=[];
  const machine=new BoundedX86(program.instructions,{fpuPrecisionBits:24});
  let emittedDebris=0,emittedParticles=0,freedDebris=0,freedParticles=0,calls=0;
  machine.onInstruction=address=>{if(address===0x44aa42)emittedDebris++;if(address===0x44ab4c)emittedParticles++;if(address===0x475f01)freedDebris++;if(address===0x435ec0)freedParticles++;};
  machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX,m.bytes.readInt32LE(0x5e8890)));
  machine.externalCalls.set(0x568a50,m=>{const p=m.bytes.readUInt32LE(m.r.ESP),n=m.bytes.readUInt32LE(m.r.ESP+8);m.bytes.fill(m.bytes.readUInt32LE(m.r.ESP+4)&255,p,p+n);m.r.EAX=p;});
  try{
    const tracks=getGame('rollcage').tracks.filter(row=>!/\/LEV(?:16|17)\.BLP$/.test(row.name));assert.equal(tracks.length,36);
    for(const track of tracks){
      const{data}=await archive.readResource(track.index),scene=parseScene(data),count=data[0xfc],cells=data.readUInt32LE(0x100),unique=new Set(),sectors=new Set();
      for(let index=0;index<count;index++){
        const row=data.readUInt16LE(cells+index*4),sector=scene.segments[data[cells+index*4+2]],column=data[cells+index*4+3];
        assert.ok(sector&&row<sector.rows&&column<sector.columns);
        sectors.add(sector.index);const p=sector.verticesOffset+(row*(sector.columns+1)+column)*8;
        for(const pointer of[p,p+8,p+(sector.columns+1)*8,p+(sector.columns+2)*8])unique.add(pointer);
      }
      if(!count){assert.equal(data[0x11c],0);continue;}
      populated.push({track:track.name,cells:count,points:unique.size,ranges:data[0x11c],sectors:[...sectors]});
      assert.ok(scene.segments.every(row=>!(data[row.offset+6]&63)),'Point tracks do not overlap the authored deformer sector domain.');
      const{data:textures}=await archive.readResource(track.textureIndex),original=Buffer.from(data),f=await installedFixture(data,textures,program),allocation=f.allocation;
      put(f.memory,0x56e258,0x720000);machine.bytes=Buffer.alloc(f.memory.length);machine.reset();f.memory.copy(machine.bytes);
      machine.externalCalls.set(0x720000,m=>{assert.equal(m.bytes.readUInt32LE(m.r.ESP),0x6000);m.r.EAX=allocation;});
      publishTerrainPointStartupSeed(f.session,f);machine.r.ECX=f.session;runUntil(machine,0x47eab4,0x47eabf);compare(f.memory,machine,`${track.name}/seed`);
      const points=initializeSoloTerrainPointRuntime(f.runtime);
      const execute=entry=>{machine.entry=entry;machine.r.ESP=STACK;put(machine.bytes,STACK,-1);machine.run(3_000_000);calls++;};
      execute(0x44a5c0);compare(f.memory,machine,`${track.name}/constructor`);
      const initial=points.snapshot;assert.equal(initial.count,114);assert.deepEqual(initial.segments.map(row=>row.index),[4,5,9]);
      assert.equal(initial.emissionSeed,1);assert.notEqual(initial.constructionSeed,1);
      for(let tick=0;tick<48;tick++){
        points.restoreForPhysics();runUntil(machine,0x450fc3,0x451008);compare(f.memory,machine,`${track.name}/restore${tick}`);
        for(const row of points.snapshot.rows)assert.deepEqual(row.position,row.basePosition,'Physics sees captured XYZ, not prior presentation displacement.');
        advanceRawBodyDebris(f.runtime);execute(0x475e50);compare(f.memory,machine,`${track.name}/debris${tick}`);
        advanceRawEffectParticles(f.runtime);execute(0x438550);compare(f.memory,machine,`${track.name}/particles${tick}`);
        points.step();execute(0x44a7a0);compare(f.memory,machine,`${track.name}/points${tick}`);
        updateDynamicLights(0,f.runtime);machine.r.ECX=0;execute(0x44d960);compare(f.memory,machine,`${track.name}/dirtyAge${tick}`);
      }
      assert.notDeepEqual(points.snapshot.segments,initial.segments);assert.equal(f.memory.readUInt32LE(0x80f210),8);
      updateDynamicLights(0,f.runtime);machine.r.ECX=0;execute(0x44d960);compare(f.memory,machine,`${track.name}/dirtyDrain`);
      assert.equal(f.memory.readUInt32LE(0x80f210),0,'The actual final-substep light updater expires the dirty records without a manual clear.');
      assert.equal(points.snapshot.constructionSeed,initial.constructionSeed,'Late emission uses its independent5ec958 stream.');
      assert.ok(Object.isFrozen(initial.rows[0].position));assert.deepEqual(data,original);
    }
    assert.deepEqual(populated,[{track:'LOW/LEV8.BLP',cells:53,points:114,ranges:8,sectors:[4,5,9]},{track:'HIGH/LEV8.BLP',cells:53,points:114,ranges:8,sectors:[4,5,9]}]);
    assert.ok(emittedDebris>0&&emittedParticles>0&&freedDebris>0&&freedParticles>0);
    console.log(JSON.stringify({installedPointTracks:populated,calls,emittedDebris,emittedParticles,freedDebris,freedParticles,compared:'all mapped bytes>=10000h after constructor/restoration/debris/particles/late-point/real44d960 dirty-aging stages'}));
  }finally{await archive.close();}
});

test('retained caller order proves construction before deformation and late point writes after particle consumers',async()=>{
  const p=await readInstructionEvidence(['2457-autonomous-initializer-dispatch-assembly.json','310-race-step-parent-assembly.json','3505-terrain-point-constructor-assembly.json','3501-remaining-stage-44a7a0-assembly.json'],{directory:'analysis/native-simulation/results'});
  const listing=new Map(p.instructions.map(row=>[row.address,row]));
  for(const[address,op,args]of[[0x47eab4,'MOV',['EAX','dword ptr [ECX + 0x618]']],[0x47eaba,'MOV',['[0x005ec954]','EAX']],[0x450fb9,'CALL',['0x00494f60']],[0x450fbe,'CALL',['0x00429f30']],[0x451012,'CALL',['0x004749e0']],[0x45114b,'CALL',['0x0044a7a0']]])assert.deepEqual(listing.get(address),{address,op,args});
  const startup=p.instructions.filter(row=>row.address>=0x47ea40&&row.address<=0x47f300),calls=startup.filter(row=>row.op==='CALL').map(row=>row.args[0]);
  assert.ok(calls.indexOf('0x0044a5c0')<calls.indexOf('0x00494c80'));
  assert.ok(p.evidence.every(row=>row.subject.digest.sha256==='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5'));
});
