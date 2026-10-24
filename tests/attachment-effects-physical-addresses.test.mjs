import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapturedMemory} from '../tools/lib/captured-memory.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {loadRelocatedAudioFixture} from '../tools/lib/relocated-audio-fixtures.mjs';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {createAttachmentEffectsFixture} from '../tools/verify-attachment-effects-instructions.mjs';
import {runNativeRaceDispatch} from '../src/native-race-dispatch.mjs';
import {activateRawPersistentEmitter,emitRawAttachmentParticle,updateRawAttachmentEffects,updateRawPersistentEmitters,updateRawType2Attachment} from '../src/attachment-effects.mjs';

//Constructed initial storage and original instructions, never native after
//bytes. Fixed operand extents move; every stored pointer remains unchanged.
const fixedSpans = [[0x5ec958,4],[0x5ecb1c,4],[0x6e65b4,24],
  [0x6e6b1c,8],[0x6fbb14,4],[0x6ff140,200],[0x80e660,32],
  [0x80f56c,512],[0x902eec,52],[0x909254,4],[0x909278,4],
  [0x90b990,4],[0x9153d8,4],[0x919140,4]];
const heapSpans = [[0x10000,0x8000],[0x60000,0x14000],[0x100000,0x8000]];
const bases = [0x400000,0x320000,0x730000];
const evidenceNames = ['1061-attachment-target-update-a-assembly.json',
  '1063-attachment-target-update-b-assembly.json','1065-attachment-emitter-assembly.json',
  '1067-attachment-target2-emitter-assembly.json','1076-persistent-emitter-setup-assembly.json',
  '115-effect-allocation-assembly.json','118-particle-removal-assembly.json',
  '117-particle-registration-assembly.json','665-retirement-4286e0-assembly.json',
  '669-retirement-4746f0-assembly.json'];

function physicalFixture(base,fixture) {
  const original=createAttachmentEffectsFixture(fixture).memory,delta=base-0x400000;
  original.writeUInt32LE(fixture%10,0x6fbb14);
  if(fixture===127)for(let row=1;row<256;row+=2)original.writeUInt32LE(0,0x6000c+row*16);
  const rows=[...heapSpans.map(([address,length])=>({address,bytes:Buffer.from(original.subarray(address,address+length))})),
    ...fixedSpans.map(([address,length])=>({address:address+delta,bytes:Buffer.from(original.subarray(address,address+length))}))];
  return {...createCapturedMemory(rows),rows,moduleBaseAddress:base};
}

test('reviewed44f3a0 dependency executes with physical globals and no preferred-address aliases',()=>{
  for(const base of bases) {
    const O=0x18000,session=0x1200000,config=0x1210000,actual=p=>p+base-0x400000;
    const rows=[[actual(0x91ce90),4],[actual(0x5ecb1c),4],[actual(0x5ecefc),4],
      [actual(0x6e6b4c),4],[actual(0x6e675c),4],[actual(0x6e6b1c),4],
      [O-128,160],[session,0x580],[config,128]].map(([address,length])=>({address,bytes:Buffer.alloc(length)}));
    const {memory:m}=createCapturedMemory(rows),put=(p,v)=>m.writeUInt32LE(v>>>0,p);
    put(O,actual(0x440cd5));put(actual(0x5ecb1c),session);put(actual(0x5ecefc),config);
    put(session+0x57c,4);m[config+0x25]=1;put(actual(0x6e675c),17);
    //Only reach the real attachment child; these other three game outcomes
    //are explicitly synthetic parent-control inputs, not native proof.
    const result=runNativeRaceDispatch({memory:m,moduleBaseAddress:base,scratchBase:O,
      entryRegisters:{ECX:1,EBX:0x6e66b0,EBP:3,ESI:4,EDI:5},
      calls:{call402d10:()=>0x1111111,call406b80:()=>undefined,call441c70:()=>1}});
    assert.equal(result.route,'sample-only');assert.equal(m.readUInt32LE(actual(0x6e675c)),18);
    assert.equal(result.registers.ebx,0x6e66b0,'Raw saved value is not a module operand.');
    if(base!==0x400000)assert.throws(()=>m.readUInt32LE(0x6e6b1c),/Uncaptured native memory/);
  }
});

