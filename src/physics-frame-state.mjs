// 0x46e9b0 resets collision clocks/caches before body preparation and decays a
// vehicle byte counter. Offset-based names retain unresolved gameplay meanings.
export function beginPhysicsFrame(bodies,vehicleBodies) {
 for(const body of bodies) {
  if(!Number.isInteger(body.collisionCount10c)||body.collisionCount10c< -128||body.collisionCount10c>255)throw Error('Frame initialization requires explicit collision byte +0x10c.');
  body.frameTimeQ16=0;body.collisionCache114=-1;body.collisionState128=0;body.collisionBound120=0x7fffffff;
  if((body.collisionCount10c&255)&&!(body.flags&0x8000)){body.collisionFlags&=0x80000000;body.collisionCounter168=[3,4,29].includes(body.flags&0x1ff)?3:1;}
 }
 for(const body of vehicleBodies){if(!Number.isInteger(body.collisionCooldown66f)||body.collisionCooldown66f<0||body.collisionCooldown66f>255)throw Error('Frame initialization requires explicit vehicle byte +0x66f.');body.collisionCooldown66f=Math.max(0,body.collisionCooldown66f-32);}
}
