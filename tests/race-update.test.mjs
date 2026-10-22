import test from 'node:test';
import assert from 'node:assert/strict';
import {runRaceUpdate} from '../src/race-update.mjs';
import {initializeVehicleHapticsConstants} from '../src/vehicle-haptics.mjs';
import {initializeWheelRenderTables} from '../src/wheel-render-state.mjs';

const BODY=0x10000,SESSION=0x30000,ALT=0x31000,CONFIG=0x32000,SCENE=0x33000,ROWS=0x34000,STACK=0x9000;
function fixture(count=2){
  const memory=Buffer.alloc(0xa00000),log=[],overrides={},put=(address,value)=>memory.writeInt32LE(value|0,address);
  put(0x5ecb1c,SESSION);put(0x5ecefc,CONFIG);put(0x90b990,SCENE);memory[SESSION+0x54d]=count;put(SESSION+0x57c,4);
  for(let index=0;index<count;index++){const body=BODY+index*0x4000;put(0x909300+index*0x30c,body);memory[body+0x718]=8;put(body+0x710,index+10);}
  const handlers=new Proxy({}, {get:(_,name)=>{
    if(name==='audioManagerCall')return(manager,method,args)=>log.push([name,manager,method,args]);
    if(typeof name!=='string'||!name.startsWith('call'))return undefined;
    return request=>{log.push([name,request.ecx,request.edx]);if(overrides[name])return overrides[name](request);return 0;};
  }});
  return {memory,put,log,overrides,handlers,run:(iteration=0,total=1)=>runRaceUpdate(iteration,total,{memory,scratchBase:STACK,handlers})};
}

test('native sweeps finish all planning before route control, audio and paired input passes',()=>{
  const f=fixture();f.put(BODY+0x4000+0x690,1);f.put(BODY+0x4000+0x694,99);
  f.overrides.call410220=()=>{assert.equal(f.memory.readInt32LE(BODY+0x70c),10);assert.equal(f.memory.readInt32LE(BODY+0x4000+0x70c),99);};
  f.run();assert.deepEqual(f.log.slice(0,13).map(([name,ecx])=>[name,ecx]),[
    ['call410220',BODY],['call410220',BODY+0x4000],['call431750',BODY],['call431750',BODY+0x4000],['call485300',BODY],['call485300',BODY+0x4000],['call42a6e0',BODY],['call42be80',0x909300],['call42a6e0',BODY+0x4000],['call42be80',0x90960c],['call49bbc0',undefined],['call42a9a0',BODY],['call42a9a0',BODY+0x4000]
  ]);
  const names=f.log.map(row=>row[0]);assert(names.indexOf('call47ccc0')<names.indexOf('call443d90'));assert(names.indexOf('call443d90')<names.indexOf('call41d2b0'));
});

test('linked-control global replacement does not replace the handling loop captured session',()=>{
  const f=fixture();f.overrides.call49bbc0=()=>f.put(0x5ecb1c,ALT);f.run();
  assert.equal(f.log.filter(row=>row[0]==='call42a9a0').length,2);assert.equal(f.log.filter(row=>row[0]==='call443d90').length,0);
});

test('authored-coordinate restoration preserves native forward word propagation',()=>{
  const f=fixture(0);f.memory[SCENE+0xfc]=1;f.put(0x90b994,ROWS);f.put(0x90b998,1);f.put(ROWS,ROWS+6);
  [11,22,33].forEach((value,index)=>f.memory.writeUInt16LE(value,ROWS+4+index*2));f.run();
  assert.deepEqual([6,8,10].map(offset=>f.memory.readUInt16LE(ROWS+offset)),[11,11,11]);
});

test('final-substep branch reads the live argument after ordinary game stages',()=>{
  const f=fixture(0);f.overrides.call480e90=()=>f.put(STACK+4,2);f.run(1,99);
  assert.deepEqual(f.log.find(row=>row[0]==='call44d960'),['call44d960',0,undefined]);assert(f.log.some(row=>row[0]==='call42b530'));
});

test('mirror scales and configured audio flag publish before manager service',()=>{
  const f=fixture(0);f.memory[SESSION+0x58b]=1;f.put(CONFIG+0x404,123);f.overrides.call484880=()=>{
    assert.equal(f.memory.readUInt32LE(0x5ecdb4),0xb5800000);assert.equal(f.memory.readUInt32LE(0x5ecdb0),0xb7f00000);assert.equal(f.memory.readInt32LE(0x6e6bd4),123);
  };
  f.overrides.call47f370=()=>1;f.put(0x90a548,77);assert.equal(f.run(),0);assert.equal(f.memory.readInt32LE(0x90a548),77);
});

