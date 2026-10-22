import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {updateRawBodyAttachments,ATTACHMENT_SCRATCH_BASE,ATTACHMENT_SCRATCH_LENGTH} from '../src/body-attachments.mjs';
import {registerRawEffectSpatial} from '../src/body-retirement-effects.mjs';

export function createRawAttachmentFixture(fixture=0) {
 const memory=Buffer.alloc(0xa00000),put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p);
 memory.fill(0xa5,0x10000,0x80000);memory.fill(0x69,ATTACHMENT_SCRATCH_BASE,ATTACHMENT_SCRATCH_BASE+ATTACHMENT_SCRATCH_LENGTH);
 put(0x6e6ba0,fixture%5);memory.writeFloatLE(1/4096,0x5dc5f4);put(0x90b990,0x70000);put(0x7010c,0x71000);
 put(0x909254,0x60000);put(0x909278,0x63000);put(0x902eec,0x50000);put(0x63000,0);put(0x63004,0);put(0x63008,0);
 for(let row=0;row<256;row++){word(0x60000+row*16,0xff00);word(0x60002+row*16,255);put(0x6000c+row*16,0x62000);}
 memory.fill(0,0x62000,0x62200);
 for(let id=0;id<8;id++) {
  const target=0x50000+id*128;memory.fill(0,target,target+128);put(0x80e660+id*4,target);
  registerRawEffectSpatial(target,0,0,0,{memory});
 }
 const values=[0,1,-1,32767,-32768,2048,4096,-4096];
 for(let index=0;index<6;index++) {
  const body=0x10000+index*0x1000,model=0x20000+index*0x100;put(0x902040+index*4,body);put(body+0x10,model);word(model+0x4c,0x80);
  for(let axis=0;axis<3;axis++)put(body+0x34+axis*4,Math.imul(fixture+axis*7+index*11,0x723af91));
  for(let lane=0;lane<10;lane++)word(body+0xc4+lane*2,values[(fixture+lane+index)%values.length]);
  for(let point=0;point<5;point++) {
   const type=[0,1,2,3,4,15][Math.floor(fixture/3**point+index)%6];word(body+0x16a+point*2,(type<<12)|((fixture+point+index)%8));
   for(let axis=0;axis<4;axis++)word(model+0x80+point*8+axis*2,values[(fixture+point*3+axis+index)%values.length]);
  }
 }
 //A populated deterministic mix guarantees all target types and real moves.
 if(fixture%7===0) {
  put(0x6e6ba0,4);for(let point=0;point<5;point++)word(0x1016a+point*2,([2,1,4,3,15][point]<<12)|point);
 }
 //The processor rereads live queue count after each body. A target can alias
 //that count; this valid readable-storage fixture clears it on the first body.
 if(fixture%13===0) {
  put(0x6e6ba0,4);put(0x7010c,0x6e6ba0);word(0x1016a,0x4000);word(0x1016c,0);
  for(let lane=0;lane<9;lane++)word(0x100c4+lane*2,0);
  for(let axis=0;axis<3;axis++)put(0x10034+axis*4,0);
 }
 return {memory,roundingMode:['nearest-even','toward-zero','down','up'][fixture%4]};
}

export async function checkRawBodyAttachments(fixtures=1600,{x87PrecisionBits,output='analysis/body-attachments-connected-instruction-check.json'}={}) {
 const {evidence,instructions}=await readInstructionEvidence(['084-attachment-update-assembly.json','086-attachment-transform-assembly.json','118-particle-removal-assembly.json','117-particle-registration-assembly.json','665-retirement-4286e0-assembly.json','669-retirement-4746f0-assembly.json'],{directory:'analysis/native-simulation/results'});
 const machine=new BoundedX86(instructions,{entry:0x44f050,fpuPrecisionBits:x87PrecisionBits}),totals={processedBodies:0,transformedPoints:0,type1Writes:0,type2Writes:0,type4Writes:0,spatialMoves:0};let steps=0,removals=0,inserts=0;
 machine.onInstruction=address=>{if(address===0x4748d0)removals++;if(address===0x474670)inserts++;};
 const ranges=[[0x10000,0x70000],[0x5dc5f4,4],[0x6e6ba0,8],[0x80e660,32],[0x902040,24],[0x902eec,4],[0x909254,4],[0x909278,4],[0x90b688,64],[0x90b990,4],[ATTACHMENT_SCRATCH_BASE,ATTACHMENT_SCRATCH_LENGTH]];
 for(let fixture=0;fixture<fixtures;fixture++) {
  const context={...createRawAttachmentFixture(fixture),x87PrecisionBits};machine.reset();context.memory.copy(machine.bytes);machine.fpuRounding=context.roundingMode;
  const report=updateRawBodyAttachments(context);for(const key of Object.keys(totals))totals[key]+=report[key];
  machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);steps+=machine.run();
  for(const[address,length]of ranges)assert.deepEqual(machine.bytes.subarray(address,address+length),context.memory.subarray(address,address+length),`fixture ${fixture} / ${address.toString(16)}`);
 }
 assert.equal(removals,totals.spatialMoves);assert.equal(inserts,totals.spatialMoves);
 const report={method:'Raw44f050 attachment queue/model-point/handle/table reads with actual432080 transform and actual4748d0 removal,474670 insertion,4286e0 bucket lookup and4746f0 nearest-column fallback. No game mocks or external services. Full body/model/target/spatial-row/index/bucket bytes, pointer tables, live count and1700-byte scratch compared over all4 declared x87 rounding modes. Runtime model-point,queue,target and spatial-map constructors remain explicit fixture inputs; no authored-point producer or original-process runtime claim.',evidence:evidence.map(item=>item.evidence_id),instructions:instructions.length,fixtures,instructionSteps:steps,...totals,actualSpatialRemovals:removals,actualSpatialInsertions:inserts,matched:true};
 if(x87PrecisionBits!==undefined)report.x87PrecisionBits=x87PrecisionBits;
 if(output)await writeFile(output,JSON.stringify(report,null,2),output==='analysis/body-attachments-connected-instruction-check.json'?undefined:{flag:'wx'});return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await checkRawBodyAttachments()));
