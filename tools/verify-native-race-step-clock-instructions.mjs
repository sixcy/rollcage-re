//Complete441c70 timing path; genuine timer, integer and conversion children.
//Only the declared synthetic Windows counter/frequency services are supplied.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readInstructionEvidence} from './lib/instruction-evidence.mjs';
import {REDUX_SHA256} from './lib/retained-native-program.mjs';
import {decodePhysicsNumericalContext} from '../src/race-clock.mjs';
import {runNativeRaceStepClock} from '../src/native-race-step-clock.mjs';

export const originalClockTarget = 'C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe';
const STACK = 0x18000, QPF = 0xa20010, QPC = 0xa20014;
const put = (m,p,v) => m.writeUInt32LE(v>>>0,p);
const i64 = n => BigInt.asIntN(64,n);
const hex = b => b.toString('hex');
export const nativeClockSchedulingScenarios = Object.freeze([
  ...[8,9,10,0x7fffffff,0xffffffff].map(streak=>({label:`backlog2-streak${streak}`,streak,elapsed:3450000n,target:103,expected:streak===8||streak===0xffffffff?1:2})),
  ...[8,9].map(streak=>({label:`backlog3-streak${streak}`,streak,elapsed:3500000n,target:104,expected:streak===8?1:3})),
  {label:'backlog1-reset',streak:9,elapsed:3400001n,target:102,expected:1},
  {label:'equal-target-reset',streak:9,elapsed:3366667n,target:101,expected:1},
  {label:'behind-target-reset',streak:9,elapsed:3300000n,target:98,expected:1},
  {label:'zero-elapsed',streak:9,elapsed:0n,target:0,expected:1},
]);

export async function loadNativeClockInstructionProgram(target = originalClockTarget) {
  const pe = await readFile(target);
  assert.equal(createHash('sha256').update(pe).digest('hex'), REDUX_SHA256, 'Exact original executable');
  const h = pe.readUInt32LE(60), optional = h+24, image = Buffer.alloc(0xa00000);
  assert.equal(pe.readUInt16LE(optional), 0x10b); assert.equal(pe.readUInt32LE(optional+28), 0x400000);
  for (let i=0;i<pe.readUInt16LE(h+6);i++) {
    const row = optional+pe.readUInt16LE(h+20)+i*40;
    const start = pe.readUInt32LE(row+20), length = pe.readUInt32LE(row+16), address = 0x400000+pe.readUInt32LE(row+12);
    assert.ok(start+length<=pe.length && address+length<=image.length);
    pe.copy(image,address,start,start+length);
  }
  const programs = await Promise.all([
    readInstructionEvidence(['010-clock-source-assembly.json','021-platform-clock-assembly.json','027-clock-uint-to-double.json','028-clock-double-to-uint.json','029-double-conversion-body.json'], {directory:'analysis/physics-clock-elevated-20261022/results'}),
    readInstructionEvidence(['1047-world-particle-count-convert-assembly.json','20261024-clock-status-568bfd-assembly.json','961-world-color-long-multiply-assembly.json','20261024-clock-signed64-division-assembly.json'], {directory:'analysis/native-simulation/results'})
  ]);
  const instructions = new Map(), evidence = [];
  for (const p of programs) {
    for (const e of p.evidence) {assert.equal(e.subject.digest.sha256,REDUX_SHA256); evidence.push(e.evidence_id);}
    for (const row of p.instructions) {if(instructions.has(row.address))assert.deepEqual(instructions.get(row.address),row);instructions.set(row.address,row);}
  }
  return {image, instructions:[...instructions.values()].sort((a,b)=>a.address-b.address), evidence:[...new Set(evidence)], targetSha256:REDUX_SHA256};
}

