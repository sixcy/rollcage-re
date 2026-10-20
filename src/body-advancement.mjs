import {advanceBodyDelta} from './body-physics.mjs';
import {multiplyQ16} from './fixed-integer.mjs';
const required=(handlers,name)=>{if(typeof handlers[name]!=='function')throw Error(`Body advancement requires handler ${name}.`);return handlers[name];};
function attachmentWord(body){const value=body.attachmentHandles?.[0]??body.attachmentCount;if(!Number.isInteger(value)||value<0||value>65535)throw Error('Body advancement requires an unsigned first attachment handle at+0x16a.');if(body.attachmentHandles&&body.attachmentCount!==undefined&&body.attachmentCount!==value)throw Error('Historical attachmentCount must agree with the first attachment handle.');return value;}
function validateClock(body){if(!Number.isInteger(body.frameTimeQ16)||body.frameTimeQ16< -2147483648||body.frameTimeQ16>2147483647)throw Error('Body advancement requires an explicit signed frame clock.');attachmentWord(body);}
function queueAttachments(body,handlers){if(attachmentWord(body)){
 const queue=handlers.attachmentQueue;if(Array.isArray(queue))queue.push(body);
 else if(Array.isArray(queue?.entries)&&Number.isInteger(queue.count)&&queue.count>=0&&queue.count<=queue.entries.length)queue.entries[queue.count++]=body;
 else throw Error('Body advancement requires an attachment queue.');
}}
function advanceDynamic(body,deltaQ16,handlers,timeOptions) {
 advanceBodyDelta(body,deltaQ16,timeOptions);
 queueAttachments(body,handlers);
}
function refreshSpatial(body,before,handlers) {
 if(body.position.some((value,index)=>(value>>24)!==before[index])){required(handlers,'removeSpatial')(body);required(handlers,'insertSpatial')(body);return true;}
 return false;
}
// 0x4484a0 applies a position correction without changing the body clock.
export function correctCollisionPosition(body,correction,handlers={}) {
 const before=body.position.map(value=>value>>24);body.position=body.position.map((value,index)=>(value+correction[index])|0);return refreshSpatial(body,before,handlers);
}
// 0x474950 applies the optional normal nudge AFTER pose arithmetic and queues,
// then increments the unscaled frame clock and tests the position's high bytes.
export function advanceBodyForCollision(body,deltaQ16,normal=null,handlers={},timeOptions) {
 validateClock(body);
 const before=body.position.map(value=>value>>24);
 advanceDynamic(body,deltaQ16,handlers,timeOptions);
 if(normal)for(let i=0;i<3;i++)body.position[i]=(body.position[i]+(normal[i]>>7))|0;
 body.frameTimeQ16=(body.frameTimeQ16+deltaQ16)|0;
 return refreshSpatial(body,before,handlers);
}
// 0x4757a0: the 0x8000 path only translates, ticks time, and queues attachments.
export function advanceKinematicBody(body,deltaQ16,handlers={}) {
 validateClock(body);
 if(!Number.isInteger(deltaQ16)||deltaQ16< -2147483648||deltaQ16>2147483647)throw Error('Body time delta must be a signed 32-bit integer.');
 body.position=body.position.map((value,index)=>(value+multiplyQ16(deltaQ16,body.linearVelocity[index]))|0);
 body.frameTimeQ16=(body.frameTimeQ16+deltaQ16)|0;
 queueAttachments(body,handlers);
 return body;
}
//47cc20 completes a rejected static contact, not object destruction. Type4
// advances even for a negative remaining interval and queues its attachments.
// Other types only finish their clock. State32 is written after spatial hooks.
export function completeRejectedCollisionBody(body,handlers={},timeOptions) {
 if(!Number.isInteger(body.frameTimeQ16)||body.frameTimeQ16< -2147483648||body.frameTimeQ16>2147483647)throw Error('Rejected collision requires an explicit signed frame clock.');
 if((body.flags&0x1ff)===4){
  const before=body.position.map(value=>value>>24),remaining=(65536-body.frameTimeQ16)|0;
  advanceDynamic(body,remaining,handlers,timeOptions);body.frameTimeQ16=(body.frameTimeQ16+remaining)|0;
  refreshSpatial(body,before,handlers);
 }else body.frameTimeQ16=65536;
 body.collisionState128=32;return body;
}
// 0x475450 uses the null-terminated physical list. A completed or overshot body
// is skipped. Kinematic translation deliberately bypasses the spatial callbacks.
export function finishBodyAdvancement(bodies,handlers={},timeOptions) {
 let advanced=0;
 for(const body of bodies){if(!body)break;validateClock(body);const remaining=(65536-body.frameTimeQ16)|0;if(remaining<=0)continue;
  if(body.flags&0x8000)advanceKinematicBody(body,remaining,handlers);
  else advanceBodyForCollision(body,remaining,null,handlers,timeOptions);
  advanced++;
 }
 return advanced;
}
