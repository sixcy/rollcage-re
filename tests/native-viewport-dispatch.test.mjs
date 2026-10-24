import test from 'node:test';
import assert from 'node:assert/strict';
import {runNativeViewportLookup,runNativeViewportEnable} from '../src/native-viewport-dispatch.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {loadNativeViewportWrapperProgram,verifyNativeViewportDispatchInstructions} from '../tools/verify-native-viewport-dispatch-instructions.mjs';

const initial={ECX:0,EBX:0x12345678,EBP:0x23456789,ESI:0x3456789a,EDI:0x456789ab};
const S=0x18004,HEAD=0x1340000,NAME=0x1350000,blocks=[0x1400000,0x1401000,0x1402000];
const put=(m,p,v)=>m.writeUInt32LE(v>>>0,p),programs=new Map();
async function fixture({base=0x400000,length=16,enabled=1,aliasApplication=false}={}){
  if(!programs.has(base))programs.set(base,loadNativeViewportWrapperProgram(base));const p=await programs.get(base),image=Buffer.from(p.image),app=aliasApplication?0x5e8890:0x1200000,actual=p.actual;
  image.fill(0x69,S-256,S+32);put(image,S,actual(0x450da6));put(image,S+4,NAME);put(image,S+8,enabled);image.fill(0x51,NAME,NAME+length);image[NAME+length]=0;
  put(image,actual(0x5e8890),0xc0123456);put(image,actual(0x6efb38),app);put(image,actual(0x56e210),0x1600020);put(image,actual(0x56e470),0x1600010);
  put(image,app+0x7c,HEAD);put(image,app+0x80,0);for(const offset of [0,4,8])put(image,HEAD+offset,HEAD);image[HEAD+12]=1;image[HEAD+13]=1;
  for(const block of blocks)image.fill(0xa7,block,block+256);
  const spans=[[S-256,288],[NAME,length+1],[app,132],[HEAD,16],...blocks.map(b=>[b,256]),...[0x5e8890,0x6efb38,0x56e210,0x56e470].map(p=>[actual(p),4]),[actual(0x56fe6b),1]];
  const captured=createCapturedMemory(spans.map(([address,length])=>({address,bytes:Buffer.from(image.subarray(address,address+length))})));
  const memory=captured.memory,nativeTls={sehWord:0x7fff1000},allocations=[],freed=[];
  const runtime={memory,moduleBaseAddress:base,scratchBase:S,entryRegisters:{...initial,ECX:app},nativeTls,handlers:{allocate(size){assert.ok(allocations.length<blocks.length);const pointer=blocks[allocations.length];allocations.push({size,pointer});return pointer;},free(pointer,child){assert.equal(child.nativeViewportWrapperCall.kind,'external-CRT-string-free');assert.equal(child.scratchBase,S-68);assert.equal(memory.readUInt32LE(S-68),actual(0x406c4b));assert.equal(memory.readUInt32LE(S-64),pointer);freed.push(pointer);}}};
  return {...captured,p,app,actual,runtime,allocations,freed};
}

test('owned-wrapper instruction oracle matches initializedRTTI and enableframes while string/map children remain explicitly synthetic',async()=>{
  const r=await verifyNativeViewportDispatchInstructions();assert.equal(r.matched,true);assert.equal(r.lookupCases,12);assert.equal(r.enableCases,78);assert.equal(r.unknownEaxCases,33);
  assert.equal(r.authority,'constructed-owned-wrapper-instructions-with-isolated-synthetic-string-map-children');
  assert.ok(r.limits.some(l=>l.includes('transitive private ABI')));assert.ok(r.cookieProof.every(p=>p.bytesHex.startsWith('3b0d')&&p.bytesHex.endsWith('7502f3c3')));
  const example=label=>r.examples.find(e=>e.label===label);assert.equal(example('enabled-late-string').enabled,true);assert.equal(example('enabled-latched-map').enabled,true);
  assert.deepEqual(example('both-frees').external,['array','string']);assert.equal(Object.hasOwn(example('both-frees').registers,'eax'),false);assert.equal(example('live-saved-edi').registers.edi,0xcafebabe);
});

