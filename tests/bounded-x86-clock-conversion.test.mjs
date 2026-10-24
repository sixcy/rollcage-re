import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BoundedX86} from '../tools/lib/bounded-x86.mjs';
import {readInstructionEvidence} from '../tools/lib/instruction-evidence.mjs';
import {REDUX_SHA256} from '../tools/lib/retained-native-program.mjs';

//Independent retained-instruction oracle. No source conversion/scheduler port
//or native process runs. Constants come from the hash-pinned original PE.
const pe = await readFile('C:/Program Files (x86)/Psygnosis/Rollcage/Direct3D/Rollcage Redux.exe');
assert.equal(createHash('sha256').update(pe).digest('hex'), REDUX_SHA256);
const image = Buffer.alloc(0xa00000), header = pe.readUInt32LE(60), optional = header + 24;
assert.equal(pe.readUInt32LE(optional + 28), 0x400000);
for (let i = 0; i < pe.readUInt16LE(header + 6); i++) {
  const row = optional + pe.readUInt16LE(header + 20) + i * 40;
  pe.copy(image, 0x400000 + pe.readUInt32LE(row + 12), pe.readUInt32LE(row + 20), pe.readUInt32LE(row + 20) + pe.readUInt32LE(row + 16));
}
const programs = await Promise.all([
  readInstructionEvidence(['027-clock-uint-to-double.json','028-clock-double-to-uint.json','029-double-conversion-body.json'], {directory:'analysis/physics-clock-elevated-20261022/results'}),
  readInstructionEvidence(['1047-world-particle-count-convert-assembly.json','20261024-clock-status-568bfd-assembly.json'], {directory:'analysis/native-simulation/results'})
]);
const code = new Map();
for (const p of programs) {
  assert.ok(p.evidence.every(e => e.subject.digest.sha256 === REDUX_SHA256));
  for (const row of p.instructions) {if (code.has(row.address)) assert.deepEqual(code.get(row.address), row); code.set(row.address, row);}
}
function retained(entry) {const m = new BoundedX86([...code.values()].sort((a,b) => a.address-b.address), {entry}); m.bytes = Buffer.from(image); return m;}
function reset(m) {m.reset(); m.r.ESP = 0x9000; m.bytes.writeInt32LE(-1, 0x9000); m.setFpuControlWord(0x7f);}
function simple(rows) {const m = new BoundedX86([...rows, ['RET']].map(([op,...args], i) => ({address:0x1000+i,op,args}))); reset(m); return m;}
const result64 = m => BigInt.asIntN(64, (BigInt(m.r.EDX>>>0)<<32n)|BigInt(m.r.EAX>>>0));

test('original568d6e reconstructs exact unsigned64 binary64 rounding across both paths', () => {
  const m = retained(0x568d6e), cases = new Set([0n,1n,0x7fffffffn,0x80000000n,0xffffffffn,0x100000000n,(1n<<64n)-1n]);
  for (let n=32n;n<64n;n++) for (const delta of [-1025n,-1n,0n,1n,1023n,1024n,1025n]) {const v=(1n<<n)+delta;if(v>=0n&&v<(1n<<64n))cases.add(v);}
  let seed=0x123456789abcdefn;for(let i=0;i<128;i++){seed=BigInt.asUintN(64,seed*6364136223846793005n+1442695040888963407n);cases.add(seed);}
  for(const n of cases){reset(m);m.r.ECX=Number(BigInt.asIntN(32,n));m.r.EDX=Number(BigInt.asIntN(32,n>>32n));m.run();assert.equal(m.xmmDouble('XMM0'),Number(n),n.toString(16));}
  assert.ok(cases.size>300);
});

test('original568c41/568aa3 truncates signed64 and executes actual masked fractional status child', () => {
  const m=retained(0x568c41),cases=[0,-0,0.5,-0.5,1.75,-1.75,Number.MIN_VALUE,-Number.MIN_VALUE,2**31+0.5,-(2**31)-0.5,2**53-1,2**53+2,2**63-1024,-(2**63)];
  const status=[];m.onInstruction=(at,cpu)=>{if(at===0x568bfd)status.push(cpu.r.EDX);};
  for(const value of cases){reset(m);m.setXmmDouble('XMM0',value);m.run();assert.equal(result64(m),BigInt(Math.trunc(value)),String(value));}
  assert.ok(status.includes(0x10));assert.ok(status.every(v=>v===0x10));assert.equal(m.externalCalls.size,0);
});

test('unmasked/invalid conversion preserves genuine568bfd stack and stops at unsupported except1', () => {
  const m=retained(0x568c41);
  for(const value of [NaN,Infinity,-Infinity,2**63,-(2**63)-2048]){reset(m);m.setXmmDouble('XMM0',value);assert.throws(()=>m.run(),/At 0x568c36: Unadmitted external call 0x005692fa/);assert.equal(m.bytes.readUInt32LE(m.r.ESP),8);assert.equal(m.bytes.readUInt32LE(m.r.ESP+24),0x7f);}
  reset(m);m.setFpuControlWord(0x5f);m.setXmmDouble('XMM0',1.25);assert.throws(()=>m.run(),/Unadmitted external call/);assert.equal(m.bytes.readUInt32LE(m.r.ESP),0x10);
});

