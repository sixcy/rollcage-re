//41dbb0 and its raw vehicle-state producers. All addresses share caller memory.
import tables from './vehicle-construction-tables.json' with {type:'json'};
import {abs32,lookupSqrt} from './fixed-integer.mjs';
import {quaternionFromReleaseDirection} from './scripted-release.mjs';
import {createRawBody,initializeRawBody,registerRawBodyShapes,measureRawBodyStorage,publishRawBodyStorage} from './raw-body-construction.mjs';
import {formatLapTimeDigits} from './lap-timing.mjs';
import {updateReplayChecksum} from './replay-codec.mjs';
import {createVehicleWheels} from './vehicle-wheel-construction.mjs';
import {initializeVehicleWheelConstructionTables} from './vehicle-wheel-construction.mjs';
const get=(m,p)=>m.readInt32LE(p),ptr=(m,p)=>m.readUInt32LE(p),put=(m,p,v)=>m.writeInt32LE(v|0,p),word=(m,p,v)=>m.writeUInt16LE(v&65535,p);
function allocate(runtime,size){const service=runtime.handlers?.allocate;if(!service)throw Error('Vehicle construction requires the CRT allocation service.');const result=service(size,runtime);return (typeof result==='number'?result:result.eax)>>>0;}
//Call once for a new runtime. This intentionally resets the mutable authored
//body template, shared animation offsets and seed to their original bytes.
export function initializeVehicleConstructionTables(memory){initializeVehicleWheelConstructionTables(memory);for(const table of tables)Buffer.from(table.bytesHex,'hex').copy(memory,Number(table.address));return memory;}

//4494a0. Route group zero is skipped; ties keep the first signed distance.
export function resetVehicleParticipant(record,{memory:m}){
 const session=ptr(m,0x5ecb1c),index=m.readUInt16LE(ptr(m,record)+0x65e);
 m[record+0x1c]=0;m[record+0x1e]=0;m[record+0x1d]=(index+1)&255;
 for(const o of[0x2c,0x30,0x34,0x38])put(m,record+o,-1);
 if(!m[session+0x58c]){const selected=session+Math.imul(index,0xdc),bytes=Buffer.from(m.subarray(0x5dcd70,0x5dcd80));for(let block=0;block<3;block++)bytes.copy(m,selected+0x24+block*16);put(m,selected+0x54,0x595999);}
 let pack=ptr(m,0x90b98c);for(const o of[0x4c,0x50])put(m,record+o,-1);put(m,record+0x24,0);m[record+0x1f]=0;m[ptr(m,record)+0x671]=1;m[ptr(m,record)+0x66d]=0;
 const body=ptr(m,record),position=[0x36,0x3a,0x3e].map(o=>m.readInt16LE(body+o)),groups=m[pack+0x46]-1;let group=ptr(m,pack+0x60)+12,best=0x7fffffff,selected=0,pointIndex=0;
 if(groups>0){for(let g=0;g<groups;g++,group+=12){const count=m.readUInt16LE(group),points=ptr(m,group+8);for(let i=0;i<count;i++){const difference=[0,2,4].map((o,a)=>m.readInt16LE(points+i*16+o)-position[a]);const distance=difference.reduce((sum,v)=>sum+Math.imul(v,v)|0,0);if(distance<best){best=distance;selected=group;pointIndex=i;}}}pack=ptr(m,0x90b98c);}
 put(m,record+0x54,selected);put(m,record+0x58,pointIndex);m[record+0x20]=0;m[record+0x21]=(m[pack+0x44]-1)&255;m[record+0x22]=m[ptr(m,pack+0x90)];m[record+0x23]=m[ptr(m,pack+0x90)+m[record+0x21]*4];
}

