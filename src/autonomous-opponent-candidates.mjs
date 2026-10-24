import {nativeGlobalAddress} from './native-global-address.mjs';
import {abs32,lookupSqrt,dotQ16,multiplyQ16,divideQ16,crossQ16} from './fixed-integer.mjs';
import {scaleContactVector} from './body-contact-friction.mjs';
import {autonomousRouteGroup,stepRoutePoint,writeRouteDirection,isRoutePointPassed,findAutonomousRoutePoint} from './autonomous-route-geometry.mjs';

const ROWS=0x91f1e0, RECORDS=0x909300;
const get=(memory,p)=>memory.readInt32LE(p);
const put=(memory,p,value)=>memory.writeInt32LE(value|0,p);
const word=(memory,p,value)=>memory.writeUInt16LE(value&65535,p);
const vector=(memory,p)=>[0,4,8].map(offset=>get(memory,p+offset));
const store=(memory,p,values)=>values.forEach((value,i)=>put(memory,p+i*4,value));
const coords=(memory,p)=>[0,2,4].map(offset=>memory.readInt16LE(p+offset)<<16);
const axis=(memory,body,first)=>[0,6,12].map(offset=>memory.readInt16LE(body+first+offset)<<4);
const point=(memory,group,index)=>memory.readUInt32LE(group+8)+(index&65535)*16;
const add=(a,b)=>(a+b)|0;
const subtract=(a,b)=>(a-b)|0;
const signedDivide=(numerator,denominator)=>{
  if(!denominator)throw Error('Native signed division by zero.');
  const quotient=BigInt(numerator|0)/BigInt(denominator|0);
  if(quotient< -2147483648n||quotient>2147483647n)throw Error('Native signed division overflow.');
  return Number(quotient);
};

export function initializeAutonomousOpponentTables(memory){Buffer.from('8813d007e80358029001c80050002800','hex').copy(memory,0x570580);return memory;}

//4919d0. Squaring here is low32 IMUL followed by SAR, not Q16 IMUL.
export function measureAutonomousRouteCurvature(groupIndex,index,positionOut,beforeOut,afterOut,{memory,scratchBase}){
  const group=autonomousRouteGroup(groupIndex,{memory}),base=memory.readUInt32LE(group+8),current=point(memory,group,index),temp=scratchBase-16,second=scratchBase-20;
  if(!stepRoutePoint(group,index,temp,{memory},true))return 0;
  let before=memory.readUInt16LE(temp);
  if(stepRoutePoint(group,memory.readUInt32LE(temp),second,{memory},true))before=memory.readUInt16LE(second);
  if(!stepRoutePoint(group,index,temp,{memory}))return 0;
  let after=memory.readUInt16LE(temp);
  if(stepRoutePoint(group,memory.readUInt32LE(temp),second,{memory}))after=memory.readUInt16LE(second);
  const following=coords(memory,base+after*16),preceding=coords(memory,base+before*16),center=coords(memory,current);
  store(memory,positionOut,center);
  store(memory,beforeOut,center.map((value,i)=>subtract(value,preceding[i])));
  store(memory,beforeOut,scaleContactVector(vector(memory,beforeOut),65536));
  store(memory,afterOut,following.map((value,i)=>subtract(value,get(memory,positionOut+i*4))));
  store(memory,afterOut,scaleContactVector(vector(memory,afterOut),65536));
  const cross=crossQ16(vector(memory,beforeOut),vector(memory,afterOut));
  const metric=cross.reduce((sum,value)=>(sum+(Math.imul(value,value)>>16))|0,0);
  return cross[1]<0?-metric|0:metric;
}

//493eb0. Select a directional segment and return its XZ side determinant.
export function measureAutonomousRouteSide(groupIndex,index,reverse,position,{memory,scratchBase}){
  const group=autonomousRouteGroup(groupIndex,{memory}),base=memory.readUInt32LE(group+8),current=coords(memory,point(memory,group,index)),output=scratchBase-44;
  let backwards=(reverse&255)!==0;
  if(!stepRoutePoint(group,index,output,{memory},backwards)){
    backwards=!backwards;if(!stepRoutePoint(group,index,output,{memory},backwards))return 0;
  }
  const neighbor=coords(memory,base+memory.readUInt16LE(output)*16);
  const anchor=backwards?neighbor:current;
  const direction=(backwards?current.map((value,i)=>subtract(value,neighbor[i])):neighbor.map((value,i)=>subtract(value,current[i]))).map(value=>value>>8);
  const displacement=anchor.map((value,i)=>subtract(value,get(memory,position+i*4))>>8);
  return subtract(multiplyQ16(displacement[0],direction[2]),multiplyQ16(displacement[2],direction[0]));
}

