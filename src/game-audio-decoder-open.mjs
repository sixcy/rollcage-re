import {openGameAudioDecoderFile,resetGameMp3Decoder,resetGameOggDecoder} from './game-audio-decoder-lifecycle.mjs';
import {resetGameWaveDecoder,initializeGameWaveDecoder} from './game-audio-wave-decoder.mjs';
import {initializeGameMp3Decoder} from './game-audio-mp3-decoder.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
const save=(r,S,items)=>{for(const[reg,offset]of items)if(Number.isInteger(r.entryRegisters?.[reg]))put(r.memory,S+offset,r.entryRegisters[reg]);};
//4b48f0. Empty paths still set69/6b. A valid path resets the concrete codec,
//clears counters/closes the old handle, reopens, then initializes only if68=0.
export function openGameAudioDecoder(decoder,path,runtime){
 const m=runtime.memory,S=runtime.scratchBase,F=S-8;save(runtime,S,[['ESI',-4],['EDI',-8]]);path=ptr(m,S+4);m[decoder+0x69]=1;m[decoder+0x6b]=1;if(!path||!m.readUInt16LE(path))return 0;
 const resetTarget=ptr(m,ptr(m,decoder)+12),reset=resetTarget===0x4b4860?resetGameWaveDecoder:resetTarget===0x4b5280?resetGameOggDecoder:resetTarget===0x4b5a90?resetGameMp3Decoder:null;if(!reset)throw Error(`Unported decoder open reset0x${resetTarget.toString(16)}.`);const context={...runtime,entryRegisters:{...runtime.entryRegisters,ESI:decoder,EDI:path}};put(m,F-4,0x4b490f);reset(decoder,{...context,scratchBase:F-4});const handle=ptr(m,decoder+0x64);for(const o of[0x78,0x7c,0x70,0x74])put(m,decoder+o,0);
 if((handle|0)!==-1){put(m,F-4,handle);put(m,F-8,0x4b493a);runtime.services.platformCall('CloseHandle',[handle],{...runtime,scratchBase:F-8});put(m,decoder+0x64,-1);}put(m,F-4,path);put(m,F-8,0x4b4949);if(!(openGameAudioDecoderFile(decoder,path,{...context,scratchBase:F-8})&255))return 0;
 if(m[decoder+0x68]===0){const target=ptr(m,ptr(m,decoder)+8),initialize=target===0x4b4720?initializeGameWaveDecoder:target===0x4b5a10?initializeGameMp3Decoder:null;put(m,F-4,0x4b495a);if(initialize)initialize(decoder,{...context,scratchBase:F-4});else if(runtime.handlers?.initializeDecoder)runtime.handlers.initializeDecoder(decoder,{...context,scratchBase:F-4});else throw Error(`Unported decoder initialization0x${target.toString(16)}.`);}
 return m[decoder+0x68];
}
