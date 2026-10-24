import {normalizeCollisionVector,multiplyQ8} from './sphere-collision.mjs';
import {lookupRawSpatialBucket} from './body-retirement-effects.mjs';
import {nativeGlobalAddress} from './native-global-address.mjs';

const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p),short=v=>v<<16>>16;
const shorts=(m,p)=>[0,2,4].map(o=>m.readInt16LE(p+o));
const ints=(m,p)=>[0,4,8].map(o=>get(m,p+o));
const dot=(a,b)=>a.reduce((sum,v,i)=>(sum+Math.imul(v,b[i]))|0,0);

//48b2a0: geometric obstruction in a spatial bucket's terrain rows. Both input
//DWORD vectors are captured, but the endpoint SHORTs are read for each row.
export function weaponTargetBucketObstructed(bucket,directionAddress,fromAddress,targetAddress,{memory:m}){
  let pack=ptr(m,0x90b98c);const normalTable=ptr(m,pack+0x1c),regions=ptr(m,pack+0x80),region=(m.readUInt16LE(bucket+6)&0x3fff)*6;
  let row=regions+region,remaining=(m.readUInt16LE(row+2)>>>9)+1;
  const direction=ints(m,directionAddress),from=ints(m,fromAddress);
  do{
    remaining--;const segment=ptr(m,ptr(m,pack)+(m.readUInt16LE(row+2)&127)*4),code=m.readUInt16LE(row),r=code&1023,c=code>>>10;
    row+=6;const cell=(Math.imul(get(m,segment+8),r)+c)|0,vertices=ptr(m,segment+0x20),vertex=vertices+((cell+r)|0)*8;
    const origin=shorts(m,vertex),first=from.map((v,i)=>(v-origin[i])|0);
    if(dot(first,direction)<=0&&dot(shorts(m,targetAddress).map((v,i)=>(v-origin[i])|0),direction)>=0){
      const normal= get(m,normalTable+m.readUInt16LE(ptr(m,segment+0x50)+cell*8+2)*4),n=[normal<<2>>22,normal<<12>>22,normal<<22>>22],d=direction.map(short);
      const cross=[(Math.imul(d[1],n[2])-Math.imul(d[2],n[1]))>>8,(Math.imul(d[2],n[0])-Math.imul(d[0],n[2]))>>8,(Math.imul(d[0],n[1])-Math.imul(d[1],n[0]))>>8].map(short);
      word(m,0x91d40c,direction[1]);word(m,0x91d360,cross[0]);word(m,0x91d368,cross[1]);word(m,0x91d408,direction[0]);word(m,0x91d370,cross[2]);word(m,0x91d410,direction[2]);
      const projection=[(Math.imul(d[2],cross[1])-Math.imul(d[1],cross[2]))|0,(Math.imul(d[0],cross[2])-Math.imul(d[2],cross[0]))|0,(Math.imul(d[1],cross[0])-Math.imul(d[0],cross[1]))|0];
      projection.forEach((v,i)=>put(m,0x91d448+i*4,v));
      if(dot(projection.map(v=>v>>8),from.map((v,i)=>(v-m.readInt16LE(vertex+i*2))|0))<0)return 1;
    }
    if(remaining)pack=ptr(m,0x90b98c);
  }while(remaining);
  return 0;
}

//48b0e0: forward-dot preference followed by four spatial line samples.
export function evaluateWeaponTarget(record,mode,targetAddress,bestAddress,runtime){
  const{memory:m,scratchBase,roundingMode='nearest-even'}=runtime,frame=scratchBase-76,body=ptr(m,record),target=shorts(m,targetAddress),start=[0x36,0x3a,0x3e].map(o=>m.readInt16LE(body+o));
  const delta=target.map((v,i)=>(v-start[i])|0),quarter=delta.map(v=>v>>2);
  const direction=normalizeCollisionVector(delta,roundingMode,{normalizeReduction:(v,l)=>{put(m,0x91d45c,v);put(m,0x91d460,l);}}).vector.map(v=>v>>4);
  direction.forEach((v,i)=>put(m,frame+0x34+i*4,v));
  const score=dot(direction,[0xc8,0xce,0xd4].map(o=>m.readInt16LE(body+o)));if(score<0)return 0;
  let best=get(m,bestAddress);if(mode===1)best=Math.max(best,(get(m,record+0x78)+6000)|0);if(score<best)return 0;
  const ownBucket=ptr(m,ptr(m,record)+12)&0xfffffffe;let position=start,previous=[0,0,0];
  for(let i=0;i<4;i++){
    position=position.map((v,j)=>(v+quarter[j])|0);position.forEach((v,j)=>put(m,frame+0x40+j*4,v));
    if(position.some((v,j)=>((v-previous[j])&0xffffff00)!==0)){
      const{bucket,outside}=lookupRawSpatialBucket(...position.map(v=>v<<16),runtime);put(m,frame+0x30,outside?1:0);previous=position.slice();
      if((bucket|0)!==ownBucket&&(outside||weaponTargetBucketObstructed(bucket,frame+0x34,frame+0x40,targetAddress,runtime)))return 0;
    }
  }
  put(m,bestAddress,score);return 1;
}

