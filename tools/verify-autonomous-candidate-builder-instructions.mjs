import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {appendAutonomousRouteCandidates,buildAutonomousRouteCandidates} from '../src/autonomous-candidate-builder.mjs';

const {instructions,evidence}=await readInstructionEvidence(['350-autonomous-candidate-origin-assembly.json','501-autonomous-candidate-append-assembly.json','211-autonomous-next-point-assembly.json','229-autonomous-previous-point-assembly.json'],{directory:'analysis/native-simulation/results'});
const machine=new BoundedX86(instructions),memory=Buffer.alloc(0xa00000),BODY=0x10000,PACK=0x20000,GROUPS=0x21000,POINTS=0x30000,STACK=0x9000,FREE=0x8000,ROWS=0x91f1e0;
let randomSeed=0x421260ab,instructionSteps=0,compilerCookieChecks=0,fullTables=0,linkedExpansions=0;
const random=limit=>{randomSeed^=randomSeed<<13;randomSeed^=randomSeed>>>17;randomSeed^=randomSeed<<5;return(randomSeed>>>0)%limit;};
const put=(address,value)=>memory.writeInt32LE(value|0,address);
machine.externalCalls.set(0x568162,m=>{assert.equal(m.r.ECX,m.bytes.readInt32LE(0x5e8890),'compiler security cookie');compilerCookieChecks++;});
machine.externalCalls.set(0x5684da,()=>{throw Error('Unreachable compiler range-check failure reached.');});
const initialize=fixture=>{
  memory.fill(0);memory.fill(0xa5,STACK-0x300,STACK+32);memory.fill(0xa5,ROWS-32,ROWS+20*52+32);
  put(0x90b98c,PACK);put(PACK+0x60,GROUPS);put(0x5e8890,0x71b842e9);memory[BODY+0x6f1]=fixture%6;
  for(let groupIndex=0;groupIndex<32;groupIndex++){
    const group=GROUPS+groupIndex*12; memory.writeUInt16LE(1+(fixture+groupIndex)%32,group);memory[group+2]=(fixture+groupIndex)%2;memory[group+3]=(fixture+groupIndex)%3===0?128:0;memory[group+4]=(fixture+groupIndex)%3?1:0;
    const pointBase=POINTS+groupIndex*0x2000;put(group+8,pointBase);
    for(let index=0;index<512;index++){
      const point=pointBase+index*16;memory[point+8]=(fixture+index+groupIndex)%4;memory[point+10]=(fixture+index*3+groupIndex*5)%16;
      const linkA=fixture%4===0?0:(index+groupIndex+1)%8,linkB=fixture%3===0?0:(index+groupIndex+2)%8;
      put(point+12,linkA|((index*7%512)<<5)|(linkB<<14)|((index*11%512)<<19));
    }
  }
  put(FREE,[-1,0,1,3,10,19][fixture%6]);memory.copy(machine.bytes);
};
const execute=(entry,group,index,args)=>{
  machine.entry=entry;machine.r.ESP=STACK;machine.r.ECX=group;machine.r.EDX=index;machine.bytes.writeUInt32LE(0xffffffff,STACK);
  args.forEach((value,i)=>machine.bytes.writeInt32LE(value|0,STACK+4+i*4));instructionSteps+=machine.run();
};
const compare=(fixture,label)=>{
  for(const[address,length]of [[ROWS-32,20*52+64],[PACK,0x1100],[POINTS,32*0x2000],[FREE,4],[BODY,0x1000]]){
    const expected=memory.subarray(address,address+length),actual=machine.bytes.subarray(address,address+length);
    if(!actual.equals(expected)){const offset=actual.findIndex((value,index)=>value!==expected[index]);assert.fail(`${label} fixture${fixture} firstdiff0x${(address+offset).toString(16)} native=${actual[offset]} JS=${expected[offset]}`);}
  }
};
const helperFixtures=4000,parentFixtures=5000;
for(let fixture=0;fixture<helperFixtures;fixture++){
  initialize(fixture);const group=fixture%8,index=[0,1,2,31,255,256,300,511][Math.floor(fixture/8)%8],budget=fixture%17,tier=fixture%6;
  appendAutonomousRouteCandidates(group,index,FREE,budget,tier,{memory,scratchBase:STACK});execute(0x421260,group,index,[FREE,budget,tier]);compare(fixture,'append');
}
for(let fixture=0;fixture<parentFixtures;fixture++){
  initialize(fixture);const group=fixture%8,index=[0,1,2,31,255,256,300,511][Math.floor(fixture/8)%8];
  const result=buildAutonomousRouteCandidates(BODY,group,index,{memory,scratchBase:STACK});execute(0x4210b0,BODY,group,[index]);compare(fixture,'builder');assert.equal(machine.r.EAX,result);
  assert.deepEqual(machine.bytes.subarray(STACK-0x90,STACK-0x8c),memory.subarray(STACK-0x90,STACK-0x8c));
  assert.deepEqual(machine.bytes.subarray(STACK-0x84,STACK-4),memory.subarray(STACK-0x84,STACK-4));
  if(result===-1)fullTables++;if(memory.readUInt16LE(STACK-0x82)!==0)linkedExpansions++;
}
const report={method:'Full4210b0 route candidate builder and421260 descending-row append run retained x86 with actual491390/491400 walking; no game-owned callees mocked. Only compiler568162 security-cookie equality and unreachable5684da range failure are admitted ABI boundaries.4000 independent append fixtures and5000 full-builder fixtures cover group0 expansion suppression, reverse/open/cyclic groups,256+ point IDs truncated to8bit row IDs, tier-adjusted budgets0..15, exhausted capacity, retained zero-type tags, both packed links, cycles/shared groups and raw live stack visited/count memory. Compares complete20-row1040-byte candidate block with guards,32group headers,16384point records,body,free index and live visited words; builderEAX matches. No original process execution.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,helperFixtures,parentFixtures,fullTables,linkedExpansions,compilerCookieChecks,instructionSteps,matched:true};
await writeFile('analysis/autonomous-candidate-builder-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
