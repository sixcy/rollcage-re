//431520 writes the left/right control bits after planar target/velocity tests.
import {abs32,crossQ16,dotQ16,multiplyQ16,divideQ16,vectorLengthQ16} from './fixed-integer.mjs';
import {readAutonomousSurfaceIndex} from './autonomous-speed.mjs';

//491540: divide one cross component by the axis's dominant signed component.
//Strict X/Y/Z tie order and the axis threshold belong to the original helper.
export function orientedSteeringRatio(first,second,axis) {
 const cross=crossQ16(first,second),x=abs32(axis[0]),y=abs32(axis[1]),z=abs32(axis[2]);
 const index=x>y?(x>z?0:2):(y>z?1:2);
 return abs32(axis[index])<0x400?0:divideQ16(cross[index],axis[index]);
}

//430ee0 saturates the side signal and adds the grounded-surface-dependent
//angular momentum correction. Behind-facing targets bypass that correction.
export function autonomousSteeringAngle(bodyAddress,side,forward,{memory}) {
 if(forward<0)return side>0?0xa000:-0xa000;
 let correction=memory[bodyAddress+0x6f1]>1?memory.readInt32LE(bodyAddress+0x50):0;
 if(abs32(correction)>4000000)correction=multiplyQ16(-(correction>>6)|0,(readAutonomousSurfaceIndex(bodyAddress,{memory})+16)<<11);
 else correction=0;
 if(memory[bodyAddress+0x64f])correction=-correction|0;
 const base=side>0x582e?0xa000:side< -0x582e?-0xa000:multiplyQ16(side,0x1d081),result=(base+correction)|0;
 return Math.max(-0xa000,Math.min(0xa000,result));
}

//430d90 writes forward/side scalars, including its retained byte6c8 diagnostic.
export function measureAutonomousVelocity(bodyAddress,{memory}) {
 const vector=[0x68,0x6c,0x70].map(offset=>memory.readInt32LE(bodyAddress+offset)>>4),length=vectorLengthQ16(vector);
 let forward=65536,side=0;
 if(length>0x800){
  const scale=divideQ16(65536,length),direction=vector.map(value=>multiplyQ16(value,scale)),axis=[0xc6,0xcc,0xd2].map(offset=>memory.readInt16LE(bodyAddress+offset)<<4),facing=[0xc8,0xce,0xd4].map(offset=>memory.readInt16LE(bodyAddress+offset)<<4);
  forward=dotQ16(facing,direction);side=orientedSteeringRatio(facing,direction,axis);
 }
 memory[bodyAddress+0x6c8]=(forward>>8)&255;return{forward,side,length};
}

//scratchBase is native entryESP. Preserve caller-visible meaningful locals and
//the overwritten first stack argument, not arbitrary saved-register contents.
export function updateAutonomousSteering(bodyAddress,targetVectorAddress,firstArg,reverseArg,{memory,scratchBase}={}) {
 if(!Buffer.isBuffer(memory)||!Number.isInteger(scratchBase)||scratchBase<68||scratchBase+12>memory.length)throw Error('Autonomous steering requires explicit native memory and entry stack.');
 const put=(p,value)=>memory.writeInt32LE(value|0,p),get=p=>memory.readInt32LE(p),vector=p=>[0,4,8].map(offset=>get(p+offset)),store=(p,values)=>values.forEach((value,index)=>put(p+index*4,value));
 const facingAddress=scratchBase-12,axisAddress=scratchBase-36,projectedAddress=scratchBase-24,dotAddress=scratchBase-52,forwardAddress=scratchBase-44;
 const facing=[0xc8,0xce,0xd4].map(offset=>memory.readInt16LE(bodyAddress+offset)<<4),axis=[0xc6,0xcc,0xd2].map(offset=>memory.readInt16LE(bodyAddress+offset)<<4);
 store(facingAddress,facing);store(axisAddress,axis);put(scratchBase-40,bodyAddress);put(scratchBase-48,targetVectorAddress);
 const projection=dotQ16(vector(targetVectorAddress),vector(axisAddress));put(dotAddress,projection);
 const products=axis.map(value=>{put(forwardAddress,value);return multiplyQ16(value,projection);});
 store(projectedAddress,vector(targetVectorAddress).map((value,index)=>(value-products[index])|0));
 let targetSide=orientedSteeringRatio(vector(facingAddress),vector(projectedAddress),vector(axisAddress)),targetForward=dotQ16(vector(facingAddress),vector(projectedAddress));put(forwardAddress,targetForward);
 if(reverseArg!==0){targetSide=-targetSide|0;targetForward=-targetForward|0;put(forwardAddress,targetForward);}
 let desired=autonomousSteeringAngle(bodyAddress,targetSide,targetForward,{memory});if(reverseArg!==0)desired=-desired|0;
 const velocity=measureAutonomousVelocity(bodyAddress,{memory});put(dotAddress,velocity.side);put(scratchBase-48,velocity.forward);
 let velocitySide=velocity.side,velocityForward=velocity.forward;if(reverseArg!==0){velocitySide=-velocitySide|0;velocityForward=-velocityForward|0;}
 let comparedVelocity=false,replacedTarget=false;
 if(firstArg!==0&&velocityForward<64000&&memory.readInt16LE(bodyAddress+0x668)>100){
  const candidate=autonomousSteeringAngle(bodyAddress,velocitySide,velocityForward,{memory});put(scratchBase+4,candidate);comparedVelocity=true;
  //The native second reverse handling negates the OLD desired signal, and its
  //side comparison uses bit27. The50000 test reads the stored target forward
  //scalar. Velocity's forward output overwrites the former target pointer.
  if(reverseArg!==0)desired=-desired|0;
  const sideBit=value=>(~(value>>>27))&1;
  if((sideBit(desired)!==sideBit(candidate)||abs32(desired)<=abs32(candidate))&&(sideBit(targetSide)===sideBit(velocitySide)||get(forwardAddress)>=50000)){desired=candidate;replacedTarget=true;}
 }
 if(memory[bodyAddress+0x64f])desired=-desired|0;
 const current=memory.readInt32LE(bodyAddress+0x644);let addedBits=0;
 if(abs32(desired)>=0x477||abs32(current)>=0x477){if(desired>current)addedBits=0x2000;else if(desired<current)addedBits=0x8000;}
 if(addedBits)memory.writeInt32LE(memory.readInt32LE(bodyAddress+0x710)|addedBits,bodyAddress+0x710);
 return{desired,current,addedBits,comparedVelocity,replacedTarget};
}
