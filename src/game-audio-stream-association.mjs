import {releaseGameAudioDecoder} from './game-audio-decoder-lifecycle.mjs';
import {setGameAudioSampleFlags} from './game-audio-sample-state.mjs';
import {findGameAudioMixer,createGameAudioChannel} from './game-audio-sample-factory.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const save=(r,S,items)=>{for(const[reg,offset]of items)if(Number.isInteger(r.entryRegisters?.[reg]))put(r.memory,S+offset,r.entryRegisters[reg]);};
//4adbd0 preserves an existing channel; otherwise it looks up the actual mixer
//and chooses the stream callback or the sample's inline callback adapter.
export function createGameAudioStreamChannel(sample,format,callback,runtime){
 const m=runtime.memory,S=runtime.scratchBase;save(runtime,S,[['EBX',-4],['ESI',-8]]);if(ptr(m,sample+0x97c))return;save(runtime,S,[['EDI',-12]]);format=ptr(m,S+4);if(!ptr(m,format+4))return;save(runtime,S,[['EBP',-16]]);const F=S-16,manager=ptr(m,0x714b08),target=ptr(m,ptr(m,manager)+0x48);if(target!==0x4a79f0)throw Error(`Unported stream mixer lookup0x${target.toString(16)}.`);put(m,F-4,ptr(m,sample+0x438));put(m,F-8,0x4adc00);const bus=findGameAudioMixer(manager,ptr(m,F-4),{...runtime,scratchBase:F-8,entryRegisters:{...runtime.entryRegisters,EBX:sample+0x97c,ESI:sample,EDI:format}});callback=ptr(m,S+8);put(m,S+4,bus);if(!callback)callback=sample+0x978;const backend=ptr(m,0x714b08)+0x81c,channel=ptr(m,ptr(m,backend));if(channel!==0x4b1d30)throw Error(`Unported stream channel adapter0x${channel.toString(16)}.`);const args=[bus,format,m[sample+0x45e],callback,sample+0x97c,sample+0x980];args.forEach((v,i)=>put(m,F-24+i*4,v));put(m,F-28,0x4adc38);createGameAudioChannel(backend,...args,{...runtime,scratchBase:F-28,entryRegisters:{...runtime.entryRegisters,EBX:sample+0x97c,EBP:callback,ESI:sample,EDI:format}});
}
//4adb20 owns old decoder retirement, new pointer publication and effective
//sample flags before selecting live decoder/stream format for channel setup.
export function associateGameAudioStream(sample,decoder,runtime){
 const m=runtime.memory,S=runtime.scratchBase,F=S-12;save(runtime,S,[['EBX',-4],['ESI',-8],['EDI',-12]]);const old=ptr(m,sample+0x968);if(old){put(m,F-4,1);put(m,F-8,0x4adb35);releaseGameAudioDecoder(old,1,{...runtime,scratchBase:F-8,entryRegisters:{...runtime.entryRegisters,EDI:sample}});put(m,sample+0x968,0);}
 const target=ptr(m,ptr(m,sample)+0x28);if(target!==0x4ad320)throw Error(`Unported stream sample-flags target0x${target.toString(16)}.`);put(m,F-4,ptr(m,sample+0x458));decoder=ptr(m,S+4);put(m,sample+0x968,decoder);put(m,F-8,0x4adb56);setGameAudioSampleFlags(sample,ptr(m,F-4),{...runtime,scratchBase:F-8});
 const stream=ptr(m,decoder+12),callback=stream?stream+28:0,alignment=((m.readUInt16LE(decoder+0x8e)>>>3)*m.readInt16LE(decoder+0x82))&65535;m.writeUInt16LE(alignment,decoder+0x8c);put(m,decoder+0x88,Math.imul(alignment,m.readInt32LE(decoder+0x84)));let format=decoder+0x80,returned=0x4adbbe;
 if(m[decoder+0x92]===1&&stream){const formatTarget=ptr(m,ptr(m,stream)+16);if(formatTarget!==0x4b3ed0)throw Error(`Unported stream format0x${formatTarget.toString(16)}.`);put(m,F-4,0x4adba0);format=stream+8;returned=0x4adba9;}
 put(m,F-4,callback);put(m,F-8,format);put(m,F-12,returned);createGameAudioStreamChannel(sample,format,callback,{...runtime,scratchBase:F-12,entryRegisters:{...runtime.entryRegisters,EBX:callback,ESI:decoder,EDI:sample}});
}
