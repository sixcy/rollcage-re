import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';
import {convertNativeUnsigned64ToDouble,convertNativeDoubleToSigned64,convertNativeDoubleBitsToSigned64,updateNativeClockConversionStatus} from '../src/native-clock-conversion.mjs';

const clock=await readInstructionEvidence(['027-clock-uint-to-double.json','028-clock-double-to-uint.json','029-double-conversion-body.json'],{directory:'analysis/physics-clock-elevated-20261022/results'});
const originalPe=await readFile('C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe');
const pe=originalPe.readUInt32LE(60),optional=pe+24,relocationRva=originalPe.readUInt32LE(optional+136),relocationSize=originalPe.readUInt32LE(optional+140);
const S=0x1141000,MASK64=(1n<<64n)-1n,buffer=new DataView(new ArrayBuffer(8));
const bits=value=>{buffer.setFloat64(0,value,true);return buffer.getBigUint64(0,true);};
async function imageAt(base){
  const image=await loadRelocatedAudioFixture(base),actual=image.actual,relocations=new Map();
  for(let p=actual(0x400000)+relocationRva,end=p+relocationSize;p<end;){
    const page=image.memory.readUInt32LE(p),length=image.memory.readUInt32LE(p+4);
    for(let j=8;j<length;j+=2){const item=image.memory.readUInt16LE(p+j);if(item>>>12===3){const rva=page+(item&4095);relocations.set(0x400000+rva,(image.memory.readUInt32LE(base+rva)-image.delta)>>>0);}}
    p+=length;
  }
  const known=new Map(image.instructions.map(r=>[r.address,r]));
  const sourceRows=clock.instructions.toSorted((a,b)=>a.address-b.address);
  for(let i=0;i<sourceRows.length;i++){
    const row=sourceRows[i],length=Math.min(15,(sourceRows[i+1]?.address??row.address+1)-row.address),args=[...row.args];
    for(let j=0;!['RET','CALL','JMP'].includes(row.op)&&!row.op.startsWith('J')&&j+4<=length;j++){
      const old=relocations.get(row.address+j);if(old===undefined)continue;
      const matches=[];for(const[index,arg]of args.entries())for(const match of arg.matchAll(/0x[0-9a-f]+/gi))if(Number(match[0])===old)matches.push({index,text:match[0]});
      assert.equal(matches.length,1,'Actual PE HIGHLOW must identify one source operand');const x=matches[0];args[x.index]=args[x.index].replace(x.text,'0x'+actual(old).toString(16));
    }
    if((row.op==='CALL'||row.op.startsWith('J'))&&args.length===1&&/^0x[0-9a-f]+$/i.test(args[0]))args[0]='0x'+actual(Number(args[0])).toString(16);
    const translated={address:actual(row.address),op:row.op,args},old=known.get(translated.address);if(old)assert.deepEqual(old,translated);known.set(translated.address,translated);
  }
  //Decode the original FF25 thunk only to observe its actual CALL entry. No
  //external except1 return or conversion answer is supplied to the oracle.
  const thunk=actual(0x5692fa);assert.equal(image.memory.readUInt16LE(thunk),0x25ff);
  known.set(thunk,{address:thunk,op:'JMP',args:['dword ptr [0x'+image.memory.readUInt32LE(thunk+2).toString(16)+']']});
  return {...image,instructions:[...known.values()].sort((a,b)=>a.address-b.address)};
}
function fixture(image,{cw=0x7f,mxcsr=0x1f80}={}){
  const m=Buffer.from(image.memory),a=image.actual;m.fill(0x69,S-192,S+64);m.writeUInt32LE(0xffffffff,S);
  const spans=[[S-192,256],[a(0x56f6a0),0x82]],source=createCapturedMemory(spans.map(([address,length])=>({address,bytes:Buffer.from(m.subarray(address,address+length))})));
  const numericalContext=decodePhysicsNumericalContext({x87ControlWord:cw,mxcsr}),runtime={memory:source.memory,moduleBaseAddress:a(0x400000),scratchBase:S,numericalContext};
  const machine=new BoundedX86(image.instructions);machine.bytes=m;machine.r.ESP=S;machine.setFpuControlWord(cw);machine.r.EAX=0x13579bdf;
  return{...source,image,machine,runtime,spans};
}
function compare(f){for(const[address,length]of f.spans)assert.deepEqual(f.span(address,length),f.machine.bytes.subarray(address,address+length),`all bytes0x${address.toString(16)}`);}
const nativeBits=m=>{const lanes=m.xmmLanes('XMM0');return BigInt(lanes[0]>>>0)|(BigInt(lanes[1]>>>0)<<32n);};

