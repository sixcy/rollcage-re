import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedListing} from './lib/retained-listing-program.mjs';
import {createVehicleFilterFixture,vehicleFilterAddresses} from './verify-vehicle-collision-filter-instructions.mjs';
import {initializeVehicleContactProfile,initializeVehicleContactProfileTables} from '../src/vehicle-contact-profile.mjs';
import {triggerVehicleContactRecovery} from '../src/vehicle-contact-state.mjs';
import {filterVehicleCollision} from '../src/vehicle-collision-filter.mjs';
import tables from '../src/vehicle-contact-profile-tables.json' with {type:'json'};

export async function verifyVehicleContactProfile({fixtures=4000,chainFixtures=1200,callbackFixtures=240,output='analysis/vehicle-contact-profile-instruction-check.json'}={}){
 const program=await loadRetainedNativeProgram(),listing=await loadRetainedListing('analysis/vehicle-filter-listing.json','analysis/native-simulation/results/1454-vehicle-filter-bytes.json'),machine=new BoundedX86([...program.instructions,...listing.instructions]),baseline=program.initializeMemory(Buffer.alloc(0xa00000)),memory=Buffer.alloc(baseline.length),STACK=0x9000;
 const retained=JSON.parse(await readFile(tables.retainedPath,'utf8')),evidence=retained.structuredContent??JSON.parse(retained.content.find(c=>c.type==='text').text);
 assert.equal(evidence.subject.digest.sha256,program.sha256);assert.equal(tables.bytesHex,evidence.normalized_result.bytes_hex.slice(0,144));
 const restored=Buffer.alloc(baseline.length,0x36);initializeVehicleContactProfileTables(restored);assert.equal(restored.subarray(tables.address,tables.address+72).toString('hex'),tables.bytesHex);assert.equal(restored[tables.address-1],0x36);assert.equal(restored[tables.address+72],0x36);
 let seed=0x41ebb0ab,instructionSteps=0,stores=0,recoveryCalls=0,aliasFixtures=0,sourceTrace=[],nativeTrace=[],tracing=false;const reached=new Set();
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed|0;};
 const sourceWrite=memory.writeInt32LE;memory.writeInt32LE=function(value,address){if(tracing&&address>=0x10000)sourceTrace.push({address,width:32,value:value|0});return sourceWrite.call(this,value,address);};
 const sourceWord=memory.writeUInt16LE;memory.writeUInt16LE=function(value,address){if(tracing&&address>=0x10000)sourceTrace.push({address,width:16,value:value&65535});return sourceWord.call(this,value,address);};
 const originalPut=machine.put.bind(machine);machine.put=(operand,value)=>{if(operand.includes('[')){const address=machine.address(operand),width=machine.width(operand);if(address>=0x10000)nativeTrace.push({address,width,value:width===8?value&255:width===16?value&65535:value|0});}originalPut(operand,value);};
 machine.onInstruction=address=>{reached.add(address);if(address===0x41f380)recoveryCalls++;};
 const put=(p,v)=>memory.writeInt32LE(v|0,p),word=(p,v)=>memory.writeUInt16LE(v&65535,p);
 const execute=(entry,body,intensity=0)=>{machine.entry=entry;machine.r.ECX=body;machine.r.EDX=intensity;machine.r.ESP=STACK;machine.bytes.writeInt32LE(-1,STACK);instructionSteps+=machine.run(100000);};
 const compare=(label,ordered=true)=>{
  const native=machine.bytes.subarray(0x10000),source=memory.subarray(0x10000);if(!native.equals(source)){const offset=native.findIndex((v,i)=>v!==source[i]);assert.fail(`${label} byte0x${(0x10000+offset).toString(16)} native${native[offset]} source${source[offset]}`);}
  if(ordered){assert.deepEqual(sourceTrace,nativeTrace,`${label} exact ordered memory stores`);stores+=sourceTrace.length;}
 };
 for(let fixture=0;fixture<fixtures;fixture++){
  baseline.copy(memory);initializeVehicleContactProfileTables(memory);
  const selector=fixture%12,profile=fixture%4===0?(random()>>>0)%256:fixture%7,row=0x5eadd4+profile*8;
  const candidates=[0x10000,0x140000,row-0x6f4,row-0x6f4+1,row-0x6f8-1,0x91f6a0-0x6f4,0x91f6a0-0x65e,0x5ea4d8-0x6f4,0x920f84-0x6f8,0x5ecb1c-0x6f8,0x5eae0c-0x6f4,0x5eae14-0x6f8];
  const body=candidates[selector],id=fixture%9===0?65535:fixture%256,session=fixture%5===0?body+0x6f4-id-0x1c:0x30000;
  if(selector>1||session!==0x30000)aliasFixtures++;
  put(body+0x6f4,random());put(body+0x6f8,random());word(body+0x65e,id);put(0x5ecb1c,session);memory[session+id+0x1c]=profile;
  if(fixture%3===0){put(row,random());put(row+4,random());}
  put(0x5ea4d8,[0,1,2,-1,3,0x7fffffff,-2147483648][Math.floor(fixture/12)%7]);put(0x920f84,[0,1,2,3,4,-1,0x7fffffff][Math.floor(fixture/84)%7]);
  machine.reset();memory.copy(machine.bytes);sourceTrace=[];nativeTrace=[];tracing=true;initializeVehicleContactProfile(body,{memory});tracing=false;execute(0x41ebb0,body);compare(`initializer${fixture}`);
 }
 for(let fixture=0;fixture<chainFixtures;fixture++){
  baseline.copy(memory);initializeVehicleContactProfileTables(memory);const body=0x10000+(fixture%4)*0x4000,session=0x30000;
  put(0x5ecb1c,session);word(body+0x65e,fixture%4);memory[session+fixture%4+0x1c]=fixture%7;put(0x5ea4d8,[0,1,2,-1][fixture%4]);put(0x920f84,fixture%5);put(body+0x6f4,random());put(body+0x6f8,random());
  word(body+0x6c4,[0,1,0x400,0x3ff,0x8000][fixture%5]);put(0x5ea4d4,[0,1,-1,0x7fffffff,-2147483648,random()][fixture%6]);
  const intensity=[0,19,20,21,255,0x7fffffff,-2147483648][fixture%7];machine.reset();memory.copy(machine.bytes);sourceTrace=[];nativeTrace=[];
  tracing=true;initializeVehicleContactProfile(body,{memory});tracing=false;execute(0x41ebb0,body);compare(`chainInitialize${fixture}`);
  sourceTrace=[];nativeTrace=[];tracing=true;triggerVehicleContactRecovery(body,intensity,{memory});tracing=false;execute(0x41f380,body,intensity);compare(`chainRecovery${fixture}`);
 }
 machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
 for(let fixture=0;fixture<callbackFixtures;fixture++){
  baseline.copy(memory);const f=createVehicleFilterFixture(fixture,memory),{body,other,event,scratchBase}=f;
  initializeVehicleContactProfileTables(memory);memory[vehicleFilterAddresses.session+memory.readUInt16LE(body+0x65e)+0x1c]=fixture%7;
  put(0x5ea4d8,fixture%3);put(0x920f84,fixture%4);word(body+0x6c4,0);memory[body+0x718]=8;memory[other+0x718]=1;put(other,3);memory[body+0x6c9]=0;memory[body+0x66f]=255;word(body+0x668,0);put(body+0x6bc,-1);
  for(let axis=0;axis<3;axis++)put(event+0x5c+axis*4,axis===fixture%3?[8,16,32,64][fixture%4]*65536:0);
  machine.reset();memory.copy(machine.bytes);sourceTrace=[];nativeTrace=[];tracing=true;initializeVehicleContactProfile(body,{memory});tracing=false;execute(0x41ebb0,body);compare(`callbackInitialize${fixture}`);
  sourceTrace=[];nativeTrace=[];const returned=filterVehicleCollision(body,other,event,f);
  machine.entry=0x41e080;machine.r.ESP=scratchBase;machine.bytes.writeInt32LE(-1,scratchBase);[body,other,event].forEach((v,i)=>machine.bytes.writeInt32LE(v|0,scratchBase+4+i*4));instructionSteps+=machine.run(2_000_000);assert.equal(machine.r.EAX,returned);compare(`callbackRecovery${fixture}`,false);
 }
 const report={method:'Actualwhole41ebb0 initializer with all sequential lane writes and difficulty/mode branches; live body/table/session/global aliases, arbitrary byte profile addressing over declared memory, original retained7packed rows+2recovery tables. Actual41ebb0→41f380 and41ebb0→41e080callback→score/recovery chains consume the produced91f6a0 pointer/profile bits and distinct recovery RNG. Every data byte10000h..9fffffh compared after each operation; initializer/directrecovery operations also compare every ordered memory store. Private stack excluded. Callback compiler cookie is the only admitted service; no game mocks, syntheticruntime/seed inputs andnooriginalprocess execution.',targetSha256:program.sha256,tableEvidence:tables.evidence,listingEvidence:listing.evidence,fixtures,aliasFixtures,chainFixtures,callbackFixtures,recoveryCalls,stores,instructionSteps,executedInstructions:reached.size,matched:true};
 if(output)await writeFile(output,JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const{listingEvidence,...summary}=await verifyVehicleContactProfile();console.log(JSON.stringify(summary));}