//481100. The global registry owns the inline body+728 effect block.
export function initializeVehicleEffectBlock(block,{memory:m}){
 const resource=ptr(m,0x90b990),index=get(m,0x7130b8),material=(m.readUInt16LE(resource+0x2e)+0x41)*16+ptr(m,0x90b988);
 m[block+6]=0;put(m,block+0x128,0);put(m,block+0x2230,0);put(m,block+0x2234,0xffff0001);put(m,block+0x2238,0);put(m,0x7130e0+index*4,block);put(m,0x7130b8,index+1);
 for(const[base,byteA,byteB,tail]of[[0x40,0x23,0x27,0x2240],[0xc4,0xa7,0xab,0x2248]]){put(m,block+base,get(m,material));put(m,block+base+0x20,get(m,material+4));word(m,block+base+0x40,m.readUInt16LE(material+8));word(m,block+base+0x60,m.readUInt16LE(material+10));const flags=(m.readUInt16LE(block+base+0x22)&0xffbf)|0x80;if(base===0x40){m[block+byteA]=12;m[block+byteB]=0x8e;}word(m,block+base+0x22,flags);if(base===0xc4){m[block+byteA]=12;m[block+byteB]=0x8e;}put(m,block+tail,0xb4000002);}
}

//4831e0. Allocation remains a CRT service; all layout/initialization is native.
export function initializeVehicleSkidStorage(body,runtime){
 const {memory:m}=runtime,storage=allocate(runtime,0x13800);if(storage)m.fill(0,storage,storage+0x13800);
 put(m,body+0x2974,storage);put(m,body+0x2978,storage+0x9c00);m[body+0x2b84]=0;
 for(let i=0;i<128;i++){const p=storage+i*0x270;for(const o of[15,171,327,483])m[p+o]=12;for(const o of[19,175,331,487])m[p+o]=0x8e;}
 const material=(m.readUInt16LE(ptr(m,0x90b990)+0x2e)+0x56)*16+ptr(m,0x90b988);m[body+0x2b86]=m[material];m[body+0x2b87]=m[material+1];const first=m.readUInt16LE(material+6),second=m.readUInt16LE(material+2);
 const records=ptr(m,body+0x2974);for(let i=0;i<512;i++){word(m,records+0x4e+i*0x9c,first);word(m,records+0x2e+i*0x9c,second);}m[body+0x2b85]=1;
}

//42c9d0 and42c950 renderer/effect records retain untouched fields.
export function initializeVehicleSurfaceLinks(body,{memory:m}){let row=body+0x2e88;put(m,body+0x2f30,row);for(let j=0;j<3;j++,row+=0x38){for(let i=0;i<13;i++)put(m,row+i*4,(row+i*4+4)|0x80000000);put(m,row+52,-1);}}
export function initializeVehicleGripRecords(body,{memory:m}){const material=(m.readUInt16LE(ptr(m,0x90b990)+0x2e)+0x96)*16+ptr(m,0x90b988);put(m,body+0x3d0c,0);for(const base of[0x3d30,0x3da8]){put(m,body+base,get(m,material));put(m,body+base+0x1c,get(m,material+4));word(m,body+base+0x38,m.readUInt16LE(material+8));word(m,body+base+0x54,m.readUInt16LE(material+10));}}

//42aa80: first state-eight replay controller, with original no-free fallback.
export function initializeVehicleController(body,mode,{memory:m}){
 const session=ptr(m,0x5ecb1c);let controller=body;for(let i=0;i<6;i++)if(get(m,session+0x1fb20+i*0x1e884)===8){controller=session+0x12a0+i*0x1e884;break;}
 put(m,body+0x660,controller);put(m,controller+0x4e2c,0);const stream=controller+8;put(m,controller+0x4e28,stream);word(m,controller+4,m.readUInt16LE(body+0x65e));
 const headers=[0x4e30,0x14c24,0x19a50];
 if(mode!==4){for(const[h,i]of headers.map((h,i)=>[h,i])){m[controller+h+2]=0;word(m,controller+h+8,0);word(m,controller+h,0);put(m,controller+h+4,(i?0x4e20:0xfde8)-16);}put(m,controller+0x1e880,2);put(m,controller,0);}
 else{for(const h of headers){word(m,controller+h+10,0);word(m,controller+h,0);m[controller+h+2]=0;}const count=m.readUInt16LE(controller+2);put(m,controller+0x4e28,stream);word(m,controller+0x1e87c,count);updateReplayChecksum(controller,{memory:m,validate:true});put(m,controller+0x1e880,5);}
 return controller;
}