test('all five attachment entries match relocated original instructions including genuine allocation and spatial children',async t=>{
  const proof=await readInstructionEvidence(evidenceNames,{directory:'analysis/native-simulation/results'});
  assert.ok(proof.evidence.every(e=>e.subject.digest.sha256==='c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5'));
  const addresses=new Set(proof.instructions.map(r=>r.address)),fixtures=[0,1,2,3,4,5,6,7,15,31,63,127];
  let cases=0,steps=0,allocations=0,removals=0,registrations=0,outsideLookups=0;
  for(const base of bases) {
    const program=await loadRelocatedAudioFixture(base),actual=program.actual;
    const instructions=program.instructions.filter(r=>addresses.has(r.address-program.delta));
    assert.equal(instructions.length,addresses.size);
    for(const address of program.unresolvedRelocations.keys())assert.ok(!instructions.some(r=>r.address===address),'Every admitted instruction operand has an unambiguous PE relocation.');
    const machine=new BoundedX86(instructions);machine.bytes=Buffer.alloc(0x1800000);
    machine.onInstruction=address=>{
      if(address===actual(0x435df0))allocations++;
      if(address===actual(0x4748d0))removals++;
      if(address===actual(0x474670))registrations++;
      if(address===actual(0x4746f0))outsideLookups++;
    };
    for(const fixture of fixtures)for(const entry of[0x44f3a0,0x44f990,0x44f7a0,0x44f740,0x44f910]) {
      const context=physicalFixture(base,fixture),m=context.memory;
      machine.reset();for(const row of context.rows)row.bytes.copy(machine.bytes,row.address);
      machine.entry=actual(entry);machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);
      let returned;
      if(entry===0x44f3a0)updateRawAttachmentEffects(context);
      else if(entry===0x44f990)updateRawPersistentEmitters(context);
      else if(entry===0x44f740) {
        machine.r.ECX=0x10000;machine.r.EDX=0x2000+(fixture%8);
        updateRawType2Attachment(machine.r.ECX,machine.r.EDX,context);
      }else if(entry===0x44f910) {
        const cursor=fixture%10,record=actual(0x6ff140)+cursor*20;
        //Two scenarios overlap source and destination. Earlier cadence and
        //word stores must remain visible to subsequent high-word reads.
        const position=fixture%2?record+4:0x17000;machine.r.ECX=position;
        activateRawPersistentEmitter(position,context);
      }else {
        machine.r.ECX=0x72000+(fixture%8)*12;machine.r.EDX=[27,28,34,1][fixture%4];
        const args=[[-0x12340000,0x4000,0xffff,-32768][fixture%4],fixture%32,Math.imul(fixture,0x437aab)];
        args.forEach((value,i)=>machine.bytes.writeInt32LE(value|0,0x9004+i*4));
        returned=emitRawAttachmentParticle(machine.r.ECX,machine.r.EDX,...args,context);
      }
      steps+=machine.run(1_000_000);cases++;
      if(returned!==undefined)assert.equal(machine.r.EAX>>>0,returned);
      for(const row of context.rows)assert.deepEqual(context.span(row.address,row.bytes.length),machine.bytes.subarray(row.address,row.address+row.bytes.length),
        `base${base.toString(16)}/entry${entry.toString(16)}/fixture${fixture}/address${row.address.toString(16)}`);
    }
  }
  assert.ok(allocations>0&&removals>0&&registrations>0&&outsideLookups>0,'Real children must execute, including active-pool reuse and nearest-row fallback.');
  t.diagnostic(JSON.stringify({authority:'constructed-relocated-retained-instructions',cases,steps,allocations,removals,registrations,outsideLookups,bases,evidence:proof.evidence.map(e=>e.evidence_id)}));
});

test('raw body, position and mesh pointer values retain their preferred-global-shaped addresses',()=>{
  const base=0x730000,actual=p=>p+base-0x400000,body=0x91ce90,target=0x9153d8,position=0x6e66b0;
  const rows=[[actual(0x80e660),4],[actual(0x80f56c),128],[actual(0x6fbb14),4],[actual(0x6ff140),200],
    [body,0x180],[target,0xa0],[position,12]].map(([address,length])=>({address,bytes:Buffer.alloc(length)}));
  const f=createCapturedMemory(rows),m=f.memory,runtime={memory:m,moduleBaseAddress:base};
  m.writeUInt32LE(target,actual(0x80e660));m[target+0x94]=1;
  m.writeUInt16LE(0x1001,body+0x16a);m.writeInt32LE(12345,actual(0x80f56c)+64);
  updateRawType2Attachment(body,0x2000,runtime);assert.equal(m.readInt32LE(target+0x90),24690);
  [0x12345678,-2*65536-1,0x7fff8000].forEach((value,i)=>m.writeInt32LE(value,position+i*4));
  activateRawPersistentEmitter(position,runtime);
  assert.deepEqual([0,2,4].map(o=>m.readInt16LE(actual(0x6ff140)+o)),[0x1234,-3,0x7fff]);
  assert.equal(m.readUInt32LE(actual(0x80e660)),target);
  assert.throws(()=>m.readInt32LE(actual(body)),/Uncaptured native memory/);
  for(const flags of[0,0x10]) {
    const f=physicalFixture(base,1);
    f.memory.writeUInt32LE(0x9153d8,actual(0x9153d8));
    f.memory.writeUInt32LE(0x902f00,actual(0x919140));
    const p=emitRawAttachmentParticle(0x72000,28,0x4000,17,flags,f);
    assert.equal(f.memory.readUInt32LE(p+0xa4),flags?0x902f00:0x9153d8,'Stored mesh pointers remain raw actual values.');
  }
});

test('explicit physical mesh operands preserve unconditional reads and the direct active-store order',()=>{
  const base=0x730000,actual=p=>p+base-0x400000,context=physicalFixture(base,1);
  const missing=actual(0x919140),rows=context.rows.filter(r=>r.address!==missing);
  const {memory:m}=createCapturedMemory(rows),runtime={memory:m,moduleBaseAddress:base};
  assert.throws(()=>emitRawAttachmentParticle(0x72000,28,0x4000,17,0,runtime),/Uncaptured native memory/);
  assert.equal(m[0x100000+0x94],1,'Direct emitter publishes active before the unconditional alternate read.');
  assert.equal(m.readUInt32LE(0x100000+0xa4),0xa5a5a5a5,'Missing alternate does not publish a default mesh.');
});