//48acb0. Model points and body objects compete by forward dot, with a6000
//preference for retaining a previous model target. Target lock gates both lists.
export function updateVehicleWeaponTarget(record,runtime){
  const{memory:m,scratchBase}=runtime,frame=scratchBase-108,body=ptr(m,record),clear=()=>{put(m,record+0x7c,0);word(m,record+0x6a,0);};
  if(m[body+0x68c]!==1&&m[body+0x68d]!==1){clear();return;}
  let type=1,shape=0,object=0,other=0,selectedPosition=[get(m,frame+0x5c),get(m,frame+0x60),get(m,frame+0x64)];put(m,frame+0x28,-1);
  const count=get(m,nativeGlobalAddress(m,0x82e904));let row=ptr(m,ptr(m,0x90b990)+0xec);
  for(let i=0;i<count;i++,row+=20){
    const candidate=ptr(m,row),model=ptr(m,row+4),index=get(m,candidate+12)&15;
    if((m[ptr(m,model+0x194)+index*4+3]&15)===5)continue;
    if(get(m,record+0x7c)===2&&(m.readUInt16LE(record+0x6a)!==1||ptr(m,record+0x70)!==candidate))continue;
    const local=shorts(m,candidate),angle=m[model+0x199],cos=m.readInt16LE(0x5ed0b0+angle*2)>>6,sin=m.readInt16LE(0x5ed030+angle*2)>>6;
    const point=[short(multiplyQ8(local[0],cos)+multiplyQ8(local[2],sin)+m.readInt16LE(model+0x36)),short(local[1]+m.readInt16LE(model+0x3a)),short(multiplyQ8(local[2],cos)+multiplyQ8(-local[0],sin)+m.readInt16LE(model+0x3e))];
    point.forEach((v,j)=>word(m,frame+0x5c+j*2,v));
    const origin=[0x36,0x3a,0x3e].map(o=>m.readInt16LE(ptr(m,record)+o)),d=point.map((v,j)=>v-origin[j]);if(dot(d,d)>0x900000)continue;
    const oldType=m.readUInt16LE(record+0x6a),mode=oldType&&(oldType!==1||ptr(m,record+0x70)!==candidate)?1:0;
    if(evaluateWeaponTarget(record,mode,frame+0x5c,frame+0x28,{...runtime,scratchBase:frame-12})){shape=candidate;object=model;selectedPosition=shorts(m,frame+0x5c).map(v=>v<<16);}
  }
  const objects=get(m,nativeGlobalAddress(m,0x82e900));
  for(let i=0;i<objects;i++){
    const candidate=ptr(m,nativeGlobalAddress(m,0x82e880+i*8)),kind=get(m,nativeGlobalAddress(m,0x82e884+i*8)),live=ptr(m,record);
    if(kind===1&&(!(get(m,live+0x710)&0x1000)||candidate===live))continue;
    if(get(m,record+0x7c)===2&&(m.readUInt16LE(record+0x6a)!==2||ptr(m,record+0x70)!==candidate))continue;
    const point=[0x36,0x3a,0x3e].map(o=>m.readInt16LE(candidate+o));point.forEach((v,j)=>word(m,frame+0x5c+j*2,v));
    const origin=[0x36,0x3a,0x3e].map(o=>m.readInt16LE(ptr(m,record)+o)),d=point.map((v,j)=>v-origin[j]);if(dot(d,d)>0x900000)continue;
    if(evaluateWeaponTarget(record,0,frame+0x5c,frame+0x28,{...runtime,scratchBase:frame-12})){other=candidate;type=2;selectedPosition=shorts(m,frame+0x5c).map(v=>v<<16);}
  }
  const score=get(m,frame+0x28);if(score<=0){clear();return;}
  const oldType=m.readUInt16LE(record+0x6a),same=oldType===type&&(type===1?ptr(m,record+0x70)===shape&&ptr(m,record+0x74)===object:type===2&&ptr(m,record+0x70)===other);
  if(same){put(m,record+0x78,score);if(oldType===2){put(m,record+0x64,selectedPosition[2]);put(m,record+0x60,selectedPosition[1]);put(m,record+0x5c,selectedPosition[0]);}return;}
  put(m,record+0x7c,2);word(m,record+0x68,6);word(m,record+0x6a,type);put(m,record+0x78,score);put(m,record+0x70,type===2?other:shape);if(type!==2)put(m,record+0x74,object);word(m,record+0x6c,0x2852);m[record+0x6e]=255;put(m,record+0x64,selectedPosition[2]);put(m,record+0x60,selectedPosition[1]);put(m,record+0x5c,selectedPosition[0]);
}

//48ac00 deliberately divides before checking the participant count.
export function updateWeaponTargets(runtime){
  const{memory:m,scratchBase}=runtime,count=m[ptr(m,0x5ecb1c)+0x54d];if(!count)throw Error('Native weapon-target scheduler divides by zero.');const selected=ptr(m,0x90a548)%count;
  for(let i=0;i<m[ptr(m,0x5ecb1c)+0x54d];i++){const record=0x909300+i*0x30c,body=ptr(m,record);if(m[body+0x718]!==8||m.readUInt16LE(body+0x65e)===selected)updateVehicleWeaponTarget(record,{...runtime,scratchBase:scratchBase-16});}
  const session=ptr(m,0x5ecb1c);for(let i=0;i<m[session+0x54d];i++){const record=0x909300+i*0x30c;if(get(m,record+0x7c)===2){const timer=(m.readUInt16LE(record+0x68)-1)&65535;word(m,record+0x68,timer);if(!timer){put(m,record+0x7c,4);word(m,record+0x68,0);word(m,record+0x6c,255);m[record+0x6e]=0x52;}}}
}
