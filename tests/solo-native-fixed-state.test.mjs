import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {RollcageArchive} from '../src/archive.mjs';
import {createSession} from '../src/solo-session.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';

const installation='C:/Program Files (x86)/Psygnosis/Rollcage';
test('six Expert Racingtest cars publish genuine last-route velocity-root state over200installed ticks',{skip:!existsSync(`${installation}/IDXData/Rollcage.idx`)},async t=>{
  const vector=await readInstructionEvidence(['227-autonomous-vector-length-assembly.json'],{directory:'analysis/native-simulation/results'}),root=await readInstructionEvidence(['221-fixed-sqrt-assembly.json']),machine=new BoundedX86([...vector.instructions,...root.instructions]),archive=await RollcageArchive.open(installation);let samples=0,nonzero=0,session;
  try{
    const {data}=await archive.readResource(30),{data:textures}=await archive.readResource(31),original=Buffer.from(data),originalTextures=Buffer.from(textures);
    session=createSession(data,textures,{vehicleTypes:[0,1,2,3,4,5],aiDifficulty:2,onDebugFrame:frame=>{
      if(frame.stage!=='after-controls')return;assert.ok(Object.isFrozen(frame));assert.equal(frame.cars.length,6);assert.ok(Number.isInteger(frame.nativeSqrtInputQ16));assert.ok(Number.isInteger(frame.nativeSqrtLeadingZeros));
      const last=frame.cars.at(-1);if(!(last.aiMode6c4&0x4000))return;
      //Independent retained41c9c0→41ca60. The debug observer owns only
      //these interpreter bytes; no session decision or answer is supplied.
      machine.reset();last.linearVelocityQ16.forEach((value,index)=>machine.bytes.writeInt32LE(value>>4,0x10000+index*4));machine.entry=0x41c9c0;machine.r.ECX=0x10000;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);machine.run();
      assert.equal(frame.nativeSqrtInputQ16,machine.bytes.readInt32LE(0x91d45c),`Native root input tick${frame.tick}`);assert.equal(frame.nativeSqrtLeadingZeros,machine.bytes.readInt32LE(0x91d460),`Native CLZ tick${frame.tick}`);samples++;if(frame.nativeSqrtInputQ16)nonzero++;
    }});
    for(let tick=0;tick<200;tick++)session.step();assert.equal(session.snapshot.ticks,200);assert.equal(session.snapshot.aiDifficulty,2);assert.ok(samples>0,'The actual last-car route pass must be observed.');assert.ok(nonzero>0,'A standing zero-vector fixture cannot satisfy this installed race check.');assert.deepEqual(data,original);assert.deepEqual(textures,originalTextures);t.diagnostic(`${samples} actualroute samples,${nonzero} nonzeroinputs in200ticks.`);
  }finally{session?.dispose();await archive.close();}
});