//493b00. A twenty-slot ring traverses unseen linked groups, comparing bit27
//of each side value with the initial value. Visited entries are committed even
//when the ring is full; the queue uses native global byte-backed arrays.
export function hasAutonomousRouteSideChange(body,{memory,scratchBase}){
  const record=RECORDS+memory.readUInt16LE(body+0x65e)*0x30c,progression=memory.readUInt32LE(record+0x54),initialGroup=memory[progression+5],initialIndex=memory.readUInt16LE(record+0x58);
  const group=autonomousRouteGroup(initialGroup,{memory}),initialPoint=point(memory,group,initialIndex),position=body+0x34;
  for(let i=1;i<64;i++)word(memory,0x7136d0+i*2,0);
  word(memory,0x7136d0,initialGroup);word(memory,0x6e6cc4,0);word(memory,0x6e6cc0,0);
  const reverse=isRoutePointPassed(group,initialIndex,position,{memory,scratchBase:scratchBase-44})===0?1:0;
  const initial=measureAutonomousRouteSide(initialGroup,initialIndex,reverse,position,{memory,scratchBase:scratchBase-52});
  let visited=1;
  const enqueue=(linkedGroup,index)=>{
    if(!linkedGroup)return;
    for(let i=0;i<64;i++)if(memory.readUInt16LE(0x7136d0+i*2)===linkedGroup)return;
    word(memory,0x7136d0+visited++*2,linkedGroup);
    const head=memory.readUInt16LE(0x6e6cc4),tail=memory.readUInt16LE(0x6e6cc0);
    if(tail===head-1||(tail===19&&head===0))return;
    word(memory,nativeGlobalAddress(memory, 0x80df20)+tail*2,index);word(memory,nativeGlobalAddress(memory, 0x80df60)+tail*2,linkedGroup);word(memory,0x6e6cc0,tail===19?0:tail+1);
  };
  const links=address=>{
    let packed=memory.readUInt32LE(address+12);enqueue(packed&31,(packed>>>5)&511);
    packed=memory.readUInt32LE(address+12);enqueue((packed>>>14)&31,(packed>>>19)&511);
  };
  links(initialPoint);
  while(memory.readUInt16LE(0x6e6cc0)!==memory.readUInt16LE(0x6e6cc4)){
    const head=memory.readUInt16LE(0x6e6cc4);word(memory,0x6e6cc4,head===19?0:head+1);
    const selectedGroup=memory.readUInt16LE(nativeGlobalAddress(memory, 0x80df60)+head*2),selectedIndex=memory.readUInt16LE(nativeGlobalAddress(memory, 0x80df20)+head*2);
    const side=measureAutonomousRouteSide(selectedGroup,selectedIndex,reverse,position,{memory,scratchBase:scratchBase-48});
    if(((side>>>27)&1)!==((initial>>>27)&1))return 1;
    links(point(memory,autonomousRouteGroup(selectedGroup,{memory}),selectedIndex));
  }
  return 0;
}

//4938f0. Penalize candidate trajectories near a slower opponent. Preserve the
//native integer cross-distance metric and low32 interpolation products.
export function scoreAutonomousOpponentCollision(body,opponent,relativeAddress,distance,time,opponentGroup,{memory}){
  const speed=get(memory,body+0x664),difference=subtract(speed,get(memory,opponent+0x664)),radius=memory.readUInt16LE(memory.readUInt32LE(body+0x10)+0x32),squared=Math.imul(radius,radius);
  let penalty;
  if(difference<0)penalty=0;
  else if(distance<=radius*4)penalty=-200;
  else{
    const upper=(distance-radius*2)<<12,lower=upper>>2;
    penalty=difference>upper?-200:difference<lower?0:signedDivide(Math.imul(subtract(lower,difference),200),subtract(upper,lower));
  }
  time=Math.min(time,65536);
  for(let index=0;index<20;index++){
    const row=ROWS+index*52;if(!memory.readUInt16LE(row)||memory[row+38])continue;
    if(memory.readUInt16LE(row)===(opponentGroup>>>0))put(memory,row+44,add(get(memory,row+44),penalty));
    const direction=scaleContactVector(vector(memory,row+4).map((value,i)=>subtract(multiplyQ16(value,speed),get(memory,opponent+0x68+i*4))),65536);
    const cross=crossQ16(vector(memory,relativeAddress),direction);
    const metric=cross.reduce((sum,value)=>add(sum,Math.imul(value>>16,value>>16)),0),outer=squared<<2;
    if(metric<=outer){
      const value=metric<=squared?-(time>>4)|0:signedDivide(Math.imul(subtract(outer,metric),time>>4),-Math.imul(squared,3)|0);
      put(memory,row+44,add(get(memory,row+44),value));
    }
  }
}

