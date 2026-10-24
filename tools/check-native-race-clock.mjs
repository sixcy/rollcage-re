//Single source execution from original clock entry. Native later game bytes
//are comparisons only; the typed QPC service supplies its eight-byte outcome.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPhysicsCapture} from './lib/physics-capture-comparison.mjs';
import {createCapturedMemory} from './lib/captured-memory.mjs';
import {createNativeRaceClockInputs,verifyNativeRaceClockEvidence} from './lib/native-race-clock-inputs.mjs';
import {verifyNativeRaceClockCaptureConfiguration,verifyNativeRaceClockCaptureRecords,createNativeRaceClockCounterBinding} from './lib/native-race-clock-capture.mjs';
import {runNativeRaceStepClock} from '../src/native-race-step-clock.mjs';
import {REDUX_SHA256} from './lib/retained-native-program.mjs';

const rows = s => s.ranges instanceof Map ? [...s.ranges.values()] : s.ranges;
const at = (s,id) => {const found=rows(s).filter(r=>r.id===id);assert.equal(found.length,1,`Exact native clock row ${id}`);return found[0];};
const encode = (_,v) => typeof v==='bigint'?`0x${BigInt.asUintN(64,v).toString(16)}`:v;

export function compareNativeRaceClockRegions(memory,expected,regions,{excluded=[]}={}) {
  const compared=new Set(),different=new Set(),result=[];let firstDivergence=null;
  for(const region of regions) {
    const actual=at(expected,region.id);assert.equal(Number(actual.address),region.address);assert.equal(actual.bytes.length,region.length);
    const source=memory.subarray(region.address,region.address+region.length);let count=0,diff=0;
    for(let i=0;i<region.length;i++) {
      const p=region.address+i;
      if(excluded.some(r=>p>=r.address&&p<r.address+r.length))continue;
      compared.add(p);count++;
      if(source[i]!==actual.bytes[i]){different.add(p);diff++;firstDivergence??={id:region.id,address:p,offset:i,sourceByte:source[i],nativeByte:actual.bytes[i]};}
    }
    result.push({id:region.id,address:region.address,length:region.length,comparedBytes:count,differingBytes:diff});
  }
  return {matched:different.size===0,uniqueBytesCompared:compared.size,differingBytes:different.size,firstDivergence,regions:result,excluded};
}

function compareRegisters(produced,expected) {
  return Object.entries(produced).map(([name,value])=>({name,source:value>>>0,native:Number(expected.registers[name])>>>0,matched:(value>>>0)===(Number(expected.registers[name])>>>0)}));
}

export function describeNativeCounterStackEffects(proof) {
  const l=proof.layout,before=at(proof.counterCall,'race-clock-stack'),after=at(proof.counterReturn,'race-clock-stack');
  assert.equal(Number(before.address),l.stackAddress);assert.equal(Number(after.address),l.stackAddress);
  const groups={privateApiStack:[],cpuCallReturn:[],counterOutput:[],other:[]};
  for(let i=0;i<before.bytes.length;i++)if(before.bytes[i]!==after.bytes[i]) {
    const p=l.stackAddress+i;
    const kind=p<l.frame-8?'privateApiStack':p<l.frame-4?'cpuCallReturn':p>=l.outputAddress&&p<l.outputAddress+8?'counterOutput':'other';
    groups[kind].push({address:p,before:before.bytes[i],after:after.bytes[i]});
  }
  return Object.fromEntries(Object.entries(groups).map(([kind,changes])=>[kind,{differingBytes:changes.length,firstChanges:changes.slice(0,24)}]));
}