test('real semantic assignment/map defaults allocate authentic16-character string capacity and preserve actualheap pointers acrossASLR',async()=>{
  for(const base of [0x400000,0x730000])for(const enabled of [1,2]){
    const f=await fixture({base,enabled,aliasApplication:base===0x730000}),old=structuredClone(f.runtime.entryRegisters),r=runNativeViewportEnable(f.runtime);
    assert.deepEqual(f.allocations.map(a=>a.size),[32,100,32]);assert.deepEqual(f.freed,[blocks[0]]);assert.equal(f.memory[f.app+0x80],1);
    assert.equal(r.record,blocks[1]+44);assert.equal(f.memory[r.record+0x34],enabled===1?1:0);assert.equal(f.memory.readUInt32LE(blocks[1]+36),31);assert.equal(f.memory.readUInt32LE(blocks[1]+32),16);
    assert.equal(r.transitivePrivateAbiComplete,false);assert.equal(r.registers.eax,undefined);assert.equal(r.registers.ecx,0xc0123456);assert.equal(r.registers.esp,S+12);assert.equal(r.registers.eip,f.actual(0x450da6));assert.equal(f.runtime.nativeTls.sehWord,0x7fff1000);
    for(const name of ['EBX','EBP','ESI','EDI'])assert.equal(r.registers[name.toLowerCase()],old[name]);
    assert.equal(f.memory.readUInt32LE(S-48),f.actual(0x406c68),'Actualcookie CALL overwrites the already popped EBXsave slot.');
    assert.equal(f.memory.readUInt32LE(f.actual(0x5e8890)),0xc0123456);if(base===0x730000)assert.equal(f.memory.readUInt32LE(0x5e8890+0x7c),HEAD,'Canonicalcookie number is an actualheap Application pointer, never a translatedfixedoperand.');
  }
});

test('inline15-byte default path avoids fabricated free/EAX and initializedRTTI returns its actualpoppedcookieECX',async()=>{
  const f=await fixture({length:15});const enabled=runNativeViewportEnable(f.runtime);assert.deepEqual(f.allocations.map(a=>a.size),[100]);assert.deepEqual(f.freed,[]);assert.equal(enabled.eax,0);
  const cast=await fixture({base:0x730000,aliasApplication:true});const C=cast.runtime.scratchBase,expected=[cast.app,0,cast.actual(0x6e213c),cast.actual(0x6e20a4),0];let calls=0;
  cast.runtime.services={libraryCall(name,args,child){calls++;assert.equal(name,'__RTDynamicCast');assert.deepEqual(args,expected);assert.equal(child.scratchBase,C-44);assert.equal(child.entryRegisters.EAX,cast.app);assert.equal(cast.memory.readUInt32LE(C-44),cast.actual(0x402d8b));assert.equal(cast.runtime.nativeTls.sehWord,C-12);return cast.app;}};
  const r=runNativeViewportLookup(cast.runtime);assert.equal(calls,1);assert.equal(r.eax,0x5e8890);assert.equal(r.registers.ecx,(0xc0123456^(C-16))>>>0);assert.notEqual(r.registers.ecx,cast.runtime.entryRegisters.ECX);assert.equal(r.registers.esp,C+4);assert.equal(cast.runtime.nativeTls.sehWord,0x7fff1000);
});

test('cold/missingexternal wrappers preserve reachedframes instead of fabricatingbootstrap or service-owned game stores',async()=>{
  const cold=await fixture();put(cold.memory,cold.actual(0x6efb38),0);assert.throws(()=>runNativeViewportLookup(cold.runtime),error=>{assert.match(error.message,/cold bootstrap ABI/);assert.equal(error.nativeViewportBoundary.entry,cold.actual(0x402d3a));return true;});assert.equal(cold.runtime.nativeTls.sehWord,S-12);assert.equal(cold.memory.readUInt32LE(S-4),0xffffffff);
  const absent=await fixture();assert.throws(()=>runNativeViewportLookup(absent.runtime),/typed external/);assert.equal(absent.memory.readUInt32LE(S-44),absent.actual(0x402d8b));
  for(const mutation of ['frame','root','tls']){const f=await fixture();f.runtime.services={libraryCall(){if(mutation==='frame')put(f.memory,S-20,0);if(mutation==='root')put(f.memory,f.actual(0x6efb38),0);if(mutation==='tls')f.runtime.nativeTls.sehWord=0x7fff1000;return f.app;}};assert.throws(()=>runNativeViewportLookup(f.runtime),/EAX-only service changed protected/);}
  const missing=await fixture();delete missing.runtime.nativeTls;assert.throws(()=>runNativeViewportEnable(missing.runtime),/explicit raw FS/);
});

test('cookie mismatch stops at the actual check after realTLS restoration/pops; incomplete async children never become completed game work',async()=>{
  const f=await fixture();f.runtime.calls={call404fa0(){put(f.memory,S-16,f.memory.readUInt32LE(S-16)^1);return blocks[1]+44;}};
  assert.throws(()=>runNativeViewportEnable(f.runtime),error=>{assert.match(error.message,/security-cookie failure/);assert.equal(error.nativeViewportBoundary.entry,f.actual(0x568162));assert.equal(error.nativeViewportBoundary.entryEsp,S-48);return true;});
  assert.equal(f.runtime.nativeTls.sehWord,0x7fff1000);assert.equal(f.memory.readUInt32LE(S-48),f.actual(0x406c68));
  const asyncChild=await fixture();asyncChild.runtime.calls={call405310:()=>Promise.resolve()};assert.throws(()=>runNativeViewportEnable(asyncChild.runtime),/complete synchronously/);
  const badReturn=await fixture();badReturn.runtime.calls={call405310(request){put(badReturn.memory,request.runtime.scratchBase,0);}};assert.throws(()=>runNativeViewportEnable(badReturn.runtime),/live CALL\/SEH/);
});