//493610. Insert a type1 lateral-avoidance or lead-position candidate.
export function appendAutonomousOpponentAvoidance(ownRecord,otherRecord,relativeAddress,distanceQ16,radius,forward,time,lowestFreeAddress,{memory,scratchBase}){
  const body=memory.readUInt32LE(ownRecord),opponent=memory.readUInt32LE(otherRecord),speedDifference=memory.readInt16LE(body+0x668)-memory.readInt16LE(opponent+0x668);
  if(get(memory,lowestFreeAddress)<0||memory[0x6e650f]>=20)return;
  if(get(memory,body+0x6bc)===-1&&(get(memory,opponent+0x6bc)!==-1||subtract(get(memory,opponent+0x3d00),get(memory,body+0x3d00))>=2))return;
  const direction=scratchBase-12;
  writeRouteDirection(direction,memory[memory.readUInt32LE(ownRecord+0x54)+5],memory.readUInt16LE(ownRecord+0x58),{memory,scratchBase:scratchBase-60});
  if(dotQ16(vector(memory,direction),axis(memory,body,0xc8))<0xf08f)return;
  const ownX=get(memory,body+0x68),otherVelocity=vector(memory,opponent+0x68);
  let target,rate;
  if(forward<(radius<<16)){
    if(speedDifference>50||distanceQ16>0x4000000)return;
    const factor=subtract(0x10000000,Math.imul(distanceQ16,3))>>12;
    let side=axis(memory,body,0xc4);
    const relative=vector(memory,relativeAddress),cross=subtract(multiplyQ16(relative[0],get(memory,body+0x70)>>2),multiplyQ16(relative[2],ownX>>2));
    if(cross<0)side=side.map(value=>-value|0);
    target=side.map(value=>multiplyQ16(value,distanceQ16));rate=subtract(0x14000,factor)>>15;
  }else{
    const shift=time<4000?4:time<8000?3:1;rate=time<4000?4:time<8000?3:2;
    target=vector(memory,relativeAddress).map((value,i)=>add(value,otherVelocity[i]<<shift));
  }
  const position=vector(memory,body+0x34).map((value,i)=>add(value,target[i])>>16),slot=memory[0x6e650f];
  position.forEach((value,i)=>word(memory,0x91f600+slot*8+i*2,value));
  const free=get(memory,lowestFreeAddress),row=ROWS+free*52;
  memory[row+2]=slot;memory[row+37]=1;put(memory,row+44,add(get(memory,row+44),31));
  memory[0x91f1c0+slot]=rate;put(memory,lowestFreeAddress,free-1);memory[0x6e650f]=slot+1;
}