test('default master-level virtual follows the live manager and preserves a NaN payload as raw bits',()=>{
  const f=fixture(0),oldManager=0x200000,manager=0x210000,table=0x220000;
  f.put(0x714b08,oldManager);f.put(manager,table);f.put(table+0x5c,0x4a90e0);f.put(oldManager+0x850,123);
  f.overrides.call484880=()=>{f.put(0x714b08,manager);f.put(0x5ecdb8,0x7fc12345);};
  const handlers=new Proxy(f.handlers,{get:(target,key)=>key==='audioManagerCall'?undefined:Reflect.get(target,key)});
  runRaceUpdate(0,1,{memory:f.memory,scratchBase:STACK,handlers});
  assert.equal(f.memory.readUInt32LE(manager+0x850),0x7fc12345);assert.equal(f.memory.readInt32LE(oldManager+0x850),123);
});

test('successful update wraps native counters and advances the nonzero signed countdown',()=>{
  for(const [countdown,expected]of [[0,0],[31,32],[32,0],[0x7fffffff,-2147483648]]){
    const f=fixture(0);f.put(0x90a548,0x7fffffff);f.put(0x6e675c,-1);f.put(0x6fb9a4,countdown);assert.equal(f.run(),1);
    assert.equal(f.memory.readInt32LE(0x90a548),-2147483648);assert.equal(f.memory.readInt32LE(0x6e675c),0);assert.equal(f.memory.readInt32LE(0x6fb9a4),expected);
  }
});

test('actual physics default requires its coherent mapped runtime context',()=>{
  const f=fixture(0);assert.throws(()=>runRaceUpdate(0,1,{memory:f.memory,scratchBase:STACK}),/call4749e0/);
});

test('real4180a0 loop bound follows the live session selection independently of participant count',()=>{
  const f=fixture(0),iterations=[];f.memory[SESSION+0x552]=3;f.memory[ALT+0x552]=2;
  f.overrides.call4180a0=request=>{iterations.push(request.ecx);if(request.ecx===0)f.put(0x5ecb1c,ALT);};
  const handlers=new Proxy(f.handlers,{get:(target,key)=>key==='call41bef0'?undefined:Reflect.get(target,key)});
  runRaceUpdate(0,1,{memory:f.memory,scratchBase:STACK,handlers});assert.deepEqual(iterations,[0,1]);
});

test('outer camera stage uses the actual direct-follow default with the live controller body',()=>{
  const f=fixture(1);f.put(0x909318,0x60000);f.put(0x60000,0x70000);f.put(0x91ff80,9);f.memory.writeUInt16LE(100,0x91ffb4);
  for(let i=0;i<54;i++)f.put(0x70034+i*4,17*i-3);
  const handlers=new Proxy(f.handlers,{get:(target,key)=>{
    if(key==='call4180a0'||key==='call41bef0')return undefined;
    if(key==='formatCameraName')return(output,format,index)=>f.memory.write(`${index} Player\0`,output);
    return Reflect.get(target,key);
  }});
  runRaceUpdate(0,1,{memory:f.memory,scratchBase:STACK,handlers});
  assert.deepEqual(f.memory.subarray(0x91ffc0,0x91ffc0+216),f.memory.subarray(0x70034,0x70034+216));assert.equal(f.memory.readUInt16LE(0x91ffb2),1);
});

test('outer update prepares wheel render objects from the current body pose',()=>{
  const f=fixture(1);initializeWheelRenderTables(f.memory);
  f.memory[BODY+0x718]=1;
  for(let lane=0;lane<9;lane++)f.memory.writeInt16LE(lane%4===0?4096:0,BODY+0xc4+lane*2);
  for(let index=0;index<4;index++)f.put(BODY+0x324+index*200+0x6c,0x40000+index*0x1000);
  f.overrides.call443d90=()=>f.put(BODY+0x34,0x12340000);
  f.overrides.call416400=()=>assert.equal(f.memory.readInt32LE(0x40000+0x34),0x12340000);
  const handlers=new Proxy(f.handlers,{get:(target,key)=>key==='call41d2b0'?undefined:Reflect.get(target,key)});
  runRaceUpdate(0,1,{memory:f.memory,scratchBase:STACK,handlers});
  assert.equal(f.log.some(row=>row[0]==='call41d2b0'),false);
});

