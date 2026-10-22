import {getAudioStopwatch,readAudioNanoseconds} from './audio-stopwatch.mjs';
import {getRendererWindowApplication} from './renderer-presentation.mjs';
import {initializeRendererWindowConstructionConstants} from './renderer-window-construction.mjs';
import constants from './renderer-frame-presentation-constants.json' with {type:'json'};
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
export function initializeRendererFramePresentationConstants(memory){initializeRendererWindowConstructionConstants(memory);for(const table of constants.tables)Buffer.from(table.bytes_hex,'hex').copy(memory,Number(table.address));return memory;}
//402da0's actual command16 follows default table entry7 to402e16. Other
//Application commands have different game algorithms, not this constant gate.
function allowPresent(application,runtime){const m=runtime.memory;put(m,runtime.scratchBase+4,16);const method=ptr(m,ptr(m,application)+4),target=ptr(m,0x402e20+m[0x402e50]*4);if(method!==0x402da0||target!==0x402e16)throw Error(`Unclosed Application present command${method.toString(16)}/${target.toString(16)}.`);return 1;}
//5290c0. The stopwatch produces an unsigned64 nanosecond value, then the
//original signed CRT divide selects its low DWORD millisecond timestamp.
export function presentRendererFrame(manager,runtime){
  const m=runtime.memory,s=runtime.scratchBase,f=((s-4)&~7)-16,output=f+8;put(m,manager+0x554,get(m,manager+0x554)+1);put(m,f-4,output);
  const clockRuntime={...runtime,scratchBase:f-8,entryRegisters:{...runtime.entryRegisters,ESI:manager,EBP:s-4}},clock=getAudioStopwatch(clockRuntime);readAudioNanoseconds(clock,output,clockRuntime);
  const milliseconds=Number(BigInt.asUintN(32,m.readBigInt64LE(output)/1000000n)),elapsed=(milliseconds-ptr(m,0x714c4c))>>>0;if(ptr(m,manager+0x558)<elapsed)put(m,manager+0x558,elapsed);put(m,0x714c4c,milliseconds);
  const application=getRendererWindowApplication({...runtime,scratchBase:f-4});if(allowPresent(application,{...runtime,scratchBase:f-8})===1){const object=ptr(m,manager+0x36c);if(typeof runtime.services?.direct3DCall!=='function')throw Error('Renderer presentation requires Direct3D COM services.');runtime.services.direct3DCall(object,0x44,[object,0,0,0,0],{...runtime,scratchBase:f-24});}return 1;
}