//493290. Route curvature/side policy either inserts a type2 follow candidate or
//biases matching ordinary candidates. Meaningful locals remain byte-backed:
//early curvature returns leave their vector outputs stale as in the native code.
export function appendAutonomousOpponentFollow(relativeAddress,distance,ownRecord,otherRecord,lowestFreeAddress,{memory,scratchBase}){
  const body=memory.readUInt32LE(ownRecord),opponent=memory.readUInt32LE(otherRecord),frame=scratchBase-84;
  const ownGroup=memory.readUInt16LE(body+0x6c0),ownIndex=frame+0x14,otherIndex=frame+0x10,ownPoint=frame+0x1c,otherPoint=frame+0x20;
  put(memory,ownIndex,memory.readUInt16LE(body+0x6c2));
  const otherGroup=memory[opponent+0x718]===8?memory.readUInt16LE(opponent+0x6c0):memory[memory.readUInt32LE(otherRecord+0x54)+5];
  put(memory,otherIndex,memory[opponent+0x718]===8?memory.readUInt16LE(opponent+0x6c2):memory.readUInt16LE(otherRecord+0x58));
  const group=autonomousRouteGroup(ownGroup,{memory}),other=autonomousRouteGroup(otherGroup,{memory});
  put(memory,ownPoint,point(memory,group,memory.readUInt16LE(ownIndex)));put(memory,otherPoint,point(memory,other,memory.readUInt16LE(otherIndex)));
  findAutonomousRoutePoint(group,ownIndex,ownPoint,body+0x34,{memory,scratchBase:frame-12});
  findAutonomousRoutePoint(other,otherIndex,otherPoint,opponent+0x34,{memory,scratchBase:frame-20});
  const position=frame+0x30,before=frame+0x3c,after=frame+0x48;
  const curvature=measureAutonomousRouteCurvature(ownGroup,memory.readUInt16LE(ownIndex),position,before,after,{memory,scratchBase:frame-32});
  const otherCurvature=measureAutonomousRouteCurvature(otherGroup,memory.readUInt16LE(otherIndex),position,before,after,{memory,scratchBase:frame-44});
  const eligible=distance<500&&abs32(curvature)<0x2540&&abs32(otherCurvature)<0x2540&&hasAutonomousRouteSideChange(body,{memory,scratchBase:frame-4})!==0;
  if(!eligible){
    const progressionGroup=memory[memory.readUInt32LE(otherRecord+0x54)+5];
    for(let index=0;index<20;index++){const row=ROWS+index*52;if(memory.readUInt16LE(row)===progressionGroup&&memory[row+38]===0)put(memory,row+44,add(get(memory,row+44),14));}
    return;
  }
  if(get(memory,lowestFreeAddress)<0||memory[0x6e650f]>=20)return;
  writeRouteDirection(before,memory[memory.readUInt32LE(ownRecord+0x54)+5],memory.readUInt16LE(ownRecord+0x58),{memory,scratchBase:frame-8});
  store(memory,after,axis(memory,body,0xc8));if(dotQ16(vector(memory,before),vector(memory,after))<0xd6d8)return;
  store(memory,after,axis(memory,opponent,0xc8));if(dotQ16(vector(memory,before),vector(memory,after))<0xd6d8)return;
  const scale=divideQ16(65536,distance<<16);store(memory,position,vector(memory,relativeAddress).map(value=>multiplyQ16(value,scale)));
  const side=subtract(multiplyQ16(get(memory,position),get(memory,before+8)),multiplyQ16(get(memory,position+8),get(memory,before)));
  const absolute=abs32(side);let correction=add(multiplyQ16(multiplyQ16(side,absolute),absolute),get(memory,opponent+0x644)>>1);correction=Math.max(-32768,Math.min(32768,correction));
  store(memory,before,axis(memory,body,0xc4));
  store(memory,before,vector(memory,before).map(value=>multiplyQ16(value,correction)));
  store(memory,position,vector(memory,before).map((value,i)=>add(value,get(memory,after+i*4))));
  store(memory,position,vector(memory,position).map(value=>multiplyQ16(value,get(memory,body+0x664))));
  const target=vector(memory,position),bodyPosition=vector(memory,body+0x34),slot=memory[0x6e650f];
  bodyPosition.forEach((value,i)=>word(memory,0x91f600+slot*8+i*2,add(value,target[i]<<6)>>16));
  const free=get(memory,lowestFreeAddress),row=ROWS+free*52;memory[0x91f1c0+slot]=31;memory[row+2]=slot;memory[row+37]=2;put(memory,row+44,add(get(memory,row+44),28));put(memory,lowestFreeAddress,free-1);memory[0x6e650f]=slot+1;
}