export function createNativeClockInstructionFixture(index, image) {
  assert.ok(Number.isSafeInteger(index) && index>=0);
  const memory = Buffer.from(image), current = [0,1,100,0xfffffffe,0xffffffff][index%5];
  const flags = [0,1,2,4,6,0x80,0x81,0x83,0x85,0x87,0xffffffff][Math.floor(index/5)%11];
  const streak = [0,1,8,9,10,0x7fffffff,0xffffffff][Math.floor(index/11)%7];
  const frequency = [1000000n,3579545n,10000000n,1n,0x100000001n,-1000000n,-1n][index%7];
  const clockOrigin = [0n,999000000n,0xffffffffn,(1n<<63n)-1n,-(1n<<63n),-1n][index%6];
  const performanceOrigin = [0n,1000000000000n,(1n<<63n)-100n,-(1n<<63n)+100n][index%4];
  const counterDelta = [1n,33333n,33334n,100000n,1000000n,0x100000000n,-1n,-33334n,(1n<<63n)-1n,-(1n<<63n)][index%10];
  const initialized = [0,1,0xffffffff][Math.floor(index/5)%3];
  const stack = STACK + ((index&1)?4:0);
  memory.fill(0x69^(index&31),stack-0x200,stack+0x10);
  put(memory,stack,0xffffffff); put(memory,0x6e66f8,current); put(memory,0x6e66e4,streak); put(memory,0x6eafe0,flags);
  put(memory,0x6e6c8c,initialized); memory.writeBigInt64LE(clockOrigin,0x6e66b0);
  memory.writeBigInt64LE(frequency,0x7135a4); memory.writeBigInt64LE(performanceOrigin,0x7135ac);
  put(memory,0x56e114,QPF); put(memory,0x56e0fc,QPC);
  put(memory,0x90a548,0x12340000+index); put(memory,0x6e675c,0xfedc0000+index);
  const entryRegisters = {EBX:0x11223344,EBP:0x55667788,ESI:0x89abcdef,EDI:0xdeadbeef};
  const numericalContext = decodePhysicsNumericalContext({x87ControlWord:index&1?0x27f:0x7f,mxcsr:index&2?0x1fa7:0x1f80});
  return {memory,scratchBase:stack,moduleBaseAddress:0x400000,entryRegisters,numericalContext,
    fixture:{index,current,flags,streak,frequency,clockOrigin,performanceOrigin,counterDelta,initialized,qpfResult:index%13===0?0:1,qpcResult:index%17===0?0:1}};
}

function servicesFor(runtime) {
  const {memory:m,fixture:f} = runtime, trace = [];
  const platformCall = (name,args,context={}) => {
    assert.ok(name==='QueryPerformanceCounter'||name==='QueryPerformanceFrequency'); assert.equal(args.length,1);
    assert.ok(Number.isSafeInteger(context.scratchBase), 'Actual external callee entry ESP');
    const entryEsp=context.scratchBase, returnAddress=m.readUInt32LE(entryEsp), argument=m.readUInt32LE(entryEsp+4);
    assert.equal(argument,args[0]>>>0,'Actual pushed platform output pointer');
    const nonvolatiles=Object.fromEntries(['EBX','EBP','ESI','EDI'].map(name=>{
      assert.ok(Number.isInteger(context.entryRegisters?.[name]),`Actual platform incoming ${name}`);
      return [name,context.entryRegisters[name]>>>0];
    }));
    const address=args[0]>>>0, before=hex(m.subarray(address,address+8)), callerStack=hex(m.subarray(entryEsp,entryEsp+12)); let returnedEax;
    if(name==='QueryPerformanceFrequency') {returnedEax=f.qpfResult;if(returnedEax)m.writeBigInt64LE(f.frequency,address);}
    else {returnedEax=f.qpcResult;if(returnedEax)m.writeBigInt64LE(i64(f.performanceOrigin+(address===0x7135ac?0n:f.counterDelta)),address);}
    trace.push({name,args:[address],entryEsp,returnAddress,nonvolatiles,callerStack,before,after:hex(m.subarray(address,address+8)),returnedEax});
    return returnedEax;
  };
  return {trace,platformCall};
}

