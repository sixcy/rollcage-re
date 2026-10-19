// Native event storage/ordering, not contact generation or collision response.
// Anchors and explicit runtime boundaries are documented in docs/collision-events.md.
const priority=key=>key&0xfffff;
export const decodeCollisionEventKey=key=>({slot:key>>>20,timeQ16:(key>>>1)&0x7ffff,terrain:!!(key&1)});
export class CollisionEventQueue {
 constructor(capacity) {
  if(!Number.isInteger(capacity)||capacity<0||capacity>4096)throw Error('Collision event capacity must fit the native twelve-bit slot index.');
  this.capacity=capacity;this.heap=new Uint32Array(capacity+1);this.free=new Uint32Array(capacity);this.events=Array.from({length:capacity},()=>({}));this.reset();
 }
 // 0x440510 resets the free stack, but leaves event records and heap bytes intact.
 reset(){this.count=0;for(let i=0;i<this.capacity;i++)this.free[i]=(i<<20)>>>0;this.freeTop=this.capacity-1;}
 push(timeQ16,terrain) {
  if(!Number.isInteger(timeQ16)||timeQ16<0||timeQ16>0x7ffff)throw Error('Collision event time must fit its native nineteen-bit field.');
  if(this.freeTop<0)throw Error('Collision event pool exhausted.');
  const key=((this.free[this.freeTop--]&0xfff00000)|(timeQ16<<1)|(terrain?1:0))>>>0;
  let index=++this.count;
  while(index>1){const parent=index>>>1;if(priority(this.heap[parent])<=priority(key))break;this.heap[index]=this.heap[parent];index=parent;}
  this.heap[index]=key;return key;
 }
 // Strict comparisons retain native equal-priority ordering (not a stable sort).
 siftDown(index) {
  const key=this.heap[index];
  while(true){let next=index,best=key;const left=index*2,right=left+1;
   if(left<=this.count&&priority(this.heap[left])<priority(best)){next=left;best=this.heap[left];}
   if(right<=this.count&&priority(this.heap[right])<priority(best)){next=right;best=this.heap[right];}
   if(next===index)return;this.heap[index]=best;this.heap[next]=key;index=next;
  }
 }
 pop() {
  if(!this.count)return null;const key=this.heap[1];this.heap[1]=this.heap[this.count--];this.siftDown(1);this.free[++this.freeTop]=key;return key;
 }
 // 0x475630 scans backwards; replacing an entry requires sifting every ancestor.
 invalidate(object1,object2) {
  if(!object1&&!object2)return 0;let removed=0;
  for(let index=this.count;index>0;index--){const event=this.events[this.heap[index]>>>20];
   if(!((object1&&(event.object1===object1||event.object2===object1))||(object2&&(event.object1===object2||event.object2===object2))))continue;
   const key=this.heap[index];this.heap[index]=this.heap[this.count--];for(let ancestor=index;ancestor;ancestor>>>=1)this.siftDown(ancestor);
   this.free[++this.freeTop]=key;removed++;
  }
  return removed;
 }
}
// 0x475500 consumes a contact result. The optional auxiliary vector is the pair
// contact-point relative velocity, converted Q8 -> Q16 in place. Flags are also
// modified; unwritten fields in a recycled slot survive.
export function insertCollisionEvent(queue,{object1,object2=null,contact,flags,tag,auxiliaryVector=null,deltaQ16}) {
 const originalFlags=flags.value|0;flags.value=originalFlags&255;
 const damping=originalFlags&0x40?originalFlags&0xf00:0;
 const time=(object1.frameTimeQ16+deltaQ16)|0,key=queue.push(time,!object2),event=queue.events[key>>>20];
 Object.assign(event,{object1,object2,kind:object2?0:1,point:contact.point.slice(),normal:contact.normal.slice(),scalar:contact.scalar|0,field44:contact.field38|0,classFlags:flags.value,tag:tag&65535});
 if(auxiliaryVector){for(let i=0;i<3;i++)auxiliaryVector[i]<<=8;event.auxiliaryVector=auxiliaryVector.slice();}
 if(object2&&(object2.collisionFlags&0x80000000))object2.collisionFlags=0;
 if(damping)event.damping=damping;
 return {key,event};
}
// 0x474b20. Callbacks receive both body references AND the mutable event record.
// Their return is the native integer acceptance result; zero removes that body.
export function filterCollisionEvent(event,deltaQ16) {
 let difference=-event.object1.frameTimeQ16|0;
 const first=event.object1;
 if(first.collisionFilter&&(first.collisionFilter(first,event.object2,event)|0)===0)event.object1=null;
 const second=event.object2;
 if(second){difference=(difference+second.frameTimeQ16)|0;if(second.collisionFilter&&(second.collisionFilter(second,event.object1,event)|0)===0)event.object2=null;}
 if(!event.object1&&event.object2){event.object1=event.object2;event.object2=null;event.normal=event.normal.map(value=>-value|0);deltaQ16=(deltaQ16-difference)|0;}
 return deltaQ16;
}
// Event-processing portion of 0x4749e0. The record is released before callbacks.
// Invalidation uses the original body references; regeneration uses the surviving
// references captured after response. Negative deltas still process one event.
export function processCollisionEvents(queue,{respond,refresh,finish}) {
 for(const [name,handler]of Object.entries({respond,refresh,finish}))if(typeof handler!=='function')throw Error(`Collision event handler ${name} is required.`);
 let processed=0;
 while(queue.count){const key=queue.pop(),{slot,timeQ16}=decodeCollisionEventKey(key),event=queue.events[slot],oldFirst=event.object1,oldSecond=event.object2;
  const delta=filterCollisionEvent(event,(timeQ16-oldFirst.frameTimeQ16)|0);
  respond(event,delta,queue);const first=event.object1,second=event.object2;
  queue.invalidate(oldFirst,oldSecond);if(first||second)refresh(first,second,queue);processed++;
  if(delta<0)break;
 }
 finish();return processed;
}
