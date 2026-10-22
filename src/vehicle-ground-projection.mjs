//481200: terrain rays feed the four projected corners of body+728's block.
import {abs32,multiplyQ16,divideQ16,dotQ16} from './fixed-integer.mjs';
import {queryRawTerrain} from './raw-terrain-query.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
const vector=(m,p)=>[0,4,8].map(o=>get(m,p+o));

//481390. Failed contacts preserve both output vectors and the smoothed normal.
export function smoothVehicleGroundProjection(body,normal,relative,fraction,contact,{memory:m}){
 if(!get(m,contact+28)||(fraction|0)<=0)return 0;
 for(let o=0;o<12;o+=4)put(m,relative+o,(get(m,contact+o)<<8)-get(m,body+0x34+o));
 let previous=get(m,body+0x2958);for(let o=0;o<12;o+=4){const value=Math.trunc(((Math.imul(previous,3)+get(m,contact+12+o))|0)/4);put(m,body+0x2958+o,value);if(o<8)previous=get(m,body+0x295c+o);put(m,normal+o,get(m,body+0x2958+o));}return 1;
}

//4815d0. Individual writes retain the native X,Z,Y order if output aliases
//the body; the returned height retains wrapped signed arithmetic.
export function computeVehicleProjectionCorner(body,forward,right,output,normal,planeDistance,flags,{memory:m}){
 let fy=get(m,forward+4),fz=get(m,forward+8),fx=get(m,forward);if(flags&2){fx=-fx|0;fy=-fy|0;fz=-fz|0;}
 let rx=get(m,right),ry=get(m,right+4),rz=get(m,right+8);if(flags&1){rx=-rx|0;ry=-ry|0;rz=-rz|0;}
 const x=(rx+fx)|0,z=(rz+fz)|0,slopeX=multiplyQ16(get(m,normal),x),slopeZ=multiplyQ16(get(m,normal+8),z),height=multiplyQ16((slopeX+((planeDistance+slopeZ)|0))|0,get(m,normal+4));
 put(m,output,(get(m,body+0x34)+x)>>16);const y=get(m,body+0x38),worldZ=get(m,body+0x3c),result=(height-ry-fy)|0;put(m,output+8,(worldZ+z)>>16);put(m,output+4,(y+height)>>16);return result;
}

//481450. normal.y is replaced in place by its negative Q16 reciprocal.
export function writeVehicleGroundProjection(body,normal,relative,{memory:m,scratchBase}){
 if(abs32(get(m,normal+4))<4096){m[body+0x72e]=0;return;}
 const frame=scratchBase-72,distance=-dotQ16(vector(m,normal),vector(m,relative))|0;put(m,frame+0x10,distance);
 for(let o=0;o<12;o+=4)put(m,frame+0x14+o,(get(m,normal+o)<<2)>>16);
 const y=get(m,normal+4);put(m,frame+0x20,abs32(y));put(m,normal+4,-divideQ16(65536,y));
 for(const[o,t]of[[0xc8,0x30],[0xce,0x34],[0xd4,0x38],[0xc4,0x24],[0xca,0x28],[0xd0,0x2c]])put(m,frame+t,Math.imul(m.readInt16LE(body+o),0x380));
 for(let i=0;i<4;i++){
  const height=computeVehicleProjectionCorner(body,frame+0x30,frame+0x24,frame+0x3c,normal,get(m,frame+0x10),(3-i)&255,{memory:m}),corner=body+0x728+i*8;
  word(m,corner,get(m,frame+0x3c)+get(m,frame+0x14));word(m,corner+2,get(m,frame+0x40)+get(m,frame+0x18));word(m,corner+4,get(m,frame+0x44)+get(m,frame+0x1c));const clipped=Math.max(0,Math.min(64,height>>16)),shade=(128-clipped*2)&255;m[corner+7]=Math.trunc(Math.imul(shade,get(m,frame+0x20))/65536)&255;
 }
}

//481200. The first pass captures the participant count; later passes read the
//count through the same selectively reloaded session pointers as the native.
export function updateVehicleGroundProjection(runtime){
 const {memory:m,scratchBase}=runtime,frame=scratchBase-0x2dc;let session=ptr(m,0x5ecb1c);const count=m[session+0x54d];
 for(let i=0;i<count;i++){const body=ptr(m,0x909300+i*0x30c),query=frame+0x120+i*72;put(m,query+20,0);put(m,query+28,0);put(m,query+24,0x4000);for(let o=0;o<12;o+=4)put(m,query+8+o,((get(m,body+0x2f3c+o)+get(m,body+0x34+o))|0)>>8);put(m,query+64,0);word(m,query+70,0);}
 if(count)for(let i=0;;i++){const body=ptr(m,0x909300+i*0x30c),time=queryRawTerrain(body,frame+0x120+i*72,frame+0x30+i*40,0x1010000,runtime);session=ptr(m,0x5ecb1c);put(m,0x7130c0+i*4,time);if(i+1>=m[session+0x54d])break;}
 for(let i=0;i<m[session+0x54d];i++){const body=ptr(m,0x909300+i*0x30c);if(smoothVehicleGroundProjection(body,frame+0x18,frame+0x24,get(m,0x7130c0+i*4),frame+0x30+i*40,runtime)){m[body+0x72e]=1;writeVehicleGroundProjection(body,frame+0x18,frame+0x24,{...runtime,scratchBase:frame-8});session=ptr(m,0x5ecb1c);}else m[body+0x72e]=0;}
}
