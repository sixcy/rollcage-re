import {getGameAudioLoopFlag,isGameAudioSamplePending} from './audio-sample-controls.mjs';
import {getApplicationDebugger} from './application-bootstrap.mjs';
const ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p);
function save(r,S,rows){for(const[n,o]of rows)if(Number.isInteger(r.entryRegisters?.[n]))put(r.memory,S+o,r.entryRegisters[n]);}
function sampleQuery(object,slot,top,returned,r){const m=r.memory,target=ptr(m,ptr(m,object)+slot);put(m,top-4,returned);if(target===0x4ad500)return getGameAudioLoopFlag(object,r);if(target===0x4ad570)return isGameAudioSamplePending(object,r);throw Error('Unported source update query0x'+target.toString(16));}
function com(owner,slot,args,top,returned,r){const m=r.memory;for(let i=args.length-1;i>=0;i--)put(m,top-(args.length-i)*4,args[i]);const S=top-args.length*4-4;put(m,S,returned);if(typeof r.services?.xAudio2Call!=='function')throw Error('Source update requires genuine XAudio2 COM interface.');return r.services.xAudio2Call(owner,slot,args.map((_,i)=>ptr(m,S+4+i*4)),{...r,scratchBase:S});}
function stop(object,top,returned,r){const voice=ptr(r.memory,object+0x97c);if(voice)com(voice,0x50,[voice,32,0],top,returned,r);}
function flush(object,top,returned,r){const voice=ptr(r.memory,object+0x97c);return com(voice,0x58,[voice],top,returned,r);}

//4adc40: two raw Boolean bytes are read late from native entryESP+4/+8.
export function updateAudioSourcePlaybackState(object,runtime){
 const{memory:m,scratchBase:S}=runtime,F=S-8;save(runtime,S,[['ESI',-4],['EDI',-8]]);
 const voice=ptr(m,object+0x97c);com(voice,0x64,[voice,object+0x98c],F,0x4adc57,runtime);
 if(!sampleQuery(object,0x48,F,0x4adc60,runtime)&&sampleQuery(object,0x3c,F,0x4adc6d,runtime)===1&&m[object+0x99d]===1){
  const decoder=ptr(m,object+0x968),finished=decoder?m[decoder+0x6b]===1:(ptr(m,object+0x994)|ptr(m,object+0x998))===0;
  if(finished){stop(object,F,0x4adcab,runtime);flush(object,F,0x4adcb7,runtime);put(m,object+0x948,0);m.writeUInt16LE(1,object+0x99c);}
 }
 const changed=m[S+4],paused=m[S+8];
 if(changed===1&&paused===1){if(sampleQuery(object,0x3c,F,0x4adce5,runtime)===1){stop(object,F,0x4add01,runtime);put(m,object+0x948,1);}return;}
 const pending=ptr(m,object+0x94c);
 if(pending===0){stop(object,F,0x4add8a,runtime);flush(object,F,0x4add96,runtime);m[object+0x99c]=1;put(m,object+0x948,0);put(m,object+0x94c,4);}
 else if(pending===2){stop(object,F,0x4add5d,runtime);put(m,object+0x948,2);put(m,object+0x94c,4);}
 else if(changed===1&&paused===0&&ptr(m,object+0x948)===1)put(m,object+0x94c,3);
}

//4adf20: construct the real XAUDIO2_BUFFER from live waveform bytes before
//submitting it and starting the voice. Win32/COM operations remain services.
export function startAudioSourcePlayback(object,runtime){
 const{memory:m,scratchBase:S}=runtime,A=(S-4)&~15,F=A-64;
 save(runtime,S,[['EBP',-4]]);if(Number.isInteger(runtime.entryRegisters?.ESI))put(m,F,runtime.entryRegisters.ESI);
 let waveform=ptr(m,object+0x964);
 if(waveform&&m[object+0x99c]===1){
  m.copy(m,F+16,waveform+0x41c,waveform+0x42c);m.copy(m,F+32,waveform+0x42c,waveform+0x43c);put(m,F+48,ptr(m,waveform+0x43c));
  const loop=sampleQuery(object,0x48,F,0x4adf74,runtime);put(m,F+36,0);
  if(loop===1){waveform=ptr(m,object+0x964);const alignment=m.readUInt16LE(waveform+0x14);if(!alignment)throw RangeError('Native source playback divides by zero alignment.');put(m,F+44,255);put(m,F+40,Math.floor(ptr(m,F+20)/alignment));}
  else{put(m,F+40,0);put(m,F+44,0);}
  const voice=ptr(m,object+0x97c);com(voice,0x54,[voice,F+16,0],F,0x4adfc3,runtime);m.writeUInt16LE(0,object+0x99c);
 }
 const voice=ptr(m,object+0x97c),table=ptr(m,voice),result=com(voice,0x4c,[voice,0,0],F,0x4adfdc,runtime)|0;
 if(result){put(m,F-4,0x4adfe5);getApplicationDebugger({...runtime,scratchBase:F-4,nativeDebuggerFrame:'direct',entryRegisters:{...runtime.entryRegisters,ECX:table,EBP:S-4,ESI:object}});}
 put(m,object+0x94c,4);const state=result===0?3:1;put(m,object+0x948,state);return state;
}
