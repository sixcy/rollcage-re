import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {updateVehicleSurfaceDrive} from '../src/vehicle-control-state.mjs';

export async function checkVehicleSurfaceDrive() {
  const {instructions,evidence}=await readInstructionEvidence(['903-race-contact-state-assembly.json'],{directory:'analysis/native-simulation/results'});
  const machine=new BoundedX86(instructions),body=0x1000,record=0x5000,stack=0x9000,fixtures=6000;
  const source=Buffer.alloc(0x6000),gains={unchanged:0,throttle:0,released:0};let steps=0;
  for(let fixture=0;fixture<fixtures;fixture++) {
    machine.reset();source.fill(0xa5);source.writeUInt32LE(body,record);
    const input=Math.imul(fixture,0x41a7)^0x80000000;
    source.writeInt32LE(input,body+0x710);
    source.writeInt32LE([0,0x7fffffff,-0x80000000,0x7fffb000,-0x3000,-0x5000][fixture%6],body+0x6a8);
    for(let i=0;i<4;i++) {
      const p=0x3000+i*32,category=[0,1,2,255][Math.floor(fixture/5**i)%4];
      source.writeUInt32LE((fixture>>(i+1))&1?p:0,body+0x198+i*28);
      source.writeUInt32LE((Math.imul(fixture+i,0x41a7)&0xffffff00)|category,p+12);
    }
    // Exercise pointer aliasing with body storage and first-hit termination.
    if(fixture%17===0){source.writeUInt32LE(body+0x6a8-12,body+0x198);source[body+0x6a8]=1;}
    source.copy(machine.bytes);const previous=source.readInt32LE(body+0x6a8);
    updateVehicleSurfaceDrive(record,{memory:source});
    const after=source.readInt32LE(body+0x6a8);gains[after===previous?'unchanged':input&0x40?'throttle':'released']++;
    machine.r.ECX=record;machine.r.ESP=stack;machine.bytes.writeInt32LE(-1,stack);
    steps+=machine.run();assert.deepEqual(machine.bytes.subarray(0,source.length),source,`fixture ${fixture}`);
  }
  const report={method:'Actual48d680 surface-category1 drive adjustment after450e50 speed publication. All retained instructions interpreted without callees or callbacks; full supplied body, descriptor/material and record bytes compared, including low-byte-only category, throttle bit40, single adjustment with multiple contacts, signed32 overflow and material/body aliasing. No original-process execution or authored material producer claim.',evidence:evidence.map(value=>value.evidence_id),instructions:instructions.length,fixtures,instructionSteps:steps,gains,matched:true};
  await writeFile('analysis/vehicle-surface-drive-instruction-check.json',JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await checkVehicleSurfaceDrive()));
