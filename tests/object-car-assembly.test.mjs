import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {RollcageArchive} from '../src/archive.mjs';
import {getGame} from '../src/track-games.mjs';
import {createObjectCarAssemblyRuntime, buildObjectCarAssembly} from '../src/object-car-assembly.mjs';
import {loadObjectCollection, listObjectResources} from '../src/object-catalog.mjs';
import {createVehicleWheels} from '../src/vehicle-wheel-construction.mjs';
import {prepareVehicleWheelRender} from '../src/wheel-render-state.mjs';
import {loadRetainedNativeProgram} from '../tools/lib/retained-native-program.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {buildViewerBundle} from '../tools/lib/track-viewer-bundle.mjs';
import {createSession} from '../src/solo-session.mjs';

const game = getGame('rollcage'), available = existsSync(`${game.installation}/IDXData/Rollcage.idx`);
test('car assembly rejects invalid explicit pose/type input without mutating source', () => {
  for (const type of [-1,7,0.5,undefined]) assert.throws(()=>buildObjectCarAssembly(Buffer.alloc(1),type),/type0 through6/);
  assert.throws(()=>buildObjectCarAssembly(Buffer.alloc(32),0),/GFXM/);
});

test('all seven installed neutral cars retain five distinct parts, authored transforms and bundled equality', {skip:!available}, async()=>{
  const archive = await RollcageArchive.open(game.installation);
  try {
    const tracks = await game.listTracks(archive), resources = await listObjectResources(archive,game,tracks);
    const browser = runInNewContext(await buildViewerBundle('src/object-car-assembly.mjs'), {btoa,atob,TextEncoder,TextDecoder});
    for (const resource of [resources[0],...resources.filter(r=>/LEV1[67]\.BLP$/i.test(r.name))]) {
      const data = (await archive.readResource(resource.index)).data, saved = Buffer.from(data), collection = await loadObjectCollection(archive,game,resource);
      const entries = collection.entries.filter(e=>e.kind==='vehicle-assembled'); assert.equal(entries.length,7);assert.ok(entries.every(e=>e.status==='supported'));
      for (let type=0;type<7;type++) {
        const built = buildObjectCarAssembly(data,type), scene = collection.load(entries[type]);
        assert.equal(JSON.stringify(browser.buildObjectCarAssembly(data,type)),JSON.stringify(built));
        assert.deepEqual(built.meshes.map(m=>m.index),[0,1,2,3,4]);assert.equal(scene.meshes.length,5);assert.equal(scene.instances,5);
        assert.deepEqual(built.assembly.parts[0].positionQ16,[0,0,0]);
        assert.deepEqual(built.assembly.parts[0].rotationQ12,[-4096,0,0,0,4096,0,0,0,-4096]);
        const state=createObjectCarAssemblyRuntime(data,type), m=state.memory;
        for(let i=0;i<4;i++) {
          const authored=0x5eac40+i*8, offset=[0,2,4].map(o=>m.readInt16LE(authored+o)), matrix=built.assembly.parts[0].rotationQ12;
          assert.deepEqual(built.assembly.parts[i+1].positionQ16,Array.from({length:3},(_,row)=>offset.reduce((sum,v,lane)=>sum+matrix[row*3+lane]*v,0)*16));
        }
        assert.equal(new Set(scene.groups.map(g=>g.instance)).size,5);assert.equal((scene.obj.match(/^g object_/gm)??[]).length,5);
      }
      assert.deepEqual(data,saved,'installed decoded source is unchanged');
    }
  } finally {await archive.close();}
});

test('installed constructed wheel allocation and subsequent neutral render match retained x86 on all mapped nonstack bytes', {skip:!available},async()=>{
  const archive=await RollcageArchive.open(game.installation);
  try {
    const track=(await game.listTracks(archive))[0],data=(await archive.readResource(track.index)).data;
    const program=await loadRetainedNativeProgram(), machine=new BoundedX86(program.instructions,{fpuPrecisionBits:24});machine.bytes=Buffer.alloc(32*1024*1024);
    for(let type=0;type<7;type++) {
      const state=createObjectCarAssemblyRuntime(data,type), {runtime,memory,body}=state, wheelModel=memory.readUInt32LE(memory.readUInt32LE(body+0x390)+0x10);
      machine.reset();memory.copy(machine.bytes);
      const run=entry=>{machine.entry=entry;machine.r.ECX=body;machine.r.EDX=wheelModel;machine.r.ESP=runtime.scratchBase;machine.bytes.writeInt32LE(-1,runtime.scratchBase);machine.bytes.writeInt32LE(0,runtime.scratchBase+4);machine.run(3000000);};
      const compare=label=>assert.equal(machine.bytes.subarray(0x10000).equals(memory.subarray(0x10000)),true,label);
      createVehicleWheels(body,wheelModel,0,runtime);run(0x41caf0);compare(`type${type} actual constructor`);
      prepareVehicleWheelRender(body,runtime);run(0x41d2b0);compare(`type${type} subsequent render`);
      assert.deepEqual(state.readParts().map(p=>p.positionQ16),buildObjectCarAssembly(data,type).assembly.parts.map(p=>p.positionQ16));
    }
  } finally {await archive.close();}
});

test('assembled model identities and wheel placement agree with actual installed racing construction at its spawn pose', {skip:!available},async()=>{
  const archive=await RollcageArchive.open(game.installation);
  try {
    const track=(await game.listTracks(archive))[0],data=(await archive.readResource(track.index)).data,textures=(await archive.readResource(track.textureIndex)).data;
    for(let type=0;type<7;type++) {
      const session=createSession(data,textures,{vehicleType:type,aiDifficulty:2});
      try {
        const snapshot=session.snapshot,state=createObjectCarAssemblyRuntime(data,type),{body,memory,runtime}=state;
        assert.deepEqual(session.assets.modelIndices,buildObjectCarAssembly(data,type).assembly.parts.map(p=>p.modelIndex));
        snapshot.position.forEach((value,i)=>memory.writeInt32LE(Math.round(value*65536),body+0x34+i*4));
        snapshot.rotation.forEach((value,i)=>memory.writeInt16LE(Math.round(value*4096),body+0xc4+i*2));
        prepareVehicleWheelRender(body,runtime);
        state.readParts().forEach((part,index)=>{
          assert.deepEqual(part.positionQ16,snapshot.parts[index].position.map(value=>Math.round(value*65536)));
          assert.deepEqual(part.rotationQ12,snapshot.parts[index].rotation.map(value=>Math.round(value*4096)));
        });
      } finally {session.dispose();}
    }
  } finally {await archive.close();}
});
