const invoke=(handlers,name,request)=>{if(typeof handlers[name]!=='function')throw Error(`Notification transport requires handler ${name}.`);return handlers[name](request);};
const eax=result=>{const value=typeof result==='number'?result:result?.eax;if(!Number.isInteger(value))throw Error('Notification transport requires explicit callee EAX.');return value|0;};
//4a0420 owns peer/mode selection and packet headers. Lower protocol helpers
//and the platform network interface remain explicit, reached-only boundaries.
export function sendNotificationPacket(mode,packet,length,flags,{memory,scratchBase,handlers={}}) {
 mode|=0;length>>>=0;flags>>>=0;
 const local=memory.readInt32LE(0x6e9f70),participant=local===-1?0:local;
 if(participant<0||participant>=6||memory.readInt32LE(0x6e7880+participant*0x67c)===0)return 1;
 const call=(name,ecx,edx,args=[])=>invoke(handlers,name,{memory,ecx,edx,args});
 if(mode===2){
  if(flags&3){
   for(let index=0;index<6;index++){const peer=0x6e788c+index*0x67c;if(memory.readInt32LE(peer-12)!==0&&eax(call('call4a0210',packet,length,[memory.readUInt32LE(peer),memory.readUInt32LE(peer+4),flags]))===0)return 0;}
   return 1;
  }
  if(length<8)return 0;if(memory.readUInt32LE(0x6e6d10)===0)return 1;
  const status=call('call471820',flags,length);if(eax(status)===0)return 1;
  if(!Number.isInteger(status?.ecx)||!Number.isInteger(status?.edx))throw Error('Notification probe requires explicit live ECX and EDX.');
  let routing=status.ecx|0,liveEdx=status.edx|0;
  if(routing&16){call('call4a01d0',packet,liveEdx);routing=flags|0;liveEdx=length|0;}
  memory.writeUInt16LE(65535,packet+2);memory[packet+1]=memory[0x6e65db];memory[0x6e65db]=(memory[0x6e65db]+1)&255;
  const inverseBit3=((~routing)&8)>>>3;
  memory.writeInt32LE(eax(call('call4a0180',packet,liveEdx)),packet+4);
  const values=scratchBase,address=scratchBase+0x20;
  memory.writeUInt32LE(memory.readUInt32LE(0x6e9f74),values);memory.writeUInt32LE(memory.readUInt32LE(0x6e9f78),values+4);memory.writeUInt16LE(65535,values+8);
  const originalInterface=memory.readUInt32LE(0x6e6d10),vtable=memory.readUInt32LE(originalInterface);
  invoke(handlers,'constructAddress49ea00',{memory,ecx:address,args:[values]});
  const result=invoke(handlers,'sendInterface',{memory,ecx:memory.readUInt32LE(0x6e6d10),functionAddress:memory.readUInt32LE(vtable+0x50),args:[packet,length,(~(flags>>>5))&1,inverseBit3,0],address,addressFlags:[1,0]});
  return eax(result)!==0?1:0;
 }
 if(mode===1){
  if(memory[0x6eafe0]&64){if(flags&16)call('call4a01d0',packet,length);return 1;}
  const selected=memory.readInt32LE(0x6e9f6c);
  if(eax(call('call46ffd0',selected,packet))===1){
   memory.writeInt32LE(1,0x6e1e78);const peer=(0x6e788c+Math.imul(selected,0x67c))>>>0;
   return eax(call('call4a0210',packet,length,[memory.readUInt32LE(peer),memory.readUInt32LE(peer+4),flags]));
  }
  memory.writeInt32LE(0,0x6e1e78);
 }
 return 0;
}