test('outer update runs actual auxiliary animation after the wheel stage with its live control pointer',()=>{
  const f=fixture(1),control=0x50000,object=0x51000;
  f.memory[BODY+0x718]=1;f.put(BODY+0x11c,-1);
  for(let lane=0;lane<9;lane++)f.memory.writeInt16LE(lane%4===0?4096:0,BODY+0xc4+lane*2);
  f.put(control,object);f.put(control+4,BODY);
  f.overrides.call41d2b0=()=>{f.put(0x909318,control);for(const offset of[0x4c,0x58,0x80,0xb8])f.put(object+offset,123);};
  f.overrides.call48e310=()=>{for(const offset of[0x4c,0x58,0x80,0xb8])assert.equal(f.memory.readInt32LE(object+offset),0);};
  const handlers=new Proxy(f.handlers,{get:(target,key)=>key==='call416400'?undefined:Reflect.get(target,key)});
  runRaceUpdate(0,1,{memory:f.memory,scratchBase:STACK,handlers});
  assert.equal(f.log.some(row=>row[0]==='call416400'),false);assert.equal(f.memory[control+0x38],1);
});

test('ordinary outer update binds real surface drive after speed publication',()=>{
  const f=fixture(1),material=0x40000;
  f.memory.writeUInt32LE(material,BODY+0x198);f.memory[material+12]=1;f.put(BODY+0x6a8,17);
  f.overrides.call443d90=()=>{assert.equal(f.memory.readInt32LE(BODY+0x6a8),17);f.put(BODY+0x710,0x40);};
  const handlers=new Proxy(f.handlers,{get:(target,key)=>key==='call48d680'?undefined:Reflect.get(target,key)});
  runRaceUpdate(0,1,{memory:f.memory,scratchBase:STACK,handlers});assert.equal(f.memory.readInt32LE(BODY+0x6a8),17+0x3000);
});

test('ordinary update binds real phase and listener stages before advancing the clock',()=>{
  const f=fixture(0);f.put(SESSION+0x580,200);f.put(0x90a548,9);
  const handlers=new Proxy(f.handlers,{get:(target,key)=>['call47f370','call484880'].includes(key)?undefined:Reflect.get(target,key)});
  assert.equal(runRaceUpdate(0,1,{memory:f.memory,scratchBase:STACK,handlers}),1);
  assert.equal(f.memory.readInt32LE(SESSION+0x57c),4);assert.equal(f.memory.readInt32LE(SESSION+0x580),201);assert.equal(f.memory.readInt32LE(0x90a548),10);
  assert(f.log.some(row=>row[0]==='call477310'));
});

test('outer substeps advance actual light fades every time and age refresh words only on the final substep',()=>{
  const f=fixture(0),light=0x80f560,retained=0x80f5a0;
  f.put(0x80f20c,3);f.memory.writeUInt16LE(2,light+0x24);f.memory.writeUInt16LE(40,light+0x26);f.memory.writeUInt16LE(9,light+18);
  f.memory.writeUInt16LE(4,retained+0x24);f.memory.writeUInt16LE(9,retained+18);
  const handlers=new Proxy(f.handlers,{get:(target,key)=>['call44d960','call42b530'].includes(key)?undefined:Reflect.get(target,key)});
  runRaceUpdate(0,2,{memory:f.memory,scratchBase:STACK,handlers});
  assert.equal(f.memory.readInt16LE(light+0x26),39);assert.equal(f.memory.readUInt16LE(light+18),2);assert.equal(f.memory.readUInt16LE(retained+18),9);
  f.memory.writeUInt16LE(9,light+18);
  f.overrides.call484880=()=>assert.equal(f.memory.readUInt16LE(light+18),2);
  runRaceUpdate(1,2,{memory:f.memory,scratchBase:STACK,handlers});
  assert.equal(f.memory.readInt16LE(light+0x26),38);assert.equal(f.memory.readUInt16LE(retained+18),8);
  assert.equal(f.log.some(row=>row[0]==='call44d960'),false);
});

