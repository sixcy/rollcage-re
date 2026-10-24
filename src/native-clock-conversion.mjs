//568d6e,568c41/568aa3 and568bfd: original in-image CRT conversion algorithms.
//The original tables are caller-owned observed/image bytes, never initialized
//here. Only the reached external except1 path remains an explicit boundary.
import {nativeCodeAddress} from './native-memory-spans.mjs';

const MASK64=(1n<<64n)-1n,FRACTION=(1n<<52n)-1n,SIGN=1n<<63n,QUIET=1n<<51n;
const bytes=new DataView(new ArrayBuffer(8));
const bitsOf=value=>{bytes.setFloat64(0,value,true);return bytes.getBigUint64(0,true);};
const numberOf=bits=>{bytes.setBigUint64(0,BigInt.asUintN(64,bits),true);return bytes.getFloat64(0,true);};
const uint=(value,label)=>{if(!Number.isInteger(value)||value< -0x80000000||value>0xffffffff)throw Error(`Native clock conversion requires x86 ${label}.`);return value>>>0;};
const qword=(value,label)=>{if(typeof value!=='bigint'||value<0n||value>MASK64)throw Error(`Native clock conversion requires uint64 ${label}.`);return value;};
const left=(value,count)=>count>=64n?0n:BigInt.asUintN(64,value<<count);
const right=(value,count)=>count>=64n?0n:value>>count;
function numerical(runtime){
  const x87=runtime.numericalContext?.x87,sse=runtime.numericalContext?.sse,cw=x87?.controlWord,mxcsr=sse?.mxcsr;
  if(!Number.isInteger(cw)||cw<0||cw>0xffff)throw Error('Native clock conversion requires an explicit raw x87 control word.');
  if(!Number.isInteger(mxcsr)||mxcsr<0||mxcsr>0xffff||(mxcsr&0xe040)!==0||((mxcsr>>>7)&63)!==63
    ||sse.roundingMode!=='nearest-even'||sse.exceptionMask!==63||sse.flushToZero||sse.denormalsAreZero)throw Error('Native clock conversion requires masked nearest-even SSE without DAZ/FTZ.');
  const state={x87ControlWord:cw,mxcsr};
  if(x87.statusWord!==undefined){if(!Number.isInteger(x87.statusWord)||x87.statusWord<0||x87.statusWord>0xffff)throw Error('Native clock conversion requires a raw x87 status word when supplied.');state.x87StatusWord=x87.statusWord;}
  return state;
}
function finiteTerm(bits){
  const field=Number((bits>>52n)&0x7ffn),fraction=bits&FRACTION;
  return {n:(bits&SIGN?-1n:1n)*(field?fraction|(1n<<52n):fraction),e:field?field-1075:-1074};
}
function exactAdd(leftBits,rightBits,resultBits){
  const a=finiteTerm(leftBits),b=finiteTerm(rightBits),r=finiteTerm(resultBits),e=Math.min(a.e,b.e,r.e);
  return (a.n<<BigInt(a.e-e))+(b.n<<BigInt(b.e-e))===(r.n<<BigInt(r.e-e));
}

export function convertNativeUnsigned64ToDouble(low,high,runtime){
  low=uint(low,'low DWORD');high=uint(high,'high DWORD');const state=numerical(runtime),m=runtime.memory,actual=p=>nativeCodeAddress(p,runtime);
  let bits,registers;
  if(!high){
    //CVTSI2SD is exact for signed32; legacy ADDSD consumes the selected qword.
    const signed=low|0,index=low>>>31,table=m.readBigUInt64LE(actual(0x56f6a0)+index*8),field=(table>>52n)&0x7ffn,fraction=table&FRACTION;
    if(field===0x7ffn&&fraction){bits=table|QUIET;if(!(table&QUIET))state.mxcsr|=1;}
    else{
      bits=bitsOf(signed+numberOf(table));
      if(!field&&fraction)state.mxcsr|=2;
      if(field!==0x7ffn&&!exactAdd(bitsOf(signed),table,bits))state.mxcsr|=0x20;
    }
    registers={ecx:index,edx:0}; //EAX is untouched and is not invented.
  }else{
    //MOVD/PSLLQ lower-qword reconstruction, including the two signed PCMPGTD
    //rounding thresholds. Both midpoint cases round the retained bit to even.
    const threshold=m.readInt32LE(actual(0x56f718)),upper=m.readInt32LE(actual(0x56f71c)),bias=m.readUInt32LE(actual(0x56f714));
    const leading=31-Math.clz32(high),shift=32-leading,packed=(BigInt(high)<<32n)|BigInt(low),shifted=left(packed,BigInt(shift)),remainder=Number(shifted&0x1fffn);
    bits=right(shifted,13n)<<1n;
    if(remainder>threshold)bits=BigInt.asUintN(64,bits+1n);
    if(remainder>upper)bits=BigInt.asUintN(64,bits+1n);
    const exponent=left(BigInt.asUintN(64,BigInt(bias)-BigInt(shift)),52n);
    bits=BigInt.asUintN(64,bits+exponent);registers={eax:shift,ecx:leading,edx:high};
  }
  return {value:numberOf(bits),bits,registers,numericalState:Object.freeze(state)};
}

