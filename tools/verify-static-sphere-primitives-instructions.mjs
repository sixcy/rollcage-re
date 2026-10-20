import {writeFile} from 'node:fs/promises';
import {BoundedX86} from './lib/bounded-x86.mjs';
import {readStaticSpherePrimitiveEvidence,initializeStaticSpherePrimitiveTables} from './lib/static-sphere-primitive-evidence.mjs';
import {queryPointSphereContact,queryEdgeSphereContact} from '../src/static-sphere-primitives.mjs';
import {normalizeCollisionVector} from '../src/sphere-collision.mjs';
const {evidence,instructions}=await readStaticSpherePrimitiveEvidence(),machine=new BoundedX86(instructions);
await initializeStaticSpherePrimitiveTables(machine);
let seed=0x422230ab,steps=0,checks=0;
const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%limit;},signed=()=>random(0xffffffff)|0;
const put=(bytes,p,values)=>values.forEach((v,i)=>bytes.writeInt32LE(v|0,p+i*4));
const modes=['nearest-even','toward-zero','down','up'],fixtures=8000,histogram={};
function call(entry,args) {machine.entry=entry;machine.r.ECX=0x10000;machine.r.EDX=0x11000;machine.r.ESP=0x9000;machine.bytes.writeUInt32LE(0xffffffff,0x9000);args.forEach((v,i)=>machine.bytes.writeInt32LE(v|0,0x9004+i*4));steps+=machine.run();return machine.r.EAX;}
for(let fixture=0;fixture<fixtures;fixture++) {
 const mode=modes[fixture%4],first=[0,1,2].map(()=>random(600)-300),second=first.map(v=>v+random(200)-100),direction=normalizeCollisionVector(second.map((v,i)=>v-first[i]),mode).vector.map(v=>v>>4),point=first.map(v=>v<<8),radius=(random(30)+1)*256,maxTime=[0,1,255,256,32768,65535,65536,131072][random(8)];
 const position=point.map(v=>(v+random(120*256)-60*256)|0),velocity=[0,1,2].map(()=>random(60*256)-30*256);
 if(fixture%7===0)velocity.fill(0);
 if(fixture%5===0){position.splice(0,3,...point);position[1]+=radius+(fixture%2?256:-256);velocity.splice(0,3,0,-8*256,0);}
 if(fixture%11===0){position.splice(0,3,...point);position[0]+=radius-128;velocity.splice(0,3,-4*256,0,0);}
 if(fixture%17===0)velocity.forEach((v,i)=>velocity[i]=(v*7)|0);
 if(fixture%31===0)position.splice(0,3,...point);
 const record=Buffer.alloc(72,0xa5);put(record,8,position);put(record,20,velocity);record.writeInt32LE(radius,64);
 const initial={point:[signed(),signed(),signed()],normal:[signed(),signed(),signed()],scalar:signed(),flags:signed()};
 for(const kind of ['point','edge']) {
  machine.reset();machine.fpuRounding=mode;record.copy(machine.bytes,0x10000);put(machine.bytes,0x11000,point);first.forEach((v,i)=>machine.bytes.writeInt16LE(v,0x11000+i*2));
  // The point caller has Q8 dwords; the edge caller has signed authored shorts.
  if(kind==='point')put(machine.bytes,0x11000,point);
  second.forEach((v,i)=>machine.bytes.writeInt16LE(v,0x11100+i*2));put(machine.bytes,0x11200,direction);
  put(machine.bytes,0x12000,[...initial.point,...initial.normal,initial.scalar,initial.flags]);const before=Buffer.from(machine.bytes.subarray(0x10000,0x1120c)),output=structuredClone(initial);
  const expected=kind==='point'?queryPointSphereContact(record,point,output,maxTime,{roundingMode:mode}):queryEdgeSphereContact(record,first,second,direction,output,maxTime,{roundingMode:mode});
  const actual=call(kind==='point'?0x422230:0x422680,kind==='point'?[0x12000,maxTime]:[0x11100,0x11200,0x12000,0xdead,maxTime]);
  const native={point:[0,1,2].map(i=>machine.bytes.readInt32LE(0x12000+i*4)),normal:[0,1,2].map(i=>machine.bytes.readInt32LE(0x1200c+i*4)),scalar:machine.bytes.readInt32LE(0x12018),flags:machine.bytes.readInt32LE(0x1201c)};
  if(actual!==expected||JSON.stringify(native)!==JSON.stringify(output)||!before.equals(machine.bytes.subarray(0x10000,0x1120c)))throw Error(`Static primitive mismatch ${JSON.stringify({fixture,kind,first,second,direction,point,position,velocity,radius,maxTime,initial,actual,expected,native,output,mode})}`);
  const key=`${kind}:${output.flags===0?'miss':output.flags===1?'impact':output.flags===2?'overlap':output.flags===0x100000?'endpoint-rejection':output.flags}`;histogram[key]=(histogram[key]??0)+1;checks++;
 }
}
const report={method:'Complete retained-x86 point and finite-edge contact routines with actual signed-short cross product, quadratic helper, normalization, Q8 fraction/scaling, lookup-root and leading-zero routines. No helper stubs or original execution. Compares all output fields and unchanged sphere/geometry bytes. Four explicit x87 rounding modes, nearest binary32 SSE arithmetic and masked invalid conversion are emulation contexts, not observed runtime control words.',evidence:evidence.map(e=>e.evidence_id),instructions:instructions.length,fixtures,checks,roundingModes:modes,histogram,instructionSteps:steps,matched:true};
await writeFile('analysis/static-sphere-primitives-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