test('uint64 conversion follows original bit reconstruction over high/low, rounding ties and deterministic full-width cases underASLR',async()=>{
  const values=new Set([0n,1n,0x7fffffffn,0x80000000n,0xffffffffn,0x100000000n,MASK64]);
  for(let n=32n;n<64n;n++)for(const delta of[-1025n,-1024n,-1n,0n,1n,1023n,1024n,1025n]){const value=(1n<<n)+delta;if(value>=0n&&value<=MASK64)values.add(value);}
  let seed=0x123456789abcdefn;for(let i=0;i<128;i++){seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);values.add(seed);}
  for(const base of[0x400000,0x320000]){
    const image=await imageAt(base);
    for(const value of values){
      const f=fixture(image),low=Number(value&0xffffffffn),high=Number(value>>32n);f.machine.entry=image.actual(0x568d6e);f.machine.r.ECX=low|0;f.machine.r.EDX=high|0;f.machine.run();
      const result=convertNativeUnsigned64ToDouble(low,high,f.runtime);compare(f);assert.equal(result.bits,nativeBits(f.machine));assert.equal(result.value,Number(value));
      for(const[name,n]of Object.entries(result.registers))assert.equal(n,f.machine.r[name.toUpperCase()]>>>0);if(!high)assert.equal(Object.hasOwn(result.registers,'eax'),false);
      assert.equal(result.numericalState.mxcsr,0x1f80); //High path uses integer SSE; low path's original table sum is exact.
    }
  }
  assert.ok(values.size>350);
});

test('signed64 conversion executes real masked status child and compares all owned stack/table bytes acrossCWandASLR',async()=>{
  const values=[0,-0,.5,-.5,1.75,-1.75,Number.MIN_VALUE,-Number.MIN_VALUE,2**-1022,-(2**-1022),2**31+.5,-(2**31)-.5,2**53-1,2**53+2,2**63-1024,-(2**63)];
  for(const base of[0x400000,0x320000]){
    const image=await imageAt(base);
    for(const cw of[0x7f,0x27f,0x37f,0xf7f])for(const value of values){
      const f=fixture(image,{cw}),beforeContext=structuredClone(f.runtime.numericalContext),visits=[];
      f.machine.entry=image.actual(0x568c41);f.machine.setXmmDouble('XMM0',value);f.machine.onInstruction=(p,x)=>{if(p===image.actual(0x568bfd))visits.push(x.r.EDX>>>0);};f.machine.run();
      const result=convertNativeDoubleToSigned64(value,f.runtime);compare(f);
      assert.equal(result.value,BigInt(Math.trunc(value)));assert.equal(result.low,f.machine.r.EAX>>>0);assert.equal(result.high,f.machine.r.EDX>>>0);assert.equal(result.registers.ecx,f.machine.r.ECX>>>0);
      assert.deepEqual(result.statusCalls.map(c=>c.code),visits);assert.equal(result.numericalState.x87ControlWord,f.machine.fpuControlWord);assert.deepEqual(f.runtime.numericalContext,beforeContext);
      if(visits.length){assert.equal(f.memory.readUInt16LE(S-36),cw);assert.equal(f.memory.readUInt16LE(S-34),0x6969);assert.equal(f.memory.readUInt32LE(S-4),image.actual(0x568bdd));}
      const subnormal=Number.isFinite(value)&&value!==0&&Math.abs(value)<2**-1022;assert.equal(result.numericalState.mxcsr,0x1f80|(subnormal?2:0));
    }
  }
});

test('invalid/range/unmasked paths stage original except1 arguments and stop at its genuine thunk entry',async()=>{
  for(const base of[0x400000,0x320000]){
    const image=await imageAt(base);
    for(const[input,cw]of [[0x7ff0000000000000n,0x7f],[0xfff0000000000000n,0x27f],[0x7ff8000000001234n,0x37f],[0x7ff0000000001234n,0x7f],[bits(2**63),0x7f],[bits(-(2**63)-2048),0x7f],[bits(1.25),0x5f]]){
      const f=fixture(image,{cw});f.runtime.numericalContext.x87.statusWord=0;f.machine.entry=image.actual(0x568c41);f.machine.setXmmLanes('XMM0',[Number(BigInt.asIntN(32,input)),Number(BigInt.asIntN(32,input>>32n)),0x12345678,0x23456789]);
      f.machine.onInstruction=p=>{if(p===image.actual(0x5692fa))throw Error('Observed original except1 entry.');};assert.throws(()=>f.machine.run(),/Observed original except1 entry/);
      assert.throws(()=>convertNativeDoubleBitsToSigned64(input,f.runtime),error=>{
        assert.match(error.message,/unbound MSVCR120 except1/);const b=error.nativeClockConversionBoundary;
        assert.equal(b.entryEsp,f.machine.r.ESP);assert.equal(b.returnAddress,f.machine.bytes.readUInt32LE(f.machine.r.ESP));assert.equal(b.numericalState.x87ControlWord,f.machine.fpuControlWord);return true;
      });compare(f);
      assert.equal(f.memory.readBigUInt64LE(S-28),input);assert.equal(f.memory.readBigUInt64LE(S-20),input);
      assert.equal(f.memory.readUInt32LE(S-12),cw);assert.equal(f.memory.readUInt32LE(S-40),image.actual(0x568c3b));
    }
  }
});

