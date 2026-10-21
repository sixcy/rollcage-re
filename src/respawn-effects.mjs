import yaw from './yaw-table.json' with {type:'json'};
const handler=(handlers,name)=>{if(typeof handlers[name]!=='function')throw Error(`Respawn effects require handler ${name}.`);return handlers[name];};
const nextSeed=seed=>Math.imul(seed,0x41a7)&0x7fffffff;
const integer=(value,label)=>{if(!Number.isInteger(value)||value< -2147483648||value>4294967295)throw Error(`Respawn effects require explicit 32-bit ${label}.`);return value|0;};
//435df0 reuses caller-owned storage. Free links and active links share+ac.
export function allocateRespawnParticle(runtime,{removeSpatial}={}) {
 for(const field of ['freeHead6e65b4','activeHead6e65c0','activeTail6e65c8'])if(!(field in runtime))throw Error(`Particle allocation requires explicit ${field}.`);
 let particle=runtime.freeHead6e65b4,head,previous;
 if(particle){runtime.freeHead6e65b4=particle.previousAC;head=runtime.activeHead6e65c0;previous=runtime.activeTail6e65c8;}
 else{
  head=runtime.activeHead6e65c0;particle=head;
  if(!particle)throw Error('Particle allocation requires native-readable free or active storage.');
  while(particle.fieldB0!==0){particle=particle.nextA8;if(!particle){particle=head;break;}}
  previous=particle.previousAC;const next=particle.nextA8;
  if(previous)previous.nextA8=next;else head=next;
  if(next){next.previousAC=previous;previous=runtime.activeTail6e65c8;}
 }
 particle.previousAC=previous;particle.nextA8=null;runtime.activeTail6e65c8=particle;
 if(previous)previous.nextA8=particle;
 runtime.activeHead6e65c0=head||particle;
 if(particle.field94===1){if(typeof removeSpatial!=='function')throw Error('Reused particle allocation requires spatial removal.');removeSpatial(particle);}
 particle.fieldB0=0;particle.fieldB4=0;return particle;
}
//436920. Particle allocation and spatial registration are explicit boundaries.
export function emitRespawnParticle(position,velocity,{colorMode,typeMode,runtime,handlers}) {
 colorMode=integer(colorMode,'colorMode');typeMode=integer(typeMode,'typeMode');
 const particle=handler(handlers,'allocate435df0')();
 particle.field96=100;particle.field95=16;particle.fieldA2=0x8000;particle.flags=typeMode===0?23:30;
 particle.velocity9c=velocity.map(value=>(value<<16)>>16);
 const translated=[0,1,2].map(index=>((velocity[index]<<8)+position[index])|0);
 particle.position88=translated.slice();particle.color98=-7968;
 handler(handlers,'register474670')(particle,translated);
 const first=nextSeed(integer(runtime.seed5ec958,'seed5ec958'));
 particle.timestampA4=integer(runtime.time9153e8,'time9153e8');particle.field94=1;runtime.seed5ec958=first;
 const low=(Math.imul(first>>>15,255)>>>16);
 let registerEcx=first;
 if(colorMode===0){
  const second=nextSeed(first),third=nextSeed(second);registerEcx=second;runtime.seed5ec958=third;
  particle.color98=((Math.imul(second>>>15,255)>>>8)&0xffff00)|low|(Math.imul(third>>>15,255)&0xffff0000)|0xff000000;
 }else particle.color98=((((low<<8)|low)<<8)|low)|0xff000000;
 return {particle,registerEcx};
}
//47d900 captures the body center once, then emits sixteen particles around it.
//Code2 suppresses byte699's write and selects the same color mode as code0.
export function emitVehicleRespawnRing(body,code,{emitParticle}={}) {
 if(typeof emitParticle!=='function')throw Error('Vehicle respawn ring requires its particle emitter.');
 let colorMode=integer(code,'ring code');if(colorMode===2)colorMode=0;else body.field699=31;
 const center=body.position.slice();let registers;
 for(let index=0;index<16;index++){
  const angle=index<<4,sine=yaw.values[angle]<<7,cosine=yaw.values[angle+64]<<7,velocityAngle=(angle+64)&255;
  const position=[(sine+(sine>>1)+center[0])|0,center[1]|0,(cosine+(cosine>>1)+center[2])|0];
  const velocity=[yaw.values[velocityAngle]>>4,0,yaw.values[velocityAngle+64]>>4];
  registers=emitParticle(position,velocity,{colorMode,typeMode:0});
 }
 return registers;
}
