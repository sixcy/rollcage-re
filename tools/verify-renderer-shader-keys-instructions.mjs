import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {rendererMaterialShaderKey,compareRendererWideStringRange,lowerBoundRendererShaderAlias,findRendererShaderAlias} from '../src/renderer-shader-keys.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyRendererShaderKeys({fixtures=2400,output='analysis/renderer-shader-keys-instruction-check.json'}={}){
  const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let calls=0,steps=0;const S=0x9000,MATERIAL=0x100000,TREE=0x110000,HEAD=0x110100,LEFT=0x110200,ROOT=0x110300,RIGHT=0x110400,NAME=0x120000,OUTPUT=0x130000,DATA=0x140000;
  const entries=[0x525ea0,0x50dce0,0x4c40e0,0x5278d0,0x527450];machine.onInstruction=p=>{reached.add(p);if(entries.includes(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};
  for(let fixture=0;fixture<fixtures;fixture++)for(let selector=0;selector<4;selector++){
    const m=program.initializeMemory(Buffer.alloc(0xa00000));m.fill(0x69,0x6000,0x9500);put(m,MATERIAL,[0,1,0x7fff,0x8000,0xffff][fixture%5]);m[MATERIAL+5]=fixture%3===0?0:1;const masks=[[],[0],[1],[0,1],[0,4],[0,5],[0,8],[9],[0,9],[31],[32],[-1],[0,1,2]];const types=masks[fixture%masks.length];m[MATERIAL+4]=fixture%17===0?0xff:types.length;for(let i=0;i<types.length;i++)put(m,MATERIAL+0x24+i*8,types[i]);
    const wide=(object,text,ordinal)=>{const data=text.length>=8?DATA+ordinal*256:object;put(m,object+20,text.length>=8?31:7);put(m,object+16,text.length);m.write(text+'\0',data,'utf16le');if(data!==object)put(m,object,data);};
    put(m,TREE,HEAD);put(m,HEAD+4,fixture%11===0?HEAD:ROOT);m[HEAD+13]=1;for(const node of[LEFT,ROOT,RIGHT]){put(m,node,HEAD);put(m,node+8,HEAD);}put(m,ROOT,LEFT);put(m,ROOT+8,RIGHT);wide(LEFT+16,'Alpha',1);wide(ROOT+16,'Gamma',2);wide(RIGHT+16,'Long shader name',3);const text=['','Alpha','Beta','Gamma','Long shader name','ZZZ','alpha','Long shader namf'][fixture%8];wide(NAME,text,4);if(selector===1&&fixture%7===0){const data=ptr(m,NAME+20)>=8?ptr(m,NAME):NAME;m.writeUInt16LE(0,data+2);}
    machine.reset();machine.fs0=0;m.copy(machine.bytes);machine.r.ESP=S;put(machine.bytes,S,-1);let actual,expected;const flags=fixture*7919;
    if(selector===0){actual=rendererMaterialShaderKey(MATERIAL,flags,{memory:m,scratchBase:S});machine.entry=0x525ea0;put(machine.bytes,S+4,MATERIAL);put(machine.bytes,S+8,flags);}
    else if(selector===1){const input=DATA+0x800;m.write('Gam\0ma\0',input,'utf16le');m.copy(machine.bytes);put(machine.bytes,S,-1);const maximum=fixture%9,count=fixture%8;actual=compareRendererWideStringRange(NAME,maximum,input,count,{memory:m});machine.entry=0x4c40e0;machine.r.ECX=NAME;[0x12345678,maximum,input,count].forEach((v,i)=>put(machine.bytes,S+4+i*4,v));}
    else if(selector===2){actual=lowerBoundRendererShaderAlias(TREE,NAME,{memory:m,scratchBase:S});machine.entry=0x5278d0;machine.r.ECX=TREE;put(machine.bytes,S+4,NAME);}
    else{actual=findRendererShaderAlias(TREE,OUTPUT,NAME,{memory:m,scratchBase:S});machine.entry=0x527450;machine.r.ECX=TREE;put(machine.bytes,S+4,OUTPUT);put(machine.bytes,S+8,NAME);}
    try{steps+=machine.run(100000);}catch(error){console.error({fixture,selector,entry:machine.entry.toString(16),registers:machine.r});throw error;}calls++;expected=machine.r.EAX|0;assert.equal(actual|0,expected,`fixture${fixture}selector${selector}`);assert.equal(machine.fs0,0);assert.deepEqual(m.subarray(0x10000),machine.bytes.subarray(0x10000),`memory fixture${fixture}selector${selector}`);
  }
  const report={method:'Actual525ea0 registered signed-word/legacy attribute-mask shader keys,actual4c40e0 unsigned UTF16 length-clamped comparison and populated5278d0/527450 alias-tree lookup. All mapped>=10000h/returns/FS,all flag/mask/registered/signed-ID cases,SSO/heap/embeddedNUL/case-sensitive keys,populated/empty trees;no game mocks or original process.',targetSha256:program.sha256,fixtures,calls,reachedInstructions:reached.size,instructionSteps:steps,actualGameCalls:visits,matched:true};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)console.log(JSON.stringify(await verifyRendererShaderKeys({fixtures:Number(process.argv[2]??2400)})));
