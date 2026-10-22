import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {verifyRaceHudFonts} from './verify-race-hud-fonts-instructions.mjs';
import {loadInstalledLocalization} from './probe-localized-startup.mjs';
import {loadProcessedLocalization} from '../src/localization-resource.mjs';
import {initializeLocalizedRaceMessages} from '../src/localized-startup.mjs';
import {initializeNetworkStartupText} from '../src/race-startup-text.mjs';
import {getOrCreateViewportRecord} from '../src/weather-viewport.mjs';
const put=(m,p,v)=>m.writeInt32LE(v|0,p);
export async function verifyRaceStartupTextConnected({output='analysis/race-startup-text-connected-instruction-check.json'}={}) {
  const installed=await loadInstalledLocalization(),reached=new Set();let steps=0,operations=0,lookups=0,queries=0,parents=0;const fileCalls=[];
  const fontReport=await verifyRaceHudFonts({fixtures:4,deviceBits:32,output:null,afterFixture:async f=>{
    if(f.fixture!==3)return;
    const {memory,machine,runtime,source,native,entryRegisters,stackBase:S}=f,oldObserver=machine.onInstruction;
    machine.onInstruction=p=>{oldObserver?.(p);reached.add(p);if(p===0x439780)lookups++;if(p===0x40ab70)queries++;if(p===0x477000)parents++;};
    const prepare=m=>{
      installed.index.copy(m,0x170000);put(m,0x717388,0x170000);put(m,0x6e4900,0x1234);put(m,0x6e65f4,0);put(m,0x5ecb1c,0x60000);m.fill(0,0x60000,0x61400);m[0x6054d]=5;put(m,0x91d338,256);put(m,0x6efb38,0x150000);
      put(m,0x15007c,0x151000);for(const o of[0,4,8])put(m,0x151000+o,0x151000);m[0x15100c]=m[0x15100d]=1;m.write('0 Player\0',0x152000);put(m,0x152010,8);put(m,0x152014,15);
      const view=getOrCreateViewportRecord(0x15007c,0x152000,{memory:m,handlers:{allocate:()=>0x153000}});for(const[o,v]of[[8,0],[12,0],[16,641],[20,479]])put(m,view+o,v);
    };prepare(memory);prepare(machine.bytes);
    const wrap=(m,base,calls)=>{let cursor=0;return{libraryCall(name,args,r){if(name==='fseek'){assert.equal(args[0],0x1234);assert.equal(args[2],0);cursor=args[1];calls.push([name,...args]);return 0;}if(name==='fread'){assert.equal(cursor,installed.entry.offset);assert.equal(args[1]*args[2],installed.entry.storedBytes);installed.imageWindow.copy(m,args[0],cursor,cursor+args[1]*args[2]);cursor+=args[1]*args[2];calls.push([name,...args]);return args[2];}if(name==='strncpy'){let i=0;for(;i<args[2]&&m[args[1]+i];i++)m[args[0]+i]=m[args[1]+i];m.fill(0,args[0]+i,args[0]+args[2]);return args[0];}return base.libraryCall(name,args,r);}};};
    machine.externalCalls.set(0x568980,m=>{m.r.ESP-=m.r.EAX;});
    const sourceFiles=[],nativeFiles=[],sourceService=wrap(memory,source,sourceFiles),nativeService=wrap(machine.bytes,native,nativeFiles);
    for(const[address,name,count]of[[0x5688a2,'fseek',3],[0x568896,'fread',4],[0x590900,'strncpy',3]])machine.externalCalls.set(address,m=>{m.r.EAX=nativeService.libraryCall(name,Array.from({length:count},(_,i)=>m.bytes.readUInt32LE(m.r.ESP+i*4)));});
    put(memory,0x56e22c,0x590900);put(machine.bytes,0x56e22c,0x590900);
    const r={...runtime,services:{...runtime.services,libraryCall:sourceService.libraryCall}};
    const run=(entry,invoke,ecx=0)=>{invoke(r);machine.entry=entry;machine.r.ESP=S;Object.assign(machine.r,entryRegisters);machine.r.ECX=ecx;put(machine.bytes,S,-1);steps+=machine.run(150000000);operations++;const a=memory.subarray(0x10000),b=machine.bytes.subarray(0x10000);if(!a.equals(b)){const o=a.findIndex((v,i)=>v!==b[i]);assert.fail('entry'+entry.toString(16)+' operation'+operations+' diff0x'+(o+0x10000).toString(16)+' native'+b[o]+' source'+a[o]);}};
    run(0x439090,loadProcessedLocalization);
    for(const language of[0,1]){
      memory.writeUInt16LE(language,0x6e65f0);machine.bytes.writeUInt16LE(language,0x6e65f0);run(0x479420,initializeLocalizedRaceMessages);
      for(const mode of[1,0]){run(0x477000,r=>initializeNetworkStartupText(mode,r),mode);assert.ok(memory[0x82dfac]>0);}
    }
    assert.deepEqual(sourceFiles,nativeFiles);fileCalls.push(...sourceFiles);machine.onInstruction=oldObserver;
  }});
  const report={matched:true,operations,actualStartupParents:parents,actualLocalizationLookups:lookups,actualViewportQueries:queries,instructionSteps:steps,reachedInstructions:reached.size,fontProducer:fontReport,localizationResource:{id:8,sha256:installed.decodedSha256,decodedBytes:installed.decoded.length},fileCalls,domain:'Persistent actual48b750 font/primitive producer from installed FONT_BMP resource9, actual439090 compressed installed resource8 loader/preprocessor, actual479420 English/French table producer, actual477000 mode1 inline and mode0?48b7d0 consumers with actual viewport map. All mapped bytes>=10000h after every operation; ordered source/native file, allocation, image worker and renderer interface services. Renderer78/88 remain declared adapters; no original process execution.'};if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await verifyRaceStartupTextConnected()));
