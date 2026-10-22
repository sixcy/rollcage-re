import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import * as opponent from '../src/autonomous-opponent-candidates.mjs';
const directory='analysis/native-simulation/results';
const names=['354-autonomous-vector-integers-assembly.json',...[601,603,605,608,610,612,614,616,618].map(id=>`${id}-opponent-${({601:'4938f0',603:'493610',605:'493290',608:'491510',610:'492030',612:'4919d0',614:'493b00',616:'4914e0',618:'493eb0'})[id]}-assembly.json`),'211-autonomous-next-point-assembly.json','229-autonomous-previous-point-assembly.json','218-autonomous-route-direction-assembly.json','226-autonomous-point-passed-assembly.json','220-autonomous-route-nearest-assembly.json','223-autonomous-vector-normalize-small-assembly.json','224-autonomous-vector-normalize-large-assembly.json','232-steering-dot-assembly.json','239-steering-triple-cross-assembly.json','134-checkpoint-interpolation-assembly.json','243-steering-normalize-assembly.json'];
const own=await readInstructionEvidence(names,{directory}),math=await readInstructionEvidence(['133-sqrt-lookup-assembly.json','211-sqrt-leading-zeros-assembly.json']);
const instructions=[...own.instructions,...math.instructions],evidence=[...own.evidence,...math.evidence],machine=new BoundedX86(instructions),memory=Buffer.alloc(0xa00000),sqrt=JSON.parse(await readFile('src/sqrt-table.json','utf8'));
const thresholdEvidence=JSON.parse(await readFile(`${directory}/606-opponent-thresholds.json`,'utf8')).structuredContent;
assert.equal(opponent.initializeAutonomousOpponentTables(Buffer.alloc(0xa00000)).subarray(0x570580,0x570590).toString('hex'),thresholdEvidence.normalized_result.bytes_hex);
const BODY=0x10000,OTHER=0x14000,MODEL=0x40000,SESSION=0x50000,PACK=0x51000,GROUPS=0x52000,POINTS=0x70000,PROGRESS=0x5b000,OUTPUT=0x60000,RELATIVE=0x61000,STACK=0x9000,FREE=0x8000,RECORDS=0x909300,ROWS=0x91f1e0;
let seed=0x492d80ab,instructionSteps=0,cookieChecks=0,special1=0,special2=0,sideChanges=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},put=(address,value)=>memory.writeInt32LE(value|0,address),word=(address,value)=>memory.writeUInt16LE(value&65535,address),store=(address,values)=>values.forEach((value,i)=>put(address+i*4,value));
const visits=new Map();machine.onInstruction=address=>{if([0x493610,0x493290,0x4938f0,0x493b00,0x493eb0,0x4919d0,0x4937bf,0x493892,0x49357d].includes(address))visits.set(address,(visits.get(address)??0)+1);};
machine.externalCalls.set(0x568162,m=>{assert.equal(m.r.ECX,m.bytes.readInt32LE(0x5e8890));cookieChecks++;});machine.externalCalls.set(0x5684da,()=>{throw Error('Unreachable compiler range failure');});
const initialize=fixture=>{
 memory.fill(0);memory.fill(0x36,STACK-0x500,STACK+64);memory.fill(0x55,OUTPUT,OUTPUT+36);
 Buffer.from(thresholdEvidence.normalized_result.bytes_hex,'hex').copy(memory,0x570580);sqrt.values.forEach((value,i)=>word(0x5eb290+i*2,value));put(0x5e8890,0x17bd42a0);put(0x5ecb1c,SESSION);memory[SESSION+0x54d]=2;put(0x90b98c,PACK);put(PACK+0x60,GROUPS);
 for(let group=0;group<32;group++){
  const row=GROUPS+group*12;word(row,12);memory[row+2]=fixture%7===0?1:0;memory[row+4]=fixture%5===0?1:0;put(row+8,POINTS+group*0x1000);
  for(let index=0;index<12;index++){const p=POINTS+group*0x1000+index*16;word(p,index*20);word(p+2,fixture%11===0?index*3:0);word(p+4,(fixture%6===0?-100:group%2?-100:100)+(fixture%9===0?index*index:0));put(p+12,((group*2+1)%32)|(((group*2+2)%32)<<14));}
 }
 for(const[index,body]of [BODY,OTHER].entries()){
  put(body+0x10,MODEL);word(body+0x65e,index);put(body+0x664,(30+index*(fixture%3-1)*10)*65536);word(body+0x668,300+index*(fixture%4)*10);word(body+0xc4,0);word(body+0xca,0);word(body+0xd0,4096);word(body+0xc8,4096);word(body+0xce,0);word(body+0xd4,0);
  store(body+0x34,[100*65536,0,0]);store(body+0x68,[(index?30:20+(fixture%3)*10)*65536,0,fixture%13===0?65536:0]);put(body+0x6bc,fixture%8===0?-1:0);put(body+0x3d00,index*(fixture%3));word(body+0x6c0,1+index);word(body+0x6c2,3);memory[body+0x718]=index?([8,10,9][fixture%3]):8;
  const record=RECORDS+index*0x30c;put(record,body);put(record+0x54,PROGRESS+index*16);memory[PROGRESS+index*16+5]=index+1;word(record+0x58,3);memory[record+0x1c]=0;put(record+0x24,index?[-1499,-1500,1][fixture%3]:0);
 }
 word(MODEL+0x32,[10,20,50,100][fixture%4]);memory[BODY+0x6f1]=fixture%6;put(BODY+0x6f8,(fixture%8)<<12);put(BODY+0x6ec,[0,1,2,0x20,0x23][fixture%5]);word(BODY+0x6fe,fixture%2?6000:0);
 const relative=[[0,0,30*65536],[40*65536,0,20*65536],[-40*65536,0,20*65536],[300*65536,0,0],[-300*65536,0,0],[1900*65536,0,0],[2100*65536,0,0]][fixture%7];store(RELATIVE,relative);relative.forEach((value,i)=>put(OTHER+0x34+i*4,(get(BODY+0x34+i*4)+value)|0));
 memory[BODY+0x6c9]=fixture%2;memory[BODY+0x6ca]=fixture%3;memory[BODY+0x6cb]=fixture%4===0?1:0;
 for(let i=0;i<20;i++){const row=ROWS+i*52;word(row,i%4?i%3+1:0);memory[row+38]=i%9===0?1:0;store(row+4,[65536,0,0]);put(row+44,i*7);}
 put(FREE,fixture%9===0?-1:19);memory[0x6e650f]=fixture%23;memory.copy(machine.bytes);
};
const get=address=>memory.readInt32LE(address);
const execute=(entry,ecx,edx,args=[])=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=STACK;machine.bytes.writeUInt32LE(0xffffffff,STACK);args.forEach((value,i)=>machine.bytes.writeInt32LE(value|0,STACK+4+i*4));instructionSteps+=machine.run();};
const compare=(fixture,label)=>{
 for(const[address,length]of [[BODY,0x8000],[MODEL,64],[SESSION,0x1000],[PACK,0x1100],[POINTS,0x20000],[PROGRESS,32],[RECORDS,6*0x30c],[OUTPUT,36],[RELATIVE,12],[FREE,4],[ROWS-32,0x500],[0x6e650f,1],[0x6e6cc0,8],[0x7136d0,128],[0x80df20,104],[0x570580,16]]){
  const actual=machine.bytes.subarray(address,address+length),expected=memory.subarray(address,address+length);if(!actual.equals(expected)){const offset=actual.findIndex((value,i)=>value!==expected[i]);assert.fail(`${label} fixture${fixture} firstdiff0x${(address+offset).toString(16)} native=${actual[offset]} JS=${expected[offset]}`);}
 }
};
const fixtures=1800;
for(let fixture=0;fixture<fixtures;fixture++){
 for(const entry of [0x4919d0,0x493eb0,0x493b00,0x4938f0,0x493610,0x493290,0x492d80]){
  initialize(fixture);const options={memory,scratchBase:STACK},distance=[100,250,499,500,1000,2000][fixture%6],time=[500,1001,2001,3999,4000,7999,8000,65537][fixture%8];let result;
  if(entry===0x4919d0){result=opponent.measureAutonomousRouteCurvature(1,fixture%12,OUTPUT,OUTPUT+12,OUTPUT+24,options);execute(entry,1,fixture%12,[OUTPUT,OUTPUT+12,OUTPUT+24]);assert.equal(machine.r.EAX,result,JSON.stringify({fixture,entry:entry.toString(16),native:[0,4,8,12,16,20,24,28,32].map(o=>machine.bytes.readInt32LE(OUTPUT+o)),js:[0,4,8,12,16,20,24,28,32].map(o=>get(OUTPUT+o))}));}
  else if(entry===0x493eb0){result=opponent.measureAutonomousRouteSide(1,fixture%12,fixture%2,BODY+0x34,options);execute(entry,1,fixture%12,[fixture%2,BODY+0x34]);assert.equal(machine.r.EAX,result,JSON.stringify({fixture,entry:entry.toString(16),native:[0,4,8,12,16,20,24,28,32].map(o=>machine.bytes.readInt32LE(OUTPUT+o)),js:[0,4,8,12,16,20,24,28,32].map(o=>get(OUTPUT+o))}));}
  else if(entry===0x493b00){result=opponent.hasAutonomousRouteSideChange(BODY,options);execute(entry,BODY,0);assert.equal(machine.r.EAX,result,JSON.stringify({fixture,entry:entry.toString(16),native:[0,4,8,12,16,20,24,28,32].map(o=>machine.bytes.readInt32LE(OUTPUT+o)),js:[0,4,8,12,16,20,24,28,32].map(o=>get(OUTPUT+o))}));sideChanges+=result;}
  else if(entry===0x4938f0){const collisionRelative=fixture%3===0?ROWS+52+44:RELATIVE;opponent.scoreAutonomousOpponentCollision(BODY,OTHER,collisionRelative,distance,time,2,options);execute(entry,BODY,OTHER,[collisionRelative,distance,time,2]);}
  else if(entry===0x493610){opponent.appendAutonomousOpponentAvoidance(RECORDS,RECORDS+0x30c,RELATIVE,distance<<16,20,fixture%2?0:100*65536,time,FREE,options);execute(entry,RECORDS,RECORDS+0x30c,[RELATIVE,distance<<16,20,fixture%2?0:100*65536,time,FREE]);}
  else if(entry===0x493290){opponent.appendAutonomousOpponentFollow(RELATIVE,distance,RECORDS,RECORDS+0x30c,FREE,options);execute(entry,RELATIVE,distance,[distance,RECORDS,RECORDS+0x30c,distance,FREE]);}
  else{opponent.updateAutonomousOpponentCandidates(BODY,FREE,options);execute(entry,BODY,FREE);}
  compare(fixture,entry.toString(16));for(let i=0;i<20;i++){if(memory[ROWS+i*52+37]===1)special1++;if(memory[ROWS+i*52+37]===2)special2++;}
 }
}
const aliasFixtures=40,aliasBody=0x6e650f-0x6f9;
for(let fixture=0;fixture<aliasFixtures;fixture++){
 initialize(fixture);memory.copy(memory,aliasBody,BODY,BODY+0x4000);put(RECORDS,aliasBody);
 put(aliasBody+0x6f8,7<<12);put(aliasBody+0x6ec,0);memory[aliasBody+0x6f1]=0;word(aliasBody+0x6fe,50);memory[aliasBody+0x6c9]=0;memory[aliasBody+0x6cb]=0;memory[OTHER+0x718]=10;put(FREE,19);
 memory[GROUPS+12+2]=0;for(const index of[3,4]){word(POINTS+0x1000+index*16+2,0);word(POINTS+0x1000+index*16+4,-100);}put(aliasBody+0x6bc,0);
 store(OTHER+0x34,[get(aliasBody+0x34),0,30*65536]);memory.copy(machine.bytes);
 opponent.updateAutonomousOpponentCandidates(aliasBody,FREE,{memory,scratchBase:STACK});execute(0x492d80,aliasBody,FREE);compare(fixture,'profile-counter-alias');
 assert.deepEqual(machine.bytes.subarray(aliasBody,aliasBody+0x4000),memory.subarray(aliasBody,aliasBody+0x4000));assert.equal(memory[0x6e650f],1);
}
const report={method:'Full492d80 opponent scan and4938f0 collision score,493610 avoidance insertion,493290 follow insertion,4919d0 curvature,493b00 linked-route side BFS and493eb0 side determinant, with actual route walkers/directions/normalizers/cross/dot/division/root. Only compiler security-cookie equality and unreachable range failure admitted ABI boundaries. Synthetic mapped body/session/model/progression/route memory; no game-owned callees mocked or original process executed.',evidence:[...evidence.map(value=>value.evidence_id),thresholdEvidence.evidence_id],instructions:instructions.length,fixtures,aliasFixtures,calls:fixtures*7+aliasFixtures,sideChanges,special1,special2,visits:Object.fromEntries([...visits].map(([p,n])=>['0x'+p.toString(16),n])),cookieChecks,instructionSteps,matched:true};await writeFile('analysis/autonomous-opponent-candidates-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));