export async function verifyNativeRaceStepClockInstructions({fixtures=330,output,target}={}) {
  assert.ok(Number.isSafeInteger(fixtures)&&fixtures>0&&fixtures<=10000);
  const program=await loadNativeClockInstructionProgram(target), machine=new BoundedX86(program.instructions,{entry:0x441c70});
  const reached=new Map(), visits=new Map(); let steps=0, apiSite;
  const watched=new Set([0x441c70,0x489cd0,0x568d6e,0x568c41,0x568bfd,0x568f10,0x569380]);
  machine.onInstruction=address=>{steps++;reached.set(address,(reached.get(address)??0)+1);if(watched.has(address))visits.set(address,(visits.get(address)??0)+1);if([0x489cfb,0x489d0a,0x489d11].includes(address))apiSite=address;};
  let firstDelivery=0, initializedCalls=0, qpfFailures=0, qpcFailures=0, catchup=0;
  const explicitScheduling = [];
  for(let index=0;index<fixtures+nativeClockSchedulingScenarios.length;index++) {
    const runtime=createNativeClockInstructionFixture(index,program.image), scenario=nativeClockSchedulingScenarios[index-fixtures];
    if(scenario) {
      Object.assign(runtime.fixture,{current:101,flags:0x83,streak:scenario.streak,frequency:1000000n,clockOrigin:0n,performanceOrigin:0n,counterDelta:scenario.elapsed,initialized:1,qpfResult:1,qpcResult:1});
      put(runtime.memory,0x6e66f8,101);put(runtime.memory,0x6e66e4,scenario.streak);put(runtime.memory,0x6eafe0,0x83);put(runtime.memory,0x6e6c8c,1);
      runtime.memory.writeBigInt64LE(0n,0x6e66b0);runtime.memory.writeBigInt64LE(1000000n,0x7135a4);runtime.memory.writeBigInt64LE(0n,0x7135ac);
    }
    const sourceServices=servicesFor(runtime), logicalBefore=runtime.memory.readUInt32LE(0x90a548), sampleBefore=runtime.memory.readUInt32LE(0x6e675c);
    let sourceReturn;
    runtime.observeNativeClock=event=>{if(event.stage==='return')sourceReturn=event;};
    machine.reset();runtime.memory.copy(machine.bytes);Object.assign(machine.r,Object.fromEntries(Object.entries(runtime.entryRegisters).map(([k,v])=>[k,v|0])),{ESP:runtime.scratchBase});
    machine.setFpuControlWord(runtime.numericalContext.x87.controlWord);
    const instructionServices=servicesFor({...runtime,memory:machine.bytes});
    for(const [address,name]of[[QPF,'QueryPerformanceFrequency'],[QPC,'QueryPerformanceCounter']])machine.externalCalls.set(address,m=>{
      const argument=m.bytes.readUInt32LE(m.r.ESP), returnAddress=new Map([[0x489cfb,0x489d01],[0x489d0a,0x489d0c],[0x489d11,0x489d13]]).get(apiSite);
      assert.ok(returnAddress,'Reached original Windows API call site');
      m.bytes.writeUInt32LE(returnAddress,m.r.ESP-4); //Architectural CALL preimage retained below the implicit platform ABI.
      m.r.EAX=instructionServices.platformCall(name,[argument],{scratchBase:m.r.ESP-4,
        entryRegisters:Object.fromEntries(['EBX','EBP','ESI','EDI'].map(name=>[name,m.r[name]>>>0]))});m.r.ESP+=4;
    });
    try {
      runtime.services={platformCall:sourceServices.platformCall};
      const count=runNativeRaceStepClock(runtime); machine.run(100000);
      assert.equal(machine.r.EAX>>>0,count>>>0,`fixture${index} returned count`);
      assert.deepEqual(sourceServices.trace,instructionServices.trace,`fixture${index} exact ordered API inputs/preimages/outputs`);
      if(!runtime.memory.equals(machine.bytes)) {
        const at=runtime.memory.findIndex((value,i)=>value!==machine.bytes[i]);
        assert.fail(`fixture${index} byte0x${at.toString(16)} source${runtime.memory[at]} instruction${machine.bytes[at]}`);
      }
      for(const [name,value]of Object.entries(runtime.entryRegisters))assert.equal(machine.r[name]>>>0,value>>>0,`fixture${index} original ${name}`);
      assert.ok(sourceReturn,'Source completed its own epilogue');
      for(const [name,value]of Object.entries(sourceReturn.registers)) {
        const expected=name==='esp'?machine.r.ESP+4:name==='eip'?machine.bytes.readUInt32LE(machine.r.ESP):machine.r[name.toUpperCase()]>>>0;
        assert.equal(value>>>0,expected>>>0,`fixture${index} source-derived return ${name}`);
      }
      assert.equal(machine.fpuControlWord,runtime.numericalContext.x87.controlWord);
      assert.equal(runtime.memory.readUInt32LE(0x90a548),logicalBefore);assert.equal(runtime.memory.readUInt32LE(0x6e675c),sampleBefore);
      if(runtime.fixture.current===0)firstDelivery++;else initializedCalls++;
      if(sourceServices.trace.some(e=>e.name==='QueryPerformanceFrequency'&&!e.returnedEax))qpfFailures++;
      if(sourceServices.trace.some(e=>e.name==='QueryPerformanceCounter'&&!e.returnedEax))qpcFailures++;
      if(count>1)catchup++;
      if(scenario){assert.equal(count,scenario.expected,scenario.label);assert.equal(sourceReturn.targetClock,scenario.target,`${scenario.label} derived timer/conversion target`);explicitScheduling.push({label:scenario.label,count,targetClock:sourceReturn.targetClock,streak:runtime.memory.readUInt32LE(0x6e66e4)});}
    } catch(error) {
      error.message=`${error.message}\nClock fixture${index}: ${JSON.stringify(runtime.fixture,(_,v)=>typeof v==='bigint'?v.toString():v)}`;
      throw error;
    }
  }
  const report={schemaVersion:1,matched:true,targetSha256:REDUX_SHA256,evidence:program.evidence,
    method:'Full441c70 with genuine489cd0,568d6e,568c41/568bfd,568f10 and569380 instructions; no game/timer/conversion/integer answer hooks. Only declared synthetic Windows QPF/QPC results supplied. Exact whole fixture memory includes caller stack and helper argument mutations.',
    authority:'constructed-inputs-with-retained-original-instructions',fixtures,totalFixtures:fixtures+nativeClockSchedulingScenarios.length,explicitScheduling,firstDelivery,initializedCalls,qpfFailures,qpcFailures,catchup,
    instructionSteps:steps,reachedInstructions:reached.size,actualChildren:Object.fromEntries([...visits].map(([k,v])=>[`0x${k.toString(16)}`,v])),
    schedulerInstructions:program.instructions.filter(r=>r.address>=0x441c70&&r.address<=0x441d66).length,
    schedulerInstructionsReached:program.instructions.filter(r=>r.address>=0x441c70&&r.address<=0x441d66&&reached.has(r.address)).length,
    comparedStack:{entryEspVariants:[STACK,STACK+4],length:0x188,alsoComparedInWholeMemory:true,sourceReturnSubsetCompared:true},
    excluded:['No original-process clock or continuous-race comparison','Full private CPU registers/EFLAGS, SSE sticky exception state and unsupported except1 branch','Outer450d60/440930,input/render/event-loop producers remain unconnected']};
  if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [output,fixtures='330']=process.argv.slice(2);
  console.log(JSON.stringify(await verifyNativeRaceStepClockInstructions({output,fixtures:Number(fixtures)})));
}