test('outer final substep uses the actual feedback parent and cache entry with native nested stack',()=>{
  const f=fixture(1),services=[];initializeVehicleHapticsConstants(f.memory);
  f.memory[0x909558]=2;f.memory.writeUInt16LE(7,0x90955c);f.put(BODY+0x11c,-1);f.memory.writeUInt16LE(100,BODY+0x668);
  //The platform explicitly reports that this device is unavailable. Both
  //407380 calls still execute; standard-container services are not reached.
  const handlers=new Proxy(f.handlers,{get:(target,key)=>{
    if(['call44d960','call42b530','call407380'].includes(key))return undefined;
    if(key==='deviceCall')return(manager,method,args,runtime)=>{services.push([method,args,runtime.scratchBase]);return 0;};
    return Reflect.get(target,key);
  }});
  runRaceUpdate(0,2,{memory:f.memory,scratchBase:STACK,handlers});assert.deepEqual(services,[]);
  runRaceUpdate(1,2,{memory:f.memory,scratchBase:STACK,handlers});
  assert.deepEqual(services,[[0x14,[7,3],STACK-80],[0x14,[7,3],STACK-80]]);
  assert.equal(f.log.some(row=>row[0]==='call42b530'||row[0]==='call407380'),false);
});

test('outer update publishes actual deformation phase and dirty range before object dispatch',()=>{
  const f=fixture(0),record=0x40000;f.put(0x80df00,1);f.put(0x80df04,record);f.memory[0x91ce90]=2;
  f.memory.writeUInt16LE(7,record);f.memory.writeUInt16LE(2047,record+2);
  f.overrides.call429f30=()=>{assert.equal(f.memory.readUInt16LE(record+2),0);assert.equal(f.memory.readUInt32LE(0x80f420),0x40000007);};
  const handlers=new Proxy(f.handlers,{get:(target,key)=>key==='call494f60'?undefined:Reflect.get(target,key)});
  runRaceUpdate(0,1,{memory:f.memory,scratchBase:STACK,handlers});assert.equal(f.log.some(row=>row[0]==='call494f60'),false);
});

test('outer update runs the actual object dispatcher before progression and physics',()=>{
  const f=fixture(0),list=0x40000,object=0x41000;f.put(0x91e778,1);f.put(0x91e77c,list);f.put(list,object);f.put(object,20);f.memory[SESSION+0x551]=3;f.put(0x91e744,7);
  f.overrides.call449640=()=>assert.equal(f.memory.readInt32LE(0x91e744),0);
  const handlers=new Proxy(f.handlers,{get:(target,key)=>key==='call429f30'?undefined:Reflect.get(target,key)});
  runRaceUpdate(0,1,{memory:f.memory,scratchBase:STACK,handlers});assert.equal(f.log.some(row=>row[0]==='call429f30'),false);
});

test('outer substeps advance and expire actual model fragments between their neighboring stages',()=>{
  const f=fixture(0),bank=0x40000,bucket=0x50000;f.put(0x810924,bank);f.put(0x902eec,BODY);f.put(bank+12,bucket);f.put(bank+0x1c,65536);f.put(bank+0x28,4);f.memory[bank+0x2c]=2;
  f.memory.writeUInt16LE(((bank-BODY+128)>>>7)&65535,bucket+10);
  const handlers=new Proxy(f.handlers,{get:(target,key)=>key==='call48edb0'?undefined:Reflect.get(target,key)});
  let lifetime=2;
  f.overrides.call481200=request=>{assert.equal(request.scratchBase,STACK-20);assert.equal(f.memory[bank+0x2c],lifetime);};
  f.overrides.call494140=()=>assert.equal(f.memory[bank+0x2c],Math.max(0,lifetime-1));
  for(let substep=0;substep<2;substep++){runRaceUpdate(substep,2,{memory:f.memory,scratchBase:STACK,handlers});lifetime--;}
  assert.equal(f.memory.readInt32LE(bank+0x10),4*65536);assert.equal(f.memory.readInt32LE(bank+0x14),2*0x48000);assert.equal(f.memory.readUInt16LE(bucket+10),0);
  const position=f.memory.subarray(bank+0x10,bank+0x1c).toString('hex');runRaceUpdate(0,1,{memory:f.memory,scratchBase:STACK,handlers});
  assert.equal(f.memory.subarray(bank+0x10,bank+0x1c).toString('hex'),position);assert.equal(f.log.some(row=>row[0]==='call48edb0'),false);
});