export async function checkNativeRaceClock(input,output) {
  const capture=await loadPhysicsCapture(input,{expectedSha256:REDUX_SHA256});
  const configuration=JSON.parse(await readFile(path.join(input,'configuration.json')));
  verifyNativeRaceClockCaptureConfiguration(configuration);
  const records=(await readFile(path.join(input,'trace.jsonl'),'utf8')).trim().split(/\r?\n/).map(JSON.parse);
  const proof=verifyNativeRaceClockCaptureRecords({capture,configuration,records});
  const evidence=await verifyNativeRaceClockEvidence();
  await mkdir(output);
  for(const name of ['configuration.json','trace.jsonl'])await copyFile(path.join(input,name),path.join(output,name),constants.COPYFILE_EXCL);
  const report={schemaVersion:1,method:'original-entry-source-warm-race-clock',authority:'original-process-with-declared-instrumentation',
    targetSha256:REDUX_SHA256,captureDirectory:path.resolve(input),evidenceIds:evidence.evidenceIds,
    matched:false,sourceExecuted:false,sourceComplete:false,clockResultMatched:false,scaledClockMatched:false,stages:[],sourceEvents:[],counterEvents:[],
    transport:{verified:true,entryOrdinal:proof.entry.ordinal,counterCallOrdinal:proof.counterCall.ordinal,
      counterReturnOrdinal:proof.counterReturn.ordinal,returnOrdinal:proof.returned.ordinal,ownerMainTid:proof.ownerMainTid,
      moduleBaseAddress:proof.moduleBaseAddress,layout:proof.layout},
    counterStackEffects:describeNativeCounterStackEffects(proof),
    limits:['One original warm441c70 call; no natural cadence, second parent tick or continuous-race proof.',
      'Original entry supplies all game/storage inputs. Counter/final game bytes remain comparison-only.',
      'Typed QPC supplies only its actual eight-byte output and BOOL. Native private API stack residues are retained and compared, never silently copied.',
      'Counter-call comparison omits only the four-byte CPU CALL return slot already published in source; the actual489d13 return word is checked independently.',
      'The final raw XMM0 low64 is compared with the source MULSD result: the reached signed converter and masked status path preserve XMM0. Offline count1 alone would not validate the conversion chain.',
      'Only source-produced known return registers and numerical fields are compared; complete private CPU/CRT ABI and unobserved scenarios remain open.']};
  try {
    const inputs=createNativeRaceClockInputs(proof.entry,{moduleBaseAddress:proof.moduleBaseAddress});
    //No aliases: fixed instruction operands use the actual module, while the
    //stack, saved values, pointers and external output retain actual addresses.
    const source=createCapturedMemory(inputs.rows),m=source.memory;
    const observe=row=>report.sourceEvents.push(row);
    const onCounter=(row,expected,excluded=[])=>{
      const comparison=compareNativeRaceClockRegions(m,expected,inputs.semanticRegions,{excluded});
      const registers=compareRegisters(row.sourceRegisters,expected);
      report.stages.push({stage:row.stage,comparison,registers,matched:comparison.matched&&registers.every(r=>r.matched)});
    };
    const binding=createNativeRaceClockCounterBinding({proof,memory:m,
      onCall:row=>onCounter(row,proof.counterCall,[{address:proof.layout.frame-8,length:4,reason:'CPU CALL has published its return word after the before-CALL native snapshot.'}]),
      onReturn:row=>onCounter(row,proof.counterReturn)});
    report.counterEvents=binding.events;
    report.sourceCount=runNativeRaceStepClock({memory:m,moduleBaseAddress:proof.moduleBaseAddress,scratchBase:inputs.entryEsp,
      numericalContext:inputs.numericalContext,entryRegisters:inputs.entryRegisters,
      observeNativeClock:observe,services:{platformCall:binding.platformCall}});
    binding.assertComplete();report.sourceExecuted=true;
    const final=report.sourceEvents.findLast(e=>e.stage==='return');assert.ok(final,'Source executed its own clock epilogue');
    const comparison=compareNativeRaceClockRegions(m,proof.returned,inputs.semanticRegions),registers=compareRegisters(final.registers,proof.returned);
    const numericalFields={x87ControlWord:'fpuControlWord',x87StatusWord:'fpuStatusWord',mxcsr:'mxcsr'};
    const numerical=Object.entries(final.numericalState).map(([name,value])=>({name,source:value,native:Number(proof.returned.registers[numericalFields[name]]),matched:value===Number(proof.returned.registers[numericalFields[name]])}));
    const scale=report.sourceEvents.findLast(e=>e.stage==='scale');assert.ok(scale,'Warm source executed its original scalar multiply');
    const encodedScale=Buffer.alloc(8);encodedScale.writeDoubleLE(scale.value);
    assert.equal(proof.returned.context.readUInt32LE(0)&0x10020,0x10020,'Final context includes the captured extended XMM state');
    const nativeScale=proof.returned.context.subarray(364,372); //WOW64_CONTEXT ExtendedRegisters204 + FXSAVE XMM0 offset160.
    report.scaledClock={sourceHex:encodedScale.toString('hex'),nativeHex:nativeScale.toString('hex'),sourceValue:scale.value,nativeValue:nativeScale.readDoubleLE(),matched:encodedScale.equals(nativeScale)};
    report.scaledClockMatched=report.scaledClock.matched;
    report.stages.push({stage:'return',comparison,registers,numerical,scaledClock:report.scaledClock,matched:comparison.matched&&registers.every(r=>r.matched)&&numerical.every(r=>r.matched)&&report.scaledClockMatched});
    report.clockResultMatched=registers.every(r=>r.matched)&&report.scaledClockMatched&&comparison.regions.filter(r=>r.id!=='race-clock-stack').every(r=>r.differingBytes===0);
    report.matched=report.stages.every(s=>s.matched);report.sourceComplete=report.matched;
  }catch(error){report.error=error.stack;report.boundary=error.nativeClockConversionBoundary;}
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,encode,2)+'\n',{flag:'wx'});
  return {report,output:path.resolve(output)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [input,output,...extra]=process.argv.slice(2);if(!input||!output||extra.length)throw Error('Usage: node tools/check-native-race-clock.mjs CAPTURE NEW_REPORT_DIRECTORY');
  const {report}=await checkNativeRaceClock(input,output);
  console.log(JSON.stringify({matched:report.matched,sourceExecuted:report.sourceExecuted,clockResultMatched:report.clockResultMatched,
    stages:report.stages.map(s=>({stage:s.stage,matched:s.matched,firstDivergence:s.comparison.firstDivergence})),counterStackEffects:report.counterStackEffects,error:report.error,output}));
  if(!report.matched)process.exitCode=1;
}
