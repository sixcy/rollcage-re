import {finishLapBookkeeping} from './lap-bookkeeping.mjs';
import {finishVehicleBookkeeping} from './finish-bookkeeping.mjs';
import {setSessionInputFlag} from './session-input-flag.mjs';
import {stepReplayControl} from './replay-codec.mjs';
import {awardWeightedPickup} from './pickup-award.mjs';

//449760: lap/finish state, notification construction and end-of-race dispatch.
//Shared addressable bytes preserve pointer reloads, record aliases and string
//callback destinations. Separate callees remain named, required reached hooks.
export function finishRaceProgress(recordAddress,{memory,scratchBase,handlers={}}={}) {
  if(!Buffer.isBuffer(memory)||!Number.isInteger(recordAddress)||!Number.isInteger(scratchBase))throw Error('Race completion requires explicit native memory, record address and scratch base.');
  const u8=p=>memory.readUInt8(p),u16=p=>memory.readUInt16LE(p),s16=p=>memory.readInt16LE(p),u32=p=>memory.readUInt32LE(p),s32=p=>memory.readInt32LE(p);
  const b=(p,value)=>memory.writeUInt8(value&255,p),w=(p,value)=>memory.writeUInt16LE(value&65535,p),d=(p,value)=>memory.writeInt32LE(value|0,p);
  const defaults={call449be0:({ecx})=>finishLapBookkeeping(ecx,{memory}),call491be0:({ecx})=>finishVehicleBookkeeping(ecx,{memory}),call41a670:({ecx})=>setSessionInputFlag(ecx,{memory}),call42ab90:({ecx})=>stepReplayControl(ecx,{memory}),call47b920:({ecx})=>awardWeightedPickup(ecx,{memory,packetAddress:scratchBase-24,handlers})};
  const call=(name,ecx,edx,args=[])=>{const target=handlers[name]??defaults[name];if(typeof target!=='function')throw Error(`Race completion requires reached handler ${name}.`);return target({memory,ecx,edx,args});};
  const body=()=>u32(recordAddress),session=()=>u32(0x5ecb1c),nameScratch=scratchBase+0x18,firstNameScratch=scratchBase+0x38,message=scratchBase+0x58;
  const copyString=(from,to)=>{let offset=0;for(;;){const value=u8(from+offset);b(to+offset,value);offset++;if(value===0)return offset-1;}};
  const stringEnd=address=>{while(u8(address)!==0)address++;return address;};
  const lap=u8(recordAddress+0x1c),upper=u8(recordAddress+0x1e);d(recordAddress+0x24,0);
  if(lap<upper){b(recordAddress+0x1c,lap+1);return;}
  let currentSession=session();
  if(u8(currentSession+0x58c)===1){b(recordAddress+0x1c,lap+1);b(recordAddress+0x1e,upper+1);return;}
  const firstBody=body();
  if(u8(firstBody+0x671)===0&&lap!==0){
    b(firstBody+0x66d,0x6f);
    if(u8(currentSession+0xa86)!==0){call('call47b920',recordAddress);call('call47b920',recordAddress);currentSession=session();}
  }
  b(body()+0x671,0);
  if(u8(recordAddress+0x1c)!==0)call('call449be0',recordAddress);
  b(recordAddress+0x1c,u8(recordAddress+0x1c)+1);b(recordAddress+0x1e,u8(recordAddress+0x1e)+1);
  const gameMode=u8(currentSession+0x551);
  if(gameMode===4){
    if(u8(recordAddress+0x1c)>5){
      b(recordAddress+0x1c,5);b(recordAddress+0x1e,5);
      const opponent=0x90960c-u16(body()+0x65e)*0x30c,opponentLap=u8(opponent+0x1c);
      if(opponentLap>1){b(opponent+0x1e,u8(opponent+0x1e)-1);b(opponent+0x1c,opponentLap-1);}
    }
    return;
  }
  if(gameMode===1){b(recordAddress+0x1c,1);b(recordAddress+0x1e,1);return;}
  if(u8(recordAddress+0x1c)>u8(currentSession+0x586)){
    b(recordAddress+0x1c,u8(currentSession+0x586)+1);
    if(s32(currentSession+0x57c)===4)d(currentSession+0x57c,5);
    if(!(u8(recordAddress+0x249)&1)){
      const currentBody=body();
      if(u8(currentBody+0x718)!==8){
        if(u8(currentSession+0x58c)===0)b(recordAddress+0x24a,1);
        if(u8(u32(0x90b98c)+0x46)>1){
          const networkFlags=u32(0x6eafe0),vehicle=u16(currentBody+0x65e);
          if((networkFlags&1)&&(networkFlags&6)&&(networkFlags&0x40)){
            const seed=Math.imul(s32(0x5ec958),0x41a7)&0x7fffffff;d(0x5ec958,seed);const phrase=(seed>>>16)&1;
            let driverName=0x5d30d4;
            if(vehicle<u8(currentSession+0x54d)){
              driverName=0x6e7894+vehicle*0x67c;
              if(u8(driverName)===0){call('call4579e0',nameScratch,u8(currentSession+0x1c+vehicle));currentSession=session();driverName=nameScratch;}
            }
            let firstName=0x5d30d4;
            if(u8(currentSession+0x54d)>0){
              firstName=0x6e7894;
              if(u8(firstName)===0){call('call4579e0',firstNameScratch,u8(currentSession+0x1c));currentSession=session();firstName=firstNameScratch;}
            }
            copyString(driverName,message);
            if(u8(currentSession+0x721)&0x80){
              const end=stringEnd(message);
              //Actual MOVSD.REP then MOVSB forward copy, including its NUL.
              for(let offset=0;offset<25;offset++)b(end+offset,u8(0x5d32c8+offset));
            }else{
              b(message,0);
              if(phrase<30)call('call472700',phrase,driverName,[firstName,message]);
            }
            if(stringEnd(message)!==message)call('call4a0620',message);
          }
          call('call491be0',recordAddress);
          if(u8(recordAddress+0x258)!==0){call('call407710',s16(recordAddress+0x25c));b(recordAddress+0x258,0);}
          currentSession=session();
        }
      }
      b(recordAddress+0x249,u8(recordAddress+0x249)|1);
    }
    const count=u8(currentSession+0x54d);let allFinished=true;
    for(let index=0;index<count;index++){
      const record=0x909300+index*0x30c;
      if(u8(u32(record)+0x718)!==8&&!(u8(record+0x249)&1)){allFinished=false;break;}
    }
    if(allFinished&&s32(currentSession+0x57c)===5){
      d(currentSession+0x57c,6);d(currentSession+0x580,0);
      if(u8(currentSession+0x58c)===2){d(currentSession+0x57c,7);d(currentSession+0x580,0);}
      if(u8(0x6eafe0)&1){
        const answer=call('call471800');
        if((typeof answer==='number'?answer:answer?.eax)===1){call('call472560');currentSession=session();}
      }
      for(let index=0;index<u8(currentSession+0x54d);index++){
        const record=0x909300+index*0x30c,controller=u32(u32(record)+0x660);
        if(controller!==0){const state=s32(controller+0x1e880);if(state===2)d(controller+0x1e880,3);else if(state===5)d(controller+0x1e880,6);}
        call('call42ab90',u32(record));call('call42ab90',u32(record));
      }
      call('call41a670',1);w(0x91ffb2,u32(0x91ffb4)+1);
    }
  }
  if(u8(recordAddress+0x1c)===u8(currentSession+0x586))b(body()+0x66d,0x6f);
}
