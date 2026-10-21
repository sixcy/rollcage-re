const required=(handlers,name)=>{if(typeof handlers[name]!=='function')throw Error(`Respawn requires handler ${name}.`);return handlers[name];};
const unsigned=(value,maximum,label)=>{if(!Number.isInteger(value)||value<0||value>maximum)throw Error(`Respawn requires explicit ${label}.`);return value;};
function recordFor(runtime,index){unsigned(index,65535,'vehicleIndex65e');const record=runtime?.records?.[index];if(!record)throw Error('Respawn requires the caller-owned vehicle runtime record.');return record;}
// 0x47d440. Inputs are the already selected pose and progression state. This
// routine does not select a checkpoint or refresh quaternion derivatives.
export function applyRespawn(body,{position,quaternion,rotation,progressionPointer,progressionValue,closestTerrain11c,vehicleState,runtime,spatialRegistry,handlers={}}) {
 const remove=spatialRegistry?object=>spatialRegistry.remove(object):required(handlers,'removeSpatial');
 const insert=spatialRegistry?object=>spatialRegistry.insert(object):required(handlers,'insertSpatial');
 remove(body);
 body.position=[position[0]|0,position[1]|0,position[2]|0];
 body.quaternion=[quaternion[0]|0,quaternion[1]|0,quaternion[2]|0,quaternion[3]|0];
 body.rotation=Array.from({length:9},(_,index)=>(rotation[index]<<16)>>16);
 for(const name of ['linearVelocity','momentum','angularVelocity','force','torque','angularMomentum'])body[name]=[0,0,0];
 body.closestTerrain11c=closestTerrain11c|0;
 if((body.flags&0x1ff)===3){
  const record=recordFor(runtime,body.vehicleIndex65e);
  if(!vehicleState?.wheels||vehicleState.wheels.length<4)throw Error('Vehicle respawn requires four caller-owned wheel states.');
  for(let index=0;index<4;index++)vehicleState.wheels[index].spin=0;
  vehicleState.field650=0;
  const registeredBody=record.body00;
  record.respawn54=progressionPointer;record.respawn58=progressionValue|0;
  if(unsigned(registeredBody.mode718,255,'registered body mode718')===8){
   registeredBody.checkpoint6c0=unsigned(progressionPointer.byte05,255,'progression byte05');
   registeredBody.checkpoint6c2=record.respawn58&65535;
  }
  if(unsigned(runtime.session.mode551,255,'session mode551')===3||runtime.session.mode551===8){
   const index=unsigned(record.body00.vehicleIndex65e,65535,'registered vehicleIndex65e'),value=unsigned(runtime.session.counters08[index],255,'session counter08');
   if(value!==0)runtime.session.counters08[index]=(value-1)&255;
  }else{
   if(!Number.isInteger(record.progress24)||record.progress24< -2147483648||record.progress24>2147483647)throw Error('Respawn requires explicit signed progress24.');
   const previous=record.progress24|0;
   required(handlers,'updateProgress44a2e0')(record);
   let delta=((record.progress24|0)-previous)|0;
   if(delta>0x7fff)delta=(delta-0x10000)|0;
   else if(delta< -0x8000)delta=(delta+0x10000)|0;
   const unwrapped=(delta+previous)|0;
   if(unwrapped<0){const lap=unsigned(record.lap1c,255,'lap1c');if(lap!==0&&lap<=unsigned(runtime.session.lapLimit586,255,'session lapLimit586'))record.lap1c=(lap-1)&255;}
   else if(unwrapped>0x10000){required(handlers,'advanceLap44a560')(record);required(handlers,'finishProgress449760')(record);}
  }
  // The body index and runtime controller pointer are re-read after callbacks.
  const controller=recordFor(runtime,body.vehicleIndex65e).controller18;
  if(controller!==0x12345678)controller.flags39=(controller.flags39|4)&255;
 }
 insert(body);return body;
}
