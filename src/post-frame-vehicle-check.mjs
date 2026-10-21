//47e180: numeric vehicle registry prepass before47ccc0 state dispatch.
//Sector+14 is an explicit signed height input; no runtime height is inferred.
function sectorFor(body){
 const value=body.closestTerrain11c;
 if(Number.isInteger(value))return value&255;
 if(value&&Number.isInteger(value.sector))return value.sector&255;
 throw Error('Post-frame vehicle check requires an explicit closest terrain sector.');
}
export function checkPostFrameVehicles(runtime,{sectorHeights,vehicleStateFor}={}) {
 const count=runtime?.session?.vehicleCount54d,records=runtime?.records;
 if(!Number.isInteger(count)||count<0||count>255||!Array.isArray(records)||records.length<count)throw Error('Post-frame vehicle check requires its unsigned registry count and records.');
 let markedBodies=0,heightFailures=0,slowFailures=0;
 for(let index=0;index<count;index++){
  const record=records[index],body=record.body00,sector=sectorFor(body),height=sectorHeights?.[sector];
  if(!Number.isInteger(height)||height< -32768||height>32767)throw Error('Post-frame vehicle check requires an explicit signed sector height.');
  let reject=false;
  if((body.position[1]>>16)>height+512){reject=true;heightFailures++;}
  else{
   if(!Number.isInteger(body.speed668)||body.speed668< -32768||body.speed668>32767)throw Error('Post-frame vehicle check requires signed speed668.');
   if(body.speed668<2){
    if(!Number.isInteger(record.field248)||record.field248<0||record.field248>255)throw Error('Post-frame vehicle check requires an explicit unsigned counter248.');
    record.field248=(record.field248+1)&255;
    if(typeof vehicleStateFor!=='function')throw Error('Post-frame vehicle check requires vehicleStateFor on the slow branch.');
    const state=vehicleStateFor(body,record,index);
    if(!state?.wheels||state.wheels.length<4)throw Error('Post-frame vehicle check requires four explicit wheel flags.');
    let grounded=true;
    for(let wheel=0;wheel<4;wheel++)if(!(state.wheels[wheel].flags&1)){grounded=false;break;}
    if(grounded)record.field248=0;
    if(record.field248>90){reject=true;slowFailures++;}
   }else record.field248=0;
  }
  if(reject){body.collisionState128=32;record.field248=0;record.body00.collisionFlags&=0x7fffffff;markedBodies++;}
 }
 return {checkedVehicles:count,markedBodies,heightFailures,slowFailures};
}
