// Independent check against retained x86 assembly, in a bounded arithmetic-only
// interpreter. No native executable is launched. Only the suspension function's
// instruction subset and its two pure arithmetic callees are admitted.
import {readFile,writeFile} from 'node:fs/promises';
import {applyWheelSuspension,decodeWheelContact,decodeWheelState} from '../src/wheel-physics.mjs';
const reply=JSON.parse(await readFile('analysis/scene/results/138-wheel-suspension-assembly.json','utf8'));
const evidence=reply.structuredContent??JSON.parse(reply.content.find(c=>c.type==='text').text);
const instructions=evidence.normalized_result.trim().split('\n').map(line=>{
 const match=/^(0x[0-9a-f]+): ([A-Z]+)(?: (.*))?$/.exec(line.trim());
 if(!match)throw Error(`Unsupported assembly line: ${line}`);
 return {address:Number(match[1]),op:match[2],args:match[3]?.split(',').map(s=>s.trim())??[]};
});
const entries=new Map(instructions.map((instruction,index)=>[instruction.address,index]));
const registers=['EAX','EBX','ECX','EDX','EBP','ESI','EDI','ESP'];
class ArithmeticMachine {
 constructor(){this.bytes=Buffer.alloc(65536);this.r=Object.fromEntries(registers.map(name=>[name,0]));this.z=false;this.s=false;this.o=false;this.c=false;}
 address(operand){
  const expression=/\[([^\]]+)\]/.exec(operand)?.[1].replace(/\s/g,'');if(!expression)throw Error(`No memory address: ${operand}`);
  const terms=expression.match(/[+-]?[^+-]+/g);let value=0;
  for(let term of terms){let sign=1;if(term[0]==='-'){sign=-1;term=term.slice(1);}else if(term[0]==='+')term=term.slice(1);
   const parts=term.split('*');if(parts.length>2)throw Error('Unsupported address expression.');
   const base=Object.hasOwn(this.r,parts[0])?this.r[parts[0]]:/^0x[0-9a-f]+$/i.test(parts[0])?Number(parts[0]):NaN;
   const scale=parts.length===2&&/^0x[0-9a-f]+$/i.test(parts[1])?Number(parts[1]):parts.length===1?1:NaN;
   if(!Number.isFinite(base*scale))throw Error(`Unsupported address term: ${term}`);value+=sign*base*scale;
  }
  return value>>>0;
 }
 width(operand){return operand.startsWith('byte ptr ')?1:operand.startsWith('word ptr ')?2:4;}
 get(operand){
  if(Object.hasOwn(this.r,operand))return this.r[operand];
  if(operand.includes('[')){const p=this.address(operand),width=this.width(operand);return width===1?this.bytes.readUInt8(p):width===2?this.bytes.readUInt16LE(p):this.bytes.readInt32LE(p);}
  if(/^-?0x[0-9a-f]+$/i.test(operand))return (operand.startsWith('-')?-Number(operand.slice(1)):Number(operand))|0;
  throw Error(`Unsupported operand: ${operand}`);
 }
 put(operand,value){
  if(Object.hasOwn(this.r,operand)){this.r[operand]=value|0;return;}
  if(operand.includes('[')){const p=this.address(operand),width=this.width(operand);if(width===1)this.bytes.writeUInt8(value&255,p);else if(width===2)this.bytes.writeUInt16LE(value&65535,p);else this.bytes.writeInt32LE(value|0,p);return;}
  throw Error(`Unsupported destination: ${operand}`);
 }
 flags(result){this.z=(result|0)===0;this.s=(result|0)<0;}
 subtract(a,b){const result=(a-b)|0;this.flags(result);this.o=((a^b)&(a^result)&0x80000000)!==0;this.c=(a>>>0)<(b>>>0);return result;}
 add(a,b){const result=(a+b)|0;this.flags(result);this.o=(~(a^b)&(a^result)&0x80000000)!==0;this.c=(a>>>0)+(b>>>0)>0xffffffff;return result;}
 product(a,b){return Number(BigInt.asIntN(32,(BigInt(a|0)*BigInt(b|0))>>16n));}
 call(address){
  if(address===0x41c990){const denominator=this.r.EDX;if(!denominator)throw Error('Emulated IDIV by zero.');const result=(BigInt(this.r.ECX)<<16n)/BigInt(denominator);if(result< -2147483648n||result>2147483647n)throw Error('Emulated IDIV overflow.');this.r.EAX=Number(result);return;}
  if(address===0x488820){const a=[0,4,8].map(p=>this.bytes.readInt32LE(this.r.ECX+p)),b=[0,4,8].map(p=>this.bytes.readInt32LE(this.r.EDX+p)),out=this.bytes.readUInt32LE(this.r.ESP);
   for(let i=0;i<3;i++)this.bytes.writeInt32LE((this.product(a[(i+1)%3],b[(i+2)%3])-this.product(a[(i+2)%3],b[(i+1)%3]))|0,out+i*4);return;}
  throw Error(`Unadmitted external call: 0x${address.toString(16)}`);
 }
 run(body){
  this.r.ECX=body;this.r.ESP=0xe000;this.bytes.writeUInt32LE(0xffffffff,this.r.ESP);
  let pc=0,steps=0;
  while(steps++<10000){const instruction=instructions[pc],{op,args}=instruction;let next=pc+1;const [a,b]=args;
   switch(op){
    case 'MOV':this.put(a,this.get(b));break;
    case 'LEA':this.put(a,this.address(b));break;
    case 'PUSH':{const value=this.get(a);this.r.ESP-=4;this.bytes.writeInt32LE(value,this.r.ESP);break;}
    case 'POP':{const value=this.bytes.readInt32LE(this.r.ESP);this.r.ESP+=4;this.put(a,value);break;}
    case 'ADD':this.put(a,this.add(this.get(a),this.get(b)));break;
    case 'SUB':this.put(a,this.subtract(this.get(a),this.get(b)));break;
    case 'CMP':this.subtract(this.get(a),this.get(b));break;
    case 'TEST':this.flags(this.get(a)&this.get(b));this.o=false;this.c=false;break;
    case 'XOR':{const value=this.get(a)^this.get(b);this.put(a,value);this.flags(value);this.o=false;this.c=false;break;}
    case 'OR':{const value=this.get(a)|this.get(b);this.put(a,value);this.flags(value);this.o=false;this.c=false;break;}
    case 'SHL':this.put(a,this.get(a)<<(this.get(b)&31));this.flags(this.get(a));break;
    case 'SHR':this.put(a,this.get(a)>>>(this.get(b)&31));this.flags(this.get(a));break;
    case 'SAR':this.put(a,this.get(a)>>(this.get(b)&31));this.flags(this.get(a));break;
    case 'NEG':this.put(a,this.subtract(0,this.get(a)));break;
    case 'DEC':this.put(a,this.subtract(this.get(a),1));break;
    case 'IMUL':{if(args.length!==1)throw Error('Unadmitted IMUL form.');const product=BigInt(this.r.EAX)*BigInt(this.get(a));this.r.EAX=Number(BigInt.asIntN(32,product));this.r.EDX=Number(BigInt.asIntN(32,product>>32n));break;}
    case 'CMOVL':if(this.s!==this.o)this.put(a,this.get(b));break;
    case 'JZ':if(this.z)next=entries.get(Number(a));break;
    case 'JNZ':if(!this.z)next=entries.get(Number(a));break;
    case 'JLE':if(this.z||this.s!==this.o)next=entries.get(Number(a));break;
    case 'JMP':next=entries.get(Number(a));break;
    case 'CALL':this.call(Number(a));break;
    case 'RET':if(this.r.ESP!==0xe000||this.bytes.readUInt32LE(this.r.ESP)!==0xffffffff)throw Error('Unbalanced emulated stack.');return steps;
    default:throw Error(`Unadmitted instruction: ${op}`);
   }
   if(next===undefined||next<0||next>=instructions.length)throw Error('Control flow escaped the retained function.');pc=next;
  }
  throw Error('Emulated instruction budget exceeded.');
 }
}
let seed=0x1a38cafe;const random=limit=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%limit;};
const bodyAddress=0x1000,bodyBytes=0x700,fixtures=2000;let instructionSteps=0;
for(let fixture=0;fixture<fixtures;fixture++) {
 const machine=new ArithmeticMachine(),bytes=machine.bytes.subarray(bodyAddress,bodyAddress+bodyBytes);
 for(let p=0;p<bytes.length;p++)bytes[p]=random(256);
 for(const p of [0x40,0x44,0x48,0x4c,0x50,0x54])bytes.writeInt32LE(random(64*65536+1)-32*65536,p);
 for(let wheel=0;wheel<4;wheel++) {
  const p=0x1f0+wheel*0x4c,sign=random(2)?1:-1;
  const directions=[[4096,0,0],[0,4096,0],[0,0,4096],[2896,2896,0],[0,2457,3276],[2364,2364,2364]];
  const direction=directions[random(directions.length)].map(value=>value*sign);
  for(let i=0;i<3;i++){bytes.writeInt32LE(direction[i],p+i*4);bytes.writeInt32LE(random(16*65536+1)-8*65536,p+0xc+i*4);
   bytes.writeInt32LE(random(64*65536+1)-32*65536,p+0x18+i*4);bytes.writeInt32LE(random(16*65536+1)-8*65536,p+0x24+i*4);
   bytes.writeInt32LE(random(84*65536+1)-42*65536,p+0x30+i*4);bytes.writeInt32LE(-direction[i]*16,p+0x3c+i*4);}
  bytes.writeInt32LE(random(44*65536+1),p+0x48);bytes[0x324+wheel*200]=random(4);
 }
 const expected=Buffer.from(bytes),model={momentum:[0,4,8].map(p=>expected.readInt32LE(0x40+p)),angularMomentum:[0,4,8].map(p=>expected.readInt32LE(0x4c+p))};
 const wheels=[0,1,2,3].map(i=>decodeWheelState(expected,0x324+i*200)),contacts=[0,1,2,3].map(i=>decodeWheelContact(expected,0x1f0+i*0x4c));
 applyWheelSuspension(model,wheels,contacts);
 for(let axis=0;axis<3;axis++){expected.writeInt32LE(model.momentum[axis],0x40+axis*4);expected.writeInt32LE(model.angularMomentum[axis],0x4c+axis*4);}
 for(let i=0;i<4;i++)if(wheels[i].flags&1){const p=0x324+i*200;
  for(const [field,offset]of [['supportProjection',4],['slipVector',0x10],['relativeHit',0x1c],['leverArm',0x28],['normal',0x40]])for(let axis=0;axis<3;axis++)expected.writeInt32LE(wheels[i][field][axis],p+offset+axis*4);
  expected.writeInt32LE(wheels[i].distance,p+0x80);
 }
 instructionSteps+=machine.run(bodyAddress);
 if(!bytes.equals(expected)){let offset=0;while(bytes[offset]===expected[offset])offset++;throw Error(`Fixture ${fixture}: output differs at object +0x${offset.toString(16)}; native-model=${bytes.readInt32LE(offset&~3)}, port=${expected.readInt32LE(offset&~3)}.`);}
}
const report={method:'Independent bounded interpretation of retained x86 suspension instructions; two pure callees modeled separately. No original executable process or full runtime comparison.',
 evidence:evidence.evidence_id,function:'0x488370',instructions:instructions.length,fixtures,wheelSlots:fixtures*4,instructionSteps,matched:true,
 coverage:'Mixed contact flags, principal and rotated axes in both directions, fractional probe/contact velocities, lever arms and suspension distances. Entire 1792-byte object region compared per fixture.'};
await writeFile('analysis/suspension-instruction-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
