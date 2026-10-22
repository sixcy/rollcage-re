import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {loadRetainedNativeProgram} from './lib/retained-native-program.mjs';
import {createTerrainWaveFixture} from './lib/terrain-wave-fixtures.mjs';
import {createProtocolFixture,createProtocolServiceFixture} from './verify-game-network-protocol-instructions.mjs';
import {activateTerrainWave} from '../src/terrain-wave.mjs';
import {updateWorldPickups} from '../src/pickup-world-state.mjs';
import {initializePickupProbabilityTables} from '../src/pickup-award.mjs';
import {initializeWheelRenderTables} from '../src/wheel-render-state.mjs';
import {registerRawBodySpatial} from '../src/raw-body-construction.mjs';

export async function verifyWeaponNetworkConnected({fixtures=600,output='analysis/weapon-network-connected-instruction-check.json'}={}){
 const program=await loadRetainedNativeProgram(),machine=new BoundedX86(program.instructions),reached=new Set(),visits={};let steps=0,networkRequests=0;
 const watched=new Set([0x446d90,0x47b680,0x47b920,0x4710f0,0x4a0420,0x4a0210,0x4a00c0,0x49fa20,0x489cd0]);machine.onInstruction=p=>{reached.add(p);if(watched.has(p))visits[p.toString(16)]=(visits[p.toString(16)]??0)+1;};machine.externalCalls.set(0x568162,m=>assert.equal(m.r.ECX>>>0,m.bytes.readUInt32LE(0x5e8890)));
 for(const[address,op]of[[0x568f10,'mul'],[0x569380,'sdiv'],[0x5689e0,'udiv']])machine.externalCalls.set(address,m=>{const left=op==='udiv'?m.bytes.readBigUInt64LE(m.r.ESP):m.bytes.readBigInt64LE(m.r.ESP),right=op==='udiv'?m.bytes.readBigUInt64LE(m.r.ESP+8):m.bytes.readBigInt64LE(m.r.ESP+8),value=BigInt.asUintN(64,op==='mul'?left*right:left/right);m.r.EAX=Number(value&0xffffffffn)|0;m.r.EDX=Number(value>>32n)|0;m.r.ESP+=16;});
 for(let i=0;i<fixtures;i++){
  const f=createTerrainWaveFixture(program,i),m=f.memory,put=(p,v)=>m.writeInt32LE(v|0,p),bodies=Buffer.from(m.subarray(f.body,f.body+0xa800)),protocolIndex=i*7;
  createProtocolFixture(protocolIndex,m);bodies.copy(m,f.body);m.fill(0x93,0x300000,0x300800);put(0x6eaed0,0x300000);put(0x6eaed4,0x300800);put(0x6eaed8,0x300000);put(0x6eafe0,0x87);put(0x6e9f70,0);put(0x6e9f6c,1);put(0x6e7880,1);put(0x6e7efc,1);put(0x6e6d10,0x190000);put(0x56e114,0xa20010);put(0x56e0fc,0xa20014);put(0x90cb80,0);m.writeUInt16LE(0,f.addresses.bucket+8);
  const entry=i%2?0x47b680:0x446d90;
  if(entry===0x47b680){
   initializePickupProbabilityTables(m);initializeWheelRenderTables(m);m[m.readUInt32LE(0x90b990)+0xf7]=0;m[m.readUInt32LE(0x5ecb1c)+0x551]=1;m[f.record+0x1d]=1;m[f.body+0x68c]=255;m[f.body+0x68d]=255;put(0x902020,0x79000);put(0x902024,1);put(0x79000,0x170000);m.fill(0,0x170000,0x170600);put(0x170000,26);m.writeUInt16LE(0x81,0x170182);for(const o of[0x34,0x38,0x3c])put(0x170000+o,m.readInt32LE(f.body+o));registerRawBodySpatial(0x170000,f);
  }
  const js=createProtocolServiceFixture(protocolIndex,m);f.services=js.services;machine.reset();m.copy(machine.bytes);const native=createProtocolServiceFixture(protocolIndex,machine.bytes);
  for(const[address,name]of[[0xa20010,'QueryPerformanceFrequency'],[0xa20014,'QueryPerformanceCounter']])machine.externalCalls.set(address,cpu=>{cpu.r.EAX=native.services.platformCall(name,[cpu.bytes.readUInt32LE(cpu.r.ESP)]);cpu.r.ESP+=4;});
  for(const[address,method,count]of[[0xa20000,0x50,17],[0xa20004,0x6c,10]])machine.externalCalls.set(address,cpu=>{cpu.r.EAX=native.services.networkCall(cpu.r.ECX,method,Array.from({length:count},(_,j)=>cpu.bytes.readUInt32LE(cpu.r.ESP+j*4)));cpu.r.ESP+=count*4;});
  let expected;if(entry===0x446d90)expected=activateTerrainWave(f.record,1,0,0,0,f);else updateWorldPickups(f);
  machine.entry=entry;machine.r.ECX=f.record;machine.r.EDX=1;machine.r.ESP=0x9000;machine.bytes.writeInt32LE(-1,0x9000);for(let j=0;j<3;j++)machine.bytes.writeInt32LE(0,0x9004+j*4);steps+=machine.run(3000000);if(expected!==undefined)assert.equal(machine.r.EAX,expected);assert.deepEqual(native.trace,js.trace,`services${i}`);networkRequests+=js.trace.filter(r=>r.name==='network').length;
  const a=machine.bytes.subarray(0x10000),b=m.subarray(0x10000);if(!a.equals(b)){const p=a.findIndex((v,j)=>v!==b[j]);assert.fail(`fixture${i}/${entry.toString(16)} diff${(p+0x10000).toString(16)} native${a[p]} JS${b[p]}, packetNative${machine.bytes.subarray(0x8f9c,0x8fa8).toString('hex')} packetJS${m.subarray(0x8f9c,0x8fa8).toString('hex')}`);}
 }
 const report={method:'Actual446d90 local terrain-wave activation→4710f0 tag91 plus47b680 collection→47b920 tag90 award,actual4a0420→4a0210→pendingring/accounting/clock. Allmappedmemory>=10000h and exact ordered virtualnetwork/performance requests compared. Only true virtual imported network APIs,performance counter/frequency,compiler cookie andCRT64arithmetic supplied. Nonhost successful sends,no receiver/failed-peer retirement/blocking-wait branches. Synthetic model/session/spatial/networkarena inputs,empty soundbank,no original process or real network execution.',targetSha256:program.sha256,fixtures,networkRequests,executedInstructions:reached.size,instructionSteps:steps,visits,matched:true,evidence:program.references.map(r=>r.evidence)};if(output)await writeFile(output,JSON.stringify(report,null,2));const{evidence,...summary}=report;console.log(JSON.stringify(summary));return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)await verifyWeaponNetworkConnected({fixtures:Number(process.argv[2]??600)});
