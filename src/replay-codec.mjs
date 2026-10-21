//42b280: four replay streams use an alternating complemented-byte checksum.
export function updateReplayChecksum(controller,{memory,validate=false}) {
  let checksum=0x2524;
  for(const [index,header]of [0,0x4e30,0x14c24,0x19a50].entries()){
    const count=index?memory.readUInt16LE(controller+header+8):memory.readInt16LE(controller),start=controller+(index?header+12:8);
    let value=0x71;for(let offset=0;offset<count;offset++)value=((~value)+memory.readUInt8(start+offset))&255;
    checksum^=value<<(index*2);
  }
  checksum&=65535;
  if(!validate)memory.writeUInt16LE(checksum,controller+6);
  else if(memory.readUInt16LE(controller+6)!==checksum)memory.writeUInt16LE(0xfecd,controller+6);
}

//42ab90: replay control and three byte-valued axis streams. Caller supplies
//complete controller memory, native pointers and the decode table at5706a0.
//It records/playbacks controls; its finish-time calls are not body destruction.
export function stepReplayControl(body,{memory}) {
  const u8=p=>memory.readUInt8(p),u16=p=>memory.readUInt16LE(p),s16=p=>memory.readInt16LE(p),u32=p=>memory.readUInt32LE(p),s32=p=>memory.readInt32LE(p);
  const b=(p,value)=>memory.writeUInt8(value&255,p),w=(p,value)=>memory.writeUInt16LE(value&65535,p),d=(p,value)=>memory.writeInt32LE(value|0,p);
  const controller=u32(body+0x660);
  if(s32(0x9020a0)!==0||controller===0)return;
  const state=()=>s32(controller+0x1e880),headers=[0x4e30,0x14c24,0x19a50];
  switch(state()){
  case 2:case 3:case 7:{
    w(controller+0x4e2c,u16(controller+0x4e2c)+1);
    if(s32(0x90a548)===0)w(controller+0x4e2e,u16(body+0x710));
    for(let axis=0;axis<3;axis++){
      const header=controller+headers[axis],sample=u8(body+0x708+axis),previous=u8(header);b(header+1,previous);b(header,sample);const delta=(sample-previous)|0;
      if(delta===0&&state()!==3&&state()!==7&&u8(header+2)!==127)b(header+2,u8(header+2)+1);
      else{
        let output=header+u16(header+8)+12;
        if(u8(header+2)!==0){if(delta!==0)b(header+2,u8(header+2)-1);b(output,u8(header+2));b(output+1,u8(header+1));output+=2;w(header+8,u16(header+8)+2);}
        b(header+2,0);
        if(delta!==0){
          if(Math.abs(delta)<64){b(output,delta|128);w(header+8,u16(header+8)+1);}
          else{b(output,0);b(output+1,u8(header));w(header+8,u16(header+8)+2);}
        }
      }
      if(u32(header+4)<u16(header+8)&&state()===2)d(controller+0x1e880,3);
    }
    const oldMask=u16(controller+0x4e2e);
    if(oldMask!==u16(body+0x710)||state()===3||state()===7||u16(controller+0x4e2c)===0x2000){
      const elapsed=s16(controller+0x4e2c)-1,codes=[11,9,10,8,6,5,4,7,13,15,14,12,2,1,3,0],selected=[];let special=0;
      for(let bit=0;bit<16;bit++)if(oldMask&(1<<bit)){selected.push(codes[bit]);if((1<<bit)&0xf0f0)special++;}
      let kind=0;
      if(selected.length===1){if(special===1&&elapsed<=15)kind=1;else if(elapsed<512)kind=2;}
      else if(selected.length===2){if(special===2&&elapsed<128)kind=3;else if(elapsed<=31)kind=4;}
      const output=u32(controller+0x4e28);let size;
      if(kind===1){b(output,(selected[0]<<4)|elapsed);size=1;}
      else if(kind===2){b(output,((selected[0]|0xc0)*2)|(elapsed>>>8));b(output+1,elapsed);size=2;}
      else if(kind===3){b(output,((selected[0]|0xf0)<<2)|(selected[1]>>1));b(output+1,(selected[1]<<7)|elapsed);size=2;}
      else if(kind===4){b(output,((selected[0]|0xd0)*2)|(selected[1]>>3));b(output+1,(selected[1]<<5)|elapsed);size=2;}
      else{b(output,(elapsed>>>8)|0xe0);b(output+1,elapsed);b(output+2,oldMask>>>8);b(output+3,oldMask);size=4;}
      w(controller,u16(controller)+size);d(controller+0x4e28,output+size);w(controller+0x4e2e,u16(body+0x710));w(controller+0x4e2c,1);
      if(state()===2){w(controller+2,u16(controller+2)+1);if(s16(controller)>=0x4e14)d(controller+0x1e880,3);}
      else if(state()===3)d(controller+0x1e880,7);
      else{updateReplayChecksum(controller,{memory});d(controller+0x1e880,0);}
    }
    return;
  }
  case 5:{
    if(u16(controller+0x4e2c)===0){
      const input=u32(controller+0x4e28),first=u8(input),second=u8(input+1),decode=index=>u16(0x5706a0+index*2);let mask,frames,size;
      const kind=first<128?1:((first>>>5)&3)===0?2:((first>>>5)&3)===1?4:((first>>>5)&3)===2?3:0;
      if(kind===1){size=1;frames=first&15;mask=decode(first>>>4);}
      else if(kind===2){size=2;frames=((first&1)<<8)|second;mask=decode((first>>>1)&15);}
      else if(kind===3){size=2;frames=second&127;mask=decode((first>>>2)&7)|decode((second>>>7)|((first&3)*2));}
      else if(kind===4){size=2;frames=second&31;mask=decode((first>>>1)&15)|decode((second>>>5)|((first&1)<<3));}
      else{size=4;frames=((first&31)<<8)|second;mask=(u8(input+2)<<8)|u8(input+3);}
      d(body+0x710,mask);d(controller+0x4e28,input+size);w(controller+0x1e87c,u16(controller+0x1e87c)-1);w(controller+0x4e2e,mask);w(controller+0x4e2c,frames-1);
      if(s16(controller+0x1e87c)< -1)d(controller+0x1e880,6);
    }else{d(body+0x710,u16(controller+0x4e2e));w(controller+0x4e2c,u16(controller+0x4e2c)-1);}
    for(const offset of headers){
      const header=controller+offset,index=u16(header+10);b(header+1,u8(header));
      if(index!==u16(header+8)){
        if(u8(header+2)===0){const token=u8(header+index+12);if(token&128){b(header,u8(header)+((token<<25)>>25));w(header+10,index+1);}else{b(header+2,token);b(header,u8(header+index+13));w(header+10,index+2);}}
        else b(header+2,u8(header+2)-1);
      }
    }
    for(let axis=0;axis<3;axis++)b(body+0x708+axis,u8(controller+headers[axis]));
    return;
  }
  case 6:d(controller+0x1e880,0);return;
  default:return;
  }
}