//488220: exact short descriptor copies and signed aggregate-radius comparison.
export function initializeRawVehicleDescriptors(body,{memory:m}){
 put(m,body+0x320,0x2c00);let radius=0;
 for(let i=0;i<4;i++){const descriptor=body+0x180+i*28,source=0x5eac60+i*28;for(const o of[0,2,4,8,10,12])word(m,descriptor+o,m.readUInt16LE(source+o));put(m,descriptor+16,i);const end=[0,2,4].map(o=>(m.readInt16LE(descriptor+o)+(Math.imul(m.readInt16LE(source+8+o),0x2c00)>>8))|0);const square=end.reduce((sum,v)=>sum+Number(BigInt.asIntN(32,BigInt(v)*BigInt(v)>>8n))|0,0),input=abs32(square);put(m,0x91d45c,input);put(m,0x91d460,Math.clz32(input));const bound=lookupSqrt(input)<<4;if(bound>radius)radius=bound;}
 const count=m.readInt8(body+0x10c),record=ptr(m,0x91e79c)+m[body+0x140+count]*72;if(radius>get(m,record+0x40))put(m,record+0x40,radius);return radius;
}

//48dd10: shared authored vertex translation runs only once per vehicle type.
export function initializeVehicleAnimationBody(body,type,{memory:m}){
 let vertices=ptr(m,body+0x24),offsets=ptr(m,0x5ecfec+type*4);const count=m[body+0x10d],primaryModel=ptr(m,ptr(m,0x909300)+0x10);
 if(m.readUInt16LE(primaryModel+6)>250){put(m,0x5ecff4,0x5ecfc4);put(m,0x5ecff8,0x5ed01c);put(m,0x5ed004,0x5ecfe4);offsets=ptr(m,0x5ecfec+type*4);}
 if(!m[0x810940+type]){m[0x810940+type]=1;for(let i=0;i<count;i++,vertices+=8){word(m,vertices,m.readUInt16LE(vertices)+m.readUInt16LE(offsets));word(m,vertices+2,m.readUInt16LE(vertices+2)+m.readUInt16LE(offsets+2));word(m,vertices+4,m.readUInt16LE(vertices+4)+m.readUInt16LE(offsets+4)-2);}}
}

//48dda0: selection temporaries retain their actual native stack addresses.
export function initializeVehicleAnimationRange(state,{memory:m,scratchBase}){
 const local=scratchBase-32,body=ptr(m,state+4),count=m[body+0x10d];let vertices=ptr(m,body+0x24),maximum=-32767,minimum=32767;
 const seed=Math.imul(get(m,0x5ed008),0x41a7)&0x7fffffff;put(m,0x5ed008,seed);m[state+0x2f5]=0;m[state+0x2f4]=(seed>>>15)&255;
 for(let i=0;i<count;i++){const z=m.readInt16LE(vertices+i*8+4);maximum=Math.max(maximum,z);minimum=Math.min(minimum,z);}minimum+=3;let selected=0;
 for(let i=0;i<count;i++){const z=m.readInt16LE(vertices+i*8+4);if(z<maximum){m[local+0x14+selected]=i;m[state+0x2e4+selected]=z>minimum?1:0;selected++;}}
 m[state+0x2dc]=selected&255;word(m,state+2,abs32(maximum)+16);if(selected)for(let i=0;i<selected;i++)m[state+0x2e0+i]=m[local+0x14+i];
 vertices=ptr(m,ptr(m,state+4)+0x24);put(m,local+0x14,vertices);let lowCount=0;
 for(let i=0;i<selected;i++){const index=m[state+0x2e0+i];if(m.readInt16LE(vertices+index*8+4)<=minimum)put(m,local+0x18+lowCount++*4,index);vertices=ptr(m,local+0x14);}
 let output=state+0x2f6;put(m,output,-1);put(m,output+4,-1);const selectedBody=ptr(m,state+4),polygons=ptr(m,selectedBody+0x28),model=ptr(m,selectedBody+0x10),polygonCount=m.readUInt16LE(model+6);
 for(let i=0;i<polygonCount;i++){let packed=ptr(m,polygons+i*8),found=false;for(let lane=0;lane<4&&!found;lane++){const index=packed&255;packed>>>=8;if(index)for(let j=0;j<lowCount;j++)if(index-1===get(m,local+0x18+j*4)){found=true;break;}}if(found)m[output++]=i&255;}
}

