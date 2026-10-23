import {resolveNativeMemoryAddress} from './native-memory-spans.mjs';

//Explicit shared-state publication for41ca60; ordinary structured integer
//helpers remain pure unless their caller supplies this native context.
export function createNativeFixedSqrtState({memory,moduleBaseAddress=0x400000}={}) {
  if(!Number.isSafeInteger(moduleBaseAddress)||moduleBaseAddress<=0||moduleBaseAddress+0x51d464>0x100000000)throw Error('Native fixed root state requires a valid observed module base.');
  const inputAddress=resolveNativeMemoryAddress(memory,0x91d45c,4),countAddress=resolveNativeMemoryAddress(memory,0x91d460,4);
  if(inputAddress!==moduleBaseAddress+0x51d45c||countAddress!==inputAddress+4)throw Error('Native fixed root publication requires its actual aliased image fields.');
  return Object.freeze({fixedSqrtQ16(value){
    if(!Number.isInteger(value)||value< -0x80000000||value>0x7fffffff)throw Error('Native fixed root input must be a signed32-bit integer.');
    //41ca75/7b/8f: ABS wraps at INT_MIN; CLZ zero is32. The initial
    //zero store is retained before the final leading-zero publication.
    const magnitude=((value^(value>>31))-(value>>31))|0;
    memory.writeInt32LE(magnitude,inputAddress);memory.writeInt32LE(0,countAddress);memory.writeInt32LE(Math.clz32(magnitude),countAddress);
  }});
}
