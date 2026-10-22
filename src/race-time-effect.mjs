//48c120 time-scale effect, renderer UV producer and autonomous recovery policy.
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
function integerFloat(value,mode){let rounded;if(mode==='nearest-even'){const floor=Math.floor(value),part=value-floor;rounded=part<0.5?floor:part>0.5?floor+1:floor%2===0?floor:floor+1;}else if(mode==='toward-zero')rounded=Math.trunc(value);else if(mode==='down')rounded=Math.floor(value);else if(mode==='up')rounded=Math.ceil(value);else throw Error('Time-effect UV conversion requires a declared x87 rounding mode.');return Number.isFinite(rounded)&&rounded>=-2147483648&&rounded<=2147483647?rounded:-2147483648;}

//48c2a0. Return the live caller registers because47be20 consumes the retained
//EDX even though this procedure's ordinary result is EAX.
export function activateRaceTimeEffect(record,age,{memory:m}){
 const state=get(m,0x811180);let ecx=record|0,eax;
 if(state!==0&&state!==4){if(ptr(m,0x811184)!==ptr(m,record)){put(m,0x811180,4);put(m,0x811188,20);eax=2;}else eax=0;}
 else{put(m,0x811184,get(m,record));if((age|0)<10){const product=Math.imul(age,0x1333);ecx=(65536-product)|0;put(m,0x811180,2);put(m,0x81118c,ecx);put(m,0x811188,10-age);}else{put(m,0x811180,1);put(m,0x81118c,0x4002);put(m,0x811188,110-age);}eax=1;}
 return{eax,ecx,edx:age|0};
}

//47c2d0. Signed8 comparison of the first slot decides which flag byte changes.
export function markVehicleWeaponReleased(body,type,{memory:m}){const mask=(type|0x40)|0;if(m.readInt8(body+0x68c)===mask)m[body+0x68c]|=0x20;else m[body+0x68d]|=0x20;}

//430890. Difficulty two skips recovery. The other branch captures the session
//and seed but reloads difficulty after each random decision.
export function recoverDriversAfterTimeEffect(body,{memory:m}){
 const owner=m.readUInt16LE(body+0x65e);let difficulty=get(m,0x5ea4d8);if(difficulty===2)return;const session=ptr(m,0x5ecb1c);let seed=get(m,0x5ea4d4);
 for(let i=0;i<m[session+0x54d];i++)if(i!==owner){const other=ptr(m,0x909300+i*0x30c);if(m[other+0x718]===8){const shift=((difficulty-1)>>>0)?1:2;seed=Math.imul(seed,0x41a7)&0x7fffffff;put(m,0x5ea4d4,seed);if(!(((seed>>>15)<<shift)&0xffff0000))put(m,other+0x6c4,0x200);difficulty=get(m,0x5ea4d8);}}
}

//40f5d0. Four groups of32 renderer records. FISTP follows the supplied x87
//context; scalar additions are binary32 and the native UV writes are bytes.
export function updateTimeEffectTextureCoordinates({memory:m,roundingMode='nearest-even'}){
 let row=0x6f53a0,vertical=(get(m,0x90a548)&127)*2;if(vertical>=224)vertical-=128;
 if(get(m,0x5ed024)===-1){for(let i=0;i<128;i++,row+=132){word(m,row+0x60,256);word(m,row+0x20,0);word(m,row+0x80,257);word(m,row+0x40,1);}return;}
 const increment=m.readFloatLE(0x5dc978);for(let group=0;group<4;group++){let horizontal=0;const next=(vertical+8)|0;for(let i=0;i<32;i++,row+=132){const previous=horizontal;horizontal=Math.fround(horizontal+increment);const first=integerFloat(previous,roundingMode),second=integerFloat(horizontal,roundingMode);m[row+0x60]=first&255;m[row+0x20]=first&255;m[row+0x80]=second&255;m[row+0x40]=second&255;m[row+0x41]=vertical&255;m[row+0x21]=vertical&255;m[row+0x81]=next&255;m[row+0x61]=next&255;}vertical=next;}
}

//48c120. Arithmetic for the intensity uses unsigned division after the low32
//multiply. The selected state is read again after renderer stores.
export function updateRaceTimeEffect(runtime){
 const {memory:m}=runtime,state=get(m,0x811180);put(m,0x6e6cac,0);
 if([1,2,4].includes(state)&&get(m,0x5ed024)!==-1){let intensity=255;if(state===2)intensity=Math.floor((Math.imul((10-get(m,0x811188))|0,255)>>>0)/10);else if(state===4)intensity=Math.floor((Math.imul(get(m,0x811188),255)>>>0)/20);put(m,0x6e6cb0,intensity);put(m,0x6e6cac,1);updateTimeEffectTextureCoordinates(runtime);}
 switch(get(m,0x811180)){
  case 1:{const remaining=(get(m,0x811188)-1)|0;put(m,0x811188,remaining);if(remaining===25)markVehicleWeaponReleased(ptr(m,0x811184),5,runtime);if(!get(m,0x811188)){put(m,0x811180,4);put(m,0x811188,20);}break;}
  case 2:put(m,0x81118c,get(m,0x81118c)-0x1333);put(m,0x811188,get(m,0x811188)-1);if(!get(m,0x811188)){put(m,0x811180,1);put(m,0x811188,100);}break;
  case 4:put(m,0x81118c,get(m,0x81118c)+0x999);put(m,0x811188,get(m,0x811188)-1);if(!get(m,0x811188)){const body=ptr(m,0x811184);if((m.readInt8(body+0x68c)&~0x20)===0x45)m[body+0x68c]=255;else m[body+0x68d]=255;const live=ptr(m,0x811184);put(m,0x811180,0);put(m,0x81118c,65536);put(m,0x811188,0);recoverDriversAfterTimeEffect(live,runtime);}break;
 }
}