//48e670 updates at most eight selected renderer polygons using the live bank.
export function initializeVehicleAnimationState(state,{memory:m}){
 let frame=m.readInt16LE(state+10)+1;if(frame>=5)frame=0;word(m,state+10,frame);frame=m.readInt16LE(state+10);const material=(m.readUInt16LE(ptr(m,0x90b990)+0x2e)+0x91+frame)*16+ptr(m,0x90b988),body=ptr(m,state+4),records=ptr(m,body+(ptr(m,0x91d590)===0x91d5a0?0x14:0x18));
 for(let i=0;i<8;i++){const index=m.readInt8(state+0x2f6+i);if(index===-1)break;const record=records+index*132;for(const[a,b]of[[6,0x42],[0,0x20],[4,0x40],[8,0x60],[10,0x80]])word(m,record+b,m.readUInt16LE(material+a));}
}

//48dc60 builds the linked animation body, then initializes shared model data.
export function createVehicleAnimation(state,model,type,runtime){
 const {memory:m,scratchBase}=runtime,body=createRawBody(model,0x8013,384,0,{...runtime,scratchBase:scratchBase-24});put(m,state+4,body);put(m,state+0x2e8,0);word(m,state+0x2dd,0);word(m,state+0x2ec,m.readUInt16LE(0x575210+type*2));m[state]=0;put(m,state+0x2f0,0);word(m,state+0x2ee,24);initializeVehicleAnimationBody(body,type,runtime);
 const selected=ptr(m,state+4),count=m.readUInt16LE(ptr(m,selected+0x10)+6);let first=0;for(let i=0;i<count;i++){const packed=get(m,ptr(m,selected+0x28)+4+i*8),value=(packed<<22)>>22;if(value<-250){first=i;break;}}m[state+1]=first&255;
 initializeVehicleAnimationRange(state,{...runtime,scratchBase:scratchBase-16});put(m,state+8,0);initializeVehicleAnimationState(state,runtime);return body;
}

