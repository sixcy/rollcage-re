import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeControlInputPacketRegions,nativeFrameControlInputRegions,nativeControlAdditionalRegions} from '../tools/lib/native-frame-control-continuation.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';

test('post-audio packet descriptors follow exact six-peer fields and native64record history domain',async()=>{
  const proof=await readInstructionEvidence(['461-physical-input-packet-assembly.json','465-input-packet-transform-assembly.json','467-input-axis-transform-assembly.json'],{directory:'analysis/native-simulation/results'});assert.ok(proof.evidence.every(row=>row.subject?.digest?.sha256==='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5'));
  const listing=new Map(proof.instructions.map(row=>[row.address,row]));
  for(const [address,op,args]of [[0x4712c0,'IMUL',['EBX','ECX','0x67c']],[0x47130a,'ADD',['EDX','0xc']],[0x47130d,'CMP',['EAX','0x40']],[0x471377,'LEA',['ESI','[EBX + 0x6e7edc]']],[0x433227,'MOV',['dword ptr [ESI + 0x8]','0x0']],[0x434226,'MOV',['ESI','0x6fb740']],[0x434275,'CMP',['ESI','0x6fb944']]]){const row=listing.get(address);assert.equal(row?.op,op);assert.deepEqual(row.args,args);}
  for(let index=0;index<6;index++)for(const [name,base,length]of [['packet',0x6e7edc,12],['peer-ready',0x6e7880,4],['current-sample',0x6e78b0,8],['history',0x6e7bd8,64*12],['peer-address',0x6e788c,8]]){const row=nativeControlInputPacketRegions.find(row=>row.id===`control-input-${name}-${index}`);assert.equal(row.preferredAddress,base+index*0x67c);assert.equal(row.length,length);}
  assert.equal(nativeControlInputPacketRegions.filter(row=>row.id.startsWith('control-input-local-sample-')).length,4);assert.equal(nativeControlInputPacketRegions.find(row=>row.id==='control-input-analog-table').length,0x204);assert.equal(nativeControlInputPacketRegions.find(row=>row.id==='control-input-replay-decode').length,32);
  const sorted=nativeControlInputPacketRegions.toSorted((a,b)=>a.preferredAddress-b.preferredAddress);for(let i=1;i<sorted.length;i++)assert.ok(sorted[i-1].preferredAddress+sorted[i-1].length<=sorted[i].preferredAddress,'No invented whole-peer observation or overlapping alias.');
});
test('only genuinely observed packet bytes enter the image alias/comparison ledger',()=>{
  const moduleBaseAddress=0x6e0000,preferredAddress=0x6e7edc,address=moduleBaseAddress+preferredAddress-0x400000;
  const full=nativeControlAdditionalRegions({ranges:[{address,bytes:Buffer.from('0041ffff0000000080808000','hex'),moduleBaseAddress}]});assert.deepEqual(full.map(row=>[row.id,row.address,row.length]),[[`control-input-packet-0-${address.toString(16)}`,address,12]]);
  assert.deepEqual(nativeControlAdditionalRegions({ranges:[{address,bytes:Buffer.alloc(11),moduleBaseAddress}]}),[]);
  for(const [preferredAddress,length]of [[0x5dc684,4],[0x5dc730,4],[0x5dc890,8],[0x5dc9d4,4],[0x6e6d10,4],[0x6f2424,20],[0x6eaedc,260]])assert.ok(nativeFrameControlInputRegions.some(row=>row.preferredAddress===preferredAddress&&row.length===length));
});