test('scalar loads zero upper64 while legacy conversions preserve unknown upper lanes without invented bits', () => {
  const m=simple([['CVTSI2SD','XMM7','EAX'],['MOVDQA','XMM6','XMM7'],['PSRLDQ','XMM6','0x4'],['MOVD','EDX','XMM6']]);m.r.EAX=-7;m.run();assert.equal(m.xmmDouble('XMM7'),-7);assert.deepEqual(m.xmmLanes('XMM7').slice(2),[undefined,undefined]);assert.equal(m.r.EDX,0xc01c0000|0);assert.throws(()=>m.xmmDouble('XMM6'),/known consumed double lanes/);
  const loaded=simple([['MOVSD','XMM5','qword ptr [0x18000]']]);loaded.bytes.writeBigUInt64LE(0x7ff8000000001234n,0x18000);loaded.run();assert.deepEqual(loaded.xmmLanes('XMM5'),[0x1234,0x7ff80000,0,0]);
});

test('packed qword lanes wrap independently, variable shifts saturate and comparison masks preserve upper64', () => {
  for(const shift of [0,1,31,32,63,64,255])for(const op of ['PSLLQ','PSRLQ']){const m=simple([[op,'XMM6','XMM7']]);m.setXmmLanes('XMM6',[-1,-1,1,0]);m.setXmmLanes('XMM7',[shift,0,0,0]);m.run();const b=Buffer.alloc(16);m.xmmLanes('XMM6').forEach((v,i)=>b.writeInt32LE(v,i*4));assert.equal(b.readBigUInt64LE(),shift>=64?0n:BigInt.asUintN(64,op==='PSLLQ'?0xffffffffffffffffn<<BigInt(shift):0xffffffffffffffffn>>BigInt(shift)));assert.equal(b.readBigUInt64LE(8),shift>=64?0n:op==='PSLLQ'?BigInt.asUintN(64,1n<<BigInt(shift)):1n>>BigInt(shift));}
  const m=simple([['PADDQ','XMM6','XMM7'],['PSUBQ','XMM6','XMM7']]);m.setXmmLanes('XMM6',[-1,-1,4,0]);m.setXmmLanes('XMM7',[1,0,7,0]);m.run();assert.deepEqual(m.xmmLanes('XMM6'),[-1,-1,4,0]);
  for(const [left,right,mask]of [[-0,0,-1],[NaN,NaN,0],[1,1,-1],[1,2,0]]){const c=simple([['CMPEQSD','XMM6','XMM7','']]);c.setXmmDouble('XMM6',left);c.setXmmDouble('XMM7',right);const lanes=c.xmmLanes('XMM6');c.run();assert.deepEqual(c.xmmLanes('XMM6'),[mask,mask,...lanes.slice(2)]);}
});

test('unknown bits/counts, unsupported scalar forms and absent control word remain explicit failures', () => {
  for(const rows of [[['MOVD','EAX','XMM6']],[['PSRLQ','XMM6','XMM7']],[['MOVDQA','XMM6','XMM7']],[['CVTSI2SD','XMM8','EAX']],[['CVTSI2SD','XMM6','AX']]])assert.throws(()=>simple(rows).run(),/Unadmitted|Uninitialized/);
  const cw=simple([['FSTCW','word ptr [0x18000]']]);delete cw.fpuControlWord;assert.throws(()=>cw.run(),/explicit observed/);
  const mode=simple([['FSTCW','word ptr [0x18000]'],['FLDCW','word ptr [0x18002]']]);mode.bytes.writeUInt16LE(0xf7f,0x18002);mode.run();assert.equal(mode.bytes.readUInt16LE(0x18000),0x7f);assert.equal(mode.fpuPrecisionBits,64);assert.equal(mode.fpuRounding,'toward-zero');assert.throws(()=>mode.setFpuControlWord(0x17f),/Unsupported/);
});

test('retained signed64 division RCR count1 rotates through carry and changes only CF/OF', () => {
  for(const value of [0,1,0x7fffffff,0x80000000,0xffffffff])for(const carry of [false,true]){const m=simple([['RCR','ECX','0x1']]);m.r.ECX=value|0;m.c=carry;m.z=m.s=m.p=m.a=true;const expected=(value>>>1)|(carry?0x80000000:0);m.run();assert.equal(m.r.ECX,expected|0);assert.equal(m.c,!!(value&1));assert.equal(m.o,!!((expected>>>31)^((expected>>>30)&1)));assert.deepEqual([m.z,m.s,m.p,m.a],[true,true,true,true]);}
  for(const args of [['EDX','0x1'],['EAX','0x2'],['EAX','CL'],['AX','0x1']])assert.throws(()=>simple([['RCR',...args]]).run(),/Unadmitted/);
});
