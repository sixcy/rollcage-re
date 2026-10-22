import {dotQ16} from './fixed-integer.mjs';
import {readAutonomousSurfaceIndex,updateAutonomousSpeed} from './autonomous-speed.mjs';
import {writeRouteDirection,writeAutonomousProgressDirection,autonomousRouteGroup} from './autonomous-route-geometry.mjs';
import {prepareAutonomousTarget} from './autonomous-route-control.mjs';
import {updateAutonomousSteering} from './autonomous-steering.mjs';
const vector=(memory,address)=>[0,4,8].map(offset=>memory.readInt32LE(address+offset));
const store=(memory,address,values)=>values.forEach((value,index)=>memory.writeInt32LE(value|0,address+index*4));
const bits=(memory,body,value)=>memory.writeInt32LE(memory.readInt32LE(body+0x710)|value,body+0x710);
//47ff20: age saturates atff, while the stuck counter wraps as a byte. A mode
//assignment clears the overlapping6c6 timer because native writes a dword.
export function updateAutonomousStuckState(body,{memory}) {
 const session=memory.readUInt32LE(0x5ecb1c);
 if(memory.readInt32LE(session+0x57c)===4&&memory.readUInt32LE(session+0x580)<60){memory.writeUInt16LE(254,body+0x6e8);return;}
 const threshold=readAutonomousSurfaceIndex(body,{memory})>10?60:30;
 if(memory.readInt16LE(body+0x668)<85&&(memory[body+0x70c]&64)){
  memory[body+0x6e9]=(memory[body+0x6e9]+1)&255;
  if(memory[body+0x6e9]>threshold){memory.writeInt32LE(0x80,body+0x6c4);memory[body+0x6e9]=0;}
 }else memory[body+0x6e9]=0;
 if(memory[body+0x6e8]!==255)memory[body+0x6e8]++;
}
//41f0d0 uses its separate RNG5ea4d4 and unsigned clock gate. The shift follows
//x86's low-five-bit count and wraps before the final unsigned right shift.
export function maybeStartAutonomousRandomRecovery(body,{memory}) {
 if(memory.readInt32LE(0x5ea4d8)===2||memory.readUInt32LE(0x90a548)<378||memory.readInt16LE(body+0x668)<200)return;
 const seed=Math.imul(memory.readInt32LE(0x5ea4d4),0x41a7)&0x7fffffff;memory.writeInt32LE(seed,0x5ea4d4);
 if((((seed>>>15)<<(memory[body+0x6f2]&31))>>>16)===0)memory.writeInt32LE(0x200,body+0x6c4);
}
//47ffb0 mode80. scratchBase is native entryESP; the route target atESP-24
//is shared with the real steering callee, including its reverse argument path.
export function updateAutonomousReverseRecovery(body,{memory,scratchBase}) {
 const record=0x909300+memory.readUInt16LE(body+0x65e)*0x30c,surface=readAutonomousSurfaceIndex(body,{memory}),young=memory[body+0x6e8]<(surface>10?150:120),phase=young?60:20,timeout=young?120:60,elapsed=memory.readUInt16LE(body+0x6c6);
 memory.writeUInt16LE((elapsed+1)&65535,body+0x6c6);
 const clear=()=>{memory.writeInt32LE(0,body+0x6c4);memory[body+0x6e8]=0;};
 if(elapsed>=timeout){clear();return;}
 const target=scratchBase-24,group=memory[memory.readUInt32LE(record+0x54)+5],index=memory.readUInt16LE(record+0x58);
 writeRouteDirection(target,group,index,{memory,scratchBase:scratchBase-48});
 store(memory,scratchBase-12,[0xc8,0xce,0xd4].map(offset=>memory.readInt16LE(body+offset)<<4));
 const alignment=dotQ16(vector(memory,target),vector(memory,scratchBase-12)),velocity=dotQ16(vector(memory,body+0x68),vector(memory,scratchBase-12));
 const steer=(first,reverse)=>updateAutonomousSteering(body,target,first,reverse,{memory,scratchBase:scratchBase-52});
 if(alignment<0x5780){
  if(alignment>=0)bits(memory,body,0x80);
  if(velocity>0){bits(memory,body,0x10);steer(1,0);return;}
  if(memory.readInt16LE(body+0x668)<70)bits(memory,body,0x10);
 }else if(alignment<0xa474){
  bits(memory,body,0x80);if(velocity>0){bits(memory,body,0x10);steer(1,0);return;}
  if(memory.readInt16LE(body+0x668)<30)bits(memory,body,0x10);
 }else{
  bits(memory,body,elapsed<phase?0x10:0x40);
  if(velocity>=0){steer(1,0);if(elapsed>=phase)clear();return;}
  bits(memory,body,0x80);
 }
 store(memory,target,vector(memory,target).map(value=>-value|0));steer(0,1);
}
//4311e0 modes1/2. Timer0 needs speed/alignment admission;10..29 only tick,
//and30+ clears the overlapping mode/timer dword. Speed reads the OLD point.
export function updateAutonomousPowerSlide(body,{memory,scratchBase}) {
 const group=memory.readUInt16LE(body+0x6c0),index=memory.readUInt16LE(body+0x6c2),elapsed=memory.readUInt16LE(body+0x6c6),mode=memory.readUInt16LE(body+0x6c4),point=memory.readUInt32LE(autonomousRouteGroup(group,{memory})+8)+index*16,target=scratchBase-24;
 for(let axis=0;axis<3;axis++)memory.writeInt32LE(((memory.readInt16LE(point+axis*2)<<16)-memory.readInt32LE(body+0x34+axis*4))|0,target+axis*4);
 if(elapsed>=30){memory.writeInt32LE(0,body+0x6c4);return 0;}
 if(elapsed>=10){memory.writeUInt16LE((memory.readUInt16LE(body+0x6c6)+1)&65535,body+0x6c6);return 0;}
 if(elapsed===0){
  if(memory.readInt16LE(body+0x668)<200)return 0;
  const record=0x909300+memory.readUInt16LE(body+0x65e)*0x30c;
  writeAutonomousProgressDirection(scratchBase-12,record,{memory,scratchBase:scratchBase-60});
  store(memory,scratchBase-36,[0xc8,0xce,0xd4].map(offset=>memory.readInt16LE(body+offset)<<4));
  if(dotQ16(vector(memory,scratchBase-36),vector(memory,scratchBase-12))<0xddb3)return 0;
 }
 const right=(mode&1)!==0;bits(memory,body,right?0x8000:0x2000);
 if(right?memory.readInt32LE(body+0x644)< -30000:memory.readInt32LE(body+0x644)>30000){bits(memory,body,0x80);memory.writeUInt16LE((memory.readUInt16LE(body+0x6c6)+1)&65535,body+0x6c6);}
 prepareAutonomousTarget(body,target,group,index,{memory,scratchBase:scratchBase-68});
 updateAutonomousSpeed(body,memory[memory.readUInt32LE(0x5ecb1c)+0x551]===4?250:memory[point+7]*2,{memory,scratchBase:scratchBase-60});return 1;
}