//568bfd, B=actual child entry ESP. FSTCW modifies exactly2 bytes. Captured
//context stays immutable; returned/error metadata carries actual derived state.
export function updateNativeClockConversionStatus(code,inputBits,runtime){
  code=uint(code,'status EDX');inputBits=qword(inputBits,'status input bits');const state=numerical(runtime),m=runtime.memory,B=uint(runtime.scratchBase,'status entry ESP'),F=B-32,actual=p=>nativeCodeAddress(p,runtime);
  if(B<36||(B&3))throw Error('Native clock status requires bounded DWORD-aligned ESP.');
  if((state.x87ControlWord&63)!==63){
    if(state.x87StatusWord===undefined)throw Error('Native clock status requires observed x87 status before an unmasked waiting store.');
    if(state.x87StatusWord&(~state.x87ControlWord)&63)throw Error('Native clock status reached an unbound pending x87 exception at568c00.');
  }
  m.writeUInt16LE(state.x87ControlWord,F);
  const eax=m.readUInt16LE(F),mask=code===8?0:m.readUInt8((actual(0x56f6ff)+code)>>>0);
  if(code!==8&&(mask&(eax&255)))return {code,entryEsp:B,frame:F,masked:true,eax,numericalState:Object.freeze(state)};
  state.x87ControlWord=m.readUInt16LE(actual(0x56f720));
  m.writeUInt32LE(code,F);m.writeUInt32LE(0,F+4);m.writeBigUInt64LE(inputBits,F+8);m.writeBigUInt64LE(inputBits,F+16);m.writeUInt32LE(eax,F+24);
  m.writeUInt32LE(actual(0x568c3b),F-4);
  const error=Error('Native clock conversion reached unbound MSVCR120 except1 at5692fa.');
  error.nativeClockConversionBoundary=Object.freeze({entry:actual(0x5692fa),returnAddress:actual(0x568c3b),entryEsp:F-4,argumentAddress:F,status:code,inputBits,oldControlWord:eax,numericalState:Object.freeze(state)});
  throw error;
}

export function convertNativeDoubleBitsToSigned64(inputBits,runtime){
  inputBits=qword(inputBits,'double input bits');let state=numerical(runtime);const m=runtime.memory,S=uint(runtime.scratchBase,'conversion entry ESP'),actual=p=>nativeCodeAddress(p,runtime),statusCalls=[];
  if(S<40||(S&3))throw Error('Native double conversion requires bounded DWORD-aligned ESP.');
  const value=numberOf(inputBits),positive=m.readBigUInt64LE(actual(0x56f6d8));
  const status=code=>{
    m.writeUInt32LE(actual(code===8?0x568bf5:0x568bdd),S-4);
    const childContext={...runtime.numericalContext,x87:{...runtime.numericalContext.x87,controlWord:state.x87ControlWord},sse:{...runtime.numericalContext.sse,mxcsr:state.mxcsr}};
    const result=updateNativeClockConversionStatus(code,inputBits,{...runtime,scratchBase:S-4,numericalContext:childContext});statusCalls.push(result);state={...result.numericalState};
  };
  const field=(inputBits>>52n)&0x7ffn;
  if(field===0x7ffn){status(8);throw Error('Native invalid conversion exception unexpectedly returned.');}
  //COMISD on a nonzero subnormal input sets the masked SSE denormal flag.
  if(!field&&(inputBits&FRACTION))state.mxcsr|=2;
  if(value>=numberOf(positive)){status(8);throw Error('Native out-of-range conversion exception unexpectedly returned.');}
  const negative=m.readBigUInt64LE(actual(0x56f6d0));
  if(value<numberOf(negative)){status(8);throw Error('Native out-of-range conversion exception unexpectedly returned.');}
  const magnitude=inputBits&~SIGN;let integer=0n;
  if(magnitude){
    const mask=m.readBigUInt64LE(actual(0x56f6b0)),hidden=m.readBigUInt64LE(actual(0x56f6b8)),bias=m.readUInt32LE(actual(0x56f710));
    const significand=(magnitude&mask)|hidden,exponent=magnitude>>52n,shift=BigInt.asUintN(64,exponent-BigInt(bias)),inverse=BigInt.asUintN(64,BigInt(bias)-exponent);
    const shiftedRight=right(significand,inverse),shiftedLeft=left(significand,shift);
    integer=Number(BigInt.asIntN(32,exponent))>(bias|0)?shiftedLeft:shiftedRight;
    if(inputBits&SIGN)integer=BigInt.asUintN(64,-integer);
    if(Number(BigInt.asIntN(32,inverse))>0&&((significand^left(shiftedRight,inverse))&MASK64)!==0n)status(0x10);
  }
  const low=Number(integer&0xffffffffn),high=Number(integer>>32n);
  return {value:BigInt.asIntN(64,integer),low,high,registers:{eax:low,edx:high,ecx:1},statusCalls,numericalState:Object.freeze(state)};
}

export function convertNativeDoubleToSigned64(value,runtime){
  if(typeof value!=='number')throw Error('Native double conversion requires a source binary64 Number.');
  return convertNativeDoubleBitsToSigned64(bitsOf(value),runtime);
}
