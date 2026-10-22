import test from 'node:test';
import assert from 'node:assert/strict';
import {constructRendererMaterial,initializeRendererMaterialConstructionConstants} from '../src/renderer-material-construction.mjs';
import {constructRendererDrawCache} from '../src/renderer-state-cache.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),wide=(m,p)=>{let end=p;while(m.readUInt16LE(end))end+=2;return m.toString('utf16le',p,end);};
function setup(){
  const memory=initializeRendererMaterialConstructionConstants(Buffer.alloc(0xa00000)),material=0x180000,cache=0x100000,manager=0x170000,calls=[];let cursor=0x200000;
  const runtime={memory,scratchBase:0x9000,services:{libraryCall(name,args){calls.push([name,args]);if(name==='operatorNew'){const p=cursor;cursor+=Math.max(args[0],1)+15&~15;return p;}if(name==='memcpy'||name==='memmove'){Buffer.from(memory.subarray(args[1],args[1]+args[2])).copy(memory,args[0]);return args[0];}if(name==='_wcsicmp'){const a=wide(memory,args[0]).toLowerCase(),b=wide(memory,args[1]).toLowerCase();return a===b?0:a<b?-1:1;}}}};
  constructRendererDrawCache(cache,runtime);put(memory,manager,0x5db278);put(memory,manager+0x360,cache);put(memory,0x714ae8,manager);put(memory,0x6e1e50,0x12345678);memory.fill(0xa7,material,material+0x200);
  const name=(text,p=0x140000)=>{memory.write(text+'\0',p,'utf16le');return p;};const text=object=>wide(memory,ptr(memory,object+20)>=8?ptr(memory,object):object);
  return{memory,material,cache,calls,runtime,name,text};
}
test('material kinds select the original stock names and append one indexed attribute',()=>{
  for(const [kind,expected]of[[0,'Stock/Particles'],[1,'Stock/Pretransformed Triangles'],[2,'Stock/Untransformed Triangles'],[3,'Stock/Pretransformed Triangles']]){
    const {memory,material,runtime,text}=setup();assert.equal(constructRendererMaterial(material,0x12345678,kind,0,runtime),material);assert.equal(text(material+8),expected);assert.equal(memory[material+7],0x78);assert.equal(memory[material+4],1);assert.equal(memory[material+5],1);assert.equal(memory.readUInt16LE(material),1);assert.equal(ptr(memory,material+0x24),0);assert.equal(memory.readUInt16LE(material+0x28),0x5678);assert.equal(memory.readUInt16LE(material+0x2a),0);
  }
});
test('an unbound kind with no name keeps an empty string, no registration and untouched extra storage',()=>{
  const {memory,material,runtime,text}=setup();constructRendererMaterial(material,0,4,0,runtime);assert.equal(text(material+8),'');assert.equal(ptr(memory,material),0);assert.equal(memory[material+4],0);assert.equal(memory[material+5],0);for(let i=0;i<8;i++){const row=material+0x24+i*8;assert.equal(ptr(memory,row),0xffffffff);assert.equal(memory.readUInt16LE(row+4),0x5678);assert.equal(memory.readUInt16LE(row+6),0x30f);}assert.deepEqual([0x64,0x68,0x6c].map(o=>ptr(memory,material+o)),[0,0,0]);assert.equal(memory[material+0x70],0xa7);
});
test('named materials own independent strings while sharing case-insensitive shader-name IDs',()=>{
  const {memory,material,runtime,name,text,cache}=setup();constructRendererMaterial(material,1,4,name('A custom material name'),runtime);constructRendererMaterial(material+0x100,1,4,name('A CUSTOM MATERIAL NAME'),runtime);assert.equal(memory.readUInt16LE(material),1);assert.equal(memory.readUInt16LE(material+0x100),1);assert.equal(text(material+8),'A custom material name');assert.equal(text(material+0x108),'A CUSTOM MATERIAL NAME');assert.notEqual(ptr(memory,material+8),ptr(memory,material+0x108));assert.equal(ptr(memory,cache+0x1010)-ptr(memory,cache+0x100c),28);
});
test('initial allocation captures the name but reloads kind and global attribute index',()=>{
  const {memory,material,runtime,name,text}=setup();const input=name('A custom name allocated before kind dispatch'),base=runtime.services.libraryCall;let mutated=false;runtime.services.libraryCall=(kind,args)=>{const result=base(kind,args);if(kind==='operatorNew'&&!mutated){mutated=true;put(memory,0x9008,3);put(memory,0x900c,0);put(memory,0x9004,0);put(memory,0x6e1e50,0x87654321);}return result;};constructRendererMaterial(material,0x55,4,input,runtime);assert.equal(text(material+8),'A custom name allocated before kind dispatch');assert.equal(memory[material+7],0x55);assert.equal(memory[material+4],1);assert.equal(memory.readUInt16LE(material+0x28),0x4321);assert.equal(memory.readUInt16LE(material+0x30),0x4321);
});
