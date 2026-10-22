import {readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import * as profile from '../src/autonomous-profile-plan.mjs';

const directory = 'analysis/native-simulation/results';
const assembly = ['380-autonomous-profile-plan-assembly.json', ...[[382,'434960'],[384,'420090'],[386,'41fd20'],[388,'41fde0'],[390,'41fe80'],[392,'41ff20'],[394,'41ff90'],[396,'41fb30'],[398,'41fa90'],[400,'41f7b0'],[402,'4201b0']].map(([id,address]) => `${id}-profile-${address}-assembly.json`)];
const {instructions,evidence} = await readInstructionEvidence(assembly, {directory});
const tables = await Promise.all(['403-profile-countdown-switch.json','404-profile-tier-switch.json','405-profile-bit200-switch.json','406-profile-proximity-switch.json','407-profile-thresholds.json'].map(async name => JSON.parse(await readFile(`${directory}/${name}`, 'utf8')).structuredContent));
const machine = new BoundedX86(instructions), memory = Buffer.alloc(0xa00000), STACK = 0x9000, SESSION = 0x50000, RECORDS = 0x909300;
let seed = 0x41f900ab, instructionSteps = 0;
const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
const signed = () => random(0x100000000) | 0;
const dword = (address,value) => memory.writeInt32LE(value | 0,address);
const gaps = [-2147483648,-131073,-65537,-32769,-32768,-32767,-16385,-16384,-8193,-8192,-4097,-4096,-3001,-3000,-2999,0,199,200,201,1000,1001,2047,2048,8192,8193,16000,16384,16385,32000,32767,32768,32769,65535,65536,2147483647];
const clocks = [0,349,350,377,378,0x7fffffff,0x80000000,0xffffffff];
const counts = new Map();
machine.onInstruction = address => {if ([0x41f900,0x434960,0x420090,0x41fd20,0x41fde0,0x41fe80,0x41ff20,0x41ff90,0x41fb30,0x41fa90,0x41f7b0,0x4201b0].includes(address)) counts.set(address,(counts.get(address) ?? 0)+1);};
const initialize = (fixture,body) => {
  memory.fill(0);
  for (const table of tables) Buffer.from(table.normalized_result.bytes_hex,'hex').copy(memory,Number(table.normalized_result.address));
  for (let index = -128; index <= 127; index++) {
    const record = RECORDS + index * 0x30c;
    dword(record,0x10000 + ((index+128)%6)*0x4000);
    memory[record+0x1c] = random(256); dword(record+0x24,gaps[(fixture+index+128)%gaps.length]);
  }
  for (let index = 0; index < 6; index++) memory[0x10000 + index*0x4000 + 0x718] = [0,8,9,10,255][(fixture+index)%5];
  memory.fill(0xa5,body,body+0x1000);
  // Repair registry pointers after a body/record alias was initialized.
  for (let index=0;index<6;index++) dword(RECORDS+index*0x30c, index===fixture%6 ? body : 0x10000+index*0x4000);
  memory.writeUInt16LE(fixture%6,body+0x65e);
  memory[body+0x6da] = fixture%4 ? fixture%6 : 255;
  dword(body+0x6dc,gaps[fixture%gaps.length]);
  dword(body+0x6ec,signed()); memory[body+0x6f0] = random(256);
  memory[body+0x6f1] = [0,1,2,3,4,5,127,254,255][fixture%9];
  memory[body+0x6f2] = 0x85;
  memory.writeInt8([-128,-1,0,1,2,127][fixture%6],body+0x6f3);
  dword(body+0x6f4,(signed() & ~0x07000000) | ((fixture%8)<<24)); dword(body+0x6f8,signed());
  dword(0x5ecb1c,SESSION); memory[SESSION+0x54d] = fixture%7;
  memory[SESSION+0x585] = fixture%3; memory[SESSION+0x586] = fixture%5; memory[SESSION+0x58c] = fixture%2;
  for (let index=0;index<6;index++) memory[SESSION+index+0x1c] = (fixture+index)%3 ? 0 : 6;
  dword(0x5ea4d4,[0,1,-1,0x7fffffff,-2147483648,signed()][fixture%6]);
  dword(0x5ea4d8,[-1,0,1,2,3][fixture%5]); dword(0x920f84,[-1,0,1,2,3,4][fixture%6]);
  dword(0x90a548,clocks[fixture%clocks.length]);
  memory.copy(machine.bytes);
};
const execute = (entry,body,mode) => {
  machine.entry=entry; machine.r.ECX=body; machine.r.EDX=mode; machine.r.ESP=STACK;
  machine.bytes.writeUInt32LE(0xffffffff,STACK);
  instructionSteps += machine.run();
};
const compare = (fixture,label,body) => {
  for(const [address,length] of [[body,0x1000],[RECORDS-128*0x30c,256*0x30c],[SESSION,0x1000],[0x5ea4c0,64],[0x90a548,4],[0x920f84,4],[0x5705f0,16]]) {
    const expected=memory.subarray(address,address+length),actual=machine.bytes.subarray(address,address+length);
    if(!actual.equals(expected)) {
      const offset=actual.findIndex((value,index)=>value!==expected[index]);
      assert.fail(`${label} fixture${fixture} firstdiff0x${(address+offset).toString(16)} native=${actual[offset]} JS=${expected[offset]}`);
    }
  }
};
const helpers = [
  [0x434960,profile.updateNearestAutonomousCompetitor,false,false],
  [0x420090,profile.updateAutonomousProfileTier,false,false],
  [0x41fd20,profile.updateAutonomousLapPolicy,false,false],
  [0x41fde0,profile.updateAutonomousGapPolicy4,true,false],
  [0x41fe80,profile.updateAutonomousGapPolicy8,true,false],
  [0x41ff20,profile.updateAutonomousPairedPolicy,true,false],
  [0x41ff90,profile.updateAutonomousTierPolicy,false,false],
  [0x41fb30,profile.updateAutonomousTrafficPolicy,false,true],
  [0x41fa90,profile.updateAutonomousGapGatePolicy,true,false],
  [0x41f7b0,profile.updateAutonomousProfileCountdown,true,false],
  [0x4201b0,profile.updateAutonomousProfileRate,false,true],
];
const helperFixtures=1600, parentFixtures=8000;
for(const [entry,fn,isState,hasMode] of helpers) for(let fixture=0;fixture<helperFixtures;fixture++) {
  const body=0x10000,mode=[0,1,-1][fixture%3]; initialize(fixture,body);
  const target=body+(isState?0x6c0:0);
  if(hasMode) fn(target,mode,{memory}); else fn(target,{memory});
  execute(entry,target,mode); compare(fixture,`helper${entry.toString(16)}`,body);
}
const aliasBodies=[0x10000,0x90a548-0x6ec,0x5ea4d4-0x6ec,0x5ea4d4-0x6f4,RECORDS];
for(let fixture=0;fixture<parentFixtures;fixture++) {
  const body=aliasBodies[Math.floor(fixture/8)%aliasBodies.length], mode=[0,1,-1][Math.floor(fixture/40)%3]; initialize(fixture,body);
  profile.updateAutonomousProfilePlan(body,mode,{memory,scratchBase:STACK}); execute(0x41f900,body,mode); compare(fixture,'parent',body);
}
const report={method:'Full scheduled41f900 and all eleven numeric/policy callees execute retained x86 without mocked calls. Each helper has1600 separate fixtures;8000 full-parent fixtures cover eight countdown profiles, byte-wrap/signed-leader cases, signed32 folded progression, early/late unsigned clocks, nonzero modes, and body aliases with runtime records, clock, RNG/profile words. Compares full4096-byte target body, all256 signed-index registry records, session, global RNG/mode/difficulty/clock, and original5705f0 thresholds. Original jump-table bytes retained independently from source switches; no original executable execution. ABI stack is separate from game-owned records/body memory.',evidence:[...evidence.map(value=>value.evidence_id),...tables.map(value=>value.evidence_id)],instructions:instructions.length,helperFixtures,helperCalls:helpers.length*helperFixtures,parentFixtures,totalCalls:helpers.length*helperFixtures+parentFixtures,aliasBodyAddresses:aliasBodies.map(value=>'0x'+value.toString(16)),calls:Object.fromEntries([...counts].map(([address,count])=>['0x'+address.toString(16),count])),instructionSteps,matched:true};
await writeFile('analysis/autonomous-profile-plan-instruction-check.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));