//47e240. Mode-four participant zero also owns six presentation bodies and
//the double-buffered selection panel. The allocations are ordinary CRT calls.
export function initializeVehiclePresentation(body,type,runtime){
 const {memory:m,scratchBase}=runtime;put(m,body+0x3e70,-1);if(m[ptr(m,0x5ecb1c)+0x551]!==4||m.readUInt16LE(body+0x65e)!==0)return;
 const block=allocate(runtime,0x121c);if(block)m.fill(0,block,block+0x121c);put(m,body+0x3e70,block);put(m,0x5ecb18,body);m[block+0x1218]=type&255;
 for(let i=0;i<6;i++){const pack=ptr(m,0x90b98c),models=ptr(m,pack+0x18),lookup=ptr(m,pack+0x58),first=ptr(m,models+m.readInt16LE(lookup+m.readUInt16LE(0x5eadc4+i*2)*2)*4),second=ptr(m,models+m.readInt16LE(lookup+m.readUInt16LE(0x5ead50+i*2)*2)*4);const object=createRawBody(first,0x1c03,384,0,{...runtime,scratchBase:scratchBase-40});put(m,block+i*4,object);createVehicleAnimation(block+24+i*0x300,second,i,{...runtime,scratchBase:scratchBase-44});}
 const x=m.readInt16LE(0x9118d0),scaled=Math.trunc((m.readUInt16LE(ptr(m,0x5ecefc)+0x42c)<<8)/400),y=((Math.imul(scaled,25)>>>8)+m.readInt16LE(0x9118d2))|0;
 const panel=allocate(runtime,0x14c0);if(panel)m.fill(0,panel,panel+0x14c0);put(m,0x902018,panel);put(m,0x90201c,panel+0xa60);
 for(let i=0;i<4;i++){
  const p=panel+i*0x298,material=(m.readUInt16LE(ptr(m,0x90b990)+0x2e)+0x99+i)*16+ptr(m,0x90b988);put(m,p+0x294,0x10000000);put(m,p+0x0c,get(m,material));word(m,p+0x10,m[material+10]-m[material]+1);put(m,p+4,0);word(m,p+8,x);word(m,p+0x12,m[material+11]-m[material+1]+1);m[p+3]=4;word(m,p+10,y+i*33);m[p+7]=0x46;word(m,p+14,m.readUInt16LE(material+6));
  for(let j=0;j<16;j++){
   const q=p+0x1c+j*40,entry=(m.readUInt16LE(ptr(m,0x90b990)+0x2e)+0x84)*16+ptr(m,0x90b988);put(m,q+4,get(m,entry));put(m,q+12,get(m,entry+4));word(m,q+20,m.readUInt16LE(entry+8));word(m,q+28,m.readUInt16LE(entry+10));const left=(j*10+m.readUInt16LE(p+8))&65535,top=(m.readUInt16LE(p+10)+18)&65535;word(m,q,left);word(m,q+2,top);word(m,q+10,top);put(m,q-4,0);word(m,q+8,left+8);word(m,q+24,left+8);word(m,q+16,left);word(m,q+18,top+8);word(m,q+26,top+8);m[q-5]=9;m[q-1]=0x2e;
  }
 }
 const end=ptr(m,0x90201c);for(let p=panel;p<end;p+=4)put(m,end+p-panel,get(m,p));
}

//41cfc0 clones the four wheel records forward, then gives each a new render
//object. Its registry cursor is captured once across all four allocations.
export function cloneSecondaryVehicleWheels(record,model,{memory:m,scratchBase}){
 const local=scratchBase-60,secondary=ptr(m,record+0x250),difference=(ptr(m,record)-secondary)|0;let registry=get(m,0x6e6b44);
 for(let i=0;i<4;i++){
  const wheel=secondary+0x324+i*200;for(let o=0;o<200;o+=4)put(m,wheel+o,get(m,wheel+difference+o));let required=384,auxiliary=0,third=0;
  const outputs=[local+0x20,local+0x1c,local+0x28,local+0x24,local+0x34,local+0x30];
  if(model){auxiliary=model+m.readUInt16LE(model+0x1c);third=model+m.readUInt16LE(model+0x1e);required=measureRawBodyStorage(model,384,[true,auxiliary!==model,third!==model],outputs,{memory:m});}
  const old=ptr(m,0x70dcf4),body=(ptr(m,0x902eec)+(old&0xfffffffc))>>>0;put(m,0x70dcf4,old+((required+127)&0xffffff80));for(let o=0;o<384;o+=4)put(m,body+o,-1);
  put(m,body,0xc00);put(m,body+4,0);word(m,body+8,0);put(m,body+12,0);put(m,body+0x118,0);put(m,body+0x11c,-1);put(m,body+0x110,0);m[body+0x12f]=255;put(m,body+0x148,0);m.fill(0,body+0x16a,body+0x172);word(m,body+0x172,0);
  if(registry<512){put(m,0x70e200+registry*4,body);word(m,body+0x10e,registry);registry=(registry+1)|0;put(m,0x6e6b44,registry);}
  if(model){put(m,body+0x24,get(m,model+0x40));m[body+0x162]=m[model+4];m[body+0x10d]=m[model+4];put(m,body+0x2c,get(m,model+12));put(m,body+0x28,get(m,model+12));let displacement=m.readUInt16LE(model+0x1c);if(displacement){put(m,body+0x2c,get(m,model+displacement+12));displacement=m.readUInt16LE(model+0x1c);m[body+0x162]=m[model+displacement+4];}put(m,body+0x30,get(m,body+0x2c));m[body+0x163]=m[body+0x162];displacement=m.readUInt16LE(model+0x1e);if(displacement){put(m,body+0x30,get(m,model+displacement+12));displacement=m.readUInt16LE(model+0x1e);m[body+0x163]=m[model+displacement+4];}put(m,body+0x10,model);
   publishRawBodyStorage(body+0x14,model,(get(m,outputs[0])+body)|0,(get(m,outputs[1])+body)|0,{memory:m});if(auxiliary===model){put(m,body+0x1c,get(m,body+0x14));put(m,body+0x20,get(m,body+0x18));}else publishRawBodyStorage(body+0x1c,auxiliary,(get(m,outputs[2])+body)|0,(get(m,outputs[3])+body)|0,{memory:m});if(third!==auxiliary&&third!==model)publishRawBodyStorage(body+0x14c,third,(get(m,outputs[4])+body)|0,(get(m,outputs[5])+body)|0,{memory:m});else{put(m,body+0x14c,get(m,body+0x1c));put(m,body+0x150,get(m,body+0x20));}
  }put(m,wheel+0x6c,body);
 }
}