//492d80. Actual opponent scan, bounded proximity, projected closing time and
//all reached policy branches. Registry count is reread at each outer iteration.
export function updateAutonomousOpponentCandidates(body,lowestFreeAddress,{memory,scratchBase,handlers={}}){
  const relativeAddress=scratchBase-12;
  const radius=memory.readUInt16LE(memory.readUInt32LE(body+0x10)+0x32),profileIndex=(memory.readUInt32LE(body+0x6f8)>>>12)&7;
  memory[0x6e650f]=0;
  const threshold=memory.readUInt16LE(0x570580+profileIndex*2),tier=memory[body+0x6f1];
  let includeHuman=tier<3;
  if(!includeHuman&&tier!==4){
    const own=RECORDS+memory.readUInt16LE(body+0x65e)*0x30c,progress=add(memory[own+0x1c]<<16,get(memory,own+0x24));
    const count=memory[memory.readUInt32LE(0x5ecb1c)+0x54d];
    for(let index=0;index<count;index++){const other=RECORDS+index*0x30c,opponent=memory.readUInt32LE(other),gap=add(subtract(memory[other+0x1c]<<16,progress),get(memory,other+0x24));if(memory[opponent+0x718]!==8&&gap<0&&gap> -1500){includeHuman=true;break;}}
  }
  for(let index=0;index<memory[memory.readUInt32LE(0x5ecb1c)+0x54d];index++){
    const otherRecord=RECORDS+index*0x30c,opponent=memory.readUInt32LE(otherRecord);
    if(index===memory.readUInt16LE(body+0x65e))continue;
    const relative=vector(memory,opponent+0x34).map((value,i)=>subtract(value,get(memory,body+0x34+i*4))),integers=relative.map(value=>value>>16),squared=integers.reduce((sum,value)=>add(sum,Math.imul(value,value)),0);
    store(memory,relativeAddress,relative);if(squared>4000000)continue;
    const distance=lookupSqrt(squared),facing=axis(memory,body,0xc8),forward=dotQ16(facing,relative),closing=dotQ16(facing,vector(memory,body+0x68).map((value,i)=>subtract(value,get(memory,opponent+0x68+i*4))));
    let time=0x70000000;
    if(abs32(forward)>=100){const reduced=divideQ16(closing>>16,forward);if((abs32(reduced)&0xffff8000)===0)time=divideQ16(closing,forward);}
    const alignment=dotQ16(vector(memory,body+0x68),vector(memory,opponent+0x68));
    if((memory[body+0x6ec]&0x20)&&forward>(radius<<16)&&closing>0&&time>1000){
      const request={body,opponent,relativeAddress,distance,time,opponentGroup:memory[memory.readUInt32LE(otherRecord+0x54)+5],memory,scratchBase:scratchBase-120};
      if(handlers.scoreCollision4938f0)handlers.scoreCollision4938f0(request);else scoreAutonomousOpponentCollision(body,opponent,relativeAddress,distance,time,request.opponentGroup,request);
    }
    if(((memory[body+0x6ec]&1)||memory.readUInt16LE(body+0x6fc+index*2)>threshold)&&alignment>0&&forward>-(radius<<16)&&(forward<(radius<<16)||time>2000)&&memory.readInt16LE(opponent+0x668)>250&&(includeHuman||memory[opponent+0x718]!==8)&&((memory[body+0x6c9]===1&&memory[body+0x6ca]!==0)||(memory[body+0x6c9]!==1&&memory[body+0x6cb]===0))){
      const ownRecord=RECORDS+memory.readUInt16LE(body+0x65e)*0x30c,request={ownRecord,otherRecord,relativeAddress,distanceQ16:distance<<16,radius,forward,time,lowestFreeAddress,memory,scratchBase:scratchBase-128};
      if(handlers.appendAvoidance493610)handlers.appendAvoidance493610(request);else appendAutonomousOpponentAvoidance(ownRecord,otherRecord,relativeAddress,request.distanceQ16,radius,forward,time,lowestFreeAddress,request);
    }
    if(((memory[body+0x6ec]&2)||memory.readUInt16LE(body+0x6fc+index*2)>threshold)&&forward<-(radius<<16)&&alignment>=0&&memory.readInt16LE(body+0x668)<=memory.readInt16LE(opponent+0x668)+5&&(time>2000||distance<2000)&&(includeHuman||memory[opponent+0x718]!==8)){
      const ownRecord=RECORDS+memory.readUInt16LE(body+0x65e)*0x30c,request={relativeAddress,distance,ownRecord,otherRecord,lowestFreeAddress,memory,scratchBase:scratchBase-124};
      if(handlers.appendFollow493290)handlers.appendFollow493290(request);else appendAutonomousOpponentFollow(relativeAddress,distance,ownRecord,otherRecord,lowestFreeAddress,request);
    }
  }
}
