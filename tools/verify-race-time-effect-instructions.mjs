import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import * as source from '../src/race-time-effect.mjs';
export async function verifyRaceTimeEffect({fixtures=3000,lifecycles=24,output='analysis/race-time-effect-instruction-check.json'}={}){
 const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),executed=new Set(),visits={};let steps=0,calls=0;machine.onInstruction=p=>{executed.add(p);if([0x48c120,0x48c2a0,0x40f5d0,0x430890,0x47c2d0].includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
 const execute=(entry,ecx=0,edx=0)=>{machine.entry=entry;machine.r.ECX=ecx;machine.r.EDX=edx;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);steps+=machine.run(300000);calls++;return{eax:machine.r.EAX,ecx:machine.r.ECX,edx:machine.r.EDX};};
 const compare=(memory,label)=>{const a=machine.bytes.subarray(0x10000),b=memory.subarray(0x10000);if(!a.equals(b)){const o=a.findIndex((v,i)=>v!==b[i]);assert.fail(`${label} diff${(0x10000+o).toString(16)} native${a[o]} JS${b[o]}`);}};
 let seed=0x48c120ab;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed|0;},modes=['nearest-even','toward-zero','down','up'];
 const fixtureFor=i=>{const memory=program.initializeMemory(Buffer.alloc(0xa00000)),d=(p,v)=>memory.writeInt32LE(v|0,p),session=0x80000;d(0x5ecb1c,session);memory[session+0x54d]=i%7;d(0x5ea4d8,[-1,0,1,2,3][i%5]);d(0x5ea4d4,random());d(0x90a548,random());d(0x5ed024,i%5===0?-1:7);for(let j=0;j<6;j++){const body=0x10000+j*0x5000;d(0x909300+j*0x30c,body);memory[body+0x718]=j&1?8:0;memory.writeUInt16LE(j,body+0x65e);memory[body+0x68c]=[5,0x45,0x65,0xff][(i+j)%4];memory[body+0x68d]=0x45;d(body+0x6c4,random());}d(0x811184,0x10000);d(0x811180,[0,1,2,4,3,-1][i%6]);d(0x811188,[-1,0,1,2,10,20,25,26,100,random()][i%10]);d(0x81118c,random());return{memory,runtime:{memory,roundingMode:modes[i%4]}};};
 for(let fixture=0;fixture<fixtures;fixture++){
  const{memory:m,runtime}=fixtureFor(fixture),entry=[0x48c120,0x48c2a0,0x40f5d0,0x430890,0x47c2d0][fixture%5],body=0x10000,age=[-2147483648,-1,0,9,10,100,2147483647,random()][fixture%8],before=Buffer.from(m);let result;
  if(entry===0x48c120)source.updateRaceTimeEffect(runtime);else if(entry===0x48c2a0)result=source.activateRaceTimeEffect(0x909300,age,runtime);else if(entry===0x40f5d0)source.updateTimeEffectTextureCoordinates(runtime);else if(entry===0x430890)source.recoverDriversAfterTimeEffect(body,runtime);else source.markVehicleWeaponReleased(body,age,runtime);
  machine.reset();before.copy(machine.bytes);machine.fpuRounding=runtime.roundingMode;const actual=execute(entry,entry===0x48c2a0?0x909300:body,age);if(result)assert.deepEqual(actual,result);compare(m,`fixture${fixture}/${entry.toString(16)}`);
 }
 for(let fixture=0;fixture<lifecycles;fixture++){
  const{memory:m,runtime}=fixtureFor(fixture);m.writeInt32LE(0,0x811180);m.writeUInt8(6,m.readUInt32LE(0x5ecb1c)+0x54d);machine.reset();m.copy(machine.bytes);machine.fpuRounding=runtime.roundingMode;assert.deepEqual(execute(0x48c2a0,0x909300,fixture%11),source.activateRaceTimeEffect(0x909300,fixture%11,runtime));compare(m,`activate${fixture}`);
  for(let frame=0;frame<140;frame++){source.updateRaceTimeEffect(runtime);execute(0x48c120);compare(m,`lifecycle${fixture}/${frame}`);}assert.equal(m.readInt32LE(0x811180),0);assert.equal(m.readInt32LE(0x81118c),65536);
 }
 const report={method:'Actual48c120 plus48c2a0 producer,40f5d0 renderer UV,47c2d0 slot marking and430890 autonomous recovery; all game instructions execute with no external calls. Mixed signed/unsigned boundaries, four declared x87 rounding modes and full140-tick effect lifecycles. ALLmemory>=10000h compared after every entry, no differing bytes excluded; synthetic session/body/seed/texture inputs, no original process execution.',targetSha256:program.sha256,fixtures,lifecycles,calls,executedInstructions:executed.size,instructionSteps:steps,visits,evidence:program.references.map(r=>r.evidence),matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyRaceTimeEffect({fixtures:Number(process.argv[2]??3000),lifecycles:Number(process.argv[3]??24)});
