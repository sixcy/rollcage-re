// Bounded static instruction interpreter for reconstruction checks.
// No native target execution; external calls require explicit per-check admission.
const aliases=Object.fromEntries(['A','B','C','D'].flatMap(name=>[[`${name}X`,[`E${name}X`,16,0]],[`${name}L`,[`E${name}X`,8,0]],[`${name}H`,[`E${name}X`,8,8]]]));
for(const name of ['BP','SI','DI','SP'])aliases[name]=[`E${name}`,16,0];
export class BoundedX86 {
 constructor(instructions,{entry=instructions[0].address,externalCalls=new Map(),tables=[]}={}){this.instructions=instructions;this.entries=new Map(instructions.map((instruction,index)=>[instruction.address,index]));this.entry=entry;this.externalCalls=externalCalls;this.bytes=Buffer.alloc(0xa00000);this.reset();for(const table of tables)Buffer.from(table.bytes_hex,"hex").copy(this.bytes,Number(table.address));}
 reset(){this.r=Object.fromEntries(['EAX','EBX','ECX','EDX','EBP','ESI','EDI','ESP'].map(name=>[name,0]));this.z=false;this.s=false;this.o=false;this.c=false;this.bytes.fill(0,0x1000,0x80000);}
 address(operand){const expression=/\[([^\]]+)\]/.exec(operand)?.[1].replace(/\s/g,'');if(!expression)throw Error(`No address: ${operand}`);let sum=0;
  for(let term of expression.match(/[+-]?[^+-]+/g)){let sign=1;if(term[0]==='-'){sign=-1;term=term.slice(1);}else if(term[0]==='+')term=term.slice(1);
   const [base,scale='0x1',...extra]=term.split('*');if(extra.length||!/^0x[0-9a-f]+$/i.test(scale))throw Error(`Invalid address: ${operand}`);
   sum+=sign*this.get(base)*Number(scale);
  }return sum>>>0;
 }
 width(operand){return aliases[operand]?.[1]??(operand.startsWith('byte ptr ')?8:operand.startsWith('word ptr ')?16:32);}
 get(operand){if(Object.hasOwn(this.r,operand))return this.r[operand];if(aliases[operand]){const [name,width,shift]=aliases[operand];return (this.r[name]>>>shift)&(width===8?255:65535);}
  if(operand.includes('[')){const p=this.address(operand),width=this.width(operand);return width===8?this.bytes.readUInt8(p):width===16?this.bytes.readUInt16LE(p):this.bytes.readInt32LE(p);}
  if(/^-?0x[0-9a-f]+$/i.test(operand))return (operand.startsWith('-')?-Number(operand.slice(1)):Number(operand))|0;throw Error(`Invalid operand: ${operand}`);
 }
 put(operand,value){if(Object.hasOwn(this.r,operand)){this.r[operand]=value|0;return;}
  if(aliases[operand]){const [name,width,shift]=aliases[operand],mask=(width===8?255:65535)<<shift;this.r[name]=(this.r[name]&~mask)|((value<<shift)&mask);return;}
  if(operand.includes('[')){const p=this.address(operand),width=this.width(operand);if(width===8)this.bytes.writeUInt8(value&255,p);else if(width===16)this.bytes.writeUInt16LE(value&65535,p);else this.bytes.writeInt32LE(value|0,p);return;}throw Error(`Invalid destination: ${operand}`);
 }
 signed(value,width){return width===8?(value<<24)>>24:width===16?(value<<16)>>16:value|0;}
 flags(value,width){const signed=this.signed(value,width);this.z=signed===0;this.s=signed<0;}
 arithmetic(a,b,width,subtract){const sign=width===32?0x80000000:1<<(width-1),mask=width===32?0xffffffff:(1<<width)-1,ua=(a&mask)>>>0,ub=(b&mask)>>>0,result=(subtract?a-b:a+b)|0;
  this.flags(result,width);this.o=(subtract?((a^b)&(a^result)&sign):(~(a^b)&(a^result)&sign))!==0;this.c=subtract?ua<ub:ua+ub>(mask>>>0);return result;
 }
 run(){const instructions=this.instructions,entries=this.entries;let pc=entries.get(this.entry),steps=0;
  while(steps++<100000){const {op,args,address}=instructions[pc], [a,b]=args;let next=pc+1;const width=a?this.width(a):32;
   try{switch(op){
    case 'NOP':break;
    case 'CWDE':this.r.EAX=this.signed(this.get('AX'),16);break;
    case 'MOVQ':{const value=b.startsWith('XMM')?this.qword:this.bytes.readBigUInt64LE(this.address(b));if(a.startsWith('XMM'))this.qword=value;else this.bytes.writeBigUInt64LE(value,this.address(a));break;}
    case 'MOV':this.put(a,this.get(b));break;
    case 'MOVZX':this.put(a,this.get(b));break;
    case 'MOVSX':this.put(a,this.signed(this.get(b),this.width(b)));break;
    case 'LEA':this.put(a,this.address(b));break;
    case 'PUSH':{const value=this.get(a);this.r.ESP-=4;this.bytes.writeInt32LE(value,this.r.ESP);break;}
    case 'POP':{const value=this.bytes.readInt32LE(this.r.ESP);this.r.ESP+=4;this.put(a,value);break;}
    case 'ADD':case 'SUB':this.put(a,this.arithmetic(this.get(a),this.get(b),width,op==='SUB'));break;
    case 'CMP':this.arithmetic(this.get(a),this.get(b),width,true);break;
    case 'INC':case 'DEC':{const carry=this.c;this.put(a,this.arithmetic(this.get(a),1,width,op==='DEC'));this.c=carry;break;}
    case 'NEG':this.put(a,this.arithmetic(0,this.get(a),width,true));break;
    case 'TEST':case 'AND':case 'OR':case 'XOR':{const left=this.get(a),right=this.get(b),value=op==='OR'?left|right:op==='XOR'?left^right:left&right;if(op!=='TEST')this.put(a,value);this.flags(value,width);this.o=false;this.c=false;break;}
    case 'SHL':case 'SHR':case 'SAR':{const shift=this.get(b)&31,value=this.get(a);if(shift){const result=op==='SHL'?value<<shift:op==='SHR'?value>>>shift:value>>shift;this.put(a,result);this.flags(result,width);this.c=!!(op==='SHL'?(value>>>(32-shift))&1:(value>>>(shift-1))&1);if(shift===1)this.o=op==='SHL'?!!((result>>>31)^(this.c?1:0)):op==='SHR'?value<0:false;}break;}
    case 'SHRD':{const shift=this.get(args[2])&31,value=this.get(a);if(shift){const result=(value>>>shift)|(this.get(b)<<(32-shift));this.put(a,result);this.flags(result,width);this.c=!!((value>>>(shift-1))&1);}break;}
    case 'IMUL':{const left=args.length===1?this.r.EAX:args.length===2?this.get(a):this.get(b),right=this.get(args.length===1?a:args.length===2?b:args[2]);const value=BigInt(left)*BigInt(right),low=Number(BigInt.asIntN(32,value));if(args.length===1){this.r.EAX=low;this.r.EDX=Number(BigInt.asIntN(32,value>>32n));}else if(args.length===2||args.length===3)this.put(a,low);else throw Error('Unadmitted IMUL form.');this.o=this.c=BigInt(low)!==value;break;}
    case 'CDQ':this.r.EDX=this.r.EAX>>31;break;
    case 'IDIV':{const divisor=BigInt(this.get(a));if(!divisor)throw Error('IDIV by zero.');const numerator=(BigInt(this.r.EDX)<<32n)|BigInt(this.r.EAX>>>0),quotient=numerator/divisor;if(quotient< -2147483648n||quotient>2147483647n)throw Error('IDIV overflow.');this.r.EAX=Number(quotient);this.r.EDX=Number(numerator%divisor);break;}
    case 'CMOVS':if(this.s)this.put(a,this.get(b));break;
    case 'CMOVG':if(!this.z&&this.s===this.o)this.put(a,this.get(b));break;
    case 'CMOVGE':if(this.s===this.o)this.put(a,this.get(b));break;
    case 'CMOVZ':if(this.z)this.put(a,this.get(b));break;
    case 'CMOVNZ':if(!this.z)this.put(a,this.get(b));break;
    case 'SETLE':this.put(a,this.z||this.s!==this.o?1:0);break;
    case 'JZ':if(this.z)next=entries.get(Number(a));break;
    case 'JNZ':if(!this.z)next=entries.get(Number(a));break;
    case 'JG':if(!this.z&&this.s===this.o)next=entries.get(Number(a));break;
    case 'JGE':if(this.s===this.o)next=entries.get(Number(a));break;
    case 'JL':if(this.s!==this.o)next=entries.get(Number(a));break;
    case 'JLE':if(this.z||this.s!==this.o)next=entries.get(Number(a));break;
    case 'JS':if(this.s)next=entries.get(Number(a));break;
    case 'JNS':if(!this.s)next=entries.get(Number(a));break;
    case 'JA':if(!this.c&&!this.z)next=entries.get(Number(a));break;
    case 'JBE':if(this.c||this.z)next=entries.get(Number(a));break;
    case 'JC':if(this.c)next=entries.get(Number(a));break;
    case 'JNC':if(!this.c)next=entries.get(Number(a));break;
    case 'JMP':next=entries.get(this.get(a)>>>0);break;
    case 'RET':{const target=this.bytes.readUInt32LE(this.r.ESP);if(target===0xffffffff){if(this.r.ESP!==0x9000)throw Error('Unbalanced stack.');return steps;}this.r.ESP+=4;next=entries.get(target);break;}
    case 'CALL':{const target=Number(a);if(entries.has(target)){this.r.ESP-=4;this.bytes.writeUInt32LE(instructions[next].address,this.r.ESP);next=entries.get(target);}else if(this.externalCalls.has(target))this.externalCalls.get(target)(this);else throw Error(`Unadmitted external call ${a}.`);break;}
    default:throw Error(`Unadmitted opcode ${op}.`);
   }}catch(error){throw Error(`At 0x${address.toString(16)}: ${error.message}`);}
   if(next===undefined||next<0||next>=instructions.length)throw Error('Control flow left retained function.');pc=next;
  }throw Error('Instruction budget exceeded.');
 }
}