test('sparse inputs require reached original tables and preserve two-byte FSTCW padding without a conversion-answer service',async()=>{
  const image=await imageAt(0x320000),f=fixture(image),a=image.actual;
  const sparse=createCapturedMemory([{address:S-40,bytes:Buffer.alloc(44,0x35)},{address:a(0x56f70f),bytes:Buffer.from([0x20])}]);
  const result=updateNativeClockConversionStatus(16,bits(1.5),{...f.runtime,memory:sparse.memory,scratchBase:S-4});
  assert.equal(result.masked,true);assert.equal(sparse.memory.readUInt16LE(S-36),0x7f);assert.equal(sparse.memory.readUInt16LE(S-34),0x3535);
  assert.throws(()=>convertNativeUnsigned64ToDouble(1,0,{...f.runtime,memory:sparse.memory}),/Uncaptured native memory/);
  assert.throws(()=>convertNativeDoubleToSigned64(1,{...f.runtime,memory:sparse.memory}),/Uncaptured native memory/);
});

test('unsupported SSE controls and unknown x87 state stay strict without mutating supplied memory/context',async()=>{
  const image=await imageAt(0x400000);
  for(const mxcsr of[0x3f80,0x1fc0,0x9f80,0]){
    const f=fixture(image,{mxcsr}),before=Buffer.from(f.span(S-192,256));assert.throws(()=>convertNativeUnsigned64ToDouble(0,1,f.runtime),/masked nearest-even SSE/);assert.deepEqual(f.span(S-192,256),before);
  }
  const f=fixture(image);delete f.runtime.numericalContext.x87.controlWord;assert.throws(()=>convertNativeDoubleToSigned64(1.5,f.runtime),/explicit raw x87 control/);
});

test('derived numerical flags preserve incoming sticky bits and expose only performed SSE operations',async()=>{
  const image=await imageAt(0x400000);
  for(const table of[0x1n,0x7ff0000000001234n,0x7ff8000000001234n]){
    const f=fixture(image,{cw:0x27f,mxcsr:0x1f84});f.memory.writeBigUInt64LE(table,0x56f6a0);
    const r=convertNativeUnsigned64ToDouble(1,0,f.runtime);
    assert.equal(r.bits,table===1n?bits(1):table|0x8000000000000n);
    assert.equal(r.numericalState.mxcsr,table===1n?0x1fa6:table===0x7ff0000000001234n?0x1f85:0x1f84);
    assert.equal(f.runtime.numericalContext.sse.mxcsr,0x1f84);assert.equal(r.numericalState.x87ControlWord,0x27f);
  }
  const f=fixture(image,{cw:0x37f,mxcsr:0x1fa7}),r=convertNativeDoubleToSigned64(.5,f.runtime);
  assert.equal(r.numericalState.mxcsr,0x1fa7);assert.equal(r.numericalState.x87ControlWord,0x37f);
});

test('missing mask bytes and unknown pending unmasked x87 state are separate explicit dependencies',async()=>{
  const image=await imageAt(0x320000),f=fixture(image),onlyStack=createCapturedMemory([{address:S-40,bytes:Buffer.alloc(44,0x69)}]);
  assert.throws(()=>updateNativeClockConversionStatus(16,bits(.5),{...f.runtime,memory:onlyStack.memory,scratchBase:S-4}),/Uncaptured native memory/);
  assert.equal(onlyStack.memory.readUInt16LE(S-36),0x7f);assert.equal(onlyStack.memory.readUInt16LE(S-34),0x6969);
  const unmasked=fixture(image,{cw:0x5f}),before=Buffer.from(unmasked.span(S-192,256));
  assert.throws(()=>updateNativeClockConversionStatus(16,bits(.5),unmasked.runtime),/observed x87 status/);assert.deepEqual(unmasked.span(S-192,256),before);
  unmasked.runtime.numericalContext.x87.statusWord=0x20;
  assert.throws(()=>updateNativeClockConversionStatus(16,bits(.5),unmasked.runtime),/pending x87 exception/);assert.deepEqual(unmasked.span(S-192,256),before);
});