//41e3f0 shares its direction buffer and root globals with the caller.
export function initializeVehicleSpawnQuaternion(output,direction,{memory:m}){
 const values=[0,4,8].map(o=>get(m,direction+o)),scratch={},quaternion=quaternionFromReleaseDirection(values,scratch);for(let i=0;i<3;i++)put(m,direction+i*4,values[i]);put(m,0x91d45c,scratch.sum91d45c);put(m,0x91d460,scratch.leadingZeros91d460);put(m,output+8,quaternion[2]);put(m,output,quaternion[0]);put(m,output+4,0);put(m,output+12,0);
}

//41dbb0. ECX is the participant record, EDX its session index. Allocation and
//all game producers run before the global/list ownership is published.
export function constructVehicle(record,index,runtime){
 const {memory:m,scratchBase}=runtime,local=scratchBase-68,session=ptr(m,0x5ecb1c),type=m[session+index+0x1c],pack=ptr(m,0x90b98c),models=ptr(m,pack+0x18),lookup=ptr(m,pack+0x58);
 put(m,local+0x14,index);const model=ptr(m,models+m.readInt16LE(lookup+m.readUInt16LE(0x5eadc4+type*2)*2)*4);put(m,local+0x20,model);const wheelModel=ptr(m,models+m.readInt16LE(lookup+m.readUInt16LE(0x5ead50+type*2)*2)*4);put(m,local+0x1c,wheelModel);put(m,local+0x18,ptr(m,models+m.readInt16LE(lookup+16)*4));
 const body=createRawBody(model,0x1c03,0x3e78,0,{...runtime,scratchBase:local-12});put(m,record,body);
 if(m[session+0x54e])put(m,record+0x250,createRawBody(ptr(m,local+0x20),0xc03,0x3e78,0,{...runtime,scratchBase:local-12}));else put(m,record+0x250,-1);
 const spawn=ptr(m,ptr(m,0x90b98c)+0x48)+m[session+get(m,local+0x14)+0x10]*8;for(const[o,t]of[[0,0x5eab18],[2,0x5eab1c],[4,0x5eab20]])put(m,t,m.readInt16LE(spawn+o)<<16);initializeRawBody(body,0x5eab18,{...runtime,scratchBase:local-4});
 let current=ptr(m,0x90b98c);const checkpoint=ptr(m,current+0x70)+m[ptr(m,current+0x90)]*20;let dx=m.readInt16LE(checkpoint+4)-m.readInt16LE(body+0x36),dy=m.readInt16LE(checkpoint+6)-m.readInt16LE(body+0x3a),dz=m.readInt16LE(checkpoint+8)-m.readInt16LE(body+0x3e);for(let i=0;i<3;i++)put(m,local+0x24+i*4,m.readInt16LE(checkpoint+12+i*2));const sum=((Math.imul(dx,get(m,local+0x24))>>6)+(Math.imul(dy,get(m,local+0x28))>>6)+(Math.imul(dz,get(m,local+0x2c))>>6))|0;if(sum<0)for(let i=0;i<3;i++)put(m,local+0x24+i*4,-get(m,local+0x24+i*4));initializeVehicleSpawnQuaternion(local+0x30,local+0x24,runtime);for(let o=0;o<16;o+=4)put(m,body+0x58+o,get(m,local+0x30+o));put(m,body+0xb4,0);
 registerRawBodyShapes(body,5,0x5ead60,runtime);initializeRawVehicleDescriptors(body,runtime);createVehicleWheels(body,ptr(m,local+0x18),get(m,local+0x14),{...runtime,scratchBase:local-16});
 put(m,body+0x644,0);put(m,body+0x648,0);word(m,body+0x64c,0);m[body+0x64e]=0;put(m,body+0x650,0);put(m,body+0x664,0);put(m,body+0x668,0);put(m,body+0x658,0);word(m,body+0x65c,0);word(m,body+0x68c,65535);word(m,body+0x65e,get(m,local+0x14));put(m,body+0x690,0);word(m,body+0x698,0);put(m,body+0x69c,-1);put(m,body+0x6bc,-1);resetVehicleParticipant(record,runtime);
 const liveBody=ptr(m,record);word(m,liveBody+0x6a0,0);word(m,liveBody+0x6a2,65535);word(m,liveBody+0x6a4,65535);m[liveBody+0x671]=0;initializeVehicleEffectBlock(body+0x728,runtime);for(const[o,v]of[[0x6a8,0x60000],[0x6ac,0x60000],[0x6b0,0],[0x6b4,0],[0x6b8,0],[0x148,0x41e080]])put(m,body+o,v);initializeVehicleSkidStorage(body,{...runtime,scratchBase:local-4});createVehicleAnimation(body+0x2b88,ptr(m,local+0x1c),type,{...runtime,scratchBase:local-8});initializeVehicleSurfaceLinks(body,runtime);initializeVehicleGripRecords(body,runtime);formatLapTimeDigits(m.subarray(record,record+0x30c),1);
 put(m,body+0x2f38,0x10000040);put(m,record+0x7c,0);put(m,record+0x80,0);for(const o of[0x2f44,0x2f40,0x2f3c,0x2f48])put(m,body+o,0);current=ptr(m,0x5ecb1c);word(m,body+0x66d,0);m[body+0x66c]=0;put(m,body+0x3e74,-1);const parameters=m[current+0x587]?0x5ead40:0x5eacd0+type*16;for(let i=0;i<4;i++)put(m,body+0x3cf4+i*4,get(m,parameters+i*4));if(m[current+get(m,local+0x14)]!==8)put(m,body+0x3d00,get(m,body+0x3d00)+1);
 m[record+0x248]=0;m[body+0x64f]=0;word(m,body+0x654,0);put(m,body+0x3d04,0);put(m,body+0x3d08,0);if(m[current+m.readUInt16LE(body+0x65e)]!==8)initializeVehicleController(body,m[current+0x58c]===2||get(m,0x6e6650)===1?4:1,runtime);else put(m,body+0x660,0);for(const o of[0x67c,0x678,0x674,0x688,0x684,0x680])put(m,body+o,0);
 const linked=ptr(m,record),participant=m.readUInt16LE(linked+0x65e),owner=0x8495e0+Math.imul(participant,0x8c);if(participant<6){put(m,owner+0x6c,linked);put(m,ptr(m,record)+0x6bc,owner);}const count=get(m,0x82e900);put(m,0x82e880+count*8,body);put(m,0x82e884+count*8,1);put(m,0x82e900,get(m,0x82e900)+1);word(m,record+0x249,0);initializeVehiclePresentation(body,type,{...runtime,scratchBase:local-12});
 if(m[ptr(m,0x5ecb1c)+0x54e]){const secondary=ptr(m,record+0x250);cloneSecondaryVehicleWheels(record,ptr(m,local+0x18),{...runtime,scratchBase:local-4});createVehicleAnimation(secondary+0x2b88,ptr(m,local+0x1c),type,{...runtime,scratchBase:local-8});initializeVehicleSurfaceLinks(secondary,runtime);initializeVehicleGripRecords(secondary,runtime);}return body;
}
