import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import * as effects from '../src/wheel-effects.mjs';
const directory='analysis/native-simulation/results';
const files=['715-wheel-traction-effects-assembly.json','717-wheel-rear-emission-assembly.json','719-wheel-surface-particles-assembly.json',...[[811,'483e60'],[813,'483c80'],[815,'483d10'],[817,'4365a0'],[819,'475c30'],[822,'483f10'],[824,'475bc0'],[826,'4334b0'],[828,'484020']].map(([id,p])=>`${id}-wheel-effects-${p}-assembly.json`),'665-retirement-4286e0-assembly.json','669-retirement-4746f0-assembly.json','115-effect-allocation-assembly.json','118-particle-removal-assembly.json','117-particle-registration-assembly.json','232-steering-dot-assembly.json','239-steering-triple-cross-assembly.json','134-checkpoint-interpolation-assembly.json','243-steering-normalize-assembly.json'];
const own=await readInstructionEvidence(files,{directory}),math=await readInstructionEvidence(['152-vector-length-assembly.json','221-fixed-sqrt-assembly.json','133-sqrt-lookup-assembly.json','211-sqrt-leading-zeros-assembly.json']),evidence=[...own.evidence,...math.evidence],instructions=[...own.instructions,...math.instructions];
const tables=await Promise.all(['820-wheel-effects-surface-switch.json','829-wheel-effects-debris-switch.json','830-wheel-effects-matrix-scale.json','831-wheel-effects-quality-threshold.json'].map(async f=>JSON.parse(await readFile(`${directory}/${f}`,'utf8')).structuredContent));
const machine=new BoundedX86(instructions),memory=Buffer.alloc(0xa00000),sqrt=JSON.parse(await readFile('src/sqrt-table.json','utf8'));
const BODY=0x10000,WHEEL=0x20000,CONFIG=0x30000,DESCRIPTORS=0x32000,GATE=0x33000,POSITION=0x34000,DIRECTION=0x34100,SKIDS=0x35000,OLD=0x36000,CURRENT=0x36200,ROWS=0x40000,INDICES=0x43000,BUCKET=0x45000,FREE=0x46000,ACTIVE=0x46100,PARTICLES=0x100000,DEBRIS=0x110000,STACK=0x9000;
let seed=0x483b90ab,instructionSteps=0,particles=0,debris=0,merges=0,segments=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p),store=(p,v)=>v.forEach((x,i)=>put(p+i*4,x));
machine.onInstruction=address=>{if(address===0x436698)particles++;if(address===0x475d96)debris++;if(address===0x483feb)merges++;if(address===0x483c80)segments++;};
const initialize=fixture=>{
 memory.fill(0);memory.fill(0x36,STACK-0x300,STACK+64);for(const t of tables)Buffer.from(t.normalized_result.bytes_hex,'hex').copy(memory,Number(t.normalized_result.address));sqrt.values.forEach((v,i)=>word(0x5eb290+i*2,v));
 put(0x5ecefc,CONFIG);memory[CONFIG+0x2c]=fixture%5===0?0:1;memory.writeFloatLE([0,3.9,4,5,NaN][fixture%5],CONFIG+0x68);put(0x909300,BODY);
 store(BODY+0x34,[20*65536,0,0]);store(BODY+0x68,[fixture%3*65536,0,fixture%7?0:-65536]);put(BODY+0x664,[0x1ffff,0x20000,0x100000,0x200000][fixture%4]);memory[BODY+0x64f]=fixture%2;
 for(let i=0;i<9;i++)word(BODY+0xc4+i*2,fixture%3===0?(i%4===0?4096:0):random(16385)-8192);
 for(let index=2;index<4;index++){const descriptor=DESCRIPTORS+(index-2)*16;put(BODY+0x198+index*28,fixture%11===0?0:descriptor);memory[descriptor+12]=[5,6,8,9,14,7][(fixture+index)%6];const wheel=BODY+0x324+index*200;memory[wheel]=fixture%13===0?0:1;store(wheel+0x60,[65536,fixture%2? -65536:0,0]);}
 store(WHEEL+0x10,[65536,0,0]);store(WHEEL+0x1c,[0,0,0]);store(WHEEL+0x40,[65536,0,0]);store(WHEEL+0xac,[fixture%4===0?0:65536,0,0]);put(WHEEL+0x58,[0,0x15ffff,0x160000,-2147483648][fixture%4]);memory[WHEEL+0x9c]=0;memory[WHEEL+0x9e]=fixture%2;
 word(WHEEL+0xa0,10);word(WHEEL+0xa2,0);word(WHEEL+0xa4,0);put(WHEEL+0xa8,(fixture%2?0x8000:0)|0x12000000);put(WHEEL+0xb8,fixture%3===0?-1:OLD);
 put(0x8495d4,SKIDS);put(0x8495d0,SKIDS+(fixture%4)*0x124);put(0x8495d8,SKIDS+4*0x124);memory.fill(0x55,SKIDS,SKIDS+4*0x124);
 for(const p of[OLD,CURRENT]){word(p,0);word(p+2,0);word(p+4,0);word(p+12,10);word(p+14,0);word(p+16,0);word(p+26,1);}
 const lengths=[0,1,10,24,47,48,49,32767];word(OLD+12,lengths[fixture%8]);word(CURRENT,10);word(CURRENT+12,20);word(CURRENT+14,fixture%4===0?10:0);
 store(POSITION,[65536*4,0,0]);store(DIRECTION,[fixture%3?0:-65536,65536,0]);put(GATE,fixture%4===0?1:0);put(GATE+4,fixture%3?0:0x7fffffff);put(GATE+8,fixture%2?5:100);put(GATE+12,fixture%13);store(GATE+16,[fixture%4*65536,0,0]);put(0x90a548,fixture%21);
 put(0x5ed2b8,[0,128,256,400][fixture%4]);put(0x5ed2c0,[0,128,256,512][fixture%4]);put(0x811180,fixture%3);put(0x811184,fixture%2?BODY:0);put(0x81118c,32768);put(0x919004,0x030b00ff|(fixture%12)<<16);put(0x5ec958,[0,1,0x7fffffff,-1,random(0x100000000)][fixture%5]);
 put(0x909254,ROWS);put(0x909278,BUCKET);for(let i=0;i<256;i++){word(ROWS+i*16,0xff00);put(ROWS+i*16+12,INDICES);}if(fixture%7===0)put(ROWS+128*16+12,0);
 put(0x902eec,PARTICLES);put(0x6e65b4,PARTICLES);for(let i=0;i<4;i++)put(PARTICLES+i*256+0xac,i<3?PARTICLES+(i+1)*256:0);
 put(0x902b7c,FREE);put(0x902b80,ACTIVE);put(0x902b84,DEBRIS);put(0x902b88,0);put(0x902b8c,fixture%33-1);for(let i=0;i<32;i++)word(FREE+i*2,i);
 memory.copy(machine.bytes);
};
const execute=(entry,ecx,edx=0,args=[])=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=STACK;machine.bytes.writeUInt32LE(0xffffffff,STACK);args.forEach((v,i)=>machine.bytes.writeInt32LE(v|0,STACK+4+i*4));instructionSteps+=machine.run();};
const compare=(fixture,label)=>{
 for(const[p,n]of[[BODY,0x4000],[WHEEL,0x100],[GATE,28],[POSITION,0x110],[SKIDS,4*0x124],[OLD,0x220],[BUCKET,16],[FREE,0x200],[PARTICLES,0x12000],[0x8495d0,12],[0x919004,4],[0x5ec958,4],[0x902b7c,20],[0x6e65b4,24],[0x91cdc0,48],[0x91d360,20],[0x91d3e4,8],[0x91d448,12]]){
  const native=machine.bytes.subarray(p,p+n),js=memory.subarray(p,p+n);if(!native.equals(js)){const i=native.findIndex((v,i)=>v!==js[i]);assert.fail(`${label} fixture${fixture} diff0x${(p+i).toString(16)} native=${native[i]} JS=${js[i]}`);}
 }
};
const fixtures=1200;
for(let fixture=0;fixture<fixtures;fixture++)for(const entry of[0x483b90,0x436630,0x42c590,0x483f10,0x4365a0,0x475c30]){
 initialize(fixture);const options={memory,scratchBase:STACK};
 if(entry===0x483b90){const strength=[0,0x40000,0x40001,0xe0000,0xe0001,0x1b0000,0x1b0001][fixture%7],surface=[-1,0,1,2,3][fixture%5];effects.updateWheelTractionEffects(WHEEL,strength,surface,options);execute(entry,WHEEL,strength,[surface]);}
 else if(entry===0x436630){const intensity=[0,2,3,31,32,-1][fixture%6],gate=fixture%5===0?0:GATE;effects.emitWheelRearParticle(BODY,POSITION,DIRECTION,0x704040,intensity,gate,options);execute(entry,BODY,POSITION,[DIRECTION,0x704040,intensity,gate]);}
 else if(entry===0x42c590){effects.emitWheelSurfaceParticles(BODY,options);execute(entry,BODY);}
 else if(entry===0x483f10){put(WHEEL+0xb8,CURRENT);memory.copy(machine.bytes);const result=effects.mergeWheelSkidSegment(WHEEL,fixture%9===0?-1:OLD,options);execute(entry,WHEEL,fixture%9===0?-1:OLD);assert.equal(machine.r.EAX,result);}
 else if(entry===0x4365a0){const result=effects.permitWheelEmission(POSITION,GATE,options);execute(entry,POSITION,GATE);assert.equal(machine.r.EAX,result);}
 else{const kind=[17,18,19,20,21,22,23,24,25,0][fixture%10];effects.emitWheelSurfaceDebris(POSITION,DIRECTION,kind,options);execute(entry,POSITION,DIRECTION,[kind]);}
 compare(fixture,entry.toString(16));
}
const aliasFixtures=48;
for(let fixture=0;fixture<aliasFixtures;fixture++)for(const entry of[0x4365a0,0x436630,0x42c590]){
 initialize(fixture);const options={memory,scratchBase:STACK};
 if(entry===0x42c590){
  const body=0x91d360-0xc4;memory.copy(memory,body,BODY,BODY+0x4000);put(0x909300,body);memory.copy(machine.bytes);
  effects.emitWheelSurfaceParticles(body,options);execute(entry,body);
  assert.deepEqual(memory.subarray(body,body+0x4000),machine.bytes.subarray(body,body+0x4000),`surface matrix/body alias fixture${fixture}`);
 }else{
  const position=GATE+(fixture%2?4:8),direction=GATE;put(GATE,1);memory.copy(machine.bytes);
  if(entry===0x4365a0){const result=effects.permitWheelEmission(position,GATE,options);execute(entry,position,GATE);assert.equal(machine.r.EAX,result);}
  else{effects.emitWheelRearParticle(BODY,position,direction,0x704040,-1,GATE,options);execute(entry,BODY,position,[direction,0x704040,-1,GATE]);}
 }
 compare(fixture,`${entry.toString(16)} alias`);
}
const report={method:'Complete 483b90 traction/skid-ring graph, 436630 four-argument rear particle emission and 4365a0 temporal/spatial gate, 42c590 surface emission plus 4334b0 signed-short transform and 475c30 debris/color producers. Actual length/root/divide/cross/dot, 435df0 particle allocation/reuse, 4748d0 removal, 474670 insertion and 4286e0/4746f0 spatial selection. No mocked callees or original process execution. Native original switch/float constants retained independently; compares complete raw bodies, wheel, gate, skid ring/pointers, particle/debris pools, spatial/free/active lists, RNG, renderer matrix/int/float/output scratch, and frame rollover. Explicit position/gate/direction and matrix/body alias fixtures preserve consumed native writes; arbitrary saved-register stack garbage is not a public output contract.',evidence:[...evidence.map(x=>x.evidence_id),...tables.map(x=>x.evidence_id),sqrt.evidence],instructions:instructions.length,fixtures,aliasFixtures,calls:fixtures*6+aliasFixtures*3,particles,debris,merges,segments,instructionSteps,matched:true};await writeFile('analysis/wheel-effects-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
