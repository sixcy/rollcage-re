import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {emitRawAttachmentParticle,updateRawType2Attachment,updateRawAttachmentEffects,updateRawPersistentEmitters} from '../src/attachment-effects.mjs';
import {registerRawEffectSpatial} from '../src/body-retirement-effects.mjs';

export function createAttachmentEffectsFixture(fixture=0) {
 const memory=Buffer.alloc(0xa00000),put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p);
 put(0x5ecb1c,0x70000);memory[0x70552]=fixture&1;put(0x90b990,0x71000);put(0x71108,0x72000);put(0x7110c,0x73000);
 put(0x6e6b1c,fixture%7);put(0x6e6b20,0x12345678);put(0x5ec958,[0,1,-1,0x7fffffff][fixture%4]);put(0x9153d8,0x44444444);put(0x919140,0x55555555);
 const pool=0x100000,count=[1,2,8,32][fixture%4];put(0x902eec,pool);put(0x6e65b4,pool);memory.fill(0xa5,pool,pool+0x8000);
 for(let i=0;i<count;i++){const p=pool+i*256;put(p+0xac,i+1<count?p+256:0);memory[p+0x94]=0;put(p+0xb0,0);}
 put(0x909254,0x60000);put(0x909278,0x63000);
 for(let row=0;row<256;row++){word(0x60000+row*16,0xff00);word(0x60002+row*16,255);put(0x6000c+row*16,0x62000);}
 for(let id=0;id<8;id++) {
  const target=pool+0x6000+id*128;put(0x80e660+id*4,target);memory[target+0x94]=(fixture+id)&1;put(target+0x90,0x77777777);registerRawEffectSpatial(target,0,0,0,{memory});
  put(0x80f56c+id*64,Math.imul(fixture+id,0x437aab));
  for(const table of[0x72000,0x73000]) {
   const p=table+id*12;for(let axis=0;axis<3;axis++)word(p+axis*2,[0,1,-1,32767,-32768,1024,-2048][(fixture+id+axis)%7]);
   word(p+6,[0,1,2,3,32767,-32768,-1][(fixture+id)%7]);
   for(let channel=0;channel<4;channel++)memory[p+8+channel]=[0,127,128,255,16,17,32,63][(fixture+id+channel)%8];
  }
 }
 for(let index=0;index<6;index++) {
  const body=0x10000+index*0x1000;put(0x902f00+index*4,fixture%3===0?0x10000:0x10000+(index%3)*0x1000);
  for(let i=0;i<5;i++)word(body+0x16a+i*2,([0,1,2,3,4,15][Math.floor(fixture/3**i+index)%6]<<12)|((fixture+index+i)%8));
 }
 for(let i=0;i<10;i++) {
  const p=0x6ff140+i*20;for(let axis=0;axis<3;axis++)word(p+axis*2,((fixture+i+axis)*7123)&65535);
  word(p+6,[0,1,7,32767,-32768,-1][(fixture+i)%6]);for(let channel=0;channel<4;channel++)memory[p+8+channel]=[0,127,128,255,16,17,32,63][(fixture+i+channel)%8];
  put(p+12,[-1,0,1,449,450,451,1000,0x7fffffff][(fixture+i)%8]);put(p+16,[-1,0,1,4,7,65535][(fixture+i)%6]);
 }
 return {memory};
}

export async function checkAttachmentEffects(fixtures=1600) {
 const {evidence,instructions}=await readInstructionEvidence(['1061-attachment-target-update-a-assembly.json','1063-attachment-target-update-b-assembly.json','1065-attachment-emitter-assembly.json','1067-attachment-target2-emitter-assembly.json','115-effect-allocation-assembly.json','118-particle-removal-assembly.json','117-particle-registration-assembly.json','665-retirement-4286e0-assembly.json','669-retirement-4746f0-assembly.json'],{directory:'analysis/native-simulation/results'});
 const machine=new BoundedX86(instructions),ranges=[[0x10000,0x8000],[0x60000,0x14000],[0x100000,0x8000],[0x5ec958,4],[0x6e65b4,24],[0x6e6b1c,8],[0x6ff140,200],[0x80e660,32],[0x80f56c,512],[0x902eec,52],[0x9153d8,4],[0x919140,4]],visits={};let steps=0,calls=0;
 machine.onInstruction=address=>{if([0x435df0,0x4748d0,0x474670,0x44f7a0,0x44f740].includes(address))visits[address]=(visits[address]??0)+1;};
 for(let fixture=0;fixture<fixtures;fixture++)for(const entry of[0x44f3a0,0x44f990,0x44f7a0,0x44f740]) {
  const context=createAttachmentEffectsFixture(fixture),m=context.memory;machine.reset();m.copy(machine.bytes);machine.entry=entry;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);let expected;
  if(entry===0x44f3a0)updateRawAttachmentEffects(context);
  else if(entry===0x44f990)updateRawPersistentEmitters(context);
  else if(entry===0x44f740){machine.r.ECX=0x10000;machine.r.EDX=0x2000+(fixture%8);updateRawType2Attachment(machine.r.ECX,machine.r.EDX,context);}
  else {
   machine.r.ECX=0x72000+(fixture%8)*12;machine.r.EDX=[27,28,34,1][fixture%4];
   const args=[[-0x12340000,0x4000,0xffff,-32768][fixture%4],fixture%32,Math.imul(fixture,0x437aab)];
   args.forEach((value,i)=>machine.bytes.writeInt32LE(value|0,0x9004+i*4));expected=emitRawAttachmentParticle(machine.r.ECX,machine.r.EDX,...args,context);
  }
  steps+=machine.run(1_000_000);calls++;if(expected!==undefined)assert.equal(machine.r.EAX>>>0,expected);
  for(const[address,length]of ranges)assert.deepEqual(machine.bytes.subarray(address,address+length),m.subarray(address,address+length),`entry ${entry.toString(16)} fixture ${fixture} / ${address.toString(16)}`);
 }
 const report={method:'Complete44f3a0 queued attachment effects,44f990 ten persistent emitter records,44f7a0 particle creation and44f740 type2 scalar propagation with actual435df0 reuse/spatial removal,474670 registration and4286e0/4746f0 spatial lookup. No callees mocked and no external services. Full body/handle/target/queue/persistent-emitter/free-active/spatial storage and RNG compared; signed16 cadence wraps, native advancing duplicate-swap scan, first-zero handles, alltypebranches, low16 vertical argument, shift-count masking, colorsaturation and pool exhaustion/reuse covered. Explicit constructed runtime tables; no authored producer or original-process execution claim.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,fixtures,calls,instructionSteps:steps,visits:Object.fromEntries(Object.entries(visits).map(([address,count])=>[`0x${Number(address).toString(16)}`,count])),matched:true};
 await writeFile('analysis/attachment-effects-instruction-check.json',JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await checkAttachmentEffects()));
