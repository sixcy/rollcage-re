// 44c3ea allocates GFXM+8 render records; 44c93c/44c99a initialize their
// descriptor mode from inline BTP words at +40. New records need real entries.
export function extendSplineRoadPacketInitializers(source,{oldCount,newCount,entries}={}) {
  if(!Buffer.isBuffer(source)||source.length<0x40||source.toString('ascii',0,4)!=='BTP '||!Number.isInteger(oldCount)||!Number.isInteger(newCount)||oldCount<0||newCount<oldCount||newCount>65536||source.readUInt32LE(12)!==oldCount||!Array.isArray(entries)||entries.length!==newCount-oldCount)throw Error('Invalid spline-road BTP packet initializer contract.');
  if(newCount===oldCount)return Buffer.from(source);
  const end=0x40+oldCount*2,bytes=Math.ceil((newCount-oldCount)*2/4)*4;
  if(end>source.length||source.length+bytes>128*1024*1024)throw Error('Spline-road BTP initializer table exceeds resource bounds.');
  // The original format's other header words are counts/flags, not addresses.
  // Reject unproved pointer-bearing variants rather than guessing relocations.
  if([0x18,0x20,0x2c].some(offset=>source.readUInt32LE(offset)!==0))throw Error('Spline-road BTP has unsupported reserved header fields.');
  const result=Buffer.alloc(source.length+bytes);result.set(source.subarray(0,end));result.set(source.subarray(end),end+bytes);const seen=new Set();
  for(const {index,sourcePacket}of entries){if(!Number.isInteger(index)||index<oldCount||index>=newCount||seen.has(index)||!Number.isInteger(sourcePacket)||sourcePacket<0||sourcePacket>=oldCount)throw Error('Invalid or duplicate spline-road packet initializer reference.');seen.add(index);result.writeUInt16LE(source.readUInt16LE(0x40+sourcePacket*2),0x40+index*2);}
  for(const offset of [0x1c,0x24,0x28,0x38,0x3c]){const value=source.readUInt32LE(offset);if(value!==0&&(value<end||value>source.length))throw Error('Spline-road BTP pointer overlaps packet initializers or exceeds resource bounds.');if(value)result.writeUInt32LE(value+bytes,offset);}
  result.writeUInt32LE(newCount,12);return result;
}
