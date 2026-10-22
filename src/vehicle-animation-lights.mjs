//48e310: linked model vertices/colors and one-time attached-light publication.
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
const trunc10=value=>Math.trunc((value|0)/1024);

//47c300. Integer hue/saturation/value conversion includes signed overflow and
//the native output division by33; unsupported hue sectors retain zero lanes.
export function convertVehicleAnimationColor(hue,saturation,value,red,green,blue,{memory:m}){
 let r=0,g=0,b=0;
 if(!(saturation|0))r=g=b=value|0;
 else{
  if((hue|0)===360)hue=0;const sector=Math.trunc((hue|0)/60)<<10,fraction=(Math.trunc((hue<<10)/60)-sector)|0;
  const low=trunc10(Math.imul((1024-saturation)|0,value)),descending=trunc10(Math.imul((1024-trunc10(Math.imul(fraction,saturation)))|0,value)),ascending=trunc10(Math.imul((1024-trunc10(Math.imul((1024-fraction)|0,saturation)))|0,value));
  switch(sector){case 0:r=value;g=ascending;b=low;break;case 1024:r=descending;g=value;b=low;break;case 2048:r=low;g=value;b=ascending;break;case 3072:r=low;g=descending;b=value;break;case 4096:r=ascending;g=low;b=value;break;case 5120:r=value;g=low;b=descending;break;}
 }
 put(m,red,Math.trunc(((r+1)|0)/33));put(m,green,Math.trunc(((g+1)|0)/33));put(m,blue,Math.trunc(((b+1)|0)/33));
}

//48e4f0. The timer's final threshold uses signed8 comparison, not unsigned.
export function updateVehicleAnimationParameters(body,state,{memory:m}){
 let recoil=m.readInt16LE(state+0x2e8),weapon=m.readInt16LE(state+0x2ea),timer=m[state+0x2de];const target=(((get(m,body+0x5d4)>>8)+(get(m,body+0x50c)>>8))|0)>>6;
 if(target>recoil)recoil=Math.min(255,(recoil+(((target-recoil)|0)>>1))|0);else if(recoil)recoil=Math.max(0,recoil-8);word(m,state+0x2e8,recoil);
 if(m.readInt16LE(body+0x6a0)){if(m.readInt16LE(body+0x6a2)>=15)weapon=255;}else if(weapon)weapon=Math.max(0,weapon-8);word(m,state+0x2ea,weapon);
 if(m[body+0x714]&0x40)timer=10;else if(timer)timer=(timer-1)&255;m[state+0x2de]=timer;const signed=timer<<24>>24;m[state+0x2dd]=timer?(signed>=8?127:Math.trunc((signed<<7)/8))&255:0;
}

//48e5e0. Each loop rereads the signed count and authored height so aliases in
//the writable model vertices and selection metadata preserve native ordering.
export function updateVehicleAnimationVertices(state,recoil,trigger,{memory:m}){
 const vertices=ptr(m,ptr(m,state+4)+0x24);let amount=(((trigger+16)<<9)+recoil)|0;if(amount>65536)amount=65536;const displacement=(amount<<5)>>16;
 if(m.readInt8(state+0x2dc)<=0)return;
 for(let i=0;;i++){const selected=m[state+0x2e0+i],delta=m[state+0x2e4+i]===1?Math.trunc(displacement/8):displacement,height=m.readUInt16LE(state+2);word(m,vertices+selected*8+4,-(height+delta));if(i+1>=m.readInt8(state+0x2dc))break;}
}

//48e3d0. RGB, phase and flash fields alias body2e78/7c/7d, consumed by44df50.
export function updateVehicleLinkedAnimation(body,{memory:m,scratchBase}){
 const state=body+0x2b88,frame=scratchBase-20;updateVehicleAnimationParameters(body,state,{memory:m});const recoil=m.readInt16LE(state+0x2e8)<<8,flash=m[state+0x2f5];m[state+0x2f4]=(m[state+0x2f4]+4)&255;if(flash){m[state+0x2f5]=(flash+1)&255;if(flash>35)m[state+0x2f5]=0;}
 const seed=Math.imul(get(m,0x5ed008),0x41a7)&0x7fffffff;put(m,0x5ed008,seed);if((((seed>>>15)<<16)&0x3ff0000)===0xa00000)m[state+0x2f5]=1;
 updateVehicleAnimationVertices(state,recoil,m.readInt8(state+0x2dd),{memory:m});const weapon=m.readInt16LE(state+0x2ea),hue=m.readInt16LE(state+(weapon<128?0x2ec:0x2ee)),saturation=Math.imul(Math.abs(128-weapon),0x35f)>>7,brightness=Math.min(1023,((recoil+0x1800)|0)>>6);
 convertVehicleAnimationColor(hue,saturation,brightness,frame+8,frame+12,frame+16,{memory:m});m[state+0x2f0]=(m[frame+8]<<3)&255;m[state+0x2f1]=(m[frame+12]<<3)&255;m[state+0x2f2]=(m[frame+16]<<3)&255;
}

//44e470. Queue capacity is16; an omitted payload keeps the old three DWORDs.
export function appendVehicleAnimationLight(position,color,mode,kind,lifetime,payload,{memory:m}){
 const count=ptr(m,0x810920);if(count>=16)return;const row=0x8106e0+count*36;for(let o=0;o<12;o+=4)put(m,row+o,get(m,position+o));put(m,row+12,get(m,color));word(m,row+16,mode);word(m,row+18,kind);put(m,row+20,lifetime);if(payload)for(let o=0;o<12;o+=4)put(m,row+24+o,get(m,payload+o));put(m,0x810920,count+1);
}

//48e310. Session pointer is captured once; the count at that pointer stays live.
export function updateVehicleAnimationLights({memory:m,scratchBase}){
 const frame=scratchBase-28,session=ptr(m,0x5ecb1c);for(let i=0;i<m[session+0x54d];i++)updateVehicleLinkedAnimation(ptr(m,0x909300+i*0x30c),{memory:m,scratchBase:frame-4});
 if(!get(m,0x6e6ca4)&&get(m,session+0x57c)===4){for(let i=0;i<m[session+0x54d];i++){const body=ptr(m,0x909300+i*0x30c);put(m,frame+12,body);appendVehicleAnimationLight(body+0x34,body+0x2e78,3,8,1,frame+12,{memory:m});}put(m,0x6e6ca4,1);}
}
