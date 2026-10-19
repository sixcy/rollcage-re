// Primary SEGM grids. Native anchors: scene results 027, 034 and 042.
export function parseScene(data) {
  if (!Buffer.isBuffer(data) || data.length < 0x120 || data.toString('ascii',0,4)!=='GFXM') throw new Error('Invalid GFXM scene header.');
  function range(offset,bytes,label) {
    if (!Number.isSafeInteger(offset)||!Number.isSafeInteger(bytes)||offset<0||bytes<0||offset+bytes>data.length) throw new Error(`Scene ${label} exceeds resource bounds.`);
  }
  const count=data.readUInt32LE(0x10), table=data.readUInt32LE(0x14), uvTable=data.readUInt32LE(0x110);
  range(table,count*4,'segment table');
  const segments=Array.from({length:count},(_,index)=>{
    const offset=data.readUInt32LE(table+index*4);
    range(offset,0x60,`segment ${index} header`);
    if(data.toString('ascii',offset,offset+4)!=='SEGM') throw new Error(`Unsupported scene segment at ${index}.`);
    const columns=data.readUInt32LE(offset+8), rows=data.readUInt32LE(offset+0xc);
    const verticesOffset=data.readUInt32LE(offset+0x20), packetsOffset=data.readUInt32LE(offset+0x50);
    const vertexCount=(columns+1)*(rows+1), faceCount=columns*rows;
    range(verticesOffset,vertexCount*8,`segment ${index} vertices`);
    range(packetsOffset,faceCount*8,`segment ${index} packets`);
    const vertices=Array.from({length:vertexCount},(_,i)=>{
      const p=verticesOffset+i*8;
      return [data.readInt16LE(p),data.readInt16LE(p+2),data.readInt16LE(p+4),data.readUInt16LE(p+6)];
    });
    const faces=Array.from({length:faceCount},(_,i)=>{
      const p=packetsOffset+i*8, textureRecord=data.readUInt32LE(p+4), uvOffset=uvTable+textureRecord*16;
      range(uvOffset,16,`segment ${index} UV record ${textureRecord}`);
      const row=Math.floor(i/columns), col=i%columns, top=row*(columns+1)+col;
      const pageWord=data.readUInt16LE(uvOffset+6);
      const gridIndices=[top,top+1,top+columns+1,top+columns+2];
      const vertexFlags=vertices[top+columns+2][3];
      // FUN_00489e40 maps TL/TR/BL/BR directly when bit 2 is set,
      // otherwise it rotates the packet corners to TR/BR/TL/BL.
      const indices=vertexFlags&4?gridIndices:[gridIndices[1],gridIndices[3],gridIndices[0],gridIndices[2]];
      return {index:i,template:data.readUInt16LE(p),textureRecord,pageWord,page:pageWord&0x3f,
        clutWord:data.readUInt16LE(uvOffset+2), uv:[[data[uvOffset],data[uvOffset+1]],[data[uvOffset+4],data[uvOffset+5]],
          [data[uvOffset+8],data[uvOffset+9]],[data[uvOffset+10],data[uvOffset+11]]],
        indices,gridIndices,
        // The native lighting pass selects corner mapping from a grid-point flag.
        // Keep it for the renderer/exporter rather than discarding the field.
        vertexFlags};
    });
    return {index,offset,columns,rows,verticesOffset,packetsOffset,vertices,faces};
  });
  return {segments,uvTable};
}
